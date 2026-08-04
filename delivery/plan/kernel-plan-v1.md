# Tiphys Kernel Plan v1

- Status: DRAFT, pending adversarial review
- Revision 1: adversarial review round 1 findings applied (PR-001 to PR-013)
- Revision 2: owner decision round 1 applied (DR-0001, DR-0002, DR-0003, DR-0005 decided; DR-0008 deferred)
- Revision 3: review round 2 findings applied (PR-101 to PR-106)
- Revision 4: owner decision round 2 applied (DR-0004, DR-0006, DR-0007, DR-0009 decided; firstmate scout folded in)
- Revision 5: review round 3 findings applied (PR-201 to PR-209)
- Revision 6: external cross-model review round 4 applied (EXT-F-01 to EXT-F-09)
- Baseline commit: 44c41397c49d2fff472b9fcee52f339660194caf
- Process summary: This plan was produced by the current orchestrated delivery process acting as intake-to-plan stage for the Tiphys kernel project, from two verified intake documents, a 13-finding spec-coherence report, and a 115-row requirements migration table. It fully phases milestone M1 (walking skeleton), outlines M2 and M3, and gives M4 and M5 one paragraph each; every phase lands as one branch and one PR through an adversarial review pipeline, sequentially, with milestone exit tests as hard gates. Owner-reserved questions are never decided here; each one is a decision record in delivery/decisions/ and blocks the phases that depend on it.
- Binding rule: "If it is not written here, it is not being made. Unanswered questions go to the orchestrator."

---

## 1. Standing context

### 1.1 Greenfield state

The repository at the baseline commit contains only delivery/ documents: the two intake documents, the spec-coherence report, the migration table, decision records DR-0001 to DR-0009 (statuses per section 9), this plan, and the round 1 review. There is no source code, no package.json, no CI, no test runner. Everything under "files-to-touch" in M1 phases is files-to-create unless marked otherwise. Verify-before-editing still applies: each implementer confirms the expected absence (or presence) before writing.

### 1.2 What stage 1 produced

1. delivery/verification/spec-coherence-report.md: findings SC-001 to SC-013, each dispositioned in section 2 below.
2. delivery/requirements/migration-table.md: rules R-001 to R-098 in 115 rows (17 lettered pairs), each placed in the coverage appendix (section 10).
3. delivery/decisions/DR-0001 to DR-0004 (license, node floor, CI runner, elevated permissions), all open at plan drafting; DR-0001 (Apache-2.0), DR-0002 (Node >= 26), and DR-0003 (GitHub Actions hosted ubuntu-latest) were decided on 2026-08-04 and are applied by revision 2.
4. This plan and new decision records DR-0005 to DR-0009.

### 1.3 Settled owner decisions (cited as given, never reopened)

1. Name: Tiphys. npm scope: @tiphys.
2. Kernel is maximally npm; harness integration is a thin adapter (blueprint section 3).
3. Topology and distribution per blueprint section 3.
4. Assurance modes per blueprint section 8.
5. Charter boundary is reversibility (blueprint section 7).
6. Tiphys is built with the current process; nothing runs on Tiphys before M4. The M3 exit test's self-delivery is a controlled exception under current-process supervision (SC-013 disposition).
7. Decorrelation deferred; red-witness against latest main, re-verified at merge; hard cutover (blueprint section 12).

### 1.4 Binding conventions (every phase, every artifact)

1. English only.
2. npm only, never pnpm or yarn.
3. No em dashes in any authored text (commas, colons, parentheses instead).
4. Falsifiable acceptance criteria only; "works correctly" is banned; the register is "node --test exits 0 and reports N tests, N > 0".
5. Parallelism is OFF until M5: every M1 phase is sequential, one phase = one branch = one PR, next phase starts only after the previous PR is merged.
6. Milestone exit tests are hard gates: no milestone starts before the previous exit test has passed with recorded evidence.

### 1.5 Topology as this plan uses it (SC-003 resolution)

The blueprint's topology diagram (a top-level kernel/ beside fleet/ and projects/) predates the settled npm decision and is not built. The corrected picture, binding for all phases:

- Kernel source lives in this repository (tiphys-ai-helmsman), a clone under the fleet home's projects/ directory on any fleet machine, delivered like any project.
- The projects area is <fleet>/projects/, created by tiphys init and gitignored: clones are recoverable from their remotes and are not durable fleet state (PR-004).
- The consumed kernel is the pinned npm dependency inside a fleet home's node_modules; a fleet home is a small npm project whose package.json is the pin.
- No top-level kernel/ directory exists on a fleet machine.
- The directory names inside the kernel repo (bin/, schemas/, roles/, tuition/) keep the blueprint's names; they are package contents, not fleet-machine topology.

---

## 2. Where the spec disagrees with itself

Every SC finding from delivery/verification/spec-coherence-report.md, dispositioned exactly once. "Follows report" means the report's recommended disposition is adopted unchanged.

| ID | Disposition | Lands in |
|---|---|---|
| SC-001 | Follows report (resolve-in-plan) | M3 outline, artifact list item "role briefs": the adversarial plan reviewer brief states the settled visibility (input report + plan + code); the same M3 phase corrects the process doc's role table so both documents agree. See also plan decision D-14. |
| SC-002 | Follows report (resolve-in-plan) | Phase M1-P2: the fleet home is initialized as a private git repository with push discipline, gitignore narrowed to genuinely ephemeral entries (state/ beacons, locks, worktrees/). Flagged vetoable as plan decision D-4 because decision records may contain material the owner does not want in any remote. M1 lands the structure only (repo, narrowed gitignore, remote WARN); the commit/push discipline for post-init fleet state is an M3 AGENTS.md orchestrator duty, named in the M3 outline (PR-012). |
| SC-003 | Follows report (resolve-in-plan) | Section 1.5 of this plan (binding topology redraw) and phase M1-P2 grounding. Plan decision D-5. |
| SC-004 | Follows report (escalate-to-owner) | DR-0005 (kernel implementation language and runtime). Decided 2026-08-04: TypeScript sources compiled to JavaScript; applied across all M1 phases by revision 2 (plan decisions D-17 and D-18). |
| SC-005 | Follows report (escalate-to-owner) | DR-0006, decided 2026-08-04 stricter than recommended: lintable-schema-first (YAML or JSON validated by JSON Schema); markdown only where content genuinely cannot be structured, with the reason recorded per artifact type, convenience never a valid reason. M1 complies via D-3 (state files plain JSON, artifact audit recorded there); the policy binds the M2 gate manifest and the M3 schemas. |
| SC-006 | Follows report in substance, folded into a DR | DR-0008 carries the package-naming recommendation (@tiphys/kernel, @tiphys/claude-code-plugin) as vetoable, alongside the registry question, per orchestrator direction. The report suggested resolve-in-plan flagged vetoable; carrying the same vetoable recommendation inside DR-0008 reaches the owner through the decision queue instead of plan prose only. M1-P1 sets the package name per the recommendation; a veto before M3 first-publish costs one line. |
| SC-007 | Follows report (escalate-to-owner) | DR-0007, decided 2026-08-04 against the plan's assumed recommendation: dual substrate, persistent local machine and reclaimable cloud sessions both first-class. Applied across M1-P2 to M1-P6 by revision 4: lease-based lock, dual-mode watcher, executor adapter interface, and a per-phase substrate field separating substrate-neutral core from adapters. Application is scoped (PR-201): M1 discharges component design and the single-environment lifecycle; the multi-environment cloud fleet lifecycle is the named M4 work item in section 3's obligation split. |
| SC-008 | Follows report (resolve-in-plan, vetoable) | Plan decision D-6: "merge authority: owner" means the owner grants approval per PR and the orchestrator executes the merge serially as release manager. The structural encoding (approval as a deterministic check, an approving review from the owner) lands in the M3 outline (assurance-mode definitions in AGENTS.md) and M4 (branch protection, R-064). During M1 to M3 construction the current process's merge practice continues unchanged. |
| SC-009 | Follows report (resolve-in-plan) | Plan decision D-7, applied twice: (a) this plan's own Open questions section (section 8) contains only decision-record references, no free-floating questions; (b) the M2 outline's coverage checker spec enumerates exactly phase, decision (including status open), and parked as the accepted reference types. |
| SC-010 | Follows report (resolve-in-plan) | Plan decision D-8: the orchestrator never writes working-tree content or commits in projects/; ref updates through the designated merge tooling are the explicit release-manager carve-out. The M4 paragraph requires the project-write block hook to encode this carve-out; the M3 AGENTS.md states the scoped rule. |
| SC-011 | Follows report (resolve-in-plan) | M2 outline: gates get declared preconditions in the gate manifest; a gate whose precondition is unmet reports not-applicable, never green; the M2 exit test asserts the applicable subset explicitly. The kernel's release-verification analogue (published package installable and importable at the released version) lands in the M3 outline. |
| SC-012 | Follows report (escalate-to-owner) | DR-0008 (release registry choice), deferred by the owner on 2026-08-04 with a due date: decided before the M3 plan is approved. Does not block M1; blocks the M3 release phase. The plan's M3 outline reads "release v0.1.0 to the registry decided in DR-0008". |
| SC-013 | Already settled by the owner (settled decision 6, section 1.3) | Recorded in the M3 outline: the M3 self-delivery is the exit test's controlled exception, executed under current-process supervision; all other kernel work through the end of M4 cutover ships via the current process; from M4 exit onward the kernel is its own pilot-class project on v1. |

No orphans: all thirteen findings appear above exactly once, each landing in a phase, a decision record, or a named plan section.

---

## 3. M1: Walking skeleton, fully phased

M1 content is fixed by blueprint section 13: kernel repo scaffold (package.json, bin/, schemas/, roles/), fleet-home init plus doctor CLI, session lock, worktree pool, spawn, teardown guard, watcher plus liveness guard, toy sandbox project. Six sequential phases. All phases follow the decided DR-0005: TypeScript sources (ESM, strict) compiled to JavaScript, with the mechanics fixed by plan decisions D-17 (dist policy: built, never committed) and D-18 (test execution via Node 26 native type stripping, tsc guarding types and emitting dist). DR-0001 (Apache-2.0), DR-0002 (Node >= 26, CI on 26 only), and DR-0003 (GitHub Actions hosted ubuntu-latest) are likewise decided and applied. The six firstmate BORROW components are planned as BUILD in effort terms, with protocols harvested from the scouted firstmate source (plan decision D-1, DR-0009 decided, delivery/requirements/firstmate-scout-report.md). DR-0007 (dual substrate) and DR-0006 (lintable-schema-first), decided in owner round 2, are applied throughout: each phase from P2 on carries a substrate field separating substrate-neutral core from adapters, and the plan constraints below bind every implementer.

Plan constraints from the firstmate scout's traps (binding on every M1 implementer; a violation is a review finding):

- C-1 (FM-052, FM-049): one current-state authority per task: tasks/<id>/meta.json status plus the turn-end file's recorded exit code. Currency is never derived from the tail of an event or status log. Bites M1-P2 (doctor), M1-P4 (spawn, teardown), M1-P5 (watcher, guard).
- C-2 (FM-053): no pid-based identity anywhere in lock or liveness design. The session lock is a lease (holderId, acquiredAt, expiresAt, renewal); liveness is lease and beacon freshness; no process probing, no /proc, no signal-0 checks. Bites M1-P3, M1-P5.
- C-3 (FM-054): the kernel never auto-backgrounds the watcher. tiphys watch runs foreground; watch --once exists for external schedulers; no daemonize flag exists; arming is explicit and verified through the beacon by the liveness guard. Bites M1-P5.

DR-0007 obligation split (PR-201; the auditable milestone boundary; nothing in M1 claims the cloud lifecycle is delivered):

- M1 discharges: substrate-neutral component cores (lease-semantics lock, dual-mode watcher, file-based liveness, ExecutorAdapter interface with the local subprocess adapter and its launch record), and the single-environment fleet lifecycle: one environment at a time drives a fleet; the fleet home is a git repository whose durable content is tracked, with the sync seams specified (lease exclusion explicitly scoped to one filesystem and one clock, state currency designed as committed-and-pushed content with the push discipline landing as the M3 AGENTS.md duty per D-4 and PR-012).
- M4 discharges (the named residue work item, referenced by the M4 paragraph in section 7 and by the section 4 not-proven list; M4 dispatch is gated on its own intake and plan per EXT-F-06 and D-19): the multi-environment cloud fleet lifecycle: resume-after-reclamation (what survives a reclaimed session, what is rebuilt, how doctor reports a post-reclaim fleet), cross-environment lease exclusion through the shared fleet remote, fleet-state sync automation, and the cloud-session executor adapter.

Test accounting rule (EXT-F-05, binding for every M1 phase; it replaces monotonic test-count acceptance): each phase's acceptance criteria name its newly required behaviors; the phase adds at least one identified test per named behavior and registers the mapping (behavior name to test name) in test/behaviors.json (JSON per DR-0006, created by M1-P1 and appended by every phase); node --test must report zero unaccounted tests (every discovered test passes, fails, or is skipped with a recorded reason; full discovery parity remains the M2 wrapper's job, R-048); and no previously registered behavior's mapped test may disappear, checked by name against test/behaviors.json, never by count. Where a count appears in a criterion it is advisory only.

Shared phase fields, stated once: migrations: none, this is a library (applies to every M1 phase). parallelizable: no (applies to every M1 phase; M1 policy, section 1.4). Invocation form (PR-102), binding for every phase: in all phase steps and acceptance criteria, tiphys <cmd> means node bin/tiphys.ts <cmd> (the source entry, no build required); every phase inherits P1 criterion 1's property that npm test passes with dist/ absent; the P6 harness and the section 4 exit test invoke dist/bin/tiphys.js after npm run build, which is where the compiled form of every M1 subcommand is witnessed.

### M1-P1: Project ground: npm scaffold, test runner, CI

- id: M1-P1
- branch: claude/m1-p1-scaffold-and-ci
- intent: Create the project's own ground (npm package skeleton, node --test runner, CI gates workflow) so every subsequent phase lands through gates.
- grounding: Greenfield repo containing only delivery/ (verify: no package.json, no .github/ at branch point). DR-0001, DR-0002, DR-0003, DR-0005 decided 2026-08-04 and recorded in their DR files.
- steps:
  1. Verify greenfield: confirm package.json, .github/, bin/ are absent; record the check in the work history.
  2. Create package.json: name @tiphys/kernel (per DR-0008's recommendation; DR-0008 is deferred, so this is a working assumption due for decision before the M3 plan is approved, a one-line change until first publish), version 0.0.0, private for now, type module, license "Apache-2.0" (DR-0001), engines.node ">=26" (DR-0002), bin mapping tiphys to dist/bin/tiphys.js, a files entry including dist (the publish tarball ships compiled output), scripts: build runs tsc -b tsconfig.src.json tsconfig.test.json (full type check of all three roots plus emit into dist/, PR-101), test runs node --test "test/**/*.test.ts" with the pattern quoted in package.json so node, not the shell, performs the globbing (an unquoted ** would be flattened by the runner's shell and silently drop top-level files once subdirectories exist, PR-106; execution is native via Node 26 type stripping, D-18), prepack runs the build so any publish is freshly built (D-17); devDependencies: typescript at a pinned exact version (PR-003). Generate package-lock.json with npm install and commit it (PR-003).
  3. Create the TypeScript configs, mechanism pinned (PR-101): tsconfig.src.json covers bin/ and src/ with composite true and emits into dist/; tsconfig.test.json covers test/ with noEmit true and a project reference to the src config. Both carry strict true, NodeNext module and resolution, target compatible with Node 26, erasableSyntaxOnly true, rewriteRelativeImportExtensions true, and verbatimModuleSyntax true (PR-103: without verbatimModuleSyntax, a type-only import written as a value import is elided in dist/ but survives in the source Node runs under type stripping and fails there at runtime; the flag forces import type and keeps the two entries behaviorally identical). Relative imports are written with .ts extensions so Node runs the sources natively and tsc rewrites them to .js in emitted output (D-18). The build command is tsc -b (step 2), which follows the project reference; tsc -p would compile a single project and leave test/ unchecked.
  4. Create bin/tiphys.ts: executable dispatcher with a #!/usr/bin/env node shebang as its first line (tsc preserves it into dist/bin/tiphys.js, and npm derives the installed command's execute bit from it, PR-104); subcommand version prints the package.json version and exits 0; any unknown subcommand prints usage to stderr and exits 64; subcommands added by later phases register in one table in src/cli.ts.
  5. Create src/cli.ts (dispatch table) and src/version.ts.
  6. Create test/cli.test.ts with at least: version subcommand exits 0 and output equals package.json version; unknown subcommand exits 64. Create test/behaviors.json (JSON per DR-0006) registering this phase's named behaviors (version-output, unknown-subcommand-exit) mapped to their test names; every later phase appends its own mappings (EXT-F-05, section 3 test accounting rule).
  7. Create directory placeholders with one-line READMEs stating which milestone fills them: schemas/README.md (M3, pending DR-0006), roles/README.md (M3), tuition/README.md (directory scaffolded now per migration-table note on R-091; the tuition flow itself is M3).
  8. Create .github/workflows/gates.yml: a matrix job named test (matrix containing exactly one Node version, 26, per decided DR-0002; runner ubuntu-latest per decided DR-0003) running npm ci (which installs the pinned typescript), npm run build, npm test; plus a non-matrixed fan-in job named exactly gates that needs the test job and fails unless every matrix leg succeeded. The required-check context DR-0004's ruleset names is therefore "gates" verbatim; a matrixed job named gates would report per-leg contexts like "gates (26)" and the required check would never complete (PR-002; the fan-in also keeps the context stable if legs ever change). Triggers: pull_request and push to the default branch; per-ref concurrency group that cancels superseded runs.
  9. Create LICENSE containing the Apache-2.0 license text (DR-0001), .gitignore (node_modules, dist/, coverage output; dist/ is never committed, D-17), and a minimal CLAUDE.md recording the binding conventions of section 1.4 and the kernel repo's gate list (npm ci, npm run build, node --test) as the agent-rules single source for this repo until the M3 gate registry replaces it.
- files-to-touch (all create; verify absent first): package.json, package-lock.json, tsconfig.src.json, tsconfig.test.json, LICENSE, bin/tiphys.ts, src/cli.ts, src/version.ts, test/cli.test.ts, test/behaviors.json, schemas/README.md, roles/README.md, tuition/README.md, .github/workflows/gates.yml, .gitignore, CLAUDE.md.
- acceptance criteria:
  1. npm ci then npm run build exits 0 (tsc -b builds both configs and emits dist/); npm test exits 0 without requiring a prior build (tests run from TypeScript sources via Node 26 type stripping, D-18), with 0 failing and zero unaccounted tests (the N >= 2 test count is advisory only; EXT-F-05).
  2. After npm run build, dist/bin/tiphys.js exists and git status --porcelain reports no changes (dist/ is ignored and never committed, D-17).
  3. node bin/tiphys.ts version exits 0 and prints exactly the version field of package.json; node dist/bin/tiphys.js version prints byte-identical output (the source entry under type stripping and the compiled entry agree).
  4. node bin/tiphys.ts no-such-command exits with code 64 and writes a usage line to stderr.
  5. package.json contains engines.node ">=26" (DR-0002), license "Apache-2.0" (DR-0001), a files entry including dist, and a prepack script running the build; the LICENSE file contains the Apache-2.0 license text (inspection).
  6. .github/workflows/gates.yml defines a matrix job named test whose matrix contains exactly one Node version, 26, and a non-matrixed job named exactly gates that lists the test job in its needs and fails when any matrix leg fails, a concurrency group keyed on the ref with cancel-in-progress true, and triggers for pull_request and push to the default branch (inspection; PR-002, DR-0002, DR-0003).
  7. The phase PR shows the gates check completed successfully (observable on the PR).
  8. Directories bin/, schemas/, roles/, tuition/ exist and each contains at least one tracked file (git ls-files count > 0 per directory).
  9. tsconfig.src.json and tsconfig.test.json both set erasableSyntaxOnly, rewriteRelativeImportExtensions, and verbatimModuleSyntax to true; tsconfig.test.json sets noEmit true and carries a project reference to the src config (inspection; these guard the native-run plus compile combination of D-18; PR-101, PR-103).
  10. With a deliberate type error temporarily introduced in a test/ file, npm run build exits nonzero; likewise for a src/ file; both demonstrations are captured in the work history and reverted before the PR (PR-101: the test/ type-check boundary has a witness, in the style of P6 criterion 5).
  11. npm pack produces a tarball; npm install of that tarball into a temporary prefix exits 0, and running the installed tiphys version through that prefix's bin directory prints exactly the package.json version (PR-104: witnesses the shebang, the execute bit, the files allowlist, and the bin wiring that criterion 3's direct node invocation bypasses).
  12. test/behaviors.json exists, is valid JSON, and maps each behavior named in this phase's criteria to a test name present in the node --test run (EXT-F-05).
- suggested model tier: cheaper tier (layout is fully specified above; the work is mechanical).
- citations: R-048 (test-runner ground the M2 wrapper will wrap), R-064 (CI green becomes checkable), R-072 and R-097 (kernel repo's own concurrency group, early instance per plan decision D-15; the productized form stays M4), R-091 note (tuition/ scaffolded in M1); SC-006 (name field per DR-0008 recommendation); blueprint section 13 (M1 contents: scaffold), section 3 (npm package shape); process doc section 9 items 1 and 4.
- conflicts-with: M1-P2 through M1-P6 (all later phases extend src/cli.ts and test/); sequential ordering absorbs this.
- blocked-by: none remaining. DR-0001, DR-0002, DR-0003, and DR-0005 were decided 2026-08-04 and are applied by revisions 2 and 3. (DR-0004 is decided, approved in principle: the owner executes items 2 and 3 right after this phase merges, timing only, no approval pending; they gate the following merge, not this dispatch.)

### M1-P2: Fleet-home init and doctor CLI

- id: M1-P2
- branch: claude/m1-p2-fleet-init-doctor
- intent: Implement tiphys init (create a fleet home) and tiphys doctor (deterministic health checks with per-check PASS/WARN/FAIL lines).
- grounding: M1-P1 merged (dispatcher, tests, CI exist); branch protection active per decided DR-0004 (owner executes items 2 and 3 right after P1 merges; approved in principle, timing only). Topology per section 1.5. Fleet layout per blueprint section 3 with the SC-002 resolution (plan decision D-4).
- steps:
  1. Create src/fleet.ts: fleet-home layout constants and helpers (paths for charter/, decisions/, backlog.md, state/, tasks/, worktrees/, projects/) and a loadFleet(dir) that validates the layout and returns typed accessors.
  2. Create src/commands/init.ts: tiphys init <dir> creates the layout in an empty or absent directory: charter/, decisions/, state/, tasks/, worktrees/, projects/ (the projects area, PR-004), backlog.md (header only), package.json (fleet-home stub; the kernel dependency pin is added at M3 first publish, a documented placeholder until then), .gitignore ignoring exactly state/, worktrees/, and projects/, then git init plus an initial commit. The bootstrap commit uses command-scoped author and committer environment variables carrying a deterministic machine identity (a documented constant, for example Tiphys Fleet <fleet@tiphys.invalid>), set only on the commit invocation; init never reads or requires user git identity and never touches user or global git configuration (EXT-F-02, reviewer Option B). Running init on an already-initialized directory exits nonzero with a message containing "already initialized".
  3. Create src/commands/doctor.ts: tiphys doctor runs in a fleet home and prints one line per check, format "CHECK <name> PASS|WARN|FAIL <detail>", exiting 0 only if no check FAILs. Checks: node version satisfies the kernel's engines range (FAIL), git available (FAIL), gh available (WARN), fleet layout complete including projects/ (FAIL, names the missing entry), fleet git repo present with a remote configured (WARN, push-discipline per SC-002), lease lock readable (FAIL if corrupt, PASS if absent; reports holder and expiry when present, never probes a process, C-2), watcher beacon freshness (WARN "watcher not running or not scheduled" when absent, PR-206; this check is completed by M1-P5's liveness guard). Additional check: git commit identity (WARN when user.name or user.email is unset, detail noting that fleet-scoped commits use init's deterministic machine identity and do not require it; EXT-F-02). Readiness profiles (EXT-F-08): tiphys doctor --for <profile> with profiles generic (default), local-only, direct-pr, full, watch; a profile promotes its required WARN conditions to FAIL, so exit 0 under a profile means ready for that mode (aligned with SC-011's precondition semantics: never green by omission). M1 profile table, deliberately small and grown at M2/M3 with the gate registry: generic and local-only promote nothing beyond the standing FAILs; direct-pr promotes gh-missing; full promotes gh-missing and remote-missing; watch promotes beacon-absent. Every doctor check is file-based (substrate-neutral, DR-0007), and any task-currency reading comes exclusively from tasks/<id>/meta.json and turn-end files, never from a log tail (plan constraint C-1).
  4. Register both subcommands in src/cli.ts.
  5. Tests in test/init.test.ts and test/doctor.test.ts using temp directories.
- files-to-touch: src/fleet.ts, src/commands/init.ts, src/commands/doctor.ts, test/init.test.ts, test/doctor.test.ts (create); src/cli.ts (edit, verify dispatch table shape first).
- acceptance criteria:
  1. tiphys init <empty tmp dir> exits 0 and creates charter/, decisions/, state/, tasks/, worktrees/, projects/, backlog.md, package.json, .gitignore, and a .git directory with at least one commit (git -C <dir> rev-list --count HEAD >= 1).
  2. A second tiphys init on the same directory exits nonzero and stderr contains "already initialized".
  3. In the initialized fleet home, git check-ignore state/anything, git check-ignore worktrees/anything, and git check-ignore projects/anything all exit 0, while git check-ignore decisions/anything and git check-ignore charter/anything both exit 1 (SC-002: durable dirs tracked, ephemera and clones ignored; PR-004).
  4. tiphys doctor in a healthy fleet home exits 0 and stdout contains one "CHECK <name>" line per check listed in step 3, none of them FAIL.
  5. After deleting decisions/, tiphys doctor exits nonzero and stdout contains "CHECK layout FAIL" naming decisions.
  6. tiphys doctor in a directory that is not a fleet home exits nonzero.
  7. With HOME set to an empty temporary directory and global and system git config pointed at nonexistent paths (GIT_CONFIG_GLOBAL, GIT_CONFIG_SYSTEM), tiphys init exits 0, the bootstrap commit exists with the documented deterministic machine identity as both author and committer, and no global git config file was created or modified (EXT-F-02).
  8. With gh absent from PATH, tiphys doctor exits 0 and stdout contains "CHECK gh WARN"; the same fleet under tiphys doctor --for full exits nonzero and stdout contains "CHECK gh FAIL" (EXT-F-08, profile promotion witnessed in both directions).
  9. node --test exits 0 with 0 failing and zero unaccounted tests; test/behaviors.json maps every behavior newly named by this phase's criteria to a test present in this run, and every previously registered mapping still resolves (checked by name, not count; EXT-F-05).
- suggested model tier: cheaper tier acceptable (deterministic file layout work).
- substrate (DR-0007): fully substrate-neutral, no adapter; init and doctor are pure filesystem and git and behave identically on a persistent machine and in a cloud session.
- citations: R-080 (fleet state layout), R-095 (supervision preconditions checked by doctor); SC-002 (fleet durability, resolved here), SC-003 (topology per section 1.5); blueprint sections 3 and 13 (M1 contents: fleet-home init + doctor); beacon convention FM-043; plan constraint C-1.
- conflicts-with: M1-P3 through M1-P6 (src/cli.ts, src/fleet.ts).
- blocked-by: none remaining (all cited DRs decided; DR-0007 dual substrate applied by revision 4).

### M1-P3: Session lock and worktree pool

- id: M1-P3
- branch: claude/m1-p3-lock-and-pool
- intent: Build the one-orchestrator-per-fleet lease-based session lock and the clean disposable worktree pool (BUILD in effort per plan decision D-1, protocols harvested per the citations).
- grounding: M1-P2 merged (fleet home exists to hold state/). DR-0009 decided: the firstmate source was supplied and scouted (delivery/requirements/firstmate-scout-report.md); this phase harvests protocols via the citations below while remaining BUILD in effort (D-1); acceptance criteria are unchanged by the scout.
- steps:
  1. Create src/lock.ts: lease-based session lock (decided DR-0007; plan constraint C-2: no pid-based identity anywhere). The lockfile at state/orchestrator.lock contains JSON {holderId, hostname, acquiredAt, expiresAt}, where holderId is an opaque token generated at acquire, never a pid. The default lease duration is 900 seconds, configurable; the renewal rule is that the holder renews at or before half-life (PR-203). Mutation contract (EXT-F-01, adopted verbatim as plan-level contract): renew fails if the lease is expired and succeeds only while holderId matches and expiresAt is still in the future; takeover (--take-over) succeeds only if the observed lease is still the lease being replaced, with compare-and-swap semantics over the lease file content, and serializes with renew, release, and competing takeover operations; all lock mutations (acquire, renew, release, takeover) go through one shared atomic mutation primitive (each mutation is decided against an observed lease state and applied only if the file still holds exactly that state, confirmed by re-reading a unique per-mutation token; a confirmation showing another writer's token means the mutation lost and returns failure without retry); command ownership is not considered valid until that primitive completes. Acquire on an absent lockfile uses O_EXCL creation through the same primitive (PR-006); an unexpired lease refuses acquire, an expired lease also refuses but reports expired (takeover is always explicit); takeover of an unexpired lease is refused. status always exits 0 and reports free, held, or expired, printing holderId, acquiredAt, and expiresAt so a human takeover decision is informed. Liveness is lease freshness only; the module contains no process checks (FM-053). Exclusion domain (PR-201): the lease excludes within one filesystem and one clock, the fleet home the lockfile lives in; cross-environment exclusion for a fleet shared through a git remote is part of the M4 residue named in section 3's obligation split and is not claimed by M1. Holdership on mutating commands is verified in M1-P4 (spawn and teardown check the caller's identity against the lease, PR-203); a paused holder whose lease expired cannot renew (expired renewal fails, EXT-F-01) and cannot mutate through the kernel (a losing holderId is refused), which closes the dual-writer window for kernel commands; module docs note that mutations outside the CLI are not covered. Harvested protocol, cited for the brief (FM-017 to FM-022): the acquire-refuse-then-read-only flow and read-back confirmation from bin/fm-lock.sh:47-85 and bin/fm-session-lock-lib.sh in the scouted clone; the mechanism is deliberately not ported (FM-058: no steal-protocol cleverness; the single compare-and-swap primitive with the concurrency criteria below is the simpler correct shape).
  2. Create src/commands/lock.ts: subcommands lock acquire [--take-over], lock renew, lock release, lock status.
  3. Create src/pool.ts: worktree pool over a project clone. pool create --task <id> --project <path> [--offline]: base resolution is five binding steps (EXT-F-03): (1) resolve the project's configured remote and its default branch (origin/HEAD when set, otherwise the remote's advertised default); (2) fetch that branch; (3) record the fetched base SHA in the pool record and emit it on stdout (spawn copies it into tasks/<id>/meta.json as baseSha, M1-P4); (4) create the task branch and the worktree at <fleet>/worktrees/<task-id> directly from that exact SHA; (5) on fetch failure, fail rather than silently use a stale local branch, unless --offline was explicitly passed, in which case the last fetched remote-tracking SHA is used and offline: true is recorded. This composes with teardown's fetch-before-evaluate discipline (PR-001, M1-P4 step 5): the branch starts from the fetched remote base and lands against the fetched remote default; neither end trusts a stale local ref. Refuses duplicate task ids; parallel-safe (unique paths, atomic directory creation, git worktree add's own locking). pool list prints one line per worktree with task id and HEAD sha. pool destroy --task <id>: refuses (exit nonzero, reason line) if the worktree has uncommitted changes or untracked files; otherwise removes the directory and prunes the git worktree registration. A --discard flag overrides the dirty refusal and removes anyway; refusal stays the default, and --discard is documented as reserved for the teardown scout path (PR-010). If a destroy operation hits a transient git index.lock, retry; remove such a lock file only under a fail-safe staleness proof (provably no holder and age beyond a threshold; any uncertainty means leave it and exit nonzero), per FM-036 and FM-051.
  4. Create src/commands/pool.ts and register subcommands.
  5. Tests: test/lock.test.ts (including a short-duration lease allowed to lapse to produce a real expired lease, and a killed holder whose unexpired lease correctly still refuses acquire: holder death is invisible to a lease, C-2; PR-208), test/pool.test.ts (against a scratch git repo created in the test).
- files-to-touch: src/lock.ts, src/commands/lock.ts, src/pool.ts, src/commands/pool.ts, test/lock.test.ts, test/pool.test.ts (create); src/cli.ts (edit).
- acceptance criteria:
  1. lock acquire in a fleet home exits 0 and creates state/orchestrator.lock whose JSON parses and contains a non-empty holderId and an expiresAt strictly in the future; no pid field exists anywhere in the file (C-2).
  2. While an unexpired lease exists, a second lock acquire from a different process exits nonzero, stderr contains "lock held", and the lock file content is byte-identical before and after the attempt.
  3. Five concurrent lock acquire invocations against a free lock yield exactly one exit 0 and four nonzero exits, and the lock file afterward contains the winner's holderId (PR-006: mutual exclusion is atomic, not read-then-write).
  4. lock renew by the holding holderId on an unexpired lease exits 0 and strictly increases expiresAt; lock renew on an expired lease exits nonzero even when holderId matches (EXT-F-01 witness: paused-holder renewal after expiry fails); lock renew with a non-matching holderId exits nonzero; every failing renew leaves the file byte-identical.
  5. With an expired lease (the test uses a short lease duration and waits past expiry), lock status exits 0 and stdout contains "expired", the holderId, and the expiry timestamp; lock acquire without --take-over still exits nonzero; lock acquire --take-over exits 0 and the file contains a new holderId with a fresh future expiresAt.
  6. A renew raced concurrently against a takeover at the expiry boundary (scripted interleave, short lease) serializes: exactly one operation exits 0, the file afterward contains exactly that winner's holderId with the token its mutation wrote, and the loser exited nonzero (EXT-F-01 witness: renew versus takeover).
  7. Two concurrent lock acquire --take-over invocations on an expired lease yield exactly one exit 0 and one nonzero exit, and the file afterward contains the winner's holderId (EXT-F-01 witness: takeover versus takeover; the compare-and-swap confirmation is what the loser fails).
  8. A release by the expired former holder raced against a takeover yields exactly one of two auditable outcomes: the release completed first and the takeover exits nonzero (its observed lease is gone), or the takeover completed first and the release exits nonzero (the file no longer holds the releaser's lease); in neither outcome is the new holder's lease removed or altered (EXT-F-01 witness: release versus takeover).
  9. After a completed takeover, any lock mutation (renew or release) attempted with the losing holderId exits nonzero and leaves the winner's lease byte-identical (EXT-F-01 witness: mutation with the losing holder id; the kernel-command half of this witness is M1-P4 criteria 12 and 13).
  10. grep over src/lock.ts shows no process.kill, no signal-0 probing, no /proc access, and no pid field (C-2, structural inspection).
  11. pool create --task t-a against a scratch project with a remote exits 0; the worktree at worktrees/t-a has empty git status --porcelain output and its HEAD sha equals the remote default branch head sha emitted as the base SHA, both when the clone's local default branch is behind the remote and when it is ahead (both staged in the test; EXT-F-03: a stale local branch is never the base).
  12. With the project clone at a detached HEAD, and separately with origin/HEAD unset, pool create still resolves the remote default branch, exits 0, and records the correct base SHA (EXT-F-03).
  13. With the remote unreachable, pool create exits nonzero and creates nothing; the same invocation with --offline exits 0, uses the last fetched remote-tracking SHA, and records that SHA plus offline: true (EXT-F-03, falsifiable in both directions).
  14. pool create with an already-used task id exits nonzero and stderr names the id.
  15. Two pool create invocations for distinct task ids launched concurrently both exit 0 and git worktree list in the project shows both worktrees.
  16. pool destroy on a worktree with an uncommitted file exits nonzero and the directory still exists; the same worktree with --discard exits 0, the directory is gone, and git worktree list no longer shows it (PR-010); a clean worktree is likewise removed by pool destroy without flags.
  17. node --test exits 0 with 0 failing and zero unaccounted tests; test/behaviors.json maps every behavior newly named by this phase's criteria to a test present in this run, and every previously registered mapping still resolves (checked by name, not count; EXT-F-05).
- suggested model tier: strongest (concurrency and liveness semantics are correctness-bearing).
- substrate (DR-0007): fully substrate-neutral, no adapter; the lease lock and the worktree pool are pure filesystem and git, identical on a persistent machine and in a cloud session.
- citations: R-003 (fresh disposable worktree per task), R-080 (locks live under fleet state/); blueprint section 4 (session lock and worktree pool contracts), section 10 point 5 (one orchestrator per fleet); DR-0009; firstmate harvest citations for the brief (delivery/requirements/firstmate-scout-report.md): lock protocol FM-017 to FM-022 (bin/fm-lock.sh:47-85, bin/fm-session-lock-lib.sh), traps FM-053 (C-2) and FM-058. Provenance note (FM-023, FM-065): the blueprint's BORROW label for the worktree pool is factually wrong; the pool implementation was never firstmate's (it is the external treehouse binary, whose license is unverified, FM-041); this plan builds the pool clean from the contract (FM-026), which also sidesteps the treehouse license question.
- conflicts-with: M1-P4 through M1-P6 (src/cli.ts; P4 consumes src/pool.ts).
- blocked-by: none remaining (all cited DRs decided; DR-0007 dual substrate applied by revision 4; DR-0009 decided and folded into the brief citations).

### M1-P4: Spawn and teardown guard

- id: M1-P4
- branch: claude/m1-p4-spawn-and-teardown
- intent: Build spawn (worktree + brief + turn-end hook + task meta in one command, with an executor seam) and the teardown guard (refuses while unlanded work is present, scout carve-out, salvage path).
- grounding: M1-P3 merged (pool and lock exist). Executor adapters per decided DR-0007: execution sits behind an ExecutorAdapter interface whose entire contract is: write the launch record tasks/<id>/executor.json at launch (JSON per DR-0006: {adapter, launchedAt, deadline?}; PR-207), launch the payload in the task worktree, and ensure the turn-end file is written with the payload exit code on completion; all state crosses the adapter boundary through files and exit codes, never through terminal inspection (FM-055: pane scraping is a race farm; FM-060: every toolbelt boundary is a subprocess with an exit code). Non-completion (a reclaimed session or killed payload) is detected via the launch record's optional deadline by the M1-P5 watcher, file-based and C-2-compliant; abandonment of a task launched without a deadline is not auto-detected in M1, recovery is manual teardown (recorded in the section 4 not-proven list, PR-207). M1 ships the local subprocess adapter (also what the exit test's stub payload uses); a multiplexer-window adapter and a cloud-session adapter are additional adapters written against the same interface, not kernel changes (M4 era).
- steps:
  1. Create src/task.ts: task meta at <fleet>/tasks/<id>/meta.json, plain JSON (plan decision D-3), fields: id, project, shape (ship or scout), branch, worktree, baseSha (the fetched base SHA emitted by pool create, EXT-F-03), status (open or closed), createdAt. Documented in a docs comment; plain JSON per D-3 (complies with decided DR-0006). meta.json status plus the turn-end exit code are the single current-state authority for a task (plan constraint C-1; FM-052: firstmate's false-surface incidents came from reading currency off a status log tail; FM-049: turn-end markers are notifications, meta is state). Field set informed by firstmate's meta catalog (FM-028, bin/fm-spawn.sh:2024-2067 in the scouted clone).
  2. Create src/brief.ts: brief assembly writes tasks/<id>/brief.md from the provided brief file, appending verbatim the fleet's environment-warnings file (state/../warnings.md location: fleet root warnings.md, tracked) when present (R-083b).
  3. Create src/hooks.ts: turn-end hook, a generated script placed in the task directory and invoked by the executor when the payload command exits; it writes tasks/<id>/turn-end as JSON {endedAt: ISO-8601 timestamp, exitCode: number} with the payload exit code (R-082b; format per DR-0006, PR-209). This file is the watcher's wake signal in M1-P5. Hook and meta live in the task directory, never inside the worktree, so the pool's dirty check never needs an exemption list (FM-059: firstmate must hardcode exemptions for its own injected files; this invariant is absolute).
  4. Create src/spawn.ts and src/commands/spawn.ts: tiphys spawn --task <id> --project <path> --brief <file> --shape ship|scout --exec <cmd> performs, in order: liveness-guard check (completed in P5; in this phase a no-op seam), pool create, brief assembly, meta write, executor launch through the ExecutorAdapter (M1: the local subprocess adapter) with cwd set to the worktree and the turn-end hook wired. In M1, --exec is required: spawn without it exits 64 with usage, because the multiplexer-window adapter that would make an exec-less spawn meaningful is M4-era (PR-013). An optional --deadline <seconds> sets the deadline field of the launch record tasks/<id>/executor.json that the adapter writes at launch (PR-207). Holdership check (PR-203): when a lease file exists, spawn verifies that the caller's holder identity (the TIPHYS_HOLDER_ID environment variable, set by the operator from lock acquire's output) matches the lockfile's holderId and that the lease is unexpired, refusing with a reason line on mismatch or expiry; with no lease file present it proceeds (M1 test contexts). The subprocess executor runs the payload to completion before spawn returns, and the payload exit code is recorded in the turn-end file (PR-013). One command, everything or a clean rollback (a failed step removes what that invocation created, and only that, then exits nonzero).
  5. Create src/teardown.ts and src/commands/teardown.ts: tiphys teardown --task <id> [--salvage]. Teardown performs the same holdership check as spawn (PR-203: when a lease file exists, TIPHYS_HOLDER_ID must match the lockfile's holderId with the lease unexpired, refusal otherwise). Teardown first fetches the project's default branch from its remote (git fetch); every landed-ness check runs against the fetched ref, never a possibly stale local one (PR-001). Refusal rules, checked in order: (a) shape scout: refuse unless tasks/<id>/report.md exists; with a report, scratch changes are discarded via pool destroy --discard and teardown proceeds (scout worktrees are scratch, scouts never push; PR-010). (b) shape ship: refuse if the worktree is dirty (unless --salvage: commit leavings as a commit whose message starts with "WIP-UNREVIEWED (do not treat as reviewed):" and push the branch, then proceed) and refuse unless the task branch is landed on the fetched default branch. Landed means either (i) the branch head is an ancestor of the fetched default branch head, or (ii) merging the branch into the fetched default branch is a no-op: git merge-tree --write-tree <fetched-default> <branch> reports no conflicts and produces a tree id equal to the fetched default head's tree id. Definition (ii) recognizes squash merges regardless of the branch's commit count, and squash is the process's own merge practice (PR-001). Prior art cited for the brief: firstmate's content_in_default implements the same merge-tree tree-equality procedure (FM-035, FM-038, bin/fm-teardown.sh:678-712 in the scouted clone), independently validating PR-001's landed definition; its fail-closed rule (any inconclusive check refuses rather than guesses) is adopted verbatim. --salvage never overrides the unlanded refusal; it only rescues uncommitted leavings onto the branch. (c) On success: pool destroy, meta status set to closed. Every refusal is exit nonzero plus a single reason line naming the blocking condition.
  6. Register subcommands; tests in test/spawn.test.ts and test/teardown.test.ts against scratch repos, using a stub payload command.
- files-to-touch: src/task.ts, src/brief.ts, src/hooks.ts, src/spawn.ts, src/teardown.ts, src/commands/spawn.ts, src/commands/teardown.ts, test/spawn.test.ts, test/teardown.test.ts (create); src/cli.ts (edit); src/pool.ts (no edit expected: the --discard flag the scout teardown path uses ships in M1-P3; verify before touching, PR-010).
- acceptance criteria:
  1. spawn with a stub exec that writes its cwd to a file exits 0 and: the written cwd path is under <fleet>/worktrees/<id>; tasks/<id>/meta.json parses with all documented fields, status open, and a baseSha equal to the base SHA pool create emitted (EXT-F-03); tasks/<id>/brief.md contains both the brief text and the full text of the fleet warnings.md file when one exists (and exactly the brief text when none exists). spawn returns only after the exec command has exited: the stub sleeps briefly and writes a completion marker, and the marker exists at the moment spawn returns (PR-013).
  2. After the stub exec exits, tasks/<id>/turn-end exists and parses as JSON {endedAt, exitCode} where endedAt is a parseable ISO-8601 timestamp and exitCode equals the exec exit code (PR-209).
  3. spawn without --exec exits 64, prints usage to stderr, and creates nothing: no worktree, no tasks/<id>/ (PR-013).
  4. If pool create fails (duplicate task id already used by a live task), spawn exits nonzero, the pre-existing tasks/<id>/ contents are byte-identical before and after, and the failing invocation created no new files (PR-005: rollback must never touch another task's artifacts).
  5. If a step after pool create fails (executor launch failure, simulated with a nonexistent exec binary), spawn exits nonzero and the worktree and tasks/<id>/ entries created by that invocation are removed (PR-005 companion: rollback removes what the failing invocation created, and only that).
  6. For a ship task whose branch has a pushed commit absent from the fetched default branch, teardown exits nonzero, prints one reason line containing the branch name, and the worktree directory still exists (PR-001: the refusal is evaluated against freshly fetched remote state).
  7. For a ship task with two commits on its branch that the harness squash-merges into the default branch on the scratch remote (git merge --squash plus a single commit, pushed to the remote), with the teardown-side clone's local default ref deliberately left stale, teardown exits 0: fetch-then-merge-tree recognizes the squash merge as landed (PR-001; two commits, so a per-commit patch-id implementation cannot pass this criterion).
  8. For a ship task with uncommitted changes: teardown without --salvage exits nonzero; teardown --salvage with unlanded commits still exits nonzero (salvage never overrides the unlanded refusal); after the branch is landed via the squash path of criterion 7 and the tree is dirty, teardown --salvage exits 0 and the branch tip commit message starts with "WIP-UNREVIEWED (do not treat as reviewed):".
  9. For a scout task with a dirty scratch worktree: teardown exits nonzero while tasks/<id>/report.md is absent; after report.md is created, teardown exits 0 and the worktree is removed via pool destroy --discard without any push (the scratch repo's remote refs are unchanged, verified by comparing git ls-remote output before and after; PR-010).
  10. After a successful teardown, meta.json status equals closed and git worktree list no longer shows the task worktree.
  11. After spawn, tasks/<id>/executor.json parses as JSON with adapter "subprocess" and a parseable ISO-8601 launchedAt; when --deadline was passed, the deadline field is present and correct; when not, it is absent (PR-207).
  12. With a lease held and TIPHYS_HOLDER_ID unset or not matching the lockfile's holderId, spawn exits nonzero with a reason line naming the lease and creates nothing; with TIPHYS_HOLDER_ID matching and the lease unexpired, the same spawn proceeds (PR-203, falsifiable in both directions).
  13. The same both-directions holdership check holds for teardown (PR-203).
  14. node --test exits 0 with 0 failing and zero unaccounted tests; test/behaviors.json maps every behavior newly named by this phase's criteria to a test present in this run, and every previously registered mapping still resolves (checked by name, not count; EXT-F-05).
- suggested model tier: strongest (most architecture-bearing phase of M1; the executor seam and refusal ordering carry long-lived contracts).
- substrate (DR-0007): core is substrate-neutral (worktree acquisition, brief assembly, meta, turn-end contract, teardown rules); the sole adapter is the executor: the local subprocess adapter ships in M1, and window or cloud-session adapters are M4-era additions against the same interface.
- citations: R-003 and R-009a (fresh isolated context per task, structural), R-033b (brief assembly is one command), R-052b (teardown refuses without report), R-081a (salvage as labeled WIP commit), R-082b (turn-end hook), R-083b (warnings file into every brief); blueprint section 4 (spawn and teardown contracts), section 9 (scout shape); DR-0007 (executor adapter), DR-0009; firstmate harvest citations for the brief (delivery/requirements/firstmate-scout-report.md): meta field catalog FM-028 (bin/fm-spawn.sh:2024-2067), turn-end hook ancestry FM-029, landedness prior art FM-035 and FM-038 (bin/fm-teardown.sh:580-712), hooks-outside-worktree discipline FM-059, delivery-contract cross-check FM-048; traps C-1 (FM-052, FM-049), FM-055, FM-060.
- conflicts-with: M1-P5, M1-P6 (src/cli.ts; P5 consumes the turn-end signal contract).
- blocked-by: none remaining (all cited DRs decided; DR-0007 dual substrate applied by revision 4; DR-0009 decided and folded into the brief citations).

### M1-P5: Watcher and liveness guard

- id: M1-P5
- branch: claude/m1-p5-watcher-liveness
- intent: Build the watcher (one substrate-neutral core, two entry modes: resident foreground process and externally triggered single pass; one reason line, zero tokens idle, exponential heartbeat backoff, beacon) and the liveness guard wired into every supervision command.
- grounding: M1-P4 merged (turn-end signal files exist as the wake source; spawn/teardown/doctor have guard seams).
- steps:
  1. Create src/watcher.ts and src/commands/watch.ts: one substrate-neutral core with two entry modes (decided DR-0007). Resident mode: tiphys watch runs as a plain foreground process. Single-pass mode: tiphys watch --once performs exactly one evaluation of the same wake sources and exits, for external triggers on reclaimable substrates (a cloud session, a scheduler). The kernel never backgrounds either mode and no daemonize flag exists; arming is explicit and verified through the beacon (plan constraint C-3; FM-054: firstmate lost supervision for about 30 minutes to shell auto-backgrounding). Wake sources, each producing a single stdout reason line then exit 0 (grammar harvested from firstmate, FM-002, bin/fm-watch.sh:13-55 in the scouted clone): "signal <task-id> <event>" (a new turn-end file for an open task), "stale <what>" (an open task whose worktree or meta is in a contradictory state, enumerated in the module docs; currency is read from meta and turn-end files only, never from a log tail, C-1), "check <name>" (a requested one-shot check via a state/check-request file), "heartbeat <n>" (in resident mode only when --max-heartbeats is set and reached; in --once mode whenever the heartbeat is due). --once with nothing actionable prints nothing and exits with the documented no-wake code 3. All cadence state is persisted in state/watcher.cadence.json, a JSON file with explicit timestamps (lastHeartbeatAt, backoffStreak), never in process memory, so resident restarts and single passes share one schedule (FM-006, FM-045: firstmate's on-disk cadence is the enabling pattern for the single-pass mode; the representation is upgraded from mtimes to JSON per DR-0006, which is also more robust under copy and sync, PR-209). Virgin fleet (PR-205): absent cadence state is initialized to the current time on first evaluation without surfacing a heartbeat; the first heartbeat falls due one base interval later. Signal currency (PR-204): a turn-end wake is surfaced at most once across both modes; state/watcher.seen.json (JSON per DR-0006) records per task the identity of the last surfaced turn-end (size, mtime, and content signature, per FM-005), advanced only when a wake is surfaced, using the same atomic write-then-verify discipline as the lock, and only after the wake record has been durably appended to state/last-wake.json (enqueue-before-suppress, FM-046: a crash between the two duplicates rather than drops); a resident watcher and a concurrent --once race on the seen-state write, and the loser treats the wake as already surfaced and reports no-wake. Stale enumeration addition (PR-207): "stale <task-id> deadline" when an open task's tasks/<id>/executor.json deadline has passed with no turn-end (file evidence only, C-2). Resident idle behavior: fs.watch on the fleet state and tasks directories with a polling fallback; the heartbeat interval starts at a configurable base and doubles up to a cap (calibration starting point FM-044), resetting on any surfaced non-heartbeat wake; every watcher evaluation rewrites state/watcher.beacon with an ISO timestamp and the current backoff, including a no-wake --once pass (PR-206: the beacon means "supervision executed recently", identically in both modes, so the PR-009 invariant is trigger-period-independent for any scheduler at least as frequent as the poll interval). The watcher surfaces wakes and never classifies or absorbs them; module docs record FM-057 (firstmate's absorb-triage grew to most of its 1126 lines because its completion signals were weak; a proposal to add classification here is a signal-design red flag). The watcher is a plain Node process: it imports no network or LLM client (zero tokens idle is structural).
  2. Create src/liveness.ts: guard(fleet) returns {inFlight, beaconAgeMs, stale} where stale means at least one open task exists and the beacon is absent or older than a threshold (default documented, configurable). Freshness is beacon-file based only; no process checks (C-2, FM-053). Scout note (FM-016): firstmate's guard grace sits far below its heartbeat cap, which is safe only because its beacon cadence is its 15s poll interval; Tiphys writes the beacon per wake and heartbeat, which is exactly why the following invariant is binding. Invariant (PR-009): the default stale threshold is strictly greater than the backoff cap plus one poll interval, and liveness.ts enforces threshold > cap + poll interval at load; a configuration violating it is an error (load fails with a message naming both values), so a healthy watcher idling at maximum backoff can never read as stale. In --once-only operation the guard's threshold additionally bounds the acceptable external trigger period: a scheduler must trigger at least as often as the threshold to stay fresh, which the operator configures and the module docs state (PR-206). Wire the guard into spawn, teardown, and doctor (completing the P2 and P4 seams): a stale result prints one stderr warning line containing "watcher stale" but does not block the command (warn, per blueprint liveness-guard contract).
  3. Tests: test/watcher.test.ts drives the watcher as a child process against a temp fleet (short base interval), test/liveness.test.ts covers fresh, absent, and stale beacons.
- files-to-touch: src/watcher.ts, src/commands/watch.ts, src/liveness.ts, test/watcher.test.ts, test/liveness.test.ts (create); src/cli.ts, src/commands/spawn.ts, src/commands/teardown.ts, src/commands/doctor.ts (edit: wire the guard; verify seam shape first).
- acceptance criteria:
  1. tiphys watch started against a fleet with one open task and no signals is still running after three base heartbeat intervals (process poll), and state/watcher.beacon has been rewritten with monotonically increasing timestamps whose successive gaps grow (each gap >= the previous gap, until the cap).
  2. Creating tasks/<id>/turn-end for an open task causes the watcher process to exit 0 within the documented poll interval, with stdout consisting of exactly one line matching the documented pattern "signal <task-id> turn-end".
  3. With no open tasks and no signals, the watcher does not exit on heartbeats (still running after three intervals) unless --max-heartbeats is set, in which case it exits 0 with the line "heartbeat <n>".
  4. On a virgin fleet (no cadence state) and with no pending signal, tiphys watch --once prints nothing to stdout and exits with the documented no-wake code 3, guaranteed by the initialization rule in step 1 (PR-205); with a turn-end file pending for an open task, watch --once exits 0 with the same single line "signal <task-id> turn-end" as resident mode (single-pass parity, DR-0007).
  5. With a short base interval, a watch --once pass run after the heartbeat interval has elapsed since the last recorded heartbeat exits 0 printing "heartbeat <n>", and an immediately following --once pass exits with the no-wake code: the schedule is persisted as file state on disk, not in process memory (FM-006, FM-045).
  6. After a --once pass surfaces "signal <task-id> turn-end", an immediately following --once pass on the unchanged fleet exits with the no-wake code 3: the seen-state advanced with the surfaced wake (PR-204).
  7. A resident watcher and a concurrent --once pass evaluating the same pending turn-end never both surface it: exactly one prints the signal line and exits 0, the other reports no-wake (PR-204: the seen-state write is atomic write-then-verify, and the loser yields).
  8. A no-wake --once pass (exit 3) strictly advances the beacon timestamp (PR-206).
  9. With an open task whose tasks/<id>/executor.json carries a deadline in the past and no turn-end file, watch --once exits 0 with a single stdout line matching "stale <task-id> deadline" (PR-207: abandonment with a declared deadline is detected from file evidence alone, C-2).
  10. With one open task and a beacon file older than the threshold, tiphys spawn, tiphys teardown, and tiphys doctor each emit one stderr line containing "watcher stale" and still perform their normal function (exit codes unchanged versus the fresh-beacon runs of the same scenarios).
  11. With a fresh beacon, the same three commands emit no "watcher stale" line (falsifiable in both directions).
  12. With the watcher idle at maximum backoff, the guard reports fresh (no "watcher stale" line) at every probe across the entire gap between two consecutive heartbeats (PR-009); loading liveness.ts with a configuration where the threshold is not strictly greater than the backoff cap plus one poll interval fails with an error naming both values.
  13. grep over src/watcher.ts and its imports shows no import of http, https, fetch, or any network client module (structural zero-tokens-idle check, inspection).
  14. grep over src/watcher.ts, src/liveness.ts, and src/commands/watch.ts shows no process.kill, no signal-0 probing, no /proc access, and no pid identity (C-2); the watch command exposes no daemonize or background flag, and the kernel code never spawns the watcher detached (no detached: true, no unref on the watcher path) (C-3, structural inspection).
  15. node --test exits 0 with 0 failing and zero unaccounted tests; test/behaviors.json maps every behavior newly named by this phase's criteria to a test present in this run, and every previously registered mapping still resolves (checked by name, not count; EXT-F-05).
- suggested model tier: strongest (event semantics, backoff, and child-process test harness are correctness-bearing).
- substrate (DR-0007): the entire watcher core and guard predicate are substrate-neutral (files, mtimes, exit codes); resident mode serves the persistent machine, --once serves cloud sessions and external schedulers; the two entry modes are one core and no adapter code exists in this phase.
- citations: R-078 (watcher + liveness guard replace the cron heartbeat; deliberate deviation from process-doc letter, plan decision D-14), R-079 (supervision never silently disappears while work is in flight: beacon plus guard), R-095 (doctor's beacon check completed here); blueprint section 4 (watcher and liveness guard contracts); DR-0007, DR-0009; firstmate harvest citations for the brief (delivery/requirements/firstmate-scout-report.md): reason-line grammar and backoff protocol FM-002 to FM-006 (bin/fm-watch.sh:13-55, 112-113, 432-460), beacon convention FM-043, liveness predicate FM-014 (bin/fm-supervision-lib.sh:35-89), single-pass enabler FM-045; traps C-1 (FM-052), C-2 (FM-053), C-3 (FM-054), FM-057.
- conflicts-with: M1-P6 (src/cli.ts).
- blocked-by: none remaining (all cited DRs decided; DR-0007 dual substrate applied by revision 4; DR-0009 decided and folded into the brief citations).

### M1-P6: Toy sandbox project and exit-test harness

- id: M1-P6
- branch: claude/m1-p6-toy-sandbox-exit
- intent: Create the toy sandbox project and a scripted, deterministic M1 exit-test harness (with a local dry-run mode for CI and a full mode against the real toy repo).
- grounding: M1-P1 through M1-P5 merged. Owner action A-1 done (toy sandbox GitHub repository exists, see section 7). gh CLI authenticated for full mode.
- steps:
  1. Create sandbox/ in the kernel repo: the toy project's content (package.json named toy-sandbox, one src file, one node --test test, a README stating its purpose), plus scripts/seed-sandbox.sh that pushes this content to the owner-created toy repo (idempotent: safe to re-run).
  2. Create scripts/m1-exit-test.sh implementing section 4's procedure verbatim, parameterized by --mode local|full. local mode uses a scratch bare repo as the "remote" and asserts a pushed branch instead of a PR (no credentials, runs in CI); full mode uses the real toy repo and gh to open and verify the PR. Every step appends its command, exit code, and captured output to an evidence directory given as an argument. Local-mode step mapping (PR-008), recorded per step in the evidence: A1's owner-action/seed precondition is replaced by creating the scratch bare repo (recorded); A6's PR clause is substituted by the pushed branch ref visible in the bare repo's git ls-remote output; stage B is performed by the harness itself as a stub squash merge into the bare repo's default branch (clone, git merge --squash, commit, push), so the squash path is witnessed in both modes (PR-001, EXT-F-04); gh-only observations (pr view OPEN and MERGED) are recorded as "mode: full-only, skipped in local". The harness never writes an evidence file for a command it did not execute. Evidence records are JSON files (step, command, exit code, output reference) per decided DR-0006's structured-first policy; prose appears only inside captured command output. Per the section 3 invocation form (PR-102), the harness invokes the CLI as node dist/bin/tiphys.js after npm run build, so the compiled form of every M1 subcommand is exercised in CI from this phase on.
  3. Create the deterministic stub payload script scripts/stub-payload.sh: in the spawned worktree, append one line to the toy README, commit, push the task branch, and in full mode open a PR via gh, printing the PR URL.
  4. Wire scripts/m1-exit-test.sh --mode local into the CI gates workflow as an additional step, so the skeleton plumbing is exercised end to end on every kernel PR from this phase on.
- files-to-touch: sandbox/ (create, several small files), scripts/seed-sandbox.sh, scripts/m1-exit-test.sh, scripts/stub-payload.sh, test/exit-test-local.test.ts (create); .github/workflows/gates.yml (edit: add the local-mode step; verify job layout first).
- acceptance criteria:
  1. In a clone of the seeded toy repo, npm ci and npm test exit 0 with at least 1 test.
  2. scripts/m1-exit-test.sh --mode local <evidence-dir> exits 0 on a machine with only git, Node 26 or later, and npm, and the evidence directory afterward contains, for every step of section 4's stages A and C plus the stage B substitution, a file recording either the executed command and exit code or the documented local-mode substitution from the step mapping table, "mode: full-only, skipped in local" entries included (PR-008, EXT-F-04); the recorded commands show every tiphys invocation resolving to dist/bin/tiphys.js (PR-102).
  3. In local mode the harness's assertions include, verifiably from the evidence files: teardown refusal exit code nonzero while the branch is unmerged, watcher exit line matching "signal <task-id> turn-end", and teardown exit 0 after the harness's squash merge (PR-001).
  4. The gates CI job runs the local-mode harness and the phase PR shows the gates check completed successfully.
  5. Deliberately breaking the guard (running the harness with an env override that skips the stage B stub merge) makes the harness exit nonzero (the harness is falsifiable, not a script that always passes).
  6. node --test exits 0 with 0 failing and zero unaccounted tests; test/behaviors.json maps every behavior newly named by this phase's criteria to a test present in this run, and every previously registered mapping still resolves (checked by name, not count; EXT-F-05).
- suggested model tier: cheaper tier acceptable (scripting against contracts fixed by P3 to P5).
- citations: R-003 and R-078 (exit-test behaviors this harness exercises: spawned worktree task, watcher wake); blueprint section 4 teardown contract (the unlanded-work refusal exercised by the harness has no R row of its own; R-052b's report-gated scout closure is exercised by M1-P4 criterion 9, not by this harness) (PR-011); blueprint section 13 (M1 contents: toy sandbox project; M1 exit test); blueprint principle 5 and process doc section 7 (evidence over claims).
- conflicts-with: none remaining (last M1 phase).
- substrate (DR-0007): the harness is substrate-neutral; its CI local mode doubles as the cloud-like witness (see the substrate note at the end of section 4).
- blocked-by: owner action A-1 (toy repo exists); all cited DRs decided (DR-0007 dual substrate applied by revision 4).

---

## 4. M1 exit test

Run by the orchestrator under the current process after M1-P6 has merged and its deploy-equivalent (CI green on main) is verified. Executed via scripts/m1-exit-test.sh --mode full, gh authenticated, on either DR-0007 substrate (the substrate note at the end of this section states what each run witnesses). The procedure is staged (EXT-F-04): stage A is an automated pre-merge witness, stage B is the owner-authorized transition, stage C is an automated post-merge witness. All three stages are required for the milestone exit. Stages A and C are deterministic scripts whose steps must pass in order; stage B is a recorded human authorization and is not pretended to be a script step. In CI, local mode runs stages A and C with the harness's stub squash merge standing in for stage B (see M1-P6).

Stage A, automated pre-merge witness (the harness runs A2 to A8 and records every command, exit code, and output):

A1. Preconditions: kernel repo at main head; npm ci && npm run build && npm test exits 0 (the build emits dist/ for the CLI entry the harness invokes, D-17); owner action A-1 done and the toy repo seeded (scripts/seed-sandbox.sh exit 0).
A2. tiphys init <fresh fleet dir> exits 0; tiphys doctor exits 0 with no FAIL lines; tiphys doctor --for full exits 0 (profile readiness for the full-pipeline run, EXT-F-08).
A3. tiphys lock acquire exits 0; the harness records the configured lease duration in the evidence (default 900 seconds), exports TIPHYS_HOLDER_ID from the acquire output for the mutating steps, and renews the lease before stage B's human-bounded wait, recording the renewal (PR-203).
A4. Clone the toy repo into <fleet>/projects/, the projects area created by tiphys init (PR-004).
A5. Run tiphys watch --once and record the documented no-wake exit code 3, guaranteed on this fresh fleet by M1-P5 step 1's cadence initialization rule (PR-205; single-pass mode witnessed on this fleet, DR-0007). Then start tiphys watch as a foreground process managed by the harness (the harness, not the kernel, owns the process; C-3); within one base interval state/watcher.beacon exists.
A6. tiphys spawn --task m1-exit --project <toy clone> --brief <trivial brief> --shape ship --exec scripts/stub-payload.sh exits 0. The stub payload lands the trivial change: evidence captured is the pushed branch and the PR URL; gh pr view <url> --json state reports OPEN. (This is the "one trivial task lands as a PR on the toy sandbox project via spawn" clause; the payload is a deterministic stub, not an LLM, per plan decision D-2.)
A7. Teardown refusal: tiphys teardown --task m1-exit exits nonzero while the PR is unmerged, with a reason line naming the branch; the worktree still exists.
A8. Watcher wake: the harness-owned watcher process has exited 0 with the single stdout line "signal m1-exit turn-end" (captured by the harness), demonstrating wake on completion. Stage A evidence: task spawned, branch pushed, PR open, watcher woke, teardown refused.

Stage B, owner-authorized transition (recorded, not scripted):

B1. The owner's approval is recorded (the approving review on the PR, or an approval note captured into the evidence bundle); the orchestrator then merges with gh pr merge --squash, so the milestone witnesses the squash path (PR-001). Stage B has no timing requirement; the lease renewal from A3 covers the wait (PR-203).

Stage C, automated post-merge witness:

C1. gh pr view reports MERGED and the squash commit is present on the toy repo's default branch; the merged SHA is recorded in the evidence.
C2. tiphys teardown --task m1-exit exits 0 (teardown fetches the toy clone's default branch before evaluating, and the merge-tree no-op check recognizes the squash merge as landed), the worktree is removed, and meta status is closed.
C3. tiphys lock release exits 0, and the evidence bundle validates: every stage A and C step has its JSON evidence record, and stage B's approval artifact is present.

Evidence recording: the harness's evidence directory is committed to the kernel repo at delivery/evidence/m1-exit-test/ (transcript per step, exit codes, the PR URL, the watcher stdout line) via a PR under the current process. The M2 milestone may not start before that evidence commit is on main. Nothing in this procedure depends on any M2 or later artifact: no gate registry, no report contract, no status line contract, no tuition flow (scout observation 1 honored).

Substrate witnessed (decided DR-0007): the blueprint's three exit conditions (a trivial task lands as a PR via spawn, teardown refuses while unlanded, the watcher wakes on completion) are substrate-neutral core behavior and are all exercised regardless of where the run happens; nothing below weakens them. The full-mode run executes on whichever substrate the owner launches it from and witnesses that substrate end to end. The CI local-mode harness runs in a reclaimable container and is effectively the cloud-like case: fresh environment per run, explicit arming, no state surviving between runs, both watcher entry modes exercised (--once in A5, resident wake in A8). What CI does not prove: long-horizon resident operation on a persistent machine (backoff behavior is witnessed only at test timescales, per M1-P5 criterion 1); any future window or cloud-session executor adapter (M4 era); fleet-state continuity across session reclamation, which is not designed or witnessed in M1: state/, worktrees/, and projects/ are gitignored and do not survive a reclaim, and a resumed cloud session starts from the pushed git-tracked fleet only (PR-201; the multi-environment cloud fleet lifecycle is the M4 work item in section 3's obligation split); and abandonment of a task spawned without a deadline (tasks with a declared deadline are detected via the executor record, M1-P5 criterion 9; without one, recovery is manual teardown, PR-207). These gaps are recorded here rather than silently assumed away.

---

## 5. M2 outline: Deterministic gates

Exit test (blueprint section 13, amended per SC-011): all applicable gates run green in CI on the kernel repo itself; every gate whose precondition is unmet reports not-applicable explicitly, never green; the CI summary shows the counts (applicable, green, not-applicable) and zero vacuous passes. Evidence recorded at delivery/evidence/m2-exit-test/.

Phase list (outline; full phasing happens in the M2 plan, written after M1 exits):

1. M2-P1 red-witness harness (first, per blueprint): input test IDs + baseline SHA; asserts red on baseline, green on head, against latest main per the settled decision; emits an evidence file. (R-015b, R-028b, R-036, R-037b, R-056b)
2. M2-P2 full-suite wrapper ported into kernel bin: parity counting, passed+failed+skipped+did-not-run == discovered; exit code is the only truth. Note: the wrapper marked EXISTS lives in a current-process project not present in this repo (verification report honest-failures); if the source is not supplied it is BUILT from the contract, same degradation rule as D-1. (R-048)
3. M2-P3 scope auditor and citation linter. (R-010b, R-020, R-025, R-058)
4. M2-P4 coverage checker: accepted reference types are exactly phase, decision (a decision record with status open is the representation of an open question, per SC-009 and plan decision D-7), and parked-with-reason; orphans fail. Includes finding-to-outcome parity for final reports. (R-023, R-089b)
5. M2-P5 gate runner with preconditions: a gate manifest for the kernel repo in YAML or JSON validated by JSON Schema (decided DR-0006, lintable-schema-first) where each gate declares a precondition (for example "project declares a deploy target in its charter"); the runner reports green, red, or not-applicable per gate and never reports green for an unmet precondition (SC-011). This manifest is the seed the M3 canonical gate registry promotes; kernel-generic gates (build (tsc type check plus emit, D-18, PR-105), suite wrapper, scope, citations, coverage) are separated from project-specific gates (deploy, migrations, i18n, analytics), which stay declared-but-not-applicable on the kernel (scout observation 2).
6. M2-P6 deploy verifier and migration verifier scripts: built to contract, precondition-gated; on the kernel repo both report not-applicable (no deploy target, no migrations), which is exactly what the M2 exit test asserts for them. (R-032, R-068, R-069)
7. M2-P7 credential scoping: implementer token cannot create PRs or merge; enforced by token scope or branch protection, wired with DR-0004 item 4. (R-008)

Key risks: red-witness semantics against a moving main (the settled merge-time re-verification rule must be encoded, not paraphrased); parity-count baseline management in the wrapper; credential scoping depends on owner-executed DR-0004 item 4; wrapper source availability (see M2-P2 note). Blocked-by: M1 exit evidence on main. DR-0006 is decided: the gate manifest and gate outputs are YAML or JSON validated by JSON Schema (lintable-schema-first), no longer conditional.

Artifacts M2 must build: bin entries for the seven components above, the gate manifest with precondition semantics, CI wiring so every kernel PR runs the applicable set.

## 6. M3 outline: Judgment layer

Exit test (blueprint section 13, amended per DR-0008 and SC-011): one kernel change delivered end to end through the kernel's own full mode, as the controlled exception under current-process supervision (SC-013, settled decision 6); release v0.1.0 to the registry decided in DR-0008; release verification is the kernel analogue per SC-011: the published package installs and imports at the released version from a clean directory (npm install of the released package at 0.1.0 exits 0 and a node import of it resolves; the package name follows DR-0008's outcome, working assumption @tiphys/kernel), recorded as evidence. All other kernel work through the end of M4 cutover ships via the current process.

Phase list (outline):

1. M3-P1 schemas under the decided DR-0006 policy (lintable-schema-first: structured YAML or JSON validated by JSON Schema; markdown only where content genuinely cannot be structured, with the reason recorded per artifact type, convenience never valid; expected justified prose exceptions are the charter's product-intent page and report narrative sections): plan, charter, decision-record, status-line (verb-vocabulary starting point: firstmate's status-line protocol, FM-042), report contract; validator in kernel bin. The status line contract (R-084) and report contract (R-085, R-086, R-088, R-089a) are built here, per scout observation 1: no earlier milestone may depend on them, and none does.
2. M3-P2 role briefs ported from the process doc: investigator, plan writer, adversarial plan reviewer, implementer, clean-room reviewer, orchestrator (AGENTS.md). The adversarial-plan-reviewer brief states the settled visibility (input report + plan + code) and the same phase corrects the process doc's role table (SC-001). AGENTS.md encodes the SC-008 merge-authority resolution (D-6) and the SC-010 scoped read-only rule (D-8).
3. M3-P3 canonical gate registry (R-094): promotes the M2 gate manifest to the single source consumed by CI and briefs, per assurance mode, with the SC-011 precondition semantics carried over.
4. M3-P4 migration table walk completed into kernel artifacts: every M3-bucket row of the coverage appendix lands in its named brief clause, checklist, template, or policy; the tuition flow (R-091) starts operating; checklists/ (probe lists) created. Binding (EXT-F-07): M3-P4 may not be dispatched as one phase; detailed M3 planning divides the walk into at least six subphases by artifact family: (1) role briefs, (2) review checklists, (3) orchestrator policy (AGENTS.md), (4) reporting and work-history templates, (5) tuition flow, (6) assurance-mode behavior; each subphase receives its own requirements coverage input (the appendix rows it owns) and its own orphan check at M3 planning.
5. M3-P5 release engineering: package naming per DR-0008 (SC-006), publish pipeline, version pinning story for fleet homes, then the self-delivery exit run and v0.1.0 release. The publish pipeline includes a deterministic license gate (EXT-F-09): inventory of production dependencies; license metadata presence check; rejection of unknown or explicitly prohibited licenses; verification of THIRD-PARTY-NOTICES whenever copied third-party code is declared (D-1's license note); and verification that LICENSE and any required notices are present in the npm pack output.

Key risks: DR-0006 and DR-0008 must be decided before M3 detailed planning; the self-delivery exit run needs explicit supervision rules written before it starts (which current-process safeguards remain active during the exception); the migration-table walk is the largest single porting surface (74 rows) and must be phased by artifact, not attempted whole.

Artifacts M3 must build: schemas/ (five schemas plus validator), roles/ (six briefs), AGENTS.md (including the fleet-state commit/push discipline as an orchestrator duty, the SC-002 residue named by D-4, PR-012, and the specification half of the cloud fleet resume story, PR-201: the duty defines which fleet state is committed and pushed when; the executable resume machinery is M4's per section 3's obligation split), checklists/, the canonical gate registry, tuition flow mechanics, the release pipeline.

## 7. M4 and M5

M4 (cutover), one paragraph: the pilot charter is written and adversarially reviewed; the current pipeline drains; the thin Claude Code plugin ships (hooks: project-write block encoding the SC-010 carve-out per D-8, turn-end signal integrating the M1 hook contract); project-specific gate wiring lands for the pilot (typecheck, lint, i18n parity, analytics symmetry per D-12, manifest regen, e2e, docs grep: R-041, R-042, R-045, R-046, R-047, R-050a, R-051), along with repo merge config and branch protection (R-064, R-065a, SC-008 structural encoding), CI patterns (R-071, R-072, R-097 productized as bootstrap checks), and the orchestrator-side project-write block (R-001a). M4 also discharges the DR-0007 residue named in section 3's obligation split (PR-201): the cloud fleet resume story (what survives reclamation, what is rebuilt, how doctor reports a post-reclaim fleet), cross-environment lease exclusion through the shared fleet remote, and fleet-state sync automation, alongside the cloud-session executor adapter; owner action A-2 (private fleet-home remote) falls due here. Binding planning requirement (EXT-F-06, plan decision D-19): M4 may not dispatch without its own intake and plan, decomposed at minimum into six workstreams: pilot bootstrap (charter, project configuration, gate applicability); harness adapter (Claude Code hooks, executor integration); authority enforcement (project-write block, credentials, approval and merge); fleet durability (commit/push protocol, recovery, reconciliation); cross-environment exclusion (distributed lease semantics); cutover (drain, freeze point, rollback, retirement criteria). Hard cutover excludes dual-running after acceptance, not a defined rollback procedure for a cutover that fails (D-19). Exit test per blueprint: the pilot project's next phase runs through v1, merged and deploy-verified entirely on v1; the old process is retired (hard cutover, settled decision 7). From M4 exit onward the kernel is its own pilot-class project on v1 (SC-013).

M5 (scale-out), one paragraph: parallelism turns ON. The conflict pre-pass script (R-026a) computes the file-overlap floor for planned phases; the merge-time red-witness gate is wired per the settled latest-main decision; a second project onboards from charter alone via the greenfield bootstrap path. Exit test per blueprint: two phases in parallel worktrees merged serially without incident; project number 2 running from charter alone. The conflicts-with and parallelizable fields that every plan (including this one) has been filling since M1 become load-bearing here; until M5 they are recorded but every execution is sequential (scout observation 4, plan decision D-2).

---

## 8. Decisions taken in this plan (flag if you disagree)

- D-1 (updated by revision 4): The six firstmate BORROW components (watcher, liveness guard, session lock, worktree pool, spawn, teardown) remain BUILD in effort terms, now informed by the scouted source (DR-0009 decided: option 1, read-only clone scouted as delivery/requirements/firstmate-scout-report.md, FM-001 to FM-065). What is harvested is protocol, not code: P3, P4, and P5 cite the firstmate reference paths for the watcher reason-line and backoff protocol, the lock protocol, the teardown landedness procedure, the spawn meta fields, and the liveness predicate. License note (FM-039 to FM-041): firstmate is MIT, compatible one-way into Apache-2.0; a notice entry (THIRD-PARTY-NOTICES naming firstmate, Kun Chen, and the MIT text) is required only if code is literally copied, and protocol reimplementation carries no notice obligation; the treehouse binary comes from a separate repository with an unverified license and is excluded, which the worktree pool's clean BUILD (FM-023, FM-026, FM-065) sidesteps entirely. Acceptance criteria are unchanged by the scout. (Historical note kept for the audit trail: DR-0009 was consult-at-dispatch and never blocked any phase, PR-007.)
- D-2: M1 is six sequential phases (P1 ground, P2 fleet init + doctor, P3 lock + pool, P4 spawn + teardown, P5 watcher + liveness, P6 sandbox + exit harness); parallelism stays off until M5; the M1 exit test's spawned work is a deterministic stub payload, not an LLM agent, because judgment roles arrive in M3 and the exit test verifies plumbing, not judgment.
- D-3 (updated by revision 4): M1 state files (task meta, lease lock, beacon) are plain JSON parsed with Node built-ins, no schema library; formal schema validation starts in M2/M3 under the decided DR-0006 policy (lintable-schema-first). Revision 4 artifact audit against that policy, extended by revision 5 (PR-209): meta.json, the lease lockfile, the turn-end file ({endedAt, exitCode} JSON), the executor launch record (executor.json), the watcher beacon, cadence state (watcher.cadence.json), signal seen-state and last-wake records (watcher.seen.json, last-wake.json), and P6 evidence records are structured JSON and comply; brief.md, scout report.md, and warnings.md remain markdown by justified exception, the justification being that they are long-form prose written for and by agents whose content cannot be structured without loss (recorded here per the policy's per-type reason rule; convenience is not the reason); backlog.md is a header-only placeholder in M1, and its structured form falls due with the M3 artifact work under the DR-0006 policy.
- D-4 (vetoable): The fleet home is a private git repository with push discipline; gitignore narrowed to state/, worktrees/, and projects/ only, so charters, backlog, and decision records are durable (SC-002, PR-004). M1 lands the structure only; the commit/push discipline for post-init fleet state is an M3 AGENTS.md orchestrator duty, named in the M3 outline (PR-012). Vetoable because decision records may contain material the owner wants in no remote.
- D-5: Topology per section 1.5 (SC-003): no top-level kernel/ on fleet machines; kernel source under projects/, consumed kernel in node_modules.
- D-6 (vetoable): SC-008 resolution: "merge authority: owner" means owner approval per PR is the gate and the orchestrator executes the merge serially as release manager; encoded structurally in M3 (AGENTS.md) and M4 (branch protection requiring an approving owner review).
- D-7: An open question is represented as a decision record with status open (SC-009); the coverage checker's accepted reference types are exactly phase, decision, parked.
- D-8: SC-010 resolution: the orchestrator never writes working-tree content or commits in projects/; ref updates through designated merge tooling are the release-manager carve-out; the M4 write-block hook must encode the carve-out.
- D-9: R-002 (review never skipped): L2 AGENTS.md clause with an L1 migration ticket (mode-aware branch protection), per the scout's provisional placement.
- D-10: R-040 (push before long validation): L2 brief clause plus a tuition-tracked migration ticket, per the scout's provisional placement.
- D-11: R-043 and R-044 (tests/fixtures for every changed method/state): L2 gate-registry entries checked by the L3 clean-room reviewer, with an optional later L1 coverage floor, per the scout's provisional placement.
- D-12: R-046 (analytics doc symmetry): L1 name-symmetry script for the stated rule; semantic accuracy stays with the R-059 blast-radius probe, per the scout's provisional placement.
- D-13: R-067 (three reds = fix the flake): L2 policy clause; an L1 flake-signature counter is deferred to v1.1 telemetry, per the scout's provisional placement.
- D-14: Where the blueprint deliberately deviates from the process doc's letter, this plan follows the blueprint: the adversarial plan reviewer also reads the input report (R-006), and the event watcher replaces the hourly cron heartbeat (R-078). Scout observation 3.
- D-15: The kernel repo's own CI gets a per-ref concurrency group in M1-P1, because the current process's adoption checklist requires it before the first merge; the productized form of R-072/R-097 (bootstrap checks for onboarded projects) remains M4.
- D-16: M1 phases assume the recommendation of any still-open DR they cite; a different owner choice triggers a plan revision before the affected phases dispatch. Discharged for DR-0001, DR-0002, DR-0003, and DR-0005 by revision 2, and for DR-0004, DR-0006, and DR-0009 by revision 4 (DR-0005 and DR-0007 both differed from the recommendation, and revisions 2 and 4 respectively are the required rework). DR-0007's discharge is scoped (PR-201): applied for M1 component design and the single-environment lifecycle; the fleet-lifecycle residue is tracked as the named M4 work item in section 3's obligation split, so the discharge asserts no more than revision 4 delivered. Still in force only for DR-0008's package-name working assumption (deferred, due before the M3 plan is approved).
- D-17 (dist policy, required by decided DR-0005): dist/ is built in CI and at publish (npm prepack), never committed; .gitignore carries dist/. Rationale: committed compiled output is merge-conflict and review noise with no reader; the process doc's generated-artifact drift gate (R-047) governs generated artifacts that must live in the repo, and dist/ need not; prepack makes every published tarball a fresh deterministic build. Consequence: no drift gate is needed for dist/ because nothing generated is committed.
- D-18 (TypeScript execution, required by decided DR-0005): tests run as TypeScript directly under node --test via Node 26 native type stripping (deterministic, npm only, zero additional dependencies; this relies explicitly on Node's native TypeScript support, available at DR-0002's decided floor of 26). Type stripping performs no type checking, so the tsc build step is what guards types: npm run build runs tsc -b over tsconfig.src.json (bin/ and src/, emit to dist/) and tsconfig.test.json (test/, noEmit, references the src project), type-checking all three roots and emitting the shippable dist/ (PR-101). Sources are restricted to erasable TypeScript syntax (no enums, no namespaces, no parameter properties), enforced by tsconfig erasableSyntaxOnly; type-only imports use import type, enforced by verbatimModuleSyntax (PR-103); relative imports use .ts extensions, rewritten to .js in emitted output by rewriteRelativeImportExtensions.
- D-19 (EXT-F-06, rollback on failed cutover): M4 may not dispatch without its own intake and plan, decomposed at minimum into the six workstreams named in section 7's M4 paragraph. The cutover workstream must define a rollback procedure for a failed cutover (drain reversal, freeze-point restore, retirement criteria unmet). This is a safety property and does not reopen the settled hard-cutover decision: what hard cutover excludes is dual-running after acceptance, not recovery from a cutover that fails.

## 9. Owner decisions

Per the process rule, phases touching an undecided owner matter are blocked-by that DR and ship nothing until it is decided. (DR-0009 was the declared exception, consult-at-dispatch and never blocking, PR-007; it is now decided and folded into the phase briefs.)

| DR | Question | Blocks |
|---|---|---|
| DR-0001 (decided: Apache-2.0) | Repository license | Applied in M1-P1 (LICENSE file, package.json license field) |
| DR-0002 (decided: Node >= 26) | Node version floor | Applied in M1-P1 (engines ">=26", CI on 26 only) |
| DR-0003 (decided: GitHub Actions hosted ubuntu-latest) | CI runner | Applied in M1-P1 (workflow) |
| DR-0004 (decided: approved in principle) | Elevated GitHub permissions | Timing only, no approval pending: the owner executes items 2 and 3 right after M1-P1 merges (the orchestrator reminds at that gate); item 4 pairs with M2-P7 |
| DR-0005 (decided: TypeScript compiled to JavaScript) | Kernel language and runtime (SC-004) | Applied across all M1 phases by revision 2 (D-17, D-18); governs M2 as well |
| DR-0006 (decided: lintable-schema-first, markdown only as justified exception) | Schema technology and artifact format (SC-005) | Applied to the M2/M3 outlines; M1 artifacts audited against the policy in D-3; per-artifact split designed at M2/M3 planning |
| DR-0007 (decided: dual substrate, local machine and cloud sessions both first-class) | Orchestration runtime substrate (SC-007) | Applied for M1 component design and the single-environment lifecycle by revisions 4 and 5 (lease lock, dual-mode watcher, executor adapter, per-phase substrate fields); the multi-environment cloud fleet lifecycle is the named M4 work item (section 3 obligation split, PR-201) |
| DR-0008 (open, deferred by owner; due before the M3 plan is approved) | Release registry and package naming (SC-012 + SC-006) | M3 release phase; M1-P1 name field carries the recommendation as a working assumption, a one-line change until first publish |
| DR-0009 (decided: source supplied and scouted, FM-001 to FM-065) | Firstmate source availability | Resolved into the phase briefs: P3/P4/P5 cite the harvested protocol paths; effort remains BUILD per D-1; license note in D-1 |

Owner action A-1 (not a decision record: it is an act, not a choice): create the toy sandbox GitHub repository (or grant the orchestrator repo-creation permission), before M1-P6 dispatches.

Owner action A-2 (PR-201; falls due at M4, recorded now so it is not lost): provide or approve creation of a private remote repository for each real fleet home when M4 cutover creates one. The fleet-state push discipline (M3 AGENTS.md duty) and the cloud fleet resume story (M4 work item) both require a remote; M1's test fleets do not need one.

## 10. Open questions

Per SC-009's disposition (plan decision D-7), every open question is a decision record with status open, not a free-floating list item. The open questions of this plan are exactly: DR-0008 (deferred by the owner, due before the M3 plan is approved). All other decision records (DR-0001 to DR-0007, DR-0009) were decided on 2026-08-04 and are applied by revisions 2 and 4; their records remain the audit trail. There are no other open questions.

## 11. Parked (not in this plan)

1. Pipeline telemetry (cost per phase, review hit rate, flake tax): blueprint v1 non-goal, deferred to v1.1; schemas must not preclude it (M3-P1 notes this constraint).
2. Multi-orchestrator fleets: blueprint v1 non-goal.
3. Production outcome loop (analytics feeding intake): blueprint v1 non-goal.
4. Non-Claude harness adapters: blueprint v1 non-goal; the ExecutorAdapter interface from decided DR-0007 keeps the door open without building any harness adapter now.
5. Reviewer decorrelation (cross-model-family review): settled as deferred until tuition records a qualifying miss.
6. Domain and name availability sweep (tiphys.dev, tiphys.io, @tiphys scope, GitHub name): already queued as blueprint owner action 1 and a scout sweep; not re-planned here.
7. L1 migration tickets for D-9 and D-10 (structural enforcement of review-never-skipped and push-before-validation): recorded as tuition items when the tuition flow starts in M3; executed post-M3 unless tuition forces them earlier.
8. Commit-position check for R-016 ("plan is the first commit of the first branch") and plan-version check for R-030: noted by the migration table as "computable if wanted later"; not built in v1.

---

## Appendix A: Requirements coverage

Every migration-table row (115 rows: R-001 to R-098 with lettered variants) mapped to exactly one bucket: an M1 phase id, M2 or M3 (outline-level coverage, detailed in that milestone's plan), M4 or M5 (deferred by milestone design, one-paragraph coverage in section 7), or parked with a reason. Buckets follow the migration table's milestone column; the six resist-placement rules carry their plan decision. Counts: M1 = 11, M2 = 16, M3 = 74, M4 = 13, M5 = 1, parked = 0.

| Row | Bucket | Note |
|---|---|---|
| R-001a | M4 | project-write block hook, carve-out per D-8 |
| R-001b | M3 | AGENTS.md clause |
| R-002 | M3 | plan decision D-9 |
| R-003 | M1-P3 | worktree pool (spawn side exercised in M1-P4, M1-P6) |
| R-004 | M3 | investigator brief |
| R-005 | M3 | plan-writer brief |
| R-006 | M3 | reviewer brief per blueprint visibility, D-14, SC-001 |
| R-007 | M3 | implementer brief |
| R-008 | M2 | credential scoping (M2-P7) |
| R-009a | M1-P4 | spawn isolation |
| R-009b | M3 | clean-room brief |
| R-010a | M3 | scout/plan-writer brief |
| R-010b | M2 | citation linter (M2-P3) |
| R-011 | M3 | plan schema |
| R-012 | M3 | plan template |
| R-013 | M3 | AGENTS.md dispatch clause |
| R-014 | M3 | plan template fill-in box |
| R-015a | M3 | investigator brief |
| R-015b | M2 | red-witness harness (M2-P1) |
| R-016 | M3 | plan template; later check parked (section 11 item 8) |
| R-017 | M3 | plan template header |
| R-018 | M3 | plan schema |
| R-019 | M3 | plan schema phase fields (superset with conflicts-with, parallelizable) |
| R-020 | M2 | scope auditor (M2-P3) |
| R-021 | M3 | plan schema decisions section |
| R-022 | M3 | decision record schema + escalation contract |
| R-023 | M2 | coverage checker (M2-P4), enumeration per D-7 |
| R-024 | M3 | full-mode definition |
| R-025 | M2 | citation linter second call site |
| R-026a | M5 | conflict pre-pass |
| R-026b | M3 | plan-review checklist |
| R-027 | M3 | plan-review checklist probe |
| R-028a | M3 | plan-review checklist probe |
| R-028b | M2 | red-witness harness |
| R-029 | M3 | finding-format schema |
| R-030 | M3 | AGENTS.md clause; later check parked (section 11 item 8) |
| R-031 | M3 | brief/worktree conventions (naming groundwork in M1-P3/P4) |
| R-032 | M2 | deploy verifier blocks dispatch (M2-P6) |
| R-033a | M3 | implementer brief template |
| R-033b | M1-P4 | spawn one-command assembly |
| R-034 | M3 | implementer brief clause |
| R-035 | M3 | brief clause + work-history template |
| R-036 | M2 | red-witness harness (M2-P1) |
| R-037a | M3 | implementer brief clause |
| R-037b | M2 | red-witness harness |
| R-038 | M3 | implementer brief clause |
| R-039 | M3 | implementer brief clause |
| R-040 | M3 | plan decision D-10 |
| R-041 | M4 | typecheck gate wiring for pilot |
| R-042 | M4 | lint gate wiring |
| R-043 | M3 | plan decision D-11 |
| R-044 | M3 | plan decision D-11 |
| R-045 | M4 | i18n parity script |
| R-046 | M4 | analytics symmetry script, plan decision D-12 |
| R-047 | M4 | manifest regen gate |
| R-048 | M2 | full-suite wrapper (M2-P2; runner ground in M1-P1) |
| R-049 | M3 | report contract clause |
| R-050a | M4 | e2e gate wiring |
| R-050b | M3 | env-failure diagnosis checklist |
| R-051 | M4 | docs-grep gate |
| R-052a | M3 | work-history template |
| R-052b | M1-P4 | teardown guard |
| R-053 | M3 | clean-room checklist + verdict schema |
| R-054 | M3 | AGENTS.md + checklist extension |
| R-055 | M3 | clean-room probe list |
| R-056a | M3 | clean-room probe list |
| R-056b | M2 | red-witness harness |
| R-057a | M3 | report contract deviations section |
| R-057b | M3 | clean-room checklist clause |
| R-058 | M2 | scope auditor |
| R-059 | M3 | clean-room probe list |
| R-060 | M3 | verdict schema |
| R-061 | M3 | AGENTS.md clause |
| R-062 | M3 | AGENTS.md + brief clauses |
| R-063 | M3 | decision record reversibility field |
| R-064 | M4 | branch protection required checks (CI groundwork M1-P1) |
| R-065a | M4 | squash-only merge config |
| R-065b | M3 | AGENTS.md clause |
| R-066 | M3 | flake playbook checklist |
| R-067 | M3 | plan decision D-13 |
| R-068 | M2 | migration verifier (M2-P6, precondition-gated per SC-011) |
| R-069 | M2 | deploy verifier (M2-P6, precondition-gated per SC-011) |
| R-070 | M3 | tuition flow |
| R-071 | M4 | CI config pattern |
| R-072 | M4 | productized; kernel repo instance in M1-P1 per D-15 |
| R-073 | M3 | AGENTS.md policy clause |
| R-074 | M3 | implementer brief clause |
| R-075 | M3 | role-to-model config |
| R-076 | M3 | AGENTS.md policy + tuition |
| R-077 | M3 | AGENTS.md policy clause |
| R-078 | M1-P5 | watcher + liveness guard, D-14 |
| R-079 | M1-P5 | beacon + guard invariant |
| R-080 | M1-P2 | fleet state layout |
| R-081a | M1-P4 | salvage WIP commit path |
| R-081b | M3 | implementer brief clause |
| R-082a | M3 | brief clause all roles |
| R-082b | M1-P4 | turn-end hook |
| R-083a | M3 | environment-warnings template |
| R-083b | M1-P4 | warnings file into brief assembly |
| R-084 | M3 | status line contract (M3-P1; scout observation 1) |
| R-085 | M3 | report contract clause |
| R-086 | M3 | report contract clause |
| R-087 | M3 | brief clauses |
| R-088 | M3 | report contract honest-failure section |
| R-089a | M3 | final report shape |
| R-089b | M2 | coverage checker parity (M2-P4) |
| R-090 | M3 | escalation contract + decision records |
| R-091 | M3 | tuition flow (directory scaffolded M1-P1; scout observation 1) |
| R-092 | M3 | investigator brief clause |
| R-093 | M3 | clean-room blast-radius entry |
| R-094 | M3 | canonical gate registry (M3-P3; manifest seed M2-P5; scout observation 1) |
| R-095 | M1-P2 | init + doctor (beacon check completed M1-P5) |
| R-096 | M3 | full-mode definition |
| R-097 | M4 | productized bootstrap check; kernel repo instance M1-P1 per D-15 |
| R-098 | M3 | repo layout convention + tuition flow |

Scout handling check: the 6 resist-placement rules are decided in D-9 (R-002), D-10 (R-040), D-11 (R-043, R-044), D-12 (R-046), D-13 (R-067); the 4 observations are handled at observation 1 (gate registry M3-P3 with M2-P5 seed, report contract and status line M3-P1, tuition directory M1-P1 with flow M3, and no M1 criterion depends on any of them), observation 2 (M2-P5 generic-versus-project split), observation 3 (D-14), observation 4 (D-2 and section 7's M5 paragraph).

DR-0007 boundary note (PR-201): no R row moves and bucket totals are unchanged. R-080 (fleet state layout) remains M1-P2 and covers the single-environment lifecycle only; the multi-environment cloud fleet lifecycle (resume after reclamation, cross-environment lease exclusion, fleet-state sync automation) is the M4 work item named in section 3's obligation split and listed in the section 4 not-proven statement.
