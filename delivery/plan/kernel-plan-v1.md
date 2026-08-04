# Tiphys Kernel Plan v1

- Status: DRAFT, pending adversarial review
- Revision 1: adversarial review round 1 findings applied (PR-001 to PR-013)
- Revision 2: owner decision round 1 applied (DR-0001, DR-0002, DR-0003, DR-0005 decided; DR-0008 deferred)
- Revision 3: review round 2 findings applied (PR-101 to PR-106)
- Baseline commit: 39da928aef231055f06d8d7dc6abff618c6b15e0
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
| SC-005 | Follows report (escalate-to-owner) | DR-0006 (schema technology and artifact format). Does not block M1 (plan decision D-3 keeps M1 state files plain JSON); must be decided before M3 detailed planning. |
| SC-006 | Follows report in substance, folded into a DR | DR-0008 carries the package-naming recommendation (@tiphys/kernel, @tiphys/claude-code-plugin) as vetoable, alongside the registry question, per orchestrator direction. The report suggested resolve-in-plan flagged vetoable; carrying the same vetoable recommendation inside DR-0008 reaches the owner through the decision queue instead of plan prose only. M1-P1 sets the package name per the recommendation; a veto before M3 first-publish costs one line. |
| SC-007 | Follows report (escalate-to-owner) | DR-0007 (orchestration runtime substrate). Blocks M1-P2 through M1-P6; see blocked-by fields. |
| SC-008 | Follows report (resolve-in-plan, vetoable) | Plan decision D-6: "merge authority: owner" means the owner grants approval per PR and the orchestrator executes the merge serially as release manager. The structural encoding (approval as a deterministic check, an approving review from the owner) lands in the M3 outline (assurance-mode definitions in AGENTS.md) and M4 (branch protection, R-064). During M1 to M3 construction the current process's merge practice continues unchanged. |
| SC-009 | Follows report (resolve-in-plan) | Plan decision D-7, applied twice: (a) this plan's own Open questions section (section 8) contains only decision-record references, no free-floating questions; (b) the M2 outline's coverage checker spec enumerates exactly phase, decision (including status open), and parked as the accepted reference types. |
| SC-010 | Follows report (resolve-in-plan) | Plan decision D-8: the orchestrator never writes working-tree content or commits in projects/; ref updates through the designated merge tooling are the explicit release-manager carve-out. The M4 paragraph requires the project-write block hook to encode this carve-out; the M3 AGENTS.md states the scoped rule. |
| SC-011 | Follows report (resolve-in-plan) | M2 outline: gates get declared preconditions in the gate manifest; a gate whose precondition is unmet reports not-applicable, never green; the M2 exit test asserts the applicable subset explicitly. The kernel's release-verification analogue (published package installable and importable at the released version) lands in the M3 outline. |
| SC-012 | Follows report (escalate-to-owner) | DR-0008 (release registry choice), deferred by the owner on 2026-08-04 with a due date: decided before the M3 plan is approved. Does not block M1; blocks the M3 release phase. The plan's M3 outline reads "release v0.1.0 to the registry decided in DR-0008". |
| SC-013 | Already settled by the owner (settled decision 6, section 1.3) | Recorded in the M3 outline: the M3 self-delivery is the exit test's controlled exception, executed under current-process supervision; all other kernel work through the end of M4 cutover ships via the current process; from M4 exit onward the kernel is its own pilot-class project on v1. |

No orphans: all thirteen findings appear above exactly once, each landing in a phase, a decision record, or a named plan section.

---

## 3. M1: Walking skeleton, fully phased

M1 content is fixed by blueprint section 13: kernel repo scaffold (package.json, bin/, schemas/, roles/), fleet-home init plus doctor CLI, session lock, worktree pool, spawn, teardown guard, watcher plus liveness guard, toy sandbox project. Six sequential phases. All phases follow the decided DR-0005: TypeScript sources (ESM, strict) compiled to JavaScript, with the mechanics fixed by plan decisions D-17 (dist policy: built, never committed) and D-18 (test execution via Node 26 native type stripping, tsc guarding types and emitting dist). DR-0001 (Apache-2.0), DR-0002 (Node >= 26, CI on 26 only), and DR-0003 (GitHub Actions hosted ubuntu-latest) are likewise decided and applied. The six firstmate BORROW components are planned as BUILD from blueprint section 4 one-line contracts (plan decision D-1, DR-0009).

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
  6. Create test/cli.test.ts with at least: version subcommand exits 0 and output equals package.json version; unknown subcommand exits 64.
  7. Create directory placeholders with one-line READMEs stating which milestone fills them: schemas/README.md (M3, pending DR-0006), roles/README.md (M3), tuition/README.md (directory scaffolded now per migration-table note on R-091; the tuition flow itself is M3).
  8. Create .github/workflows/gates.yml: a matrix job named test (matrix containing exactly one Node version, 26, per decided DR-0002; runner ubuntu-latest per decided DR-0003) running npm ci (which installs the pinned typescript), npm run build, npm test; plus a non-matrixed fan-in job named exactly gates that needs the test job and fails unless every matrix leg succeeded. The required-check context DR-0004's ruleset names is therefore "gates" verbatim; a matrixed job named gates would report per-leg contexts like "gates (26)" and the required check would never complete (PR-002; the fan-in also keeps the context stable if legs ever change). Triggers: pull_request and push to the default branch; per-ref concurrency group that cancels superseded runs.
  9. Create LICENSE containing the Apache-2.0 license text (DR-0001), .gitignore (node_modules, dist/, coverage output; dist/ is never committed, D-17), and a minimal CLAUDE.md recording the binding conventions of section 1.4 and the kernel repo's gate list (npm ci, npm run build, node --test) as the agent-rules single source for this repo until the M3 gate registry replaces it.
- files-to-touch (all create; verify absent first): package.json, package-lock.json, tsconfig.src.json, tsconfig.test.json, LICENSE, bin/tiphys.ts, src/cli.ts, src/version.ts, test/cli.test.ts, schemas/README.md, roles/README.md, tuition/README.md, .github/workflows/gates.yml, .gitignore, CLAUDE.md.
- acceptance criteria:
  1. npm ci then npm run build exits 0 (tsc -b builds both configs and emits dist/); npm test exits 0 without requiring a prior build (tests run from TypeScript sources via Node 26 type stripping, D-18), and node --test reports N tests with N >= 2 and 0 failing.
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
- suggested model tier: cheaper tier (layout is fully specified above; the work is mechanical).
- citations: R-048 (test-runner ground the M2 wrapper will wrap), R-064 (CI green becomes checkable), R-072 and R-097 (kernel repo's own concurrency group, early instance per plan decision D-15; the productized form stays M4), R-091 note (tuition/ scaffolded in M1); SC-006 (name field per DR-0008 recommendation); blueprint section 13 (M1 contents: scaffold), section 3 (npm package shape); process doc section 9 items 1 and 4.
- conflicts-with: M1-P2 through M1-P6 (all later phases extend src/cli.ts and test/); sequential ordering absorbs this.
- blocked-by: none remaining. DR-0001, DR-0002, DR-0003, and DR-0005 were decided 2026-08-04 and are applied in this revision. (DR-0004 items 2 and 3 are executed by the owner right after this phase merges; they gate the following merge, not this dispatch.)

### M1-P2: Fleet-home init and doctor CLI

- id: M1-P2
- branch: claude/m1-p2-fleet-init-doctor
- intent: Implement tiphys init (create a fleet home) and tiphys doctor (deterministic health checks with per-check PASS/WARN/FAIL lines).
- grounding: M1-P1 merged (dispatcher, tests, CI exist). Topology per section 1.5. Fleet layout per blueprint section 3 with the SC-002 resolution (plan decision D-4).
- steps:
  1. Create src/fleet.ts: fleet-home layout constants and helpers (paths for charter/, decisions/, backlog.md, state/, tasks/, worktrees/, projects/) and a loadFleet(dir) that validates the layout and returns typed accessors.
  2. Create src/commands/init.ts: tiphys init <dir> creates the layout in an empty or absent directory: charter/, decisions/, state/, tasks/, worktrees/, projects/ (the projects area, PR-004), backlog.md (header only), package.json (fleet-home stub; the kernel dependency pin is added at M3 first publish, a documented placeholder until then), .gitignore ignoring exactly state/, worktrees/, and projects/, then git init plus an initial commit. Running init on an already-initialized directory exits nonzero with a message containing "already initialized".
  3. Create src/commands/doctor.ts: tiphys doctor runs in a fleet home and prints one line per check, format "CHECK <name> PASS|WARN|FAIL <detail>", exiting 0 only if no check FAILs. Checks: node version satisfies the kernel's engines range (FAIL), git available (FAIL), gh available (WARN), fleet layout complete including projects/ (FAIL, names the missing entry), fleet git repo present with a remote configured (WARN, push-discipline per SC-002), lock state readable (FAIL if corrupt, PASS if absent), watcher beacon freshness (WARN "watcher not running" when absent; this check is completed by M1-P5's liveness guard).
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
  7. node --test exits 0, total test count strictly greater than M1-P1's count, 0 failing.
- suggested model tier: cheaper tier acceptable (deterministic file layout work).
- citations: R-080 (fleet state layout), R-095 (supervision preconditions checked by doctor); SC-002 (fleet durability, resolved here), SC-003 (topology per section 1.5); blueprint sections 3 and 13 (M1 contents: fleet-home init + doctor).
- conflicts-with: M1-P3 through M1-P6 (src/cli.ts, src/fleet.ts).
- blocked-by: DR-0007. (DR-0005 decided 2026-08-04.)

### M1-P3: Session lock and worktree pool

- id: M1-P3
- branch: claude/m1-p3-lock-and-pool
- intent: Build the one-orchestrator-per-fleet session lock and the clean disposable worktree pool (BUILD from blueprint section 4 contracts, per plan decision D-1).
- grounding: M1-P2 merged (fleet home exists to hold state/). DR-0009 is consulted at dispatch, never blocks (PR-007): if undecided or option 2, BUILD per D-1; if option 1 source was supplied before dispatch, the implementer adapts it to these same acceptance criteria (which do not change either way); an option 1 answer arriving after dispatch is ignored.
- steps:
  1. Create src/lock.ts: lockfile at state/orchestrator.lock containing JSON {pid, hostname, acquiredAt}. Acquisition is atomic (PR-006): open with O_EXCL; on EEXIST, read the existing lock and evaluate liveness (same host and process exists, checked via signal 0; different host is always treated as live in v1, DR-0007 substrate is a single machine per fleet); a live lock refuses acquire. Takeover is atomic replace: write a temp file and rename it over the lockfile. status reports held, stale (holder pid dead), or free, and always prints acquiredAt so a human takeover decision is informed. Explicit takeover flag required to replace a stale lock; takeover of a live lock is refused. Module docs record the pid-reuse limitation: after a reboot an unrelated live process can occupy the recorded pid, making a dead lock read held; the surfaced acquiredAt is the operator's tiebreaker for a manual takeover.
  2. Create src/commands/lock.ts: subcommands lock acquire [--take-over], lock release, lock status.
  3. Create src/pool.ts: worktree pool over a project clone. pool create --task <id> --project <path>: creates a git worktree at <fleet>/worktrees/<task-id> from the project's default branch head, on a new branch named for the task; refuses duplicate task ids; parallel-safe (unique paths, atomic directory creation, git worktree add's own locking). pool list prints one line per worktree with task id and HEAD sha. pool destroy --task <id>: refuses (exit nonzero, reason line) if the worktree has uncommitted changes or untracked files; otherwise removes the directory and prunes the git worktree registration. A --discard flag overrides the dirty refusal and removes anyway; refusal stays the default, and --discard is documented as reserved for the teardown scout path (PR-010).
  4. Create src/commands/pool.ts and register subcommands.
  5. Tests: test/lock.test.ts (including a child-process holder that is killed to produce a real stale lock), test/pool.test.ts (against a scratch git repo created in the test).
- files-to-touch: src/lock.ts, src/commands/lock.ts, src/pool.ts, src/commands/pool.ts, test/lock.test.ts, test/pool.test.ts (create); src/cli.ts (edit).
- acceptance criteria:
  1. lock acquire in a fleet home exits 0 and creates state/orchestrator.lock whose JSON parses and contains the acquiring pid.
  2. With the lock held by a live process, a second lock acquire from a different process exits nonzero, stderr contains "lock held", and the lock file content is byte-identical before and after the attempt.
  3. Five concurrent lock acquire invocations against a free lock yield exactly one exit 0 and four nonzero exits, and the lock file afterward contains the winner's pid (PR-006: mutual exclusion is atomic, not read-then-write).
  4. After the holding process is killed, lock status exits 0 and stdout contains "stale" and the acquiredAt timestamp; lock acquire without the takeover flag still exits nonzero; lock acquire --take-over exits 0 and the lock file now contains the new pid.
  5. pool create --task t-a against a scratch project repo exits 0; the worktree at worktrees/t-a has empty git status --porcelain output and its HEAD sha equals the scratch repo default branch head sha.
  6. pool create with an already-used task id exits nonzero and stderr names the id.
  7. Two pool create invocations for distinct task ids launched concurrently both exit 0 and git worktree list in the project shows both worktrees.
  8. pool destroy on a worktree with an uncommitted file exits nonzero and the directory still exists; the same worktree with --discard exits 0, the directory is gone, and git worktree list no longer shows it (PR-010); a clean worktree is likewise removed by pool destroy without flags.
  9. node --test exits 0, total test count strictly greater than M1-P2's count, 0 failing.
- suggested model tier: strongest (concurrency and liveness semantics are correctness-bearing).
- citations: R-003 (fresh disposable worktree per task), R-080 (locks live under fleet state/); blueprint section 4 (session lock and worktree pool contracts), section 10 point 5 (one orchestrator per fleet); DR-0009.
- conflicts-with: M1-P4 through M1-P6 (src/cli.ts; P4 consumes src/pool.ts).
- blocked-by: DR-0007. (DR-0005 decided 2026-08-04; DR-0009 is consulted at dispatch and never blocks; PR-007.)

### M1-P4: Spawn and teardown guard

- id: M1-P4
- branch: claude/m1-p4-spawn-and-teardown
- intent: Build spawn (worktree + brief + turn-end hook + task meta in one command, with an executor seam) and the teardown guard (refuses while unlanded work is present, scout carve-out, salvage path).
- grounding: M1-P3 merged (pool and lock exist). Executor seam per DR-0007 recommendation: window allocation is behind an adapter interface; M1 ships a subprocess executor (runs a command in the worktree) which is also what the exit test's stub payload uses; the multiplexer-window adapter is completed when the fleet substrate is live (M4 era), without kernel API change.
- steps:
  1. Create src/task.ts: task meta at <fleet>/tasks/<id>/meta.json, plain JSON (plan decision D-3), fields: id, project, shape (ship or scout), branch, worktree, status (open or closed), createdAt. Documented in a docs comment; no schema library (DR-0006 pending).
  2. Create src/brief.ts: brief assembly writes tasks/<id>/brief.md from the provided brief file, appending verbatim the fleet's environment-warnings file (state/../warnings.md location: fleet root warnings.md, tracked) when present (R-083b).
  3. Create src/hooks.ts: turn-end hook, a generated script placed in the task directory and invoked by the executor when the payload command exits; it writes tasks/<id>/turn-end containing an ISO-8601 timestamp and the payload exit code (R-082b). This file is the watcher's wake signal in M1-P5.
  4. Create src/spawn.ts and src/commands/spawn.ts: tiphys spawn --task <id> --project <path> --brief <file> --shape ship|scout --exec <cmd> performs, in order: liveness-guard check (completed in P5; in this phase a no-op seam), pool create, brief assembly, meta write, executor launch with cwd set to the worktree and the turn-end hook wired. In M1, --exec is required: spawn without it exits 64 with usage, because the multiplexer-window adapter that would make an exec-less spawn meaningful is M4-era (PR-013). The subprocess executor runs the payload to completion before spawn returns, and the payload exit code is recorded in the turn-end file (PR-013). One command, everything or a clean rollback (a failed step removes what that invocation created, and only that, then exits nonzero).
  5. Create src/teardown.ts and src/commands/teardown.ts: tiphys teardown --task <id> [--salvage]. Teardown first fetches the project's default branch from its remote (git fetch); every landed-ness check runs against the fetched ref, never a possibly stale local one (PR-001). Refusal rules, checked in order: (a) shape scout: refuse unless tasks/<id>/report.md exists; with a report, scratch changes are discarded via pool destroy --discard and teardown proceeds (scout worktrees are scratch, scouts never push; PR-010). (b) shape ship: refuse if the worktree is dirty (unless --salvage: commit leavings as a commit whose message starts with "WIP-UNREVIEWED (do not treat as reviewed):" and push the branch, then proceed) and refuse unless the task branch is landed on the fetched default branch. Landed means either (i) the branch head is an ancestor of the fetched default branch head, or (ii) merging the branch into the fetched default branch is a no-op: git merge-tree --write-tree <fetched-default> <branch> reports no conflicts and produces a tree id equal to the fetched default head's tree id. Definition (ii) recognizes squash merges regardless of the branch's commit count, and squash is the process's own merge practice (PR-001). --salvage never overrides the unlanded refusal; it only rescues uncommitted leavings onto the branch. (c) On success: pool destroy, meta status set to closed. Every refusal is exit nonzero plus a single reason line naming the blocking condition.
  6. Register subcommands; tests in test/spawn.test.ts and test/teardown.test.ts against scratch repos, using a stub payload command.
- files-to-touch: src/task.ts, src/brief.ts, src/hooks.ts, src/spawn.ts, src/teardown.ts, src/commands/spawn.ts, src/commands/teardown.ts, test/spawn.test.ts, test/teardown.test.ts (create); src/cli.ts (edit); src/pool.ts (no edit expected: the --discard flag the scout teardown path uses ships in M1-P3; verify before touching, PR-010).
- acceptance criteria:
  1. spawn with a stub exec that writes its cwd to a file exits 0 and: the written cwd path is under <fleet>/worktrees/<id>; tasks/<id>/meta.json parses with all documented fields and status open; tasks/<id>/brief.md contains both the brief text and the full text of the fleet warnings.md file when one exists (and exactly the brief text when none exists). spawn returns only after the exec command has exited: the stub sleeps briefly and writes a completion marker, and the marker exists at the moment spawn returns (PR-013).
  2. After the stub exec exits, tasks/<id>/turn-end exists and contains a parseable ISO-8601 timestamp and the exec exit code.
  3. spawn without --exec exits 64, prints usage to stderr, and creates nothing: no worktree, no tasks/<id>/ (PR-013).
  4. If pool create fails (duplicate task id already used by a live task), spawn exits nonzero, the pre-existing tasks/<id>/ contents are byte-identical before and after, and the failing invocation created no new files (PR-005: rollback must never touch another task's artifacts).
  5. If a step after pool create fails (executor launch failure, simulated with a nonexistent exec binary), spawn exits nonzero and the worktree and tasks/<id>/ entries created by that invocation are removed (PR-005 companion: rollback removes what the failing invocation created, and only that).
  6. For a ship task whose branch has a pushed commit absent from the fetched default branch, teardown exits nonzero, prints one reason line containing the branch name, and the worktree directory still exists (PR-001: the refusal is evaluated against freshly fetched remote state).
  7. For a ship task with two commits on its branch that the harness squash-merges into the default branch on the scratch remote (git merge --squash plus a single commit, pushed to the remote), with the teardown-side clone's local default ref deliberately left stale, teardown exits 0: fetch-then-merge-tree recognizes the squash merge as landed (PR-001; two commits, so a per-commit patch-id implementation cannot pass this criterion).
  8. For a ship task with uncommitted changes: teardown without --salvage exits nonzero; teardown --salvage with unlanded commits still exits nonzero (salvage never overrides the unlanded refusal); after the branch is landed via the squash path of criterion 7 and the tree is dirty, teardown --salvage exits 0 and the branch tip commit message starts with "WIP-UNREVIEWED (do not treat as reviewed):".
  9. For a scout task with a dirty scratch worktree: teardown exits nonzero while tasks/<id>/report.md is absent; after report.md is created, teardown exits 0 and the worktree is removed via pool destroy --discard without any push (the scratch repo's remote refs are unchanged, verified by comparing git ls-remote output before and after; PR-010).
  10. After a successful teardown, meta.json status equals closed and git worktree list no longer shows the task worktree.
  11. node --test exits 0, total test count strictly greater than M1-P3's count, 0 failing.
- suggested model tier: strongest (most architecture-bearing phase of M1; the executor seam and refusal ordering carry long-lived contracts).
- citations: R-003 and R-009a (fresh isolated context per task, structural), R-033b (brief assembly is one command), R-052b (teardown refuses without report), R-081a (salvage as labeled WIP commit), R-082b (turn-end hook), R-083b (warnings file into every brief); blueprint section 4 (spawn and teardown contracts), section 9 (scout shape); DR-0007 (executor seam), DR-0009.
- conflicts-with: M1-P5, M1-P6 (src/cli.ts; P5 consumes the turn-end signal contract).
- blocked-by: DR-0007. (DR-0005 decided 2026-08-04; DR-0009 is consulted at dispatch and never blocks; PR-007.)

### M1-P5: Watcher and liveness guard

- id: M1-P5
- branch: claude/m1-p5-watcher-liveness
- intent: Build the watcher (sleeps on fleet state, exits with one reason line, zero tokens idle, exponential heartbeat backoff, beacon) and the liveness guard wired into every supervision command.
- grounding: M1-P4 merged (turn-end signal files exist as the wake source; spawn/teardown/doctor have guard seams).
- steps:
  1. Create src/watcher.ts and src/commands/watch.ts: tiphys watch runs as a plain foreground process (resident under the DR-0007 substrate). Wake sources, each producing a single stdout reason line then exit 0: "signal <task-id> <event>" (a new turn-end file for an open task), "stale <what>" (an open task whose worktree or meta is in a contradictory state, enumerated in the module docs), "check <name>" (a requested one-shot check via a state/check-request file), "heartbeat <n>" only when --max-heartbeats is set and reached. Idle behavior: fs.watch on the fleet state and tasks directories with a polling fallback; heartbeat interval starts at a configurable base and doubles up to a cap; every wake and heartbeat rewrites state/watcher.beacon with an ISO timestamp and the current backoff. The watcher is a plain Node process: it imports no network or LLM client (zero tokens idle is structural).
  2. Create src/liveness.ts: guard(fleet) returns {inFlight, beaconAgeMs, stale} where stale means at least one open task exists and the beacon is absent or older than a threshold (default documented, configurable). Invariant (PR-009): the default stale threshold is strictly greater than the backoff cap plus one poll interval, and liveness.ts enforces threshold > cap + poll interval at load; a configuration violating it is an error (load fails with a message naming both values), so a healthy watcher idling at maximum backoff can never read as stale. Wire the guard into spawn, teardown, and doctor (completing the P2 and P4 seams): a stale result prints one stderr warning line containing "watcher stale" but does not block the command (warn, per blueprint liveness-guard contract).
  3. Tests: test/watcher.test.ts drives the watcher as a child process against a temp fleet (short base interval), test/liveness.test.ts covers fresh, absent, and stale beacons.
- files-to-touch: src/watcher.ts, src/commands/watch.ts, src/liveness.ts, test/watcher.test.ts, test/liveness.test.ts (create); src/cli.ts, src/commands/spawn.ts, src/commands/teardown.ts, src/commands/doctor.ts (edit: wire the guard; verify seam shape first).
- acceptance criteria:
  1. tiphys watch started against a fleet with one open task and no signals is still running after three base heartbeat intervals (process poll), and state/watcher.beacon has been rewritten with monotonically increasing timestamps whose successive gaps grow (each gap >= the previous gap, until the cap).
  2. Creating tasks/<id>/turn-end for an open task causes the watcher process to exit 0 within the documented poll interval, with stdout consisting of exactly one line matching the documented pattern "signal <task-id> turn-end".
  3. With no open tasks and no signals, the watcher does not exit on heartbeats (still running after three intervals) unless --max-heartbeats is set, in which case it exits 0 with the line "heartbeat <n>".
  4. With one open task and a beacon file older than the threshold, tiphys spawn, tiphys teardown, and tiphys doctor each emit one stderr line containing "watcher stale" and still perform their normal function (exit codes unchanged versus the fresh-beacon runs of the same scenarios).
  5. With a fresh beacon, the same three commands emit no "watcher stale" line (falsifiable in both directions).
  6. With the watcher idle at maximum backoff, the guard reports fresh (no "watcher stale" line) at every probe across the entire gap between two consecutive heartbeats (PR-009); loading liveness.ts with a configuration where the threshold is not strictly greater than the backoff cap plus one poll interval fails with an error naming both values.
  7. grep over src/watcher.ts and its imports shows no import of http, https, fetch, or any network client module (structural zero-tokens-idle check, inspection).
  8. node --test exits 0, total test count strictly greater than M1-P4's count, 0 failing.
- suggested model tier: strongest (event semantics, backoff, and child-process test harness are correctness-bearing).
- citations: R-078 (watcher + liveness guard replace the cron heartbeat; deliberate deviation from process-doc letter, plan decision D-14), R-079 (supervision never silently disappears while work is in flight: beacon plus guard), R-095 (doctor's beacon check completed here); blueprint section 4 (watcher and liveness guard contracts); DR-0007, DR-0009.
- conflicts-with: M1-P6 (src/cli.ts).
- blocked-by: DR-0007. (DR-0005 decided 2026-08-04; DR-0009 is consulted at dispatch and never blocks; PR-007.)

### M1-P6: Toy sandbox project and exit-test harness

- id: M1-P6
- branch: claude/m1-p6-toy-sandbox-exit
- intent: Create the toy sandbox project and a scripted, deterministic M1 exit-test harness (with a local dry-run mode for CI and a full mode against the real toy repo).
- grounding: M1-P1 through M1-P5 merged. Owner action A-1 done (toy sandbox GitHub repository exists, see section 7). gh CLI authenticated for full mode.
- steps:
  1. Create sandbox/ in the kernel repo: the toy project's content (package.json named toy-sandbox, one src file, one node --test test, a README stating its purpose), plus scripts/seed-sandbox.sh that pushes this content to the owner-created toy repo (idempotent: safe to re-run).
  2. Create scripts/m1-exit-test.sh implementing section 4's procedure verbatim, parameterized by --mode local|full. local mode uses a scratch bare repo as the "remote" and asserts a pushed branch instead of a PR (no credentials, runs in CI); full mode uses the real toy repo and gh to open and verify the PR. Every step appends its command, exit code, and captured output to an evidence directory given as an argument. Local-mode step mapping (PR-008), recorded per step in the evidence: step 1's A-1/seed precondition is replaced by creating the scratch bare repo (recorded); step 6's PR clause is substituted by the pushed branch ref visible in the bare repo's git ls-remote output; step 9's merge is performed by the harness itself as a squash merge into the bare repo's default branch (clone, git merge --squash, commit, push), so the squash path is witnessed in both modes (PR-001); gh-only observations (pr view OPEN and MERGED) are recorded as "mode: full-only, skipped in local". The harness never writes an evidence file for a command it did not execute. Per the section 3 invocation form (PR-102), the harness invokes the CLI as node dist/bin/tiphys.js after npm run build, so the compiled form of every M1 subcommand is exercised in CI from this phase on.
  3. Create the deterministic stub payload script scripts/stub-payload.sh: in the spawned worktree, append one line to the toy README, commit, push the task branch, and in full mode open a PR via gh, printing the PR URL.
  4. Wire scripts/m1-exit-test.sh --mode local into the CI gates workflow as an additional step, so the skeleton plumbing is exercised end to end on every kernel PR from this phase on.
- files-to-touch: sandbox/ (create, several small files), scripts/seed-sandbox.sh, scripts/m1-exit-test.sh, scripts/stub-payload.sh, test/exit-test-local.test.ts (create); .github/workflows/gates.yml (edit: add the local-mode step; verify job layout first).
- acceptance criteria:
  1. In a clone of the seeded toy repo, npm ci and npm test exit 0 with at least 1 test.
  2. scripts/m1-exit-test.sh --mode local <evidence-dir> exits 0 on a machine with only git, Node 26 or later, and npm, and the evidence directory afterward contains, for every numbered step of section 4, a file recording either the executed command and exit code or the documented local-mode substitution from the step mapping table, "mode: full-only, skipped in local" entries included (PR-008); the recorded commands show every tiphys invocation resolving to dist/bin/tiphys.js (PR-102).
  3. In local mode the harness's assertions include, verifiably from the evidence files: teardown refusal exit code nonzero while the branch is unmerged, watcher exit line matching "signal <task-id> turn-end", and teardown exit 0 after the harness's squash merge (PR-001).
  4. The gates CI job runs the local-mode harness and the phase PR shows the gates check completed successfully.
  5. Deliberately breaking the guard (running the harness with an env override that skips the merge step) makes the harness exit nonzero (the harness is falsifiable, not a script that always passes).
  6. node --test exits 0, total test count strictly greater than M1-P5's count, 0 failing.
- suggested model tier: cheaper tier acceptable (scripting against contracts fixed by P3 to P5).
- citations: R-003 and R-078 (exit-test behaviors this harness exercises: spawned worktree task, watcher wake); blueprint section 4 teardown contract (the unlanded-work refusal exercised by the harness has no R row of its own; R-052b's report-gated scout closure is exercised by M1-P4 criterion 9, not by this harness) (PR-011); blueprint section 13 (M1 contents: toy sandbox project; M1 exit test); blueprint principle 5 and process doc section 7 (evidence over claims).
- conflicts-with: none remaining (last M1 phase).
- blocked-by: DR-0007; owner action A-1 (toy repo exists). (DR-0005 decided 2026-08-04.)

---

## 4. M1 exit test

Deterministic procedure, run by the orchestrator under the current process after M1-P6 has merged and its deploy-equivalent (CI green on main) is verified. Executed via scripts/m1-exit-test.sh --mode full on a machine matching DR-0007's decided substrate, with gh authenticated. All steps must pass in one uninterrupted run; a failed step fails the milestone exit.

Procedure (the harness automates steps 2 to 10 and records every command, exit code, and output):

1. Preconditions: kernel repo at main head; npm ci && npm run build && npm test exits 0 (the build emits dist/ for the CLI entry the harness invokes, D-17); owner action A-1 done and the toy repo seeded (scripts/seed-sandbox.sh exit 0).
2. tiphys init <fresh fleet dir> exits 0; tiphys doctor exits 0 with no FAIL lines.
3. tiphys lock acquire exits 0.
4. Clone the toy repo into <fleet>/projects/, the projects area created by tiphys init (PR-004).
5. Start tiphys watch in the background; within one base interval state/watcher.beacon exists.
6. tiphys spawn --task m1-exit --project <toy clone> --brief <trivial brief> --shape ship --exec scripts/stub-payload.sh exits 0. The stub payload lands the trivial change: evidence captured is the pushed branch and the PR URL; gh pr view <url> --json state reports OPEN. (This is the "one trivial task lands as a PR on the toy sandbox project via spawn" clause; the payload is a deterministic stub, not an LLM, per plan decision D-2.)
7. Teardown refusal: tiphys teardown --task m1-exit exits nonzero while the PR is unmerged, with a reason line naming the branch; the worktree still exists.
8. Watcher wake: the background watcher process has exited 0 with the single stdout line "signal m1-exit turn-end" (captured by the harness), demonstrating wake on completion.
9. The PR is merged with gh pr merge --squash (owner approval per current-process merge practice precedes the merge), so the milestone witnesses the squash path (PR-001); after gh pr view reports MERGED, tiphys teardown --task m1-exit exits 0 (teardown fetches the toy clone's default branch before evaluating, and the merge-tree no-op check recognizes the squash merge as landed), the worktree is removed, and meta status is closed.
10. tiphys lock release exits 0.

Evidence recording: the harness's evidence directory is committed to the kernel repo at delivery/evidence/m1-exit-test/ (transcript per step, exit codes, the PR URL, the watcher stdout line) via a PR under the current process. The M2 milestone may not start before that evidence commit is on main. Nothing in this procedure depends on any M2 or later artifact: no gate registry, no report contract, no status line contract, no tuition flow (scout observation 1 honored).

---

## 5. M2 outline: Deterministic gates

Exit test (blueprint section 13, amended per SC-011): all applicable gates run green in CI on the kernel repo itself; every gate whose precondition is unmet reports not-applicable explicitly, never green; the CI summary shows the counts (applicable, green, not-applicable) and zero vacuous passes. Evidence recorded at delivery/evidence/m2-exit-test/.

Phase list (outline; full phasing happens in the M2 plan, written after M1 exits):

1. M2-P1 red-witness harness (first, per blueprint): input test IDs + baseline SHA; asserts red on baseline, green on head, against latest main per the settled decision; emits an evidence file. (R-015b, R-028b, R-036, R-037b, R-056b)
2. M2-P2 full-suite wrapper ported into kernel bin: parity counting, passed+failed+skipped+did-not-run == discovered; exit code is the only truth. Note: the wrapper marked EXISTS lives in a current-process project not present in this repo (verification report honest-failures); if the source is not supplied it is BUILT from the contract, same degradation rule as D-1. (R-048)
3. M2-P3 scope auditor and citation linter. (R-010b, R-020, R-025, R-058)
4. M2-P4 coverage checker: accepted reference types are exactly phase, decision (a decision record with status open is the representation of an open question, per SC-009 and plan decision D-7), and parked-with-reason; orphans fail. Includes finding-to-outcome parity for final reports. (R-023, R-089b)
5. M2-P5 gate runner with preconditions: a machine-readable gate manifest for the kernel repo where each gate declares a precondition (for example "project declares a deploy target in its charter"); the runner reports green, red, or not-applicable per gate and never reports green for an unmet precondition (SC-011). This manifest is the seed the M3 canonical gate registry promotes; kernel-generic gates (build (tsc type check plus emit, D-18, PR-105), suite wrapper, scope, citations, coverage) are separated from project-specific gates (deploy, migrations, i18n, analytics), which stay declared-but-not-applicable on the kernel (scout observation 2).
6. M2-P6 deploy verifier and migration verifier scripts: built to contract, precondition-gated; on the kernel repo both report not-applicable (no deploy target, no migrations), which is exactly what the M2 exit test asserts for them. (R-032, R-068, R-069)
7. M2-P7 credential scoping: implementer token cannot create PRs or merge; enforced by token scope or branch protection, wired with DR-0004 item 4. (R-008)

Key risks: red-witness semantics against a moving main (the settled merge-time re-verification rule must be encoded, not paraphrased); parity-count baseline management in the wrapper; credential scoping depends on owner-executed DR-0004 item 4; wrapper source availability (see M2-P2 note). Blocked-by: M1 exit evidence on main; DR-0006 if gate outputs adopt the shared validator early (otherwise plain JSON per D-3 extends through M2).

Artifacts M2 must build: bin entries for the seven components above, the gate manifest with precondition semantics, CI wiring so every kernel PR runs the applicable set.

## 6. M3 outline: Judgment layer

Exit test (blueprint section 13, amended per DR-0008 and SC-011): one kernel change delivered end to end through the kernel's own full mode, as the controlled exception under current-process supervision (SC-013, settled decision 6); release v0.1.0 to the registry decided in DR-0008; release verification is the kernel analogue per SC-011: the published package installs and imports at the released version from a clean directory (npm install of the released package at 0.1.0 exits 0 and a node import of it resolves; the package name follows DR-0008's outcome, working assumption @tiphys/kernel), recorded as evidence. All other kernel work through the end of M4 cutover ships via the current process.

Phase list (outline):

1. M3-P1 schemas per DR-0006: plan, charter, decision-record, status-line, report contract; validator in kernel bin. The status line contract (R-084) and report contract (R-085, R-086, R-088, R-089a) are built here, per scout observation 1: no earlier milestone may depend on them, and none does.
2. M3-P2 role briefs ported from the process doc: investigator, plan writer, adversarial plan reviewer, implementer, clean-room reviewer, orchestrator (AGENTS.md). The adversarial-plan-reviewer brief states the settled visibility (input report + plan + code) and the same phase corrects the process doc's role table (SC-001). AGENTS.md encodes the SC-008 merge-authority resolution (D-6) and the SC-010 scoped read-only rule (D-8).
3. M3-P3 canonical gate registry (R-094): promotes the M2 gate manifest to the single source consumed by CI and briefs, per assurance mode, with the SC-011 precondition semantics carried over.
4. M3-P4 migration table walk completed into kernel artifacts: every M3-bucket row of the coverage appendix lands in its named brief clause, checklist, template, or policy; the tuition flow (R-091) starts operating; checklists/ (probe lists) created.
5. M3-P5 release engineering: package naming per DR-0008 (SC-006), publish pipeline, version pinning story for fleet homes, then the self-delivery exit run and v0.1.0 release.

Key risks: DR-0006 and DR-0008 must be decided before M3 detailed planning; the self-delivery exit run needs explicit supervision rules written before it starts (which current-process safeguards remain active during the exception); the migration-table walk is the largest single porting surface (74 rows) and must be phased by artifact, not attempted whole.

Artifacts M3 must build: schemas/ (five schemas plus validator), roles/ (six briefs), AGENTS.md (including the fleet-state commit/push discipline as an orchestrator duty, the SC-002 residue named by D-4, PR-012), checklists/, the canonical gate registry, tuition flow mechanics, the release pipeline.

## 7. M4 and M5

M4 (cutover), one paragraph: the pilot charter is written and adversarially reviewed; the current pipeline drains; the thin Claude Code plugin ships (hooks: project-write block encoding the SC-010 carve-out per D-8, turn-end signal integrating the M1 hook contract); project-specific gate wiring lands for the pilot (typecheck, lint, i18n parity, analytics symmetry per D-12, manifest regen, e2e, docs grep: R-041, R-042, R-045, R-046, R-047, R-050a, R-051), along with repo merge config and branch protection (R-064, R-065a, SC-008 structural encoding), CI patterns (R-071, R-072, R-097 productized as bootstrap checks), and the orchestrator-side project-write block (R-001a). Exit test per blueprint: the pilot project's next phase runs through v1, merged and deploy-verified entirely on v1; the old process is retired (hard cutover, settled decision 7). From M4 exit onward the kernel is its own pilot-class project on v1 (SC-013).

M5 (scale-out), one paragraph: parallelism turns ON. The conflict pre-pass script (R-026a) computes the file-overlap floor for planned phases; the merge-time red-witness gate is wired per the settled latest-main decision; a second project onboards from charter alone via the greenfield bootstrap path. Exit test per blueprint: two phases in parallel worktrees merged serially without incident; project number 2 running from charter alone. The conflicts-with and parallelizable fields that every plan (including this one) has been filling since M1 become load-bearing here; until M5 they are recorded but every execution is sequential (scout observation 4, plan decision D-2).

---

## 8. Decisions taken in this plan (flag if you disagree)

- D-1: The six firstmate BORROW components (watcher, liveness guard, session lock, worktree pool, spawn, teardown) are planned as BUILD from the blueprint section 4 one-line contracts, because no firstmate source is present in this repository (verification report, honest-failures). BORROW degrades to BUILD unless the owner supplies the source before the relevant phase dispatches; raised in the owner queue as DR-0009 because it may shrink M1 cost. Acceptance criteria are identical either way. DR-0009 is consulted at dispatch and never blocks any phase; an option 1 answer arriving after the relevant phase has dispatched is ignored (PR-007).
- D-2: M1 is six sequential phases (P1 ground, P2 fleet init + doctor, P3 lock + pool, P4 spawn + teardown, P5 watcher + liveness, P6 sandbox + exit harness); parallelism stays off until M5; the M1 exit test's spawned work is a deterministic stub payload, not an LLM agent, because judgment roles arrive in M3 and the exit test verifies plumbing, not judgment.
- D-3: M1 state files (task meta, lock, beacon) are plain JSON parsed with Node built-ins, no schema library; DR-0006 governs M2-and-later schema artifacts. This keeps DR-0006 from blocking M1.
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
- D-16: M1 phases assume the recommendation of any still-open DR they cite; a different owner choice triggers a plan revision before the affected phases dispatch. Discharged for DR-0001, DR-0002, DR-0003, and DR-0005 by revision 2 (owner decisions applied; DR-0005 differed from the recommendation and this revision is the required rework). Still in force for DR-0007 (substrate, recommendation assumed) and for DR-0008's package-name working assumption (deferred, due before the M3 plan is approved).
- D-17 (dist policy, required by decided DR-0005): dist/ is built in CI and at publish (npm prepack), never committed; .gitignore carries dist/. Rationale: committed compiled output is merge-conflict and review noise with no reader; the process doc's generated-artifact drift gate (R-047) governs generated artifacts that must live in the repo, and dist/ need not; prepack makes every published tarball a fresh deterministic build. Consequence: no drift gate is needed for dist/ because nothing generated is committed.
- D-18 (TypeScript execution, required by decided DR-0005): tests run as TypeScript directly under node --test via Node 26 native type stripping (deterministic, npm only, zero additional dependencies; this relies explicitly on Node's native TypeScript support, available at DR-0002's decided floor of 26). Type stripping performs no type checking, so the tsc build step is what guards types: npm run build runs tsc -b over tsconfig.src.json (bin/ and src/, emit to dist/) and tsconfig.test.json (test/, noEmit, references the src project), type-checking all three roots and emitting the shippable dist/ (PR-101). Sources are restricted to erasable TypeScript syntax (no enums, no namespaces, no parameter properties), enforced by tsconfig erasableSyntaxOnly; type-only imports use import type, enforced by verbatimModuleSyntax (PR-103); relative imports use .ts extensions, rewritten to .js in emitted output by rewriteRelativeImportExtensions.

## 9. Owner decisions

Per the process rule, phases touching an undecided owner matter are blocked-by that DR and ship nothing until it is decided. DR-0009 is the declared exception: it sizes work without changing any contract, so it is consulted at dispatch and never blocks (PR-007).

| DR | Question | Blocks |
|---|---|---|
| DR-0001 (decided: Apache-2.0) | Repository license | Applied in M1-P1 (LICENSE file, package.json license field) |
| DR-0002 (decided: Node >= 26) | Node version floor | Applied in M1-P1 (engines ">=26", CI on 26 only) |
| DR-0003 (decided: GitHub Actions hosted ubuntu-latest) | CI runner | Applied in M1-P1 (workflow) |
| DR-0004 (open) | Elevated GitHub permissions | Not a dispatch blocker; items 2 and 3 execute right after M1-P1 merges (the orchestrator reminds at that gate); item 4 pairs with M2-P7 |
| DR-0005 (decided: TypeScript compiled to JavaScript) | Kernel language and runtime (SC-004) | Applied across all M1 phases by revision 2 (D-17, D-18); governs M2 as well |
| DR-0006 (open, new) | Schema technology and artifact format (SC-005) | M3 detailed planning (not M1, per D-3) |
| DR-0007 (open, new) | Orchestration runtime substrate (SC-007) | M1-P2 through M1-P6 |
| DR-0008 (open, deferred by owner; due before the M3 plan is approved) | Release registry and package naming (SC-012 + SC-006) | M3 release phase; M1-P1 name field carries the recommendation as a working assumption, a one-line change until first publish |
| DR-0009 (open, new) | Firstmate source availability | None: consult-at-dispatch, never blocks (PR-007). Outcome checked at M1-P3/P4/P5 dispatch; if undecided, proceed as BUILD per D-1; sizing only, reversible |

Owner action A-1 (not a decision record: it is an act, not a choice): create the toy sandbox GitHub repository (or grant the orchestrator repo-creation permission), before M1-P6 dispatches.

## 10. Open questions

Per SC-009's disposition (plan decision D-7), every open question is a decision record with status open, not a free-floating list item. The open questions of this plan are exactly: DR-0004, DR-0006, DR-0007, DR-0008 (deferred by the owner, due before the M3 plan is approved), DR-0009. DR-0001, DR-0002, DR-0003, and DR-0005 were decided on 2026-08-04 and are applied by revision 2; their records remain the audit trail. There are no other open questions.

## 11. Parked (not in this plan)

1. Pipeline telemetry (cost per phase, review hit rate, flake tax): blueprint v1 non-goal, deferred to v1.1; schemas must not preclude it (M3-P1 notes this constraint).
2. Multi-orchestrator fleets: blueprint v1 non-goal.
3. Production outcome loop (analytics feeding intake): blueprint v1 non-goal.
4. Non-Claude harness adapters: blueprint v1 non-goal; the DR-0007 adapter seam keeps the door open without building anything.
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
