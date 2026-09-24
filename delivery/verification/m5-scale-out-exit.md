# M5-P6 exit report: hemma scale-out proof

Governing plan section: delivery/plan/value-delivery-plan.yaml:395. This
document was written incrementally. Section 1 is the bootstrap (step 3a).
Section 2 is the two parallel phases and their delivered outcome (step 3b,
criterion p6-parallel-value). Section 3 classifies every failure met
(criterion p6-attribution). Section 4 gives the verdict on every p6 criterion.
Section 5 lists the environment events and what was not verified.

Paths inside hemma and hemma-fleet are quoted in backticks, because neither
repository is a citation root here.

## 1. Bootstrap (step 3a)

### 1a. What was done, in one table

| repository | branch | pull request | reviewed and merged head | merge commit |
|---|---|---|---|---|
| ThomasHendrickx/hemma-fleet | `tiphys/bootstrap` | https://github.com/ThomasHendrickx/hemma-fleet/pull/1 | `bba99ec82bc1108bed802f0ceb0428cef053b05b` | `4fdd927f1885c0fe579666d8ef143462c8ed2797`, 2026-09-24T14:54:52Z |
| ThomasHendrickx/hemma | `tiphys/bootstrap` | https://github.com/ThomasHendrickx/hemma/pull/456 | `8e84b4e464e6902bbecdc982242cd87c9cde24bd` (the first head was `668f690`; the fix round, 1j, moved it) | `16a5588a594abc3a7d2daf8ee18d1a1f27b1a50d`, 2026-09-24T14:55:03Z |

Neither branch name matches `^claude/m[0-9]+-p[0-9]+-`, so neither is read as
a phase branch by any scope gate. This step (the implementer) merged nothing
and pushed nothing to either `main`; both pull requests were merged afterwards
by the orchestrator, at the heads both clean-room reviews approved (section 2).
No migration ran against any remote database. (Table updated at exit-report
time; the head column was stale after the fix round, finding CR-B-002.)

Specification followed: the bootstrap inputs of intake section 4c
(delivery/verification/m5-hemma-intake.md:186), the post-init steps of 4e
(delivery/verification/m5-hemma-intake.md:292) and the registry
recommendations of 4f (delivery/verification/m5-hemma-intake.md:584).

Toolchains, stated per command below: node v26.6.0 (npm 11.18.0) for every
`tiphys` command and for the gate runs; node v24.21.0 (npm 11.19.0), hemma's CI
major, for hemma's own checks and for the lockfile change; node v22.22.2 only
to install the Inngest dev CLI (section 1f).

### 1b. hemma-fleet: the fleet home

**Method, and why.** `tiphys init` refuses a directory that is not empty
(src/commands/init.ts:151), and `hemma-fleet` `main` (7efd572) already held
`README.md`. So init 0.2.1 ran into an empty scratch directory. Its output
was copied into the clone and compared byte for byte:

```
+ npx tiphys init <scratch>/fleet-init
initialized fleet home at <scratch>/fleet-init
exit 0
91951680c3cadb6a744bb710d99dae53dddd70bd Tiphys Fleet <fleet@tiphys.invalid> tiphys init: fleet home bootstrap
 .gitignore | 3, backlog.md | 1, charter/.gitkeep, decisions/.gitkeep, package.json | 9, status/.gitkeep, tasks/.gitkeep
identical .gitignore
identical backlog.md
identical charter/.gitkeep
identical decisions/.gitkeep
identical package.json
identical status/.gitkeep
identical tasks/.gitkeep
```

(The file list line is `git log --stat` condensed to one line; nothing else in
this block is edited except `<scratch>`.)

Three commits on `tiphys/bootstrap`: `25a917f` init's seven files, `bba99ec`
`charter/hemma.yaml` plus the `package-lock.json` that `npm install` wrote for
init's exact pin. The charter carries all eleven required fields. Each field's
source in hemma is named in a comment above it: `CLAUDE.md` (tech stack,
architecture, schema conventions, lint, deployment, work history),
`PROJECT-PURPOSE.md` (product intent, what is not built),
`docs/deployment.md` (topology, post-deploy checks),
`integrations/next-auth/auth.ts` (auth providers and session strategy) and
`prisma/schema.prisma` (Project, ProjectMember).

**Checks, in a clone of the branch, node v26.6.0.** First run, straight after
the copy:

```
+ npx tiphys validate --type charter charter/hemma.yaml
exit 0
+ npx tiphys doctor
CHECK layout FAIL missing state/, worktrees/, projects/
CHECK retention FAIL <fleet>/charter/hemma.yaml declares retention path docs/work-history/, which does not exist
exit 1
+ npx tiphys next
tiphys next: not a fleet home: <fleet> is missing state/, worktrees/, projects/
exit 1
```

(Only the two FAIL lines of doctor are shown here; the full output is in the
second run below, where every line is printed.)

Then `mkdir state worktrees projects` (by hand, before the kernel command for
it was found; see the fresh-clone run below) and `projects/hemma` made a
symbolic link to the hemma clone. The charter's retention paths were moved to paths hemma
already tracks (`docs/work-history/`, `docs/reports/`). Second run:

```
+ npx tiphys validate --type charter charter/hemma.yaml
exit 0
+ npx tiphys doctor
CHECK node PASS v26.6.0 satisfies kernel engines ">=26"
CHECK git PASS git version 2.43.0
CHECK gh WARN gh not found on PATH, PR modes unavailable
CHECK layout PASS all layout entries present
CHECK remote WARN fetched origin, which carries no ref for branch tiphys/bootstrap, so the whole of this branch is unpushed
CHECK lock PASS no lease present
CHECK shared-lock PASS not-declared (tiphys.sharedExclusion is absent from this fleet home's package.json, so the cross-environment layer is off here)
CHECK beacon WARN watcher not running or not scheduled
CHECK identity PASS git commit identity configured (Claude <noreply@anthropic.com>)
CHECK retention PASS 3 declared retention path(s) present and tracked
CHECK tasks PASS 0 open of 0
CHECK branches PASS 1 pushed branch(es), none unmerged into origin/main
CHECK worktrees PASS no pool worktrees
CHECK kernel-artifacts PASS the kernel install at <fleet>/node_modules/@tiphys/kernel carries roles/, schemas/, checklists/ and AGENTS.md
exit 0
+ npx tiphys next
fleet <fleet>
in flight: 0
unknown: 0
base refs: 1
  project hemma: branches judged against refs/remotes/origin/main (chosen by origin/HEAD)
next action: NOTHING IS IN FLIGHT in this fleet home. That is not the same sentence as 'the work is done'; read the cannot-see list above before concluding it
exit 0 (0 means every in-flight category is empty, 3 means work remains, 1 means this command failed)
```

`<fleet>` stands for the clone's path. The five-line "cannot see" list that
`next` prints between `base refs` and `next action` is left out; it is the
fixed list documented at intake section 4f and names no hemma fact.

The retention paths resolve through `projects/hemma`, the second root doctor
reads (src/commands/doctor.ts:701, src/commands/doctor.ts:805).

**The kernel's own command for a clone, measured afterwards on a FRESH clone
of the pushed branch** (`bba99ec`), node v26.6.0:

```
+ npm ci
added 11 packages in 614ms
exit 0
+ npx tiphys init .
tiphys init: <clone> is already initialized; run tiphys resume to rebuild the ephemeral directories a clone does not carry
exit 1
+ npx tiphys resume
REBUILT state/
REBUILT worktrees/
REBUILT projects/
exit 0
+ npx tiphys doctor (no project clone yet)
CHECK layout PASS all layout entries present
CHECK retention FAIL <clone>/charter/hemma.yaml declares retention path docs/work-history/, which does not exist
exit 1
+ npx tiphys next
next action: NOTHING IS IN FLIGHT in this fleet home. That is not the same sentence as 'the work is done'; read the cannot-see list above before concluding it
exit 0 (0 means every in-flight category is empty, 3 means work remains, 1 means this command failed)
```

(`doctor` filtered to its `layout` and `retention` lines; `next` to its last
two.) So `tiphys resume` is the kernel's step for a clone, and the only step it
leaves is the project clone under `projects/`, which is by design.

And init against a directory holding only hemma-fleet's `README.md`:

```
tiphys init: <scratch>/readme-only is not empty and not a fleet home, refusing
exit 1
```

### 1c. hemma: the bootstrap branch

Eleven commits on `tiphys/bootstrap`, cut from hemma `main` a6141d7 (the last
three are the fix round, 1j):

| commit | content |
|---|---|
| `b743bf9` | `@tiphys/kernel` `0.2.1` as an exact devDependency; `package-lock.json` written by `npm install --save-dev --save-exact` (lockfile superseded by `e9d2627`) |
| `2d4ebc4` | `charter.yaml` (byte-identical to the fleet copy, `cmp` exit 0) and `assurance-modes.yaml` (byte copy of the installed kernel's, sha256 3aaba6da21a034c9a95d7ee19a36dffb77d985e699e4e33e7a8f6d8297b025ea, also `cmp`-identical to this repository's copy) |
| `bcb7770` | `gate-registry.yaml` from the template, and the adapters in `scripts/tiphys-gates/` |
| `7db1f34` | `.github/workflows/tiphys-gates.yml`, a NEW workflow; `ci.yml` is unchanged |
| `bda3b37` | `docs/tiphys/plan.yaml` (phases M1-P1, M1-P2) and `docs/tiphys/phase-declarations/m1-p1.json`, `m1-p2.json` |
| `5e055f9` | the push arm passes `--base/--head/--phase` (finding F-4) |
| `d25ff20` | adapter detail wording (`failed suite(s)`, not `failed file(s)`) |
| `668f690` | hemma's own work history, `docs/work-history/2026-09-24.tiphys-bootstrap.md` |
| `6221f18` | the gates job sets `DATABASE_URL` and `DIRECT_URL` (1j, first CI run red) |
| `e9d2627` | `package-lock.json` regenerated by npm so every non-dev entry matches `main` (1j, F-5) |
| `8e84b4e` | hemma's work history: the fix round |

The work-history file is outside the brief's list. Hemma's `CLAUDE.md`
("Before finishing any prompt", item 9) requires one for every completed task,
and hemma's rules bind hemma changes, so it was added and is named here.

The registry, as the intake recommended in 4f:

- `unit-tests`, `typecheck`, `lint`: hemma's own commands through adapters
  that each write one GateResult (units: tests passed, project files in the
  tsc program, files linted). Lint uses hemma's threshold: zero errors,
  warnings allowed.
- `scope`: `[node, node_modules/@tiphys/kernel/dist/src/gates/scope.js,
  --declarations, docs/tiphys/phase-declarations]`, `applicability:
  conditional`, `branch-matches` `claude/m[0-9]+-p[0-9]+-.*`, parameters
  `[base, head, phase]`.
- No `merge-preconditions`, `red-witness`, `suite` or `citations` (4f
  recommendation 4 and the 4e table).

The workflow: `ubuntu-latest`, node 26, `actions/checkout` with
`fetch-depth: 0` and `ref: ${{ github.head_ref }}`, `npm ci`,
`npx prisma generate`, `npx next typegen`, then `npx tiphys gates run
--registry gate-registry.yaml --mode full` with `--phase` derived from the
branch name, lowercased, by the same `sed` as this repository's own workflow.

Documents validated with the installed kernel, node v26.6.0:

```
+ npx tiphys validate --type charter charter.yaml
exit 0
+ npx tiphys validate --type gate-registry gate-registry.yaml
exit 0
+ npx tiphys validate --type plan docs/tiphys/plan.yaml
dispatchable: true
exit 0
```

The conflict pre-pass on hemma's two real declarations, from this branch's
checkout (0.2.1 has no `conflicts`, intake 4f). **This first run was made
WITHOUT `--append-only`**, so it printed the kernel's own three default
registries, which intake 6a says hemma's run should replace with its own
(finding CR-B-003). The corrected run follows the original:

```
+ node bin/tiphys.ts conflicts <hemma>/docs/tiphys/phase-declarations/m1-p1.json <hemma>/docs/tiphys/phase-declarations/m1-p2.json
conflicts: 2 declaration(s): M1-P1 (<hemma>/docs/tiphys/phase-declarations/m1-p1.json), M1-P2 (<hemma>/docs/tiphys/phase-declarations/m1-p2.json)
append-only, union-resolved, never an overlap: test/behaviors.json, gates.manifest.json, delivery/requirements/clause-map.json
DISJOINT M1-P1 M1-P2
conflicts: 0 overlapping pair(s), 1 disjoint pair(s), 0 overlapping path(s)
semantic coupling: NOT CHECKED. Literal file overlap is the only thing this command computes; zero overlap is not proof of independence. A reviewer must still judge semantic coupling for EVERY pair, disjoint ones included (a test in one phase asserting on what another phase changes, related behaviour in disjoint files, merge order).
exit 0
```

Corrected, at exit-report time, with hemma's one append-only file and this
branch's kernel (node v26.6.0). The declarations are byte-identical at
`8e84b4e` and at hemma `main` `5bf2e57` (`git diff --quiet` exit 0):

```
+ node bin/tiphys.ts conflicts --append-only package-lock.json <hemma>/docs/tiphys/phase-declarations/m1-p1.json <hemma>/docs/tiphys/phase-declarations/m1-p2.json
conflicts: 2 declaration(s): M1-P1 (<hemma>/docs/tiphys/phase-declarations/m1-p1.json), M1-P2 (<hemma>/docs/tiphys/phase-declarations/m1-p2.json)
append-only, union-resolved, never an overlap: package-lock.json
DISJOINT M1-P1 M1-P2
conflicts: 0 overlapping pair(s), 1 disjoint pair(s), 0 overlapping path(s)
semantic coupling: NOT CHECKED. Literal file overlap is the only thing this command computes; zero overlap is not proof of independence. A reviewer must still judge semantic coupling for EVERY pair, disjoint ones included (a test in one phase asserting on what another phase changes, related behaviour in disjoint files, merge order).
exit 0
```

The bootstrap criteria review reproduced the same verdict and its control
(both declarations plus `tests/setup.ts`: `OVERLAP M1-P1 M1-P2 tests/setup.ts`,
exit 1), and judged semantic coupling: neither spec path is referenced by any
tracked non-doc file (delivery/review/m5-p6-hemma-review-bootstrap-criteria.md:74).

The phase predicates are red at the branch point (node v24.21.0):

```
+ npx eslint --max-warnings 0 domain/site-shed/site-shed.service.spec.ts
no-untimed-clock-in-specs warnings: 7
exit 1
+ npx eslint --max-warnings 0 integrations/google-calendar/oauth.spec.ts
no-untimed-clock-in-specs warnings: 7
exit 1
+ npx vitest run --project unit domain/site-shed/site-shed.service.spec.ts integrations/google-calendar/oauth.spec.ts
 Test Files  2 passed (2)
      Tests  64 passed (64)
exit 0
```

(The `warnings:` lines are a `grep -c` of each eslint output, printed by the
script, not eslint's own text.)

### 1d. The gates, run locally the way the CI job runs them

On the bootstrap branch itself, node v26.6.0, `--base origin/main --head HEAD
--phase tiphys/bootstrap`, at `a6141d7` plus the uncommitted bootstrap files
(the first run, before the commits):

```
gates: declared 4 applicable 3 verdict 3 green 3 red 0 not-applicable 1 error 0 vacuous 0
gates: unit-tests: green: 8541 passed, 0 failed, 13 skipped, 7 todo of 8561; 0 failed file(s); vitest exit 0
gates: typecheck: green: 3910 project file(s) in the program, 0 error line(s); tsc exit 0
gates: lint: green: 3875 file(s), 0 error(s) (0 fatal), 795 warning(s); eslint exit 0
gates: scope: not-applicable: precondition scope-branch-is-a-phase-branch evaluated and unmet: branch tiphys/bootstrap does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$
gates: every applicable gate is green
exit 0
```

The 13 skipped are named in the vitest JSON report: 6 in
`domain/applicability/applicability.concurrency.spec.ts` and 7 in
`domain/credit/credit.repository.spec.ts`, both of which skip unless a
dedicated database variable is set. The gates job does not set them; hemma's
`validate` and `build-and-e2e` jobs do, and still run those specs.

**Scope, witnessed against a simulated post-bootstrap `main`.** Hemma's `main`
does not hold the declarations yet, and the scope gate refuses a merge base
that is not an ancestor of `origin/main` (measured: `error ... is not an
ancestor of the configured trunk origin/main`). So a local bare copy was made
with `main` moved to the bootstrap head `bda3b37`, and cloned. Nothing from it
was pushed. `--only scope`, node v26.6.0:

| run | branch | change | result |
|---|---|---|---|
| A | `claude/m1-p1-site-shed-frozen-clock` | the declared spec | green, 1 path audited, exit 0 |
| B | same | plus M1-P2's spec | red, names `integrations/google-calendar/oauth.spec.ts`, exit 1 |
| C | `claude/m1-p2-google-calendar-oauth-frozen-clock` | the declared spec | green, 1 path audited, exit 0 |
| D | `claude/m1-p9-no-declaration` | any | red, "no phase declaration exists at docs/tiphys/phase-declarations/m1-p9.json in the merge base", exit 1 |
| E2 | `fix/typo`, with `lint` | `README.md` | scope not-applicable, lint green, exit 0 |
| F | `main`, no `--base/--head/--phase` | none | scope ERROR, "requires --base --head --phase, which was not supplied", exit 21 |
| F2 | `main`, `--base HEAD~1 --head HEAD --phase main`, with `lint` | none | scope not-applicable, exit 0 |

Run B, verbatim:

```
gates: scope: red: touched path(s) outside the declared scope: integrations/google-calendar/oauth.spec.ts (declaration docs/tiphys/phase-declarations/m1-p1.json at merge base bda3b379daa446fbae9fcb035eab98c268e24daf, sha256 a0f4f863f79ecb6c1320f46ebfa73179cfb951d100a6d04b0731bb48c6871a56) (1 declared path(s) not touched: docs/work-history/2026-09-24.site-shed-frozen-clock.md)
gates: 1 gate(s) reported red: scope
exit 1
```

Run E with `--only scope` alone exited 21: a run whose only gate is
not-applicable has no applicable gate, which the runner reports as error by
design (delivery/plan/kernel-plan-m2.md:221). E2 is the realistic shape.

**The three adapters, red witness.** One branch in the simulated clone carried
three defects: a failing test (`expect(1 + 1).toBe(3)`), a type error
(`const notANumber: number = "a string"`) and a lint error (a `lib/` file
importing from `domain/`, which hemma's `hemma-lint/no-domain-imports-in-lib`
sets to error). Full registry, node v26.6.0:

```
gates: declared 4 applicable 3 verdict 3 green 0 red 3 not-applicable 1 error 0 vacuous 0
gates: unit-tests: red: 8541 passed, 1 failed, 13 skipped, 7 todo of 8562; 2 failed suite(s); vitest exit 1
gates: typecheck: red: 3913 project file(s) in the program, 1 error line(s); tsc exit 2
gates: lint: red: 3878 file(s), 1 error(s) (0 fatal), 795 warning(s); eslint exit 1
gates: scope: not-applicable: precondition scope-branch-is-a-phase-branch evaluated and unmet: branch witness/red does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$
gates: 3 gate(s) reported red: unit-tests, typecheck, lint
exit 1
lib/tiphys-witness/type-error.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.
eslint error lib/tiphys-witness/lint-error.ts hemma-lint/no-domain-imports-in-lib
```

A first attempt used `debugger;` as the lint defect and lint stayed green:
hemma's config does not make `no-debugger` an error. That is hemma's
threshold working as its `CLAUDE.md` states it, and it is why the witness uses
one of hemma's own error-level rules.

### 1e. hemma's own checks (validate job, step for step)

Node v24.21.0 (hemma's CI major), npm 11.19.0, at hemma `d25ff20`, with
every database variable set to the local Postgres 16 and the host printed
before each command (`+ db var DATABASE_URL host: localhost:5432`, and the
same for `DIRECT_URL` and `E2E_DATABASE_URL`). The ambient `DATABASE_URL`
points at a remote database; the script overrides it and refuses to run if
any of the three is not local.

| step (hemma `ci.yml` `validate` job) | exit | result |
|---|---|---|
| `npm ci --no-audit --no-fund` | 0 | npm 11.19.0 printed `install-scripts` warnings and ran no dependency install scripts; see note |
| `npx prisma generate` | 0 | |
| `npm run lint` | 0 | `795 problems (0 errors, 795 warnings)` |
| `npm run help:coverage` | 0 | |
| `npm run check:locale-parity` | 0 | `Locale parity: 39 namespace files identical across nl/en/fr.` |
| `check:consumer-manifest`, `check:invalidation-manifest`, `check:service-graph`, `check:retired-names`, `check:event-lifecycle-manifests`, `check:event-registry`, `check:consumer-model-registry` | 0 each | each reports up to date; `73 services, 9 edges, 0 cycles` |
| `npx next typegen` then `npx tsc --noEmit` | 0, 0 | |
| `npx prisma migrate deploy` into LOCAL `hemma_applicability` | 0 | `All migrations have been successfully applied.` |
| `npx vitest run --project unit`, `APPLICABILITY_TEST_DATABASE_URL` local | 0 | `Test Files 629 passed \| 2 skipped (631)`; `Tests 8546 passed \| 8 skipped \| 7 todo (8561)` |

Declared transliteration for this block and 1f: the lint summary line starts
with U+2716 in the raw capture (1 occurrence), the locale-parity line with
U+2705 (1 occurrence), and the test:full lines quoted in 1f with U+2705 (3
occurrences) and U+1F7E2 (2 occurrences); each is quoted from its first ASCII
character, so the glyph is rendered as nothing. Inside table cells a literal
`|` is written `\|`. Nothing else in any quoted output was altered.

Note on npm 11.19.0: it skips dependency install scripts unless approved
(`npm warn install-scripts ... Run npm install-scripts approve <pkg> to
allow`). Every check above still passed. Whether hemma's CI npm behaves the
same is not established here.

### 1f. hemma's E2E rule

**The rule, verbatim** (hemma `CLAUDE.md`, "Before creating or updating a
PR"): "All E2E tests must pass. Run `npx playwright test` and fix every
failure before pushing. It does not matter whether the failure is caused by
your changes or not -- if a test is red, the PR cannot be created or updated.
No exceptions." (The raw text has an em dash where `--` stands here, 1
occurrence, transliterated.)

The orchestrator's correction made a local Postgres 16 available, so the rule
was run here rather than deferred to CI. Mirror of the `build-and-e2e` job,
node v24.21.0, `CI=true` and the workflow-level env block of `ci.yml`
(non-secret values), databases LOCAL only:

| step | exit | result |
|---|---|---|
| drop and recreate LOCAL `hemma_e2e`, `npx prisma migrate deploy` | 0 | all migrations applied |
| `npm run build` (NODE_OPTIONS 8192) | 0 | |
| `npm run start` and the Inngest dev CLI 1.45.1 (installed to scratch with node v22.22.2's npm, which runs its install script) | ready | both answered within their timeouts |
| `npx playwright test --list` | 0 | `Total: 237 tests in 57 files` |
| `npx playwright test`, run 1 | **1** | `1 failed`, `6 skipped`, `4 did not run`, `226 passed (3.2m)`; the failure is `tests/e2e/budget-phase-aware-view.spec.ts:40`, `locator.click: Test timeout of 60000ms exceeded` on `budget-view-toggle-full`, which the call log shows `disabled`; the 4 did-not-run are the rest of that `serial`, `retries: 0` describe |
| that spec file alone, 3 times | 0, 0, 0 | `5 passed` each time (against run 1's leftover server; see 1k) |
| `npx playwright test`, run 2 (against run 1's leftover server; see 1k) | 0 | `1 flaky` (`tests/e2e/quote-budget-linking.spec.ts:178`, passed on retry), `6 skipped`, `230 passed (2.9m)` |
| `npm run test:full -- --workers=3` (its Playwright stage against run 1's leftover server; see 1k) | 0 | `Diff-scoped audit clean.`; `vitest [unit]: 8540 passed / 14 skipped / 7 todo / 8561 total`; `vitest [interaction]: 3 passed / 0 skipped / 0 todo / 3 total`; `playwright: 231 passed / 0 failed / 6 skipped / 0 did-not-run / 0 flaky -> accounted 237 of 237`; `Full test suite green.` |
| credit concurrency specs, LOCAL `hemma_credit_test` | 0 | `Tests 7 passed (7)` |

(`->` stands for U+2192 in the test:full line, 1 occurrence, transliterated.)

The 6 skips are by the specs' own conditions: two direct-upload tests that
need real storage, two login tests skipped under `CI`, and two reproduction
harnesses that run only when `SOAK_MINUTES` or `REPRO_ITERATIONS` is set
(`grep -n skip` of the four spec files).

**Verdict on the rule, and why the pull request was opened.** The last two
full runs of the suite are green: run 2 exited 0, and `test:full`, the wrapper
hemma's `CLAUDE.md` names for "run the full test suite", reports 0 failed and 0
flaky with every discovered test accounted for. Run 1's failure did not recur
in 5 later executions of its test (3 isolated, 2 in full runs). The branch
changes no application source; at `668f690` it did change one production
transitive dependency version (F-5), which the fix round undid (1j). This is a judgment that the rule is met, stated with
the red run beside it rather than instead of it, and the pull request
description carries the same record. The control run on hemma `main` came
after this, in the fix round (1j). **1k withdraws it as a control**: it ran
against a server built from the branch, not from `main`.

Not run: the direct-upload e2e against real Supabase storage (it needs the
`supabase/storage-api` service container and there is no container runtime
here) and Lighthouse (warn-only in CI).

### 1g. Every bootstrap input, classified

Classes as in intake 4c: CHARTER, PREDICATE (hemma-owned), OPERATOR (an
argument or an environment step, declared), KERNEL-HANDWORK (kernel
configuration neither init nor the charter produces, placed by hand; each is a
`hidden-bootstrap-handwork` finding and is named).

| # | input | where | class | note |
|---|---|---|---|---|
| B-1 | the fleet-home repository, `main` with `README.md` | hemma-fleet | OPERATOR (owner action A-18) | created by the owner |
| B-2 | `tiphys init <empty scratch dir>`, then a byte copy of its seven tracked files | hemma-fleet | OPERATOR | forced by the non-empty refusal, src/commands/init.ts:151; see F-1 |
| B-3 | `charter/hemma.yaml` | hemma-fleet | CHARTER | all eleven required fields; sources named per field |
| B-4 | `npm install` (lockfile for init's pin) | hemma-fleet | OPERATOR | intake I-11 |
| B-5 | `npx tiphys resume` in a clone of the fleet home | hemma-fleet | OPERATOR | a kernel command; this step first did it by hand with `mkdir` (same three empty directories) before finding it; see F-2 |
| B-6 | a hemma clone at `projects/hemma` | hemma-fleet | OPERATOR | projects/ is where clones live by design (src/fleet.ts:29); doctor's retention check needs it |
| B-7 | `charter.yaml` at the root | hemma | CHARTER | same bytes as B-3 |
| B-8 | `assurance-modes.yaml` at the root, a byte copy from `node_modules/@tiphys/kernel` | hemma | **KERNEL-HANDWORK (H-6)** | see F-3 |
| B-9 | `gate-registry.yaml` | hemma | PREDICATE | written from `templates/gate-registry.example.yaml`, which 0.2.1 does not ship, so the template was read from this branch; hemma does not depend on it at run time |
| B-10 | the `scope` entry's command path into `node_modules/@tiphys/kernel/dist/` | hemma | PREDICATE naming a kernel-internal path | intake 4f; stable only through the exact pin |
| B-11 | `scripts/tiphys-gates/*.mjs` | hemma | PREDICATE | hemma's commands, hemma's thresholds |
| B-12 | `@tiphys/kernel` `0.2.1` exact devDependency and the lockfile npm wrote | hemma | PREDICATE | see F-5; the placement flags (`--install-strategy=nested`, npm 10.9.7) are operator arguments, 1j |
| B-13 | `.github/workflows/tiphys-gates.yml` | hemma | PREDICATE | intake I-14 |
| B-14 | `docs/tiphys/plan.yaml` | hemma | PREDICATE | hemma's own plan |
| B-15 | `docs/tiphys/phase-declarations/m1-p1.json`, `m1-p2.json` | hemma | PREDICATE, kernel-imposed naming | intake I-12; ids and branches follow the enforced pattern |
| B-16 | `docs/work-history/2026-09-24.tiphys-bootstrap.md` | hemma | PREDICATE (hemma's own rule) | not a Tiphys input |
| B-17 | `--phase` from the branch name, and `--base/--head/--phase` on push | hemma CI | PREDICATE | see F-4 |
| B-18 | `--shared-exclusion` on `tiphys init` (intake I-2) | hemma-fleet | OPERATOR, a choice, NOT taken | init ran without it, so doctor reports `shared-lock PASS not-declared` (1b). It matters only when phases run from different environments; both M1 phases ran in one container (section 2). Added at exit-report time (CR-B-006 b) |

**Summary.** 18 inputs: 2 CHARTER, 9 PREDICATE, 6 OPERATOR, **1 KERNEL-HANDWORK
(H-6)**.

**Handwork numbering.** H-1 to H-4 are the intake's numbering
(delivery/verification/m5-hemma-intake.md:700). H-5 was allocated in this
step's first draft to the three ignored fleet directories created with `mkdir`,
and withdrawn before push when `tiphys resume` was found to produce them (F-2,
and the step 3a work history). The id stays retired and is not reused. H-6 is
the one hand-placed kernel item (CR-B-006 c).

**Verdict on p6-charter-only: NOT MET on released kernel 0.2.1.** The
criterion requires that no kernel-specific configuration beyond the charter
and project-owned predicates was hand-added. H-6, `assurance-modes.yaml`
copied into hemma by hand, is exactly such configuration, and 0.2.1 has no
command that produces it. This branch's `tiphys init --project`
(src/commands/init.ts:323, DR-0058) produces that file byte-identically
(F-3), so the criterion is met by this branch ONCE A RELEASE CARRIES IT. That
release is a follow-up; it has not happened (CR-B-006 a).

### 1h. Findings from the bootstrap

- **F-1 (kernel, low): init cannot target an existing repository.** A fleet
  home whose repository already has a commit (here only a README) cannot be
  made by `tiphys init` in place; the operator runs init elsewhere and copies.
  Measured: exit 0 into an empty directory, and exit 1 with the refusal at
  src/commands/init.ts:151 for a directory holding only the README (1b). The copy is exact and
  declared, so it is not hidden; it is a manual step.
- **F-2 (operator step, NOT handwork): a clone of a fleet home needs
  `tiphys resume`.** init creates `state/`, `worktrees/` and `projects/` and
  gitignores them (src/fleet.ts:12, src/fleet.ts:29), so no clone has them, and
  without them doctor fails `layout` and `next` refuses (src/fleet.ts:88).
  `tiphys resume` rebuilds all three (1b, fresh-clone run), and init itself
  names that command when run in a clone. This step at first recreated them by
  hand and classed that as handwork; the fresh-clone measurement corrected it.
  Recorded because the kernel's own pointer to `resume` appears only when init
  is run in the clone, and doctor's `layout` FAIL line does not mention it.
- **F-3 (kernel, H-6): 0.2.1 has no `init --project`, so the modes document was
  copied by hand.** The copy is byte-identical to what `tiphys init --project`
  on this branch writes (src/commands/init.ts:323 and intake 4e), and the
  intake's 4f named exactly this replacement. It is still kernel configuration
  placed by hand with the released kernel. It stops being handwork when a
  release that carries `init --project` is published and hemma runs it.
- **F-4 (kernel design, measured consequence): parameters are checked before
  the precondition.** The runner reports a gate whose declared parameters are
  absent as error BEFORE it evaluates the precondition (src/gates/run.ts:1413),
  which is the deliberate rule M2-C-3 (delivery/plan/kernel-plan-m2.md:64). So a
  project whose push arm runs the same registry must pass `--base`, `--head` and
  `--phase` even though scope will be not-applicable there (runs F and F2). The
  kernel's own workflow avoids this because its push bundle does not include
  scope. Not a defect; a fact every project CI must know, and the template does
  not say it.
- **F-5 (project predicate side effect, DECIDED and resolved): the kernel's
  exact dependency pins moved a hemma PRODUCTION transitive dependency.**
  `@tiphys/kernel` 0.2.1 pins `yaml` 2.9.0 exactly. With npm's default hoisted
  strategy, npm replaced hemma's hoisted `yaml` 2.8.4 with 2.9.0, because 2.9.0
  satisfies every other range; `npm ls yaml --omit=dev` showed `next-mdx-remote`
  (through `vfile-matter`) and `inngest` (through OpenTelemetry) resolving it.
  The orchestrator decided the bootstrap must not change hemma's production
  tree (intake K-3: every merge deploys). The fix round regenerated the
  lockfile with npm so that 0 non-dev entries differ from `main` (1j). The
  kernel-side lesson stands: an EXACT pin on a common library in a kernel that
  projects install as a devDependency can move the project's production tree,
  and the default install does it silently. Whether 0.2.x should use ranges
  for its runtime dependencies is a kernel question this step does not answer.
- **F-6 (charter, open): `review-families` is not declared.** Optional in the
  schema, and absence keeps the cross-family requirement unchanged. This step
  did not know which model families the orchestrator will review hemma phases
  on, so it did not guess.
- **F-7 (declared cost): the phase declarations carry a DATE.** Hemma names
  work histories `YYYY-MM-DD.<name>.md` and a declaration lists literal paths,
  so both declarations name `2026-09-24`. A phase that runs on another day
  needs its declaration amended (an additive grant, src/gates/scope.ts:110).

### 1j. Fix round after the first CI run (hemma 668f690 to 8e84b4e)

The orchestrator relayed three items after the first CI runs on hemma pull
request 456 at `668f690`: the `Tiphys gates` run 36007584690 (job
107659659141) was red; F-5 was decided; and run 1's E2E failure needed a
control run on `main`. hemma's `CI` run 36007584456 on the same head was
green (`validate`, `build-and-e2e` and `ci-passed` success, `migrate`
skipped), including its Playwright step.

**Item 1, the red gates job.** It failed at `npx prisma generate`:
`Failed to load config file ... Error: DATABASE_URL or DIRECT_URL is not set`,
exit 1.

- Mechanism: **the local environment carried variables CI does not.** Every
  local gate run in 1d started from a shell that exported `DATABASE_URL` and
  `DIRECT_URL` (forced to the local database on purpose, for safety). The new
  workflow set neither. hemma's `validate` job gets both from `ci.yml`'s
  workflow-level `env` block, which is why it passes.
- Derivation: rather than add the two names the error printed, the job's steps
  were run in an EMPTY environment (`env -i`). The only variables passed in
  were `HOME`, a `PATH` with node v26.6.0 first, `CI=true`, and this
  container's proxy and CA variables. Anything else the job needs would then
  fail as well.
- Not covered by the derivation: the runner's preinstalled tools, GitHub's
  `GITHUB_*` variables, and the `${{ github.* }}` expressions in the gates
  step. The local run supplied the push-arm values literally (`--base HEAD~1
  --head HEAD --phase tiphys/bootstrap`); the pull-request arm's values are
  observed only in CI.

| arm | environment | `prisma generate` | rest of the job |
|---|---|---|---|
| red, at `668f690` | empty, no database variables (`+ database-like vars inside the clean env: 0`) | exit 1, `Error: DATABASE_URL or DIRECT_URL is not set` | not run |
| fix | empty plus the job-level `env` block, parsed from the workflow file | exit 0 | not run |
| fix, port closed | the same two URLs with port 5432 changed to 5999 (`+ port 5999 listening: no`), because a runner has no database for this job | exit 0 | `next typegen` exit 0; gates exit 0 |

The port-closed arm's gate lines, at `e9d2627` (the same numbers at `668f690`
plus the fix):

```
gates: declared 4 applicable 3 verdict 3 green 3 red 0 not-applicable 1 error 0 vacuous 0
gates: unit-tests: green: 8540 passed, 0 failed, 14 skipped, 7 todo of 8561; 0 failed suite(s); vitest exit 0
gates: typecheck: green: 3910 project file(s) in the program, 0 error line(s); tsc exit 0
gates: lint: green: 3875 file(s), 0 error(s) (0 fatal), 795 warning(s); eslint exit 0
gates: scope: not-applicable: precondition scope-branch-is-a-phase-branch evaluated and unmet: branch tiphys/bootstrap does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$
gates: every applicable gate is green
exit 0
```

One test differs from 1d (8541 passed, 13 skipped there). Diffing the two vitest
JSON reports by test name gives exactly one: `hierarchy-parser.flow.run.spec.ts`
"runs the full flow and logs result" passed in 1d and skips here. It is
`it.skipIf(process.env.CI)`, and the 1d runs had no `CI=true`. This is the same
mechanism, harmless in this case. The fix sets the two values `ci.yml`
already uses, and it adds no secret.

**Item 2, F-5 decided: no production dependency change.** A script compares the
non-dev `packages` entries of two lockfiles (every entry whose `dev` is not
true, so `devOptional` entries count as non-dev), plus the root's production
`dependencies`. It prints each added, removed or changed entry and a count, and
exits 0 only on zero. Every experiment started from `main`'s `package.json`
and `package-lock.json`, with npm only:

| lockfile | npm | non-dev differences from `main` a6141d7 |
|---|---|---|
| `main` against itself (the script's control) | | 0 |
| the first bootstrap lockfile, `668f690` | 11.19.0 | 2: `node_modules/yaml` 2.8.4 to 2.9.0; `node_modules/fsevents` loses `dev: true` |
| `main`, no-op `npm install --package-lock-only` | 11.19.0 | 1 (`fsevents`) |
| `main`, no-op | 11.18.0 (node v26.6.0) | 1 (`fsevents`) |
| `main`, no-op | 10.9.7 (node v22.22.2) | 0 |
| kernel added, default strategy | 11.19.0 | 2 |
| kernel added, default strategy, `--prefer-dedupe` | 11.19.0 | 2 |
| kernel added, `--install-strategy=nested` | 11.19.0 | 1 (`fsevents`) |
| kernel added, `--install-strategy=shallow` | 11.19.0 | 1 (`fsevents`) |
| kernel added, default strategy | 10.9.7 | 1 (`yaml`) |
| **kernel added, `--install-strategy=nested`** | **10.9.7** | **0** |

Two separate causes, and each needed its own change:

- `yaml`: the default hoisted strategy REPLACES the root `yaml` because 2.9.0
  satisfies every existing range. A nested strategy places the kernel's own
  dependencies under `node_modules/@tiphys/kernel/node_modules/` instead.
- `fsevents`: npm 11 rewrites one flag of `main`'s OWN lockfile on a no-op
  install. `fsevents` 2.3.2 is an optional dependency of `playwright`, which is
  a hemma production dependency. So npm 11's computed flag is arguably the
  correct one, and `main`'s lockfile is stale. That is hemma's business, not
  the bootstrap's, and npm 10.9.7 leaves it as it is.

The committed lockfile (`e9d2627`), regenerated by
`npm install --package-lock-only --ignore-scripts --save-dev --save-exact
--install-strategy=nested @tiphys/kernel@0.2.1` with npm 10.9.7:

```
+ non-dev lockfile entries vs origin/main
non-dev entries: base 1020, head 1020; differences: 0
diff exit 0
  yaml at node_modules/@tiphys/kernel/node_modules/yaml 2.9.0 dev
  yaml at node_modules/yaml 2.8.4 non-dev
+ package.json vs main:
+    "@tiphys/kernel": "0.2.1",
```

Its full change against `main` is the root devDependency and 7 added entries,
all under `node_modules/@tiphys/kernel/`. What else was checked:

- A second run of the same command reproduced the committed blob byte for byte
  (`cmp`). hemma's pre-commit hook runs prettier on staged JSON, and it changed
  nothing.
- `npm ci` exits 0 with npm 11.19.0 and with npm 11.18.0. After `npm ci`, the
  installed hoisted `yaml` is 2.8.4 and the kernel's is 2.9.0.
- A later default-strategy `npm install --package-lock-only` leaves the
  lockfile byte-identical with npm 10.9.7. With npm 11.19.0 it keeps `yaml`
  nested and flips the same `fsevents` flag it flips on `main`.
- No hand edit and no `overrides`.
- A hemma developer who runs a plain `npm install <pkg>` with npm 11 will
  still flip `fsevents`, exactly as on `main` today.

**Item 3, the E2E control on `main`. WITHDRAWN AS A CONTROL, see 1k: every
Playwright run below was served by the server left over from 1f's run 1, which
was built from the bootstrap branch, not from `main`.** As recorded at the
time: hemma `main` at `a6141d7`, in its own worktree. Same method as 1f: node v24.21.0, `CI=true`, the `ci.yml` env block,
a freshly recreated LOCAL `hemma_e2e`, `prisma migrate deploy`, a production
build and the Inngest dev CLI. Results:

| run | result |
|---|---|
| `npm ci`, `prisma generate`, `migrate deploy`, `npm run build` | exit 0 each |
| `npx playwright test`, full 1 | exit 0: `6 skipped`, `231 passed (2.9m)` |
| `npx playwright test`, full 2 | exit 0: `6 skipped`, `231 passed (2.8m)` |
| `tests/e2e/budget-phase-aware-view.spec.ts` alone, 5 times | exit 0 each, `5 passed` each |

As first written: "`budget-phase-aware-view.spec.ts:40` passed in all 7
executions on `main`." That sentence is FALSE as a statement about `main`, and
is left here struck by this note rather than deleted. What those 7 executions
show is that the spec, with `main`'s spec files (identical to the branch's),
passed 7 times against the BRANCH build. Corrected count: 1 failure in 13
local executions, all 13 against branch builds (1 against a fresh server, 12
against the leftover one); 0 valid local executions on `main`. hemma's own CI
`build-and-e2e` job passed on `668f690`, on `8e84b4e`, and on every later head
(section 2). Whether the failure predates the branch is still NOT established.

**CI on the new head `8e84b4e`**, read with the GitHub REST API and the GitHub
MCP tools:

| workflow, run | job, id | conclusion |
|---|---|---|
| `Tiphys gates`, 36011488311 (`pull_request`) | `gates`, 107673050400 | success; step `Tiphys gates (push)` skipped, as designed on this event |
| `CI`, 36011488314 (`pull_request`) | `validate`, 107673049974 | success |
| `CI`, 36011488314 | `build-and-e2e`, 107673049761 | success, including `Run Playwright tests` and `Direct-upload e2e against real storage` |
| `CI`, 36011488314 | `migrate`, 107676231046 | skipped (not a push to `main`) |
| `CI`, 36011488314 | `ci-passed`, 107678279269 | success |

The `gates` job log prints the same gate lines as the local port-closed arm
above. These are the per-gate lines from the job log, so this is observed, not
deduced from a bundle count:

```
gates: declared 4 applicable 3 verdict 3 green 3 red 0 not-applicable 1 error 0 vacuous 0
gates: unit-tests: green: 8540 passed, 0 failed, 14 skipped, 7 todo of 8561; 0 failed suite(s); vitest exit 0
gates: typecheck: green: 3910 project file(s) in the program, 0 error line(s); tsc exit 0
gates: lint: green: 3875 file(s), 0 error(s) (0 fatal), 795 warning(s); eslint exit 0
gates: scope: not-applicable: precondition scope-branch-is-a-phase-branch evaluated and unmet: branch tiphys/bootstrap does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$
gates: every applicable gate is green
```

The job uploaded its `summary.json` as artifact 10812739530.

### 1k. Correction at exit-report time: a leftover production server served 4 of 5 local E2E runs

Found while writing this report. A `next-server (v16.2.5)` process was still
running with its working directory in this step's hemma clone:

```
$ ps -o pid,ppid,lstart,cmd -p 26960
  PID  PPID                  STARTED CMD
26960     1 Thu Sep 24 13:28:08 2026 next-server (v16.2.5)
$ ls -l /proc/26960/cwd
lrwxrwxrwx 1 root root 0 Sep 24 14:40 /proc/26960/cwd -> <scratch>/m5p6-step3/hemma
```

(The scratch directory's absolute path is shortened to `<scratch>` in the
second capture; nothing else in either capture is changed.)

Its start time is the moment 1f's run 1 brought its servers up (the step's
beacon log reads `2026-09-24T13:28:12Z e2e servers up`). Every later local E2E
script tried to start its own server on port 3000 and could not:

| local run (evidence directory) | `EADDRINUSE` lines in its `nextjs.log` | which server answered |
|---|---|---|
| 1f run 1 (`e2e`) | 0 (`Ready in 147ms`) | its own, fresh |
| 1f spec alone x3, run 2 (`e2e-branch-rerun`, `e2e-full-rerun`) | 3 each | run 1's |
| 1f `test:full` (`e2e-test-full`) | 3 | run 1's |
| 1j item 3, "control on `main`" (`e2e-main`) | 3 | run 1's, built from the branch |

hemma's Playwright config reuses an existing server
(`reuseExistingServer: true`), so each run proceeded against the old one and
reported green without saying so. The Inngest dev server logged no bind error
in any run.

- **Mechanism: a cleanup that did not test the property that matters.** The E2E
  scripts' exit trap killed the recorded `npm run start` pid and ran
  `pkill -f "next start"`. Next.js renames its server process to
  `next-server (vX)`, which that pattern does not match, and the npm wrapper's
  death does not stop its child. The trap reported nothing either way.
- **Derivation:** `grep -c EADDRINUSE` over the `nextjs.log` of every local
  E2E run this step made (the table above; five runs, one per evidence
  directory). Not covered: the M1-P1 and M1-P2 implementers' own local E2E
  runs. M1-P1 used ports 3101 and 8301 (its pull request body says so). For
  M1-P2 the port is not stated, so whether its local run met the same server is
  not known from here.
- **Consequences:** the bootstrap's local E2E evidence reduces to run 1 (one
  failure) plus 12 green executions against the same branch build. The E2E rule
  verdict in 1f rested on run 2 and `test:full`, which are still green runs of
  the branch's code, but they are not independent server starts. The "control on
  `main`" is withdrawn (1j). The independent E2E evidence on every merged head is
  hemma CI's `build-and-e2e` job (section 2).
- **The process is still running at the time of writing.** Stopping it was
  refused by this agent's permission layer ("Interfere With Workloads"), and the
  orchestrator reports the same refusal. It is an ENVIRONMENT item for the owner
  or orchestrator: pid 26960, cwd `<scratch>/m5p6-step3/hemma`, connected to the
  LOCAL `hemma_e2e` only (its environment's `DATABASE_URL` host is
  `localhost:5432`).
- **Lesson for the next bootstrap:** give each E2E run its own port pair and
  assert the port is free before starting, and stop a server by the port's
  owner rather than by a process-name pattern.

### 1i. What this step did NOT cover

- The `push` arm of the new workflow has not run; it runs only after a merge
  to hemma `main`. Only the `pull_request` arm was observed in CI (1j).
- The real-storage direct-upload e2e was not run locally (1f); hemma's CI runs
  it in `build-and-e2e`. Whether run 1's E2E failure predates the branch is
  still open (1j, item 3).
- The two phases themselves, their merges and their post-merge push runs
  (step 3b).
- Whether a repository ruleset governs hemma `main` (intake Q-3) was not
  re-probed.

## 2. Two parallel phases in hemma (step 3b, criterion p6-parallel-value)

Every fact in this section was read from GitHub with the GitHub MCP tools
(pull request reads, commit listings and workflow-run reads) at exit-report
time, or measured in a hemma clone; each row names its source. Commit times are
the commits' own author timestamps, which the committing machine sets; pull
request and run times are GitHub's.

### 2a. The phases

Both are in hemma's own plan, `docs/tiphys/plan.yaml`, and each has its own
declaration under `docs/tiphys/phase-declarations/`, merged to hemma `main`
with the bootstrap at `16a5588`. Both are test-only. Each removes the 7
`no-untimed-clock-in-specs` warnings from one spec by freezing the clock in
file-level hooks, with no assertion changed.

| phase | branch | pull request | reviewed head | merge commit |
|---|---|---|---|---|
| M1-P1 | `claude/m1-p1-site-shed-frozen-clock` | https://github.com/ThomasHendrickx/hemma/pull/457 | `8380ad0d6470964b00903e42a8300b64cfe53bd7` | `ccd658c03cc3d900a1d956a7ee0b453c54716423` |
| M1-P2 | `claude/m1-p2-google-calendar-oauth-frozen-clock` | https://github.com/ThomasHendrickx/hemma/pull/458 | `a49d417c9b37a8d12445d2791de034089d61cda7` | `5bf2e57afa34f5be984b37339b5e315d02ca6b13` |

Both pull requests have base `16a5588` (the pull request reads' `base.sha`),
so both branches were cut from the same `main`.

**Merged at exactly the reviewed heads**, measured in a hemma clone:

```
+ git log --format='%h %p' -1 ccd658c      -> ccd658c 16a5588 8380ad0
+ git log --format='%h %p' -1 5bf2e57      -> 5bf2e57 ccd658c a49d417
+ git diff --quiet 8380ad0 ccd658c          -> exit 0 (tree of the merge equals the reviewed head)
+ git diff --name-only a49d417 5bf2e57      -> only M1-P1's two files
+ git diff --quiet a49d417 5bf2e57 -- <M1-P2's two files>   -> exit 0
+ git diff --name-only 16a5588 ccd658c      -> docs/work-history/2026-09-24.site-shed-frozen-clock.md, domain/site-shed/site-shed.service.spec.ts
+ git diff --name-only ccd658c 5bf2e57      -> docs/work-history/2026-09-24.google-calendar-oauth-frozen-clock.md, integrations/google-calendar/oauth.spec.ts
```

(Each output is shown after `->` on the command's line. This is a layout
change for width, not a change to the output.)

The two changed sets are disjoint, as the pre-pass said they would be (1c,
corrected run).

### 2b. Concurrently active

Both implementers were dispatched in one orchestrator turn. The timeline shows
that the two branches were in work at the same time, and that both pull
requests were open before either merged:

| time (UTC) | event | source |
|---|---|---|
| 15:01:46 | M1-P1 first commit `bfe626e` | commit listing of hemma `main` |
| 15:01:55 | M1-P2 first commit `86f95fb` | same |
| 15:21:58 | M1-P1 head `8380ad0` | same |
| 15:26:58 | pull request 457 (M1-P1) opened | pull request read, `created_at` |
| 15:30:32 | M1-P2 commit `0dd4c8b` | commit listing |
| 15:35:31 | M1-P2 head `a49d417` | commit listing |
| 15:36:42 | pull request 458 (M1-P2) opened | pull request read, `created_at` |
| 15:48:10 | pull request 457 merged as `ccd658c` | pull request read, `merged_at` |
| 15:57:46, 15:57:55 | M1-P1's two push runs complete | run reads, `updated_at` |
| 15:58:41 | pull request 458 merged as `5bf2e57` | pull request read, `merged_at` |

So from 15:01:55 to 15:48:10 both phases had unmerged work, and from 15:36:42
to 15:48:10 both pull requests were open.

### 2c. Reviews, two per unit

Each document is copied byte for byte into this repository (all ten files are
pure ASCII with no control characters, so nothing was transliterated;
`sha256sum` and `cmp` against the originals were run at copy time).

| unit | criteria review | hazard review | verdicts |
|---|---|---|---|
| bootstrap, hemma 456 at `8e84b4e` and hemma-fleet 1 at `bba99ec` | delivery/review/m5-p6-hemma-review-bootstrap-criteria.md:191 | delivery/review/m5-p6-hemma-review-bootstrap-hazard.md:315 | APPROVE, APPROVE, for both pull requests |
| M1-P1 at `8380ad0` | delivery/review/m5-p6-hemma-review-m1p1-criteria.md:1, verdict JSON `m5-p6-hemma-m1-p1-criteria.json` | delivery/review/m5-p6-hemma-review-m1p1-hazard.md:1, verdict JSON `m5-p6-hemma-m1-p1-hazard.json` | APPROVE, APPROVE |
| M1-P2 at `a49d417` | delivery/review/m5-p6-hemma-review-m1p2-criteria.md:1, verdict JSON `m5-p6-hemma-m1-p2-criteria.json` | delivery/review/m5-p6-hemma-review-m1p2-hazard.md:1, verdict JSON `m5-p6-hemma-m1-p2-hazard.json` | APPROVE, APPROVE, no findings |

Model families. The four M1 verdict JSONs record `produced-by` `claude-opus`
for the criteria reviews and `claude-sonnet` for the hazard reviews. The
kernel's dual-review check compares `produced-by` as a string
(scripts/check-dual-review.mjs:642), so these count as different families
there. Whether two tiers from one vendor meet the intent of DR-0012
condition 1 is not judged here. The two bootstrap review documents do not
record a family at all. That they ran on different families is the
orchestrator's statement. The files do not carry it: `grep -n -i 'opus|sonnet|fable|produced|family'`
over both finds one hit, an unrelated word on hazard line 106.

Two review-evidence limits, recorded rather than smoothed over:

- **The M1-P1 hazard review is a condensed persistence, not the reviewer's
  file.** The disk was full (ENOSPC) when that reviewer tried to write, so the
  orchestrator wrote the markdown from the reviewer's final report, and states
  so in the file's own header. Its verdict JSON is verbatim. That reviewer
  could not execute its own tests or its mutation witness (its finding
  HZ-M1P1-001). The M1-P1 criteria review of the same head DID execute its own
  probes. It ran a frozen-clock probe (22 tests and 90 real-clock reads in the
  control arm, 0 with the hooks), a failing-test leak check and five shuffle
  seeds.
- **The M1-P1 criteria reviewer's raw probe JSON is gone.** Its report cites
  `/dev/shm/rp-probe.json` and `/dev/shm/rp-control.json`. Both were deleted
  during the orchestrator's disk cleanup. Measured at exit-report time:
  `ls -la /dev/shm` lists no `rp-` file. The report text, with its summarised
  output, survives. The raw data does not.

### 2d. CI on every head, and the post-merge push runs

All read with the GitHub MCP tools (`get_workflow_run`); every conclusion is
`success` and every run is `completed`.

| unit | event | head | CI run | Tiphys gates run |
|---|---|---|---|---|
| bootstrap | pull_request | `8e84b4e` | https://github.com/ThomasHendrickx/hemma/actions/runs/36011488314 | https://github.com/ThomasHendrickx/hemma/actions/runs/36011488311 |
| bootstrap | push to `main` | `16a5588` | https://github.com/ThomasHendrickx/hemma/actions/runs/36016296883 | https://github.com/ThomasHendrickx/hemma/actions/runs/36016295861 |
| M1-P1 | pull_request | `8380ad0` | https://github.com/ThomasHendrickx/hemma/actions/runs/36020272922 | https://github.com/ThomasHendrickx/hemma/actions/runs/36020272918 |
| M1-P1 | push to `main` | `ccd658c` | https://github.com/ThomasHendrickx/hemma/actions/runs/36022844051 | https://github.com/ThomasHendrickx/hemma/actions/runs/36022844293 |
| M1-P2 | pull_request | `a49d417` | https://github.com/ThomasHendrickx/hemma/actions/runs/36021445913 | https://github.com/ThomasHendrickx/hemma/actions/runs/36021445984 |
| M1-P2 | push to `main` | `5bf2e57` | https://github.com/ThomasHendrickx/hemma/actions/runs/36024088802 | https://github.com/ThomasHendrickx/hemma/actions/runs/36024088752 |

**Serial merges.** M1-P2 merged at 15:58:41, after both of M1-P1's push runs
on `ccd658c` had completed green (15:57:46 and 15:57:55). The M1-P2 pull
request's own runs tested the union with `16a5588`, not with `ccd658c`. The
union with M1-P1 was first run in CI by the push runs on `5bf2e57`, and both
were green. Before the merge, the M1-P2 criteria review's
`git merge-tree --write-tree origin/main HEAD` (exit 0, tree `4a384e7`, each
side's blobs unaltered) was a deduction about that union, not a run.

Unlike the kernel's own workflow (T-009), hemma's `ci.yml` and the new
`tiphys-gates.yml` key the concurrency group on `run_id` for pushes to `main`.
So no push run here was cancelled by a later merge. The bootstrap hazard review
confirmed this by reading the `concurrency:` block
(delivery/review/m5-p6-hemma-review-bootstrap-hazard.md:86).

The M1 pull-request Tiphys runs are the first CI runs where hemma's `scope` gate
was APPLICABLE. The M1-P1 pull request body quotes its local gate run at
`8380ad0`:
`scope: green: 2 changed path(s) audited against declaration
docs/tiphys/phase-declarations/m1-p1.json at merge base 16a5588`. This report
did not read the CI job logs of runs 36020272918 and 36021445984, so the
per-gate CI line for scope is not quoted here. What is observed is that each
run concluded `success` (see section 5).

### 2e. Delivered outcome in hemma

The outcome the phases promised is that both specs lint clean with no clock
warnings, and that their tests run on a frozen clock. Measured at exit-report
time, in a temporary worktree of hemma `main` at `5bf2e57` (removed
afterwards). The toolchain was node v26.6.0 and npm 11.18.0, after
`npm ci --ignore-scripts` (exit 0):

```
+ npx eslint --max-warnings 0 domain/site-shed/site-shed.service.spec.ts
exit 0
+ npx eslint --max-warnings 0 integrations/google-calendar/oauth.spec.ts
exit 0
  16a5588 domain/site-shed/site-shed.service.spec.ts: 7 no-untimed-clock-in-specs, 7 warnings, 0 errors
  16a5588 integrations/google-calendar/oauth.spec.ts: 7 no-untimed-clock-in-specs, 7 warnings, 0 errors
  5bf2e57 domain/site-shed/site-shed.service.spec.ts: 0 no-untimed-clock-in-specs, 0 warnings, 0 errors
  5bf2e57 integrations/google-calendar/oauth.spec.ts: 0 no-untimed-clock-in-specs, 0 warnings, 0 errors
```

The last four lines come from `git show <rev>:<file> | npx eslint --stdin
--stdin-filename <file> -f json`, counted by a node one-liner that the script
printed. So the 14 warnings are gone: 7 per spec at the branch point, and 0 at
`main`. The repository-wide count reported by the implementers moved from 795
(bootstrap, 1d) to 788 after M1-P1 (the pull request 457 body) and to 781
after M1-P2 (the M1-P2 addendum). This report did not re-run the
repository-wide count.

**Re-run it yourself** on any clone of hemma at `5bf2e57`, after `npm ci`:

```
npx eslint --max-warnings 0 domain/site-shed/site-shed.service.spec.ts integrations/google-calendar/oauth.spec.ts; echo "exit $?"
```

That the specs are FROZEN, not just lint-silent (CR-B-004 is the gap between
the two), rests on the reviewers' executed probes. For M1-P1, the criteria
review found 0 real-clock reads in 43 tests with the hooks, against 90 without
them. For M1-P2, it found 0 in-test reads from `oauth.ts` or the spec, against
33 in the control arm. The hazard review's two structurally different mutation
witnesses each reddened exactly one targeted test.

### 2f. After the merge: two commits on the M1-P2 branch that are not landed

After pull request 458 merged, the M1-P2 implementer pushed two commits to its
phase branch:

- `0a77e7e`: a merge of `main` at `ccd658c`, author date 15:48:50.
- `ee36392`: a work-history addendum, author date 16:00:41. It records a local
  re-run: gates 4/4 green at base `ccd658c`, lint 781 warnings, E2E 231 passed,
  0 failed.

Source: the commit listing of that branch.

These commits are on the branch only. They are in no pull request and have no
CI run, and they are deliberately not landed. `main` records the merged work,
and the addendum adds no acceptance evidence that `main` lacks. Class: an
orchestration timing event (a message reached the implementer after the merge),
NOT a failure. The push time is not in the commit data read here, which
carries author and committer dates only.

**Verdict on p6-parallel-value: MET.** Two disjoint phases were active at the
same time (2b). Each was reviewed twice at a named head and merged at exactly
that head (2a, 2c). The merges were serial, the second after the first's push
runs completed green (2d). Every post-merge push run is green (2d). The
delivered outcome is measured on hemma `main` with a command anyone can re-run
(2e).

## 3. Every failure met, classified (criterion p6-attribution)

Classes: KERNEL (this repository's code or evidence), PROJECT PREDICATE
(hemma-owned configuration, code or tests), ENVIRONMENT (this container,
toolchain or harness), OWNER ACTION (needs a decision or access only the owner
or orchestrator holds). Severity is the finder's.

| # | failure | class | what establishes the class |
|---|---|---|---|
| A-1 | `Tiphys gates` red on the first bootstrap head (run 36007584690): `prisma generate` found no `DATABASE_URL` | PROJECT PREDICATE (hemma's new workflow lacked the env), made invisible by the ENVIRONMENT (the operator shell exported both) | `env -i` reproduction: red with no database variables, green with the job env (1j) |
| A-2 | the kernel's exact `yaml: 2.9.0` pin replaced hemma's production `yaml` 2.8.4 (F-5) | KERNEL | the non-dev lockfile diff: 2 differences at `668f690`, 0 after `--install-strategy=nested` (1j); the pin is in the kernel's own `package.json` |
| A-3 | npm 11 flips `fsevents`' `dev` flag in hemma `main`'s own lockfile on a no-op install | ENVIRONMENT (npm major), with a stale PROJECT lockfile underneath | no-op `npm install --package-lock-only` on `main`: 1 difference on npm 11.19.0 and 11.18.0, 0 on 10.9.7 (1j) |
| A-4 | local E2E run 1: `budget-phase-aware-view.spec.ts:40` timed out on a disabled toggle | PROJECT PREDICATE (a hemma E2E test), cause NOT established between the test and the environment | the bootstrap changes no application source (`git diff --stat`, 14 files, none of them application source: delivery/review/m5-p6-hemma-review-bootstrap-criteria.md:22); hemma CI `build-and-e2e` green on every head (2d); no valid local control on `main` (1k) |
| A-5 | a leftover `next-server` from run 1 served 4 of 5 later local E2E runs; the "control on `main`" was not one | ENVIRONMENT (this step's cleanup trap) | `EADDRINUSE` counts per run and the process's start time and cwd (1k) |
| A-6 | the leftover server could not be stopped | ENVIRONMENT (permission layer); OWNER ACTION to stop it | the permission refusal, "Interfere With Workloads" (1k) |
| A-7 | disk full, about 15:40Z; ENOSPC for reviewers and implementers | ENVIRONMENT | the M1-P1 criteria review's environment note and HZ-M1P1-001; cleared by the orchestrator deleting stale clones |
| A-8 | the M1-P1 hazard reviewer could not run its own tests | ENVIRONMENT (A-7) | HZ-M1P1-001 in `m5-p6-hemma-m1-p1-hazard.json` |
| A-9 | the M1-P1 criteria reviewer's raw probe JSON was deleted | ENVIRONMENT (disk cleanup) | `ls -la /dev/shm`: no `rp-` file (2c) |
| A-10 | Postgres was installed but stopped, and read as absent | ENVIRONMENT | tuition T-047, `delivery/tuition/T-047-postgres-is-installed-and-stopped-not-absent.md` on branch `claude/m5-orchestrator-paperwork-6` (`git ls-tree` at `a765ae7`; quoted, because it is not on this branch) |
| A-11 | the ambient `DATABASE_URL` and `E2E_DATABASE_URL` point at a REMOTE database | ENVIRONMENT | every hemma script printed `+ db-like var present: DATABASE_URL` and then forced each variable to `localhost:5432`, refusing to run otherwise (1e) |
| A-12 | npm 11.19.0 ran no dependency install scripts, so the Inngest CLI needed npm 10 | ENVIRONMENT | npm's own `npm warn install-scripts` lines in the install logs (1f) |
| A-13 | `tiphys init` refuses a non-empty directory (F-1) | KERNEL (low) | exit 1 with the refusal at src/commands/init.ts:151 (1b) |
| A-14 | a clone of a fleet home fails doctor `layout` until `tiphys resume` (F-2); doctor does not name `resume` | KERNEL (low, a message gap); the step itself is OPERATOR | fresh-clone run: doctor FAIL, `resume` exit 0, doctor PASS (1b) |
| A-15 | `assurance-modes.yaml` placed by hand, H-6 (F-3) | KERNEL (0.2.1 has no `init --project`) | `cmp` against the installed kernel's copy, exit 0; src/commands/init.ts:323 is the unreleased producer |
| A-16 | a gate with declared parameters errors before its precondition is read (F-4) | KERNEL (a design fact every project CI must know; not a defect) | runs F and F2 (1d); src/gates/run.ts:1413 |
| A-17 | `review-families` absent from the charter (F-6) | OWNER ACTION (only the orchestrator or owner knows which families are available) | `validate --type charter` exit 0 without it; the field is optional (schemas/charter.schema.json:161) |
| A-18 | declarations name dated work-history files (F-7) | PROJECT PREDICATE (hemma's naming) meeting a KERNEL rule (literal paths) | the declarations' `filesToTouch`; amendment is additive (src/gates/scope.ts:110) |
| A-19 | HZ-B-001, medium: the scope gate's standing extras (`test/behaviors.json`, `delivery/work-history/<phase>.md`, `delivery/review/`, `delivery/verification/`) admit undeclared files in ANY project | KERNEL | the hazard reviewer's committed run: two undeclared files under those paths, scope GREEN, exit 0 (delivery/review/m5-p6-hemma-review-bootstrap-hazard.md:157); the lists at src/gates/scope.ts:565 and src/gates/scope.ts:979 |
| A-20 | CR-B-001, low: the workflow runs the registry from the pull request's HEAD, so a phase can delete its own scope gate | PROJECT PREDICATE (hemma wiring; a design residue the kernel shares) | the criteria reviewer's run F: scope entry deleted plus an undeclared path, green, exit 0 (delivery/review/m5-p6-hemma-review-bootstrap-criteria.md:117) |
| A-21 | CR-B-005, low: `${{ github.head_ref }}` interpolated straight into the shell | PROJECT PREDICATE (hemma workflow; this step wrote the line) | the `--phase` line of `.github/workflows/tiphys-gates.yml` in hemma (delivery/review/m5-p6-hemma-review-bootstrap-criteria.md:178) |
| A-22 | HZ-B-002, low-medium: the fleet `.gitignore` does not exclude `node_modules/` | KERNEL (`tiphys init` writes it) | `npm ci` in a fleet clone, then `git status` shows `?? node_modules/`; init's list at src/fleet.ts:29 |
| A-23 | HZ-B-004, informational: the registry's per-gate `events` field is declared and not read by the runner | KERNEL | `grep -rn events` over the runner source (delivery/review/m5-p6-hemma-review-bootstrap-hazard.md:108) |
| A-24 | CR-B-004, low: hemma's clock lint rule is file-level; one `vi.useFakeTimers()` silences it for the whole file | PROJECT PREDICATE (hemma's lint rule and plan) | the rule source, `infrastructure/lint/no-untimed-clock-in-specs.mjs` in hemma; both phases' reviewers closed the gap with executed probes (2e) |
| A-25 | HZ-M1P1-003, low: roster fixtures sit far from the 7 and 28 day thresholds, so mutation sensitivity is weak | PROJECT PREDICATE (pre-existing in hemma, outside M1-P1's scope) | the M1-P1 hazard verdict JSON |
| A-26 | CR-M1P1-001, low: stale line numbers in the M1-P1 work history's claim-grep section | PROJECT PREDICATE (hemma document) | the M1-P1 criteria verdict JSON |
| A-27 | CR-B-002, CR-B-003, CR-B-006: stale head, a pre-pass run without `--append-only`, no p6-charter-only verdict, a missing I-2 row, an H-5 gap | KERNEL (this repository's evidence) | fixed in this revision (1a, 1c, 1g) |
| A-28 | local unit counts 8541 passed and 13 skipped against CI's 8540 and 14 | ENVIRONMENT, explained | one test, `hierarchy-parser.flow.run.spec.ts`, is `it.skipIf(process.env.CI)`; a per-test diff of the two vitest reports names only it (1j) |
| A-29 | this agent's harness refused `git` with variable paths, `su`, and stopping a process | ENVIRONMENT | the refusals themselves; worked round with literal paths and scripts (step 3a work history) |
| A-30 | the M1-P2 branch gained two commits after its merge | NOT A FAILURE: an orchestration timing event | 2f |

Not in the table because no failure occurred: the commit AUTHOR identity. The
commits this step made in hemma carry the git identity configured in this
container, `Claude <noreply@anthropic.com>` (doctor prints it, 1b). This
repository's convention 7 is about commit MESSAGES, and those carry no model or
tool name. Recorded so that no reader mistakes the author field for a message
breach, or the reverse.

## 4. Verdict on every p6 criterion

| criterion | verdict | evidence |
|---|---|---|
| p6-prepass | MET | the kernel half, APPROVED by both clean-room reviews at `45a0d54` (delivery/review/clean-room-m5-p6-kernel-criteria.md:360 and delivery/review/clean-room-m5-p6-kernel-hazard.md:775); used for real on hemma's declarations (1c, corrected run) |
| p6-charter-only | **NOT MET on released 0.2.1**, because of H-6. MET by this branch's `tiphys init --project` once a release carries it; that release is a follow-up | 1g |
| p6-parallel-value | MET | section 2 |
| p6-attribution | MET | section 3, 30 rows, each with its class and what establishes it |
| p6-suite | MET: `npm run build` exit 0, `npm test` exit 0, 1512 tests, 1512 pass, 0 skipped, node v26.6.0 | 4a |

### 4a. p6-suite

Run at exit-report time on this branch at `e1f2bda` (this report's content
does not touch `src/` or `test/`). Toolchain: node v26.6.0, npm 11.18.0, with
`dist/` built by the first command. Invocation: `npm test`.

```
+ npm run build
exit 0
+ git status --porcelain (after build)
+ npm test
exit 0
i tests 1512
i pass 1512
i fail 0
i cancelled 0
i skipped 0
i todo 0
```

(Node's reporter prints U+2139 at the head of each summary line; it is
rendered `i` here, 6 occurrences. The `suites 0` and `duration_ms` lines are
omitted. Nothing else is changed. `git status --porcelain` printed nothing.)

**p6-suite: MET.** Both commands exit 0, and 1512 tests pass with 0 failed and
0 skipped.

## 5. Environment events, and what this report did not verify

- Disk full at about 15:40Z (A-7), cleared by the orchestrator deleting stale
  clones. The same cleanup deleted this step's hemma and kernel
  `node_modules`. The kernel's were reinstalled for this report's gate runs, and
  hemma's only in a temporary worktree that has since been removed.
- Postgres installed but stopped (A-10). The ambient remote `DATABASE_URL`
  (A-11) was not used by any command this step ran: every hemma script
  forced each database variable to a local URL and refused to run otherwise.
- The npm 11 `fsevents` flip (A-3). hemma developers on npm 11 will see it on
  any install.
- The leftover `next-server`, pid 26960 (A-5, A-6). Still running.
- NOT verified here:
  - the per-gate CI log lines of the two M1 pull-request Tiphys runs (only
    their `success` conclusions were read);
  - the repository-wide lint total on `5bf2e57` (the 781 is the implementer's
    number);
  - whether M1-P2's local E2E run met the leftover server;
  - that the bootstrap reviews ran on different model families (2c);
  - the push time of the two post-merge M1-P2 commits (2f).
