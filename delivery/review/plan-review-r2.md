# Adversarial Plan Review r2: Tiphys Kernel Plan v1, Revision 2 (delta review)

- Date: 2026-08-04
- Scope: revision 2 changes only (diff 29a6315..c1f203a), per coordinator instruction. Round 1 findings were verified as applied; previously reviewed and passed material is not re-litigated. The four decided DRs (DR-0001 Apache-2.0, DR-0002 Node >= 26, DR-0003 GitHub Actions hosted, DR-0005 TypeScript compiled to JavaScript) are settled owner decisions and out of scope; this review attacks only the plan's implementation of them.
- Plan reviewed at commit c1f203a (plan's self-declared baseline 50a9368)
- Method: read the full diff of the plan and all nine DR files between 29a6315 and c1f203a, plus the touched plan sections in full context; ran the six mandatory probes (build-story coherence, type-stripping reality check, scripted stale-claim sweep, cross-document consistency, P1 criteria falsifiability, conventions scan).

## Verdict

FIX-ROUND-NEEDED

Two medium findings, four low. The decision application is clean where it is mechanical (license, floor, runner, blocked-by hygiene, stale-claim sweep near-perfect); the two mediums are both in the new build story: the build command and the suggested config mechanism contradict each other while the test/ type-check claim has no falsifiable witness, and the source-versus-dist CLI invocation form is left undefined for phases P2 to P6.

## Findings

### PR-101

- Severity: medium
- Claim in the plan: P1 step 2 pins the build script as "build runs tsc -p tsconfig.json (full type check plus emit into dist/)"; step 3 says compilation "type-checks bin/, src/, and test/, while only bin/ and src/ output is emitted into dist/ (the mechanism, for example a solution-style config with a noEmit test project, is the implementer's choice within acceptance criteria 1 and 9)"; criterion 1 repeats the coverage claim parenthetically; D-18 states "npm run build type-checks bin/, src/, and test/" (plan lines 94, 95, 104, 336).
- Why it is wrong: the pinned command and the suggested mechanism are incompatible, and the coverage claim is not guarded by any criterion. tsc -p compiles exactly one project and does not follow project references; building a solution-style config requires tsc -b. A solution-style root config under tsc -p type-checks nothing and exits 0 (criterion 2 would catch the missing dist, so the total no-op fails, but the surviving hole is exact: an implementer who uses a single tsconfig covering only bin/ and src/ satisfies criteria 1, 2, 3, and 9 completely while test/ is never type-checked by anything, since D-18's own text says type stripping performs no checking). The one place types are supposed to be guarded has an unwitnessed boundary, and every acceptance criterion passes while it is broken.
- Evidence: plan lines 94, 95, 104, 336; TypeScript CLI semantics (tsc -p versus tsc -b for referenced projects).
- Concrete edit: pin the mechanism instead of delegating it: build runs tsc -b, with tsconfig.src.json (bin/ and src/, emit to dist/) and tsconfig.test.json (test/, noEmit, references the src project), both carrying the D-18 flags. Add a falsifiability criterion in the style of P6 criterion 5: "with a deliberate type error temporarily introduced in a test/ file, npm run build exits nonzero; likewise for a src/ file; both demonstrations captured in the work history and reverted." Update criterion 9 to name both config files.

### PR-102

- Severity: medium
- Claim in the plan: P2 through P6 steps and criteria invoke the CLI as "tiphys init", "tiphys doctor", "tiphys spawn", and so on, with no definition of what "tiphys" resolves to before the package is installed; the only pinned invocations are P1 criterion 3 (node bin/tiphys.ts and node dist/bin/tiphys.js, for the version subcommand only) and exit-test step 1 ("the build emits dist/ for the CLI entry the harness invokes") (plan lines 106, 126 onward, 260).
- Why it is wrong: revision 2 introduced a real source-versus-compiled split and left every later phase ambiguous across it. Two concrete failure paths: (a) P1 criterion 1's "npm test exits 0 without requiring a prior build" is asserted once and never re-imposed; a later phase whose tests spawn dist/bin/tiphys.js passes CI (the gates job builds before testing), and the no-build test story quietly dies with no criterion failing. (b) If instead all phase tests use the source entry, then no compiled subcommand other than version is ever executed until P6's harness, and a compile-boundary defect (import rewriting, emitted layout) in init/lock/spawn/teardown surfaces three phases after the code merged. A fresh implementer of P2 cannot tell from the plan which form their tests must drive.
- Evidence: plan lines 104 (the without-prior-build property, P1 only), 106, 126-135, 152-160, 186-195, 212-220, 260.
- Concrete edit: add one sentence to section 3's shared phase fields: "In all phase steps and acceptance criteria, tiphys <cmd> means node bin/tiphys.ts <cmd> (source entry, no build required); every phase inherits P1 criterion 1's property that npm test passes with dist/ absent; the P6 harness and the section 4 exit test invoke dist/bin/tiphys.js after npm run build, which is where compiled-form behavior of all subcommands is witnessed." Optionally add to P6's local-mode criteria that the harness's tiphys invocations resolve to dist (so the compiled form of every M1 subcommand is exercised in CI from P6 on).

### PR-103

- Severity: low
- Claim in the plan: D-18 and P1 step 3 fix the tsconfig flag set as erasableSyntaxOnly plus rewriteRelativeImportExtensions, and criterion 9 asserts exactly those two flags (plan lines 95, 109, 336).
- Why it is wrong or dangerous: the flag that disciplines import syntax for native execution is missing. Without verbatimModuleSyntax, a type-only import written as a plain value import is elided by tsc in the emitted dist/ (works) but survives in the source that Node runs under type stripping, where it fails at runtime when the imported name has no value existence. That is a source-versus-dist behavioral divergence of exactly the kind criterion 3 exists to prevent; it would be caught by a failing test rather than silently, but the plan chose to enumerate the binding flags precisely, and the enumeration is one flag short of making D-18's "the source entry and the compiled entry agree" structurally true.
- Evidence: plan lines 95, 106, 109, 336; TypeScript verbatimModuleSyntax semantics versus Node type stripping.
- Concrete edit: add verbatimModuleSyntax true to P1 step 3 and to criterion 9's inspection list, and add "type-only imports use import type" to D-18's syntax discipline sentence.

### PR-104

- Severity: low
- Claim in the plan: P1 step 2 sets "bin mapping tiphys to dist/bin/tiphys.js, a files entry including dist (the publish tarball ships compiled output), ... prepack runs the build" (plan line 94).
- Why it is dangerous: nothing in M1 ever exercises the installed form. Criterion 3 runs node dist/bin/tiphys.js directly, which bypasses everything npm installation adds: the shebang line (tsc preserves one only if bin/tiphys.ts has it, and no step says it must), the execute bit npm derives from it, and the files allowlist actually containing everything dist needs. All nine criteria can pass while npx tiphys or a global install is broken, and the defect would surface at M3 first publish, two milestones after the code merged.
- Evidence: plan lines 94, 105, 106; M3 outline release phase (first install-and-import verification).
- Concrete edit: either add a cheap P1 criterion: "npm pack produces a tarball; installing it into a temporary prefix and running the installed tiphys version prints the package.json version" (this also forces the shebang to be stated in step 4), or explicitly park installed-form verification with a named pointer to the M3 release phase so the gap is a recorded decision instead of a silence.

### PR-105

- Severity: low
- Claim in the plan: the M2-P5 outline still lists the kernel-generic gates as "typecheck, suite wrapper, scope, citations, coverage" (plan line 285).
- Why it is wrong: revision 2 renamed the kernel's type gate: there is no typecheck script anymore; the gate is the build step (tsc type check plus emit, D-18), and CLAUDE.md's gate list was correctly updated to "npm ci, npm run build, node --test" in P1 step 9. The M2 outline's label is the one survivor of the sweep, and it is exactly the list the M2 gate manifest and the M3 gate registry will be seeded from, so the stale name propagates forward if uncorrected.
- Evidence: plan lines 94 (scripts list, no typecheck), 101 (CLAUDE.md gate list), 285.
- Concrete edit: in M2-P5, replace "typecheck" with "build (tsc type check plus emit, D-18)".

### PR-106

- Severity: low
- Claim in the plan: P1 step 2 sets the test script to "node --test over test/**/*.test.ts" (plan line 94).
- Why it is dangerous: if the pattern is written unquoted in package.json, the shell npm uses (dash on the DR-0003 runner) expands ** as a single *, so the pattern matches only depth-two files. Today that finds nothing (all M1 tests are top-level), the literal pattern falls through to node, and node's own globbing handles ** correctly, so it works by accident. The day a phase adds a test/ subdirectory, the shell starts expanding, and top-level test files silently drop from the run. The per-phase monotonic test-count criteria would likely catch the drop, but the process doc's own warning ("all green with silently-dropped tests is the most dangerous output a suite can produce") argues for not relying on an accident.
- Evidence: plan line 94; process doc lines 117-120.
- Concrete edit: specify the script with the pattern quoted so node performs the globbing: node --test "test/**/*.test.ts", and say so in step 2.

## Probes run

1. Build-story coherence: traced package.json (bin to dist/bin/tiphys.js, files including dist, build/test/prepack scripts), tsconfig (D-18 flags, outDir), .gitignore (dist/), CI order (npm ci, build, test, then the P6 local-mode harness after build so dist exists), and the exit-test precondition (updated to npm ci && npm run build && npm test, so the fresh-clone story holds). No executable path references a nonexistent location. Found: the build command versus config-mechanism contradiction with the unwitnessed test/ coverage (PR-101), the undefined development-versus-installed invocation form for P2 to P6 (PR-102), and the never-witnessed installed form (PR-104). The toy sandbox and stub payload are language-independent and unaffected.
2. Type-stripping reality check: D-18 states the erasable-syntax constraints (no enums, no namespaces, no parameter properties) and binds them to tsconfig erasableSyntaxOnly, which criterion 9 asserts by inspection, and .ts import extensions bound to rewriteRelativeImportExtensions, also in criterion 9: enforceable, not hopes. The tsc coverage claim (bin/, src/, test/) is asserted in criterion 1 and D-18 but has no falsifiable witness (PR-101). The flag set is one short for import discipline (PR-103).
3. Stale-claim sweep: scripted greps over the full revision 2 plan for JSDoc, checkJs, jsconfig, typecheck, "no build step", plain JavaScript, MIT, Node 22/24 forms, and registry names. Zero survivors except one: the M2-P5 gate list still says "typecheck" (PR-105). R-041's "typecheck gate wiring for pilot" is the pilot project's own gate and is correctly untouched. All Node-version text now reads 26 (P1 steps 2 and 8, criteria 5 and 6, P6 criterion 2's "Node 26 or later"); license text reads Apache-2.0 everywhere it appears; the M3 exit test no longer names a registry or a hardcoded package name.
4. Cross-document consistency: DR-0005's decision note left the dist question open ("the plan revision picks one and says which"); D-17 picks built-in-CI-never-committed and states the drift-gate consequence, consistent. D-18's reliance on Node 26 native type stripping is explicitly tied to DR-0002's decided floor. D-16 is correctly discharged for DR-0001/0002/0003/0005 and kept in force for DR-0007 and the DR-0008 working assumption. Blocked-by fields: P1 "none remaining", P2 to P5 carry exactly DR-0007, P6 carries DR-0007 plus A-1; section 9's table and section 10's open-questions list (DR-0004, 0006, 0007, 0008 deferred, 0009) match the DR files' statuses. DR-0002's "CI on 26 only" matches P1 step 8 and criterion 6 exactly. DR-0001's NOTICE-when-needed clause requires nothing from M1 and the plan correctly ships LICENSE only. No contradictions found beyond PR-101's internal step 2 versus step 3 tension.
5. P1 criteria 1 to 9 falsifiability: each criterion was checked for fresh-agent executability and pass-while-broken. Criteria 2, 3, 4, 5, 6, 7, 8 are executable and tight (criterion 3's byte-identical dual-entry check is a genuinely strong parity witness; criterion 2 guards D-17 in both directions). Criterion 1's "without requiring a prior build" is executable (delete dist, run). The failures are criterion 1's unfalsifiable type-check-coverage parenthetical (PR-101) and criterion 9 guarding a flag set that is one flag short (PR-103). No criterion depends on branch protection existing before DR-0004 items 2 and 3 execute.
6. Conventions: scripted non-ASCII scan over the full revision 2 plan and all nine DR files: zero matches, so zero em dashes and zero en dashes in the changed text (and everywhere else). npm only throughout (D-18 says so explicitly); English only.

## Honest failures

- Node 26 behavior claims are from knowledge, not execution: that type stripping is default-on and stable at Node 26, that node --test accepts .ts files and glob patterns natively, and that erasableSyntaxOnly-conformant sources run unmodified. Node 26 postdates direct experience; the plan's own D-18 stakes the same claims, and P1 criterion 1 will test them within minutes of dispatch, but this review could not pre-verify them (no Node 26 runtime in this environment, and the repo is still greenfield).
- tsc -p versus tsc -b semantics for solution-style configs (PR-101) and dash's ** expansion behavior (PR-106) are asserted from tool knowledge, not demonstrated here.
- DR-0002's Node release-schedule claims (26 entering LTS October 2026) are the owner's and the DR's premises; settled and not verified against the live release schedule.
- The claim that revision 2 applied all 13 round 1 findings was spot-verified through the diff for the ones the changed text touches (PR-001 squash witness in P4 criterion 7 and exit-test step 9, PR-002 fan-in job, PR-003 lockfile and pinned typescript, PR-004 projects/ area, PR-006 through PR-013 visible in their sections); a full re-audit of round 1 application was not in this round's scope.
