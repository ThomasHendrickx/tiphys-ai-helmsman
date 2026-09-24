# M5-P6 exit report: hemma scale-out proof

Governing plan section: delivery/plan/value-delivery-plan.yaml:395. This
document is written incrementally. This revision holds section 1, Bootstrap
(step 3a). The parallel phases, merges and delivered outcomes (step 3b and
criterion p6-parallel-value) are not written yet.

Paths inside hemma and hemma-fleet are quoted in backticks, because neither
repository is a citation root here.

## 1. Bootstrap (step 3a)

### 1a. What was done, in one table

| repository | branch | pull request | head |
|---|---|---|---|
| ThomasHendrickx/hemma-fleet | `tiphys/bootstrap` | https://github.com/ThomasHendrickx/hemma-fleet/pull/1 | `bba99ec82bc1108bed802f0ceb0428cef053b05b` |
| ThomasHendrickx/hemma | `tiphys/bootstrap` | https://github.com/ThomasHendrickx/hemma/pull/456 | `668f69004238fb5620f4145c5c18c76439767605` |

Neither branch name matches `^claude/m[0-9]+-p[0-9]+-`, so neither is read as
a phase branch by any scope gate. Nothing was merged. Nothing was pushed to
either `main`. No migration ran against any remote database.

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

Eight commits on `tiphys/bootstrap`, cut from hemma `main` a6141d7:

| commit | content |
|---|---|
| `b743bf9` | `@tiphys/kernel` `0.2.1` as an exact devDependency; `package-lock.json` written by `npm install --save-dev --save-exact` |
| `2d4ebc4` | `charter.yaml` (byte-identical to the fleet copy, `cmp` exit 0) and `assurance-modes.yaml` (byte copy of the installed kernel's, sha256 3aaba6da21a034c9a95d7ee19a36dffb77d985e699e4e33e7a8f6d8297b025ea, also `cmp`-identical to this repository's copy) |
| `bcb7770` | `gate-registry.yaml` from the template, and the adapters in `scripts/tiphys-gates/` |
| `7db1f34` | `.github/workflows/tiphys-gates.yml`, a NEW workflow; `ci.yml` is unchanged |
| `bda3b37` | `docs/tiphys/plan.yaml` (phases M1-P1, M1-P2) and `docs/tiphys/phase-declarations/m1-p1.json`, `m1-p2.json` |
| `5e055f9` | the push arm passes `--base/--head/--phase` (finding F-4) |
| `d25ff20` | adapter detail wording (`failed suite(s)`, not `failed file(s)`) |
| `668f690` | hemma's own work history, `docs/work-history/2026-09-24.tiphys-bootstrap.md` |

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
checkout (0.2.1 has no `conflicts`, intake 4f):

```
+ node bin/tiphys.ts conflicts <hemma>/docs/tiphys/phase-declarations/m1-p1.json <hemma>/docs/tiphys/phase-declarations/m1-p2.json
conflicts: 2 declaration(s): M1-P1 (<hemma>/docs/tiphys/phase-declarations/m1-p1.json), M1-P2 (<hemma>/docs/tiphys/phase-declarations/m1-p2.json)
append-only, union-resolved, never an overlap: test/behaviors.json, gates.manifest.json, delivery/requirements/clause-map.json
DISJOINT M1-P1 M1-P2
conflicts: 0 overlapping pair(s), 1 disjoint pair(s), 0 overlapping path(s)
semantic coupling: NOT CHECKED. Literal file overlap is the only thing this command computes; zero overlap is not proof of independence. A reviewer must still judge semantic coupling for EVERY pair, disjoint ones included (a test in one phase asserting on what another phase changes, related behaviour in disjoint files, merge order).
exit 0
```

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
| that spec file alone, 3 times | 0, 0, 0 | `5 passed` each time |
| `npx playwright test`, run 2 | 0 | `1 flaky` (`tests/e2e/quote-budget-linking.spec.ts:178`, passed on retry), `6 skipped`, `230 passed (2.9m)` |
| `npm run test:full -- --workers=3` | 0 | `Diff-scoped audit clean.`; `vitest [unit]: 8540 passed / 14 skipped / 7 todo / 8561 total`; `vitest [interaction]: 3 passed / 0 skipped / 0 todo / 3 total`; `playwright: 231 passed / 0 failed / 6 skipped / 0 did-not-run / 0 flaky -> accounted 237 of 237`; `Full test suite green.` |
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
changes no application source; it does change one production transitive
dependency version (F-5). This is a judgment that the rule is met, stated with
the red run beside it rather than instead of it, and the pull request
description carries the same record. Whether run 1's failure is a pre-existing
flake was NOT established by a control run on hemma `main`.

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
| B-12 | `@tiphys/kernel` `0.2.1` exact devDependency and the lockfile npm wrote | hemma | PREDICATE | see F-5 for a side effect |
| B-13 | `.github/workflows/tiphys-gates.yml` | hemma | PREDICATE | intake I-14 |
| B-14 | `docs/tiphys/plan.yaml` | hemma | PREDICATE | hemma's own plan |
| B-15 | `docs/tiphys/phase-declarations/m1-p1.json`, `m1-p2.json` | hemma | PREDICATE, kernel-imposed naming | intake I-12; ids and branches follow the enforced pattern |
| B-16 | `docs/work-history/2026-09-24.tiphys-bootstrap.md` | hemma | PREDICATE (hemma's own rule) | not a Tiphys input |
| B-17 | `--phase` from the branch name, and `--base/--head/--phase` on push | hemma CI | PREDICATE | see F-4 |

**Summary.** 17 inputs: 2 CHARTER, 9 PREDICATE, 5 OPERATOR, **1 KERNEL-HANDWORK
(H-6)**.

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
- **F-5 (project predicate side effect, open): the kernel's exact dependency
  pins moved a hemma PRODUCTION transitive dependency.** `@tiphys/kernel` 0.2.1
  pins `yaml` 2.9.0 exactly. npm deduplicated hemma's hoisted `yaml` from 2.8.4
  to 2.9.0, and `npm ls yaml --omit=dev` shows `next-mdx-remote` (through
  `vfile-matter`) and `inngest` (through OpenTelemetry) resolving it. So the
  bootstrap merge would ship a different `yaml` minor version to production.
  Written by npm, not by hand. Whether that is acceptable under intake K-3 (no
  production change) is a decision for the orchestrator; it is recorded in the
  hemma pull request description too.
- **F-6 (charter, open): `review-families` is not declared.** Optional in the
  schema, and absence keeps the cross-family requirement unchanged. This step
  did not know which model families the orchestrator will review hemma phases
  on, so it did not guess.
- **F-7 (declared cost): the phase declarations carry a DATE.** Hemma names
  work histories `YYYY-MM-DD.<name>.md` and a declaration lists literal paths,
  so both declarations name `2026-09-24`. A phase that runs on another day
  needs its declaration amended (an additive grant, src/gates/scope.ts:110).

### 1i. What this step did NOT cover

- No CI run of the new workflow has been observed. Everything in 1d is local.
  The first observation is the hemma pull request's own `Tiphys gates` run.
- The real-storage direct-upload e2e (1f), and a control run of the E2E suite
  on hemma `main` to settle whether run 1's failure predates this branch.
- The two phases themselves, their merges and their post-merge push runs
  (step 3b).
- Whether a repository ruleset governs hemma `main` (intake Q-3) was not
  re-probed.
