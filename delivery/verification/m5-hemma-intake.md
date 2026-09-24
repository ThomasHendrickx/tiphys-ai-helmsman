# M5-P6 step 1: hemma intake (verification-first, read-only)

Status: step 1 complete; the verdict line is at the end of section 8.

Governing plan section: delivery/plan/value-delivery-plan.yaml:395

## 0. Method and the no-mutation guarantee

Subject: `github.com/ThomasHendrickx/hemma`, shallow clone at `/home/user/hemma`,
HEAD a6141d7d0c289d115aeb236853fe9aa881d75788 ("Demo: ground-floor plan with
real, localised annotations (#454)"), single branch `main`, `.git/shallow`
holds exactly that sha.

No command in this intake targeted the clone at `/home/user/hemma` (post-run check in section 2c). It was copied once with
`cp -a /home/user/hemma <scratch>/hemma-intake/hemma` and EVERY command below
(git reads, `npm ci`, lint, type-check, tests) ran against that scratch copy.
No commit, branch, push or GitHub write call was made against hemma. Paths
into hemma are quoted in backticks because hemma is not a citation root of
this repository.

Toolchain for this repository's commands: node v26.6.0 (scratch prefix, see
CLAUDE.md standing warning 1).

## 1. Current stack (measured)

| fact | value | evidence |
|---|---|---|
| language | TypeScript (strict), TSX | `tsconfig.json` `"strict": true`; tracked files by extension: 2228 `.ts`, 1618 `.tsx`, 1636 `.md`, 277 `.mdx`, 109 `.sql` |
| size | 6289 tracked files; 730985 lines of `.ts`/`.tsx` | `git ls-files \| wc -l` = 6289; `git ls-files \| grep -E '\.(ts\|tsx)$' \| xargs cat \| wc -l` = 730985 |
| package manager | npm, lockfileVersion 3 | `package-lock.json` line 4; no `packageManager` field, no pnpm or yarn lockfile |
| runtime version | Node 24 in every CI job; NO `engines` field, NO `.nvmrc`, NO `.node-version` | `.github/workflows/ci.yml:115`, `:373`, `:759`, `golden-path-preview.yml:72` all `node-version: 24`; `grep -n '"engines"' package.json` exit 1 |
| framework | Next.js 16 (App Router), React 19, tRPC 11, Prisma 7 on PostgreSQL, Tailwind 4, shadcn/ui, Inngest, next-intl, Resend | `CLAUDE.md:13-24` of hemma; `package.json` `"next": "^16.2.4"`, `"react": "^19.2.5"`, `"prisma": "^7.4.2"`; `prisma/schema.prisma:8` `provider = "postgresql"` |
| database migrations | 110 entries under `prisma/migrations` | `ls prisma/migrations \| wc -l` = 110 |
| test runners | Vitest 4 with projects `unit`, `storybook`, `interaction`; Playwright for e2e | `vitest.config.ts:54`, `:102`, `:148`; `playwright.config.ts` |
| version | `2026.06.1-1` | `version.json` |

Hemma already runs its OWN agent process: a 22 KB `CLAUDE.md`, 16 persona
commands under `.claude/commands/` and 12 skills under `.claude/skills/`, a
`docs/phases/` tree (12 phase-definition files), and a mandatory
`docs/work-history/<isodate>.<feature>.md` per task (`CLAUDE.md:335-346` of
hemma). Its `CLAUDE.md:295-326` already states an anti-vacuity rule of its own:
`npm run test:full` enforces Vitest summary parity and Playwright
discovery-count parity because "A missing test name is silence, not a pass".
That matters for section 5: hemma's predicates were written by people who
already hold the kernel's premise, so the adoption case is one of CONVERGENCE
with an existing process, not of introducing one.

## 2. Existing gates (measured)

### 2a. CI workflows

Two workflows under `.github/workflows/`, 805 and 131 lines.

`ci.yml` (triggers `push` to `main` and `pull_request` to `main`,
`ci.yml:10-14`), four jobs:

| job | runner | steps that assert | evidence |
|---|---|---|---|
| `validate` | self-hosted `[self-hosted, hemma, validate]` (Hetzner) | `npm ci`, `prisma generate`, `npm run lint`, `help:coverage`, `check:locale-parity`, `check:consumer-manifest`, `check:invalidation-manifest`, `check:service-graph`, `next typegen && tsc --noEmit`, `prisma migrate deploy` into a throwaway DB, `vitest run --project unit` | `ci.yml:69-230` |
| `build-and-e2e` | self-hosted `[self-hosted, hemma, build]` | `npm run build`, render-count fences, Playwright full suite, direct-upload e2e against a real storage gateway, credit concurrency specs against a real Postgres, warn-only Lighthouse | `ci.yml:238-728` |
| `migrate` | `ubuntu-latest` | `prisma migrate deploy` against production `secrets.DIRECT_URL`; only on `push` to `main`; `needs: [validate]` only; serialised by `concurrency: production-migrate`, `cancel-in-progress: false` | `ci.yml:730-788` |
| `ci-passed` | `ubuntu-latest` | aggregator, fails if any need failed or was cancelled; its comment says it is the job "branch protection should require" | `ci.yml:790-805` |

Workflow concurrency: `group: ci-${{ github.ref == 'refs/heads/main' &&
github.run_id || github.ref }}`, so on `main` every push run completes and
none is cancelled by the next (`ci.yml:20-22`). This is the OPPOSITE of the
kernel repository's own `gates.yml`, whose shared `push` group lets merge N+1
cancel head N's run (CLAUDE.md, T-009 addendum). Consequence for step 3: on
hemma, "observe the post-merge push run for head N to completion" is literally
satisfiable for each serial merge, with no cancelled-run caveat.

`golden-path-preview.yml`: `schedule` (`30 5 * * *`) and `workflow_dispatch`
only, no `pull_request` trigger, runs a journey against the deployed `main`
alias held in the `PREVIEW_BASE_URL` repository variable; by design it does
not appear as a PR check: `grep -n pull_request golden-path-preview.yml` matches only a comment line (line 6), no trigger (`golden-path-preview.yml:1-40`).

### 2b. Recent CI results on GitHub (read-only, GitHub MCP `actions_list`)

| run | workflow | event | head | conclusion | created |
|---|---|---|---|---|---|
| 35845441652 | CI | push | a6141d7 (the intake HEAD) | success | 2026-09-23T09:52:00Z |
| 35961005071 | Golden path (deployed) | schedule | a6141d7 | success | 2026-09-24T05:40:42Z |
| 35854751011 | CI | pull_request (PR #455) | 622f128 | success | 2026-09-23T11:28:41Z |
| 35854722119 | CI | pull_request (PR #455) | 709d88e | cancelled (superseded) | 2026-09-23T11:28:22Z |
| 35832881137 | CI | push | ce7e95b | success | 2026-09-23T07:39:45Z |

`total_count` 1332 runs across workflows. So `main` at the intake HEAD is
green on both of hemma's workflows, observed rather than assumed.

### 2c. Local re-run of the `validate` job's predicates (scratch copy)

Toolchain: node v22.22.2 (`/opt/node22/bin`), npm 10.9.7. CI pins Node 24,
which is not installed in this container; v22 is the nearest available and
satisfies Next 16's floor. This is a DEVIATION from CI's toolchain and the
results below are about v22, not v24.

| command | exit | counts / tail |
|---|---|---|
| `npm ci --no-audit --no-fund` | 0 | `added 1573 packages in 54s`; `prepare` ran `husky` in the scratch copy only |
| `npx prisma generate` | 0 | |
| `npx next typegen` | 0 | `Types generated successfully` |
| `npx tsc --noEmit` | 0 | 1m37s wall, no output |
| `npm run lint` | 0 | `795 problems (0 errors, 795 warnings)`; warnings include hemma's own rule `hemma-lint/no-untimed-clock-in-specs` |
| `npx vitest run --project unit` (CI's exact unit invocation, with CI's `CACHE_DIR`/`XDG_CACHE_HOME` redirect and `CI=true`) | 0 | `Test Files 628 passed \| 3 skipped (631)`; `Tests 8540 passed \| 14 skipped \| 7 todo (8561)`; 93.41s |

Declared transliteration: two quoted lines begin with a non-ASCII glyph in the
raw capture, and each is quoted here from its first ASCII character, so the
glyph is rendered as nothing. U+2716 at the head of the lint summary line, 1
occurrence. U+2713 at the head of the `next typegen` line, 1 occurrence.
Inside table cells, a literal `|` from the captured output is written `\|`
so the table renders, and runs of spaces are collapsed to one. Nothing else in
any quoted output was altered.

NOT RUN locally, and why: `npm run build`, Playwright e2e, the direct-upload
and credit-concurrency specs, and `npm run test:full` all need a migrated
Postgres (and for e2e a started app plus Inngest) that this container does not
provide. The 3 skipped test files are NOT identified by the default reporter;
one known skip cause is that `APPLICABILITY_TEST_DATABASE_URL`, which CI sets
at `ci.yml:224-229`, was unset here. The remaining skip causes are an open
question, not a claim that they are all database skips.

The original clone was checked after the runs: `ls /home/user/hemma/node_modules`
reports "No such file or directory", and `find /home/user/hemma -newer
<npm-ci.log> -not -path '*/.git/*'` printed nothing.

## 3. Branch protection, rulesets, deploy target

| probe | result |
|---|---|
| GitHub MCP `list_branches` | `main` sha a6141d7, `"protected": false`; 75 branches, NONE protected |
| REST `GET /repos/ThomasHendrickx/hemma` and `/branches/main/protection`, `/rulesets`, `/rules/branches/main`, `/actions/runs`, `/deployments`, `/environments` through the agent proxy | HTTP 404 on ALL NINE, including the repository record itself |

Reading of the 404s: the repository exists (the MCP read it and the clone
exists), so a 404 on the bare repository record means the REST credential the
proxy substitutes cannot see this private repository. The 404s are therefore
UNREACHABLE, not "no protection" and not "no rulesets". Classic branch
protection is established as ABSENT by `"protected": false`. Whether a
repository RULESET governs `main` is NOT established: the MCP toolset here has
no ruleset read, and the REST path is blind. Open question Q-3.

Consequence either way: nothing observed makes `ci-passed` a required check,
so today a pull request CAN be merged on red CI in hemma unless an
unobserved ruleset forbids it. The kernel's merge preconditions would be the
only thing requiring green. That is a condition on step 3, not a blocker.

Deploy target: Vercel, auto-deploying every push to `main`
(`docs/deployment.md` "Deploy flow" steps 1-5; `ci.yml:733-741` comment "Vercel
deploys every main push unconditionally"). Database: Supabase Postgres, with
production migrations applied from CI's `migrate` job. Consequence: EVERY
merge to hemma `main` in step 3 is a production deploy and, if it carries a
migration, a production schema change. Section 6 selects phases with neither
a migration nor a server-behaviour change for exactly this reason.

## 4. Charter and every bootstrap input (criterion p6-charter-only)

### 4a. What hemma has today

No Tiphys artifact exists in hemma. `git ls-files | grep -iE
'charter|tiphys|gate-registry|phase-decl'` printed nothing. The CHARTER INPUT
hemma can supply is prose that already exists: `PROJECT-PURPOSE.md` (14 KB,
product intent), `CLAUDE.md:13-24` (tech stack, i.e. the irreversible
decisions), `CLAUDE.md:105-143` and `:335-346` (quality rules and definition of
done), `docs/deployment.md` (deploy topology), and `docs/work-history/` (an
existing retention location). None of it is in the charter schema's shape.

### 4b. What `tiphys init` actually consumes

Read from the kernel source, not predicted:

- `tiphys init <dir> [--shared-exclusion]` is the whole interface
  (src/commands/init.ts:95). It takes a directory and one optional flag.
- It refuses any non-empty directory (src/commands/init.ts:113), so it can
  not run IN hemma's repository, which is non-empty. It creates a SEPARATE fleet home, the shape
  the only precedent used (`ThomasHendrickx/pulse-fleet` beside
  `ThomasHendrickx/pulse`, src/commands/init.ts:114 treats `.git` as a marker).
- It writes `charter/`, `decisions/`, `tasks/`, `status/` with `.gitkeep`,
  `state/`, `worktrees/`, `projects/`, `backlog.md`, a `package.json` pinning
  `@tiphys/kernel` to the running kernel's own version, and a `.gitignore` of
  exactly the three ephemeral dirs (src/commands/init.ts:138, src/fleet.ts:12,
  src/fleet.ts:29).
- **It reads NO charter.** Nothing in src/commands/init.ts:95 to its end opens a
  charter, a registry, or any project file. "Bootstrap from its charter" is
  therefore not an init step; the charter is written into the fleet home AFTER
  init, and every other input below is consumed later by other commands.

### 4c. The full input inventory

Classification key: CHARTER (hemma supplies it inside its charter), PREDICATE
(hemma-owned gate command or declaration, DR-0029 Part 1 at
delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md:38),
OPERATOR (an argument, declared on the command line), KERNEL-HANDWORK (kernel
configuration that neither init nor the charter produces and that someone would
have to place by hand; each is a `hidden-bootstrap-handwork` hazard).

| # | input | consumed by | class | hemma source |
|---|---|---|---|---|
| I-1 | fleet home directory (new, empty, its own repository) | `tiphys init <dir>` | OPERATOR | none; to be created |
| I-2 | `--shared-exclusion` | `tiphys init` (src/commands/init.ts:88) | OPERATOR | a choice; relevant if the two concurrent phases run from different environments |
| I-3 | kernel version pin | init writes it from the running kernel (src/commands/init.ts:161); the charter also requires `identity.kernel-version-pin` (schemas/charter.schema.json:29) | CHARTER | this repository's package.json:3 says 0.1.0; which version is PUBLISHED and installable is open (Q-5) |
| I-4 | the charter: `kind`, `identity`, `delivery-mode`, `assurance-tier`, `yolo-permissions`, `irreversible-decisions`, `product-intent`, `constraints`, `escalation-contract`, `release-verification`, `retention` required; `review-families` optional | `tiphys validate --type charter`, doctor, merge preconditions | CHARTER | all eleven must be AUTHORED; content exists as prose (4a). `review-families` should be declared, since hemma has one collaborator (section 5) |
| I-5 | the charter's FILE NAME and location | checks read `charter.yaml` from a context directory (src/checks.ts:4616); the pulse precedent stored `charter/pulse.yaml` in the fleet home | CHARTER, location RESOLVED after DR-0058 (section 4e): two locations | Q-4, answered in 4e |
| I-6 | a project gate registry naming hemma's own commands (`npm run lint`, `npx tsc --noEmit`, `npx vitest run --project unit`, and the kernel-contract gates hemma opts into) | `tiphys gates run --registry <file>` | PREDICATE | hemma's commands exist and pass (section 2c); the registry itself does not exist. AFTER DR-0058 a project-owned template ships, `templates/gate-registry.example.yaml`, and `tiphys init --project` names its path; hemma still writes its own registry and the adapter scripts its commands name (4e) |
| I-7 | `assurance-modes.yaml` | the merge-authority regime needs BOTH `charter.yaml` and `assurance-modes.yaml` present at the committed source (src/checks.ts:4629); the mode enum check reads it (src/checks.ts:320) | was **KERNEL-HANDWORK (H-1)**; after DR-0058 PRODUCED by `tiphys init --project` into the PROJECT repository, to be committed (4e) | none. It is the KERNEL's closed vocabulary (DR-0020), not a hemma predicate. The pulse precedent hand-placed it as a symlink, `assurance-modes.yaml -> node_modules/@tiphys/kernel/assurance-modes.yaml` |
| I-8 | `schemas/` beside the context documents | cross-document checks resolve `schemas/charter.schema.json` beside the document (src/commands/mode.ts:21) | was **KERNEL-HANDWORK (H-2)**; after DR-0058 NOT NEEDED for bootstrap or the merge regime, with evidence (4e) | none. Pulse precedent: symlink `schemas -> node_modules/@tiphys/kernel/schemas` |
| I-9 | the kernel's `gate-registry.yaml` placed in the fleet home | the pulse precedent symlinked `gate-registry.yaml -> node_modules/@tiphys/kernel/gate-registry.yaml` | was **KERNEL-HANDWORK (H-3)**, and a PREDICATE substitution; after DR-0058 REPLACED by the project-owned template (I-6, 4e) | That symlink makes the KERNEL's predicates stand in for the project's, which is the opposite of DR-0029 Part 1. For hemma it would also not run: the kernel registry's commands are kernel-repository-relative, e.g. `node src/gates/scope.ts --declarations delivery/plan/phase-declarations` at `gate-registry.yaml` line 126 (root-level yaml, quoted because it is not a citation root) |
| I-10 | `.gitignore` line `.ctx-*/` | observed in pulse-fleet, not written by init (src/fleet.ts:29 lists three entries) | was **KERNEL-HANDWORK (H-4)**; after DR-0058 NOT NEEDED, no kernel producer or consumer (4e) | none |
| I-11 | `npm install` in the fleet home so the pinned kernel is under `node_modules/` | every symlink in I-7 to I-9 resolves through it | OPERATOR | depends on Q-5 |
| I-12 | one phase declaration per hemma phase, committed to hemma `main` BEFORE the phase branch exists | scope gate (src/gates/scope.ts:877) | PREDICATE, with KERNEL-IMPOSED naming | id must match `^M[0-9]+-P[0-9]+$` and branch `^claude/m[0-9]+-p[0-9]+-.+$` (src/gates/schemas/phase-declaration.schema.json:13, src/gates/schemas/phase-declaration.schema.json:18). Measured: `tiphys conflicts` REFUSED declarations with ids `H-P1`/`H-P2`, exit 2, `does not match the required pattern ^M[0-9]+-P[0-9]+$`. Hemma's own phase names (`run17-p4`, `claude/run9-r2-...`) do not fit; the kernel's vocabulary is imposed, which is a declared cost, not handwork |
| I-13 | red-witness specs (`witness/*.json`) for any src change, if hemma's registry includes the kernel's `red-witness` gate | red-witness gate | PREDICATE | none yet; hemma's natural witness is `eslint --max-warnings 0 <file>` (section 6) |
| I-14 | a CI step that runs `tiphys gates run` in hemma | nothing today: `grep -c tiphys` reports 0 in `ci.yml` and 0 in `golden-path-preview.yml` | PREDICATE (hemma owns its CI) | absent. Without it the kernel's gates are local-only evidence, the DR-0029 Part 3c degraded band |
| I-15 | push access for the orchestrator to hemma, and to the new fleet-home repository | step 3 | OWNER ACTION | section 7 |

### 4d. Verdict on p6-charter-only, as the kernel stood at `cb262fb`

**SUPERSEDED BY 4e.** The verdict below was true at `cb262fb`, before DR-0058,
and is kept as written so the record shows what the kernel change closed.
Option 1 below is what DR-0058 chose.

**Charter plus project-owned predicates is NOT sufficient today.** Four inputs
(I-7, I-8, I-9, I-10) are kernel configuration that init does not produce and
that the charter does not carry. The only onboarded precedent carries all four
as hand-placed files. Step 3 can satisfy p6-charter-only in one of two ways,
and choosing between them is not this intake's decision:

1. a kernel change makes init (or a resolver) produce or locate I-7, I-8 and
   I-10, and I-9 is replaced by a hemma-authored registry (I-6). This touches
   src/commands/init.ts, which is NOT on this phase's files-to-touch
   (delivery/plan/value-delivery-plan.yaml:424), so it needs a plan amendment;
2. the handwork is performed and DECLARED, and the exit report records
   p6-charter-only as failed with each item named. That is honest and it fails
   the criterion.

Bending the kernel silently (placing the symlinks and saying nothing) is the
third option and is excluded by the plan's own hazard `hidden-bootstrap-handwork`
(delivery/plan/value-delivery-plan.yaml:460).

Evidence for the precedent, and its limit: pulse-fleet was cloned read-only
(`git clone --depth 1`, HEAD 7656f67) into scratch and read with `ls` and `cat` only; no script in it was run.
A shallow clone shows the symlinks exist at that head, not when or by whom they
were added. A read-only clone of `ThomasHendrickx/pulse` itself was refused by
this session's permission layer, so the project side of the precedent is
unobserved here.

### 4e. Addendum after DR-0058 (M5-P6 kernel half and its fix round 1)

This addendum brings section 4 up to date with the kernel change DR-0058 made on
this branch. It answers the criteria review's CR-001 and CR-002 and records the
hazard review's CR-KH-005 disposition. DR-0058 itself is not edited here; the
orchestrator adds the addendum to the decision record.

**What `tiphys init` produces now.**

- `tiphys init <fleet>` writes the same fleet layout as before and prints two
  next steps: the charter goes at `<fleet>/charter/<project>.yaml`, and the
  project repository needs `tiphys init --project <repo>`.
- `tiphys init --project <repo>` (src/commands/init.ts:323) accepts only the
  top level of a git work tree, reached directly or through a symbolic link. It
  writes `assurance-modes.yaml` at the repository root as a byte copy of the
  running kernel's file. It refuses to replace anything already there that is
  not identical. It reports whether `charter.yaml` and `gate-registry.yaml`
  exist, and names the template path when the registry is absent. It writes
  neither.

**The four former KERNEL-HANDWORK items, with evidence.**

| item | disposition | evidence |
|---|---|---|
| I-7 `assurance-modes.yaml` | PRODUCED by `init --project`, in the PROJECT repository, as a copy | the merge regime reads it from the commit of the repository the gates run in (src/checks.ts:4799); the merge gate's `--context` defaults to that repository (src/gates/merge-preconditions.ts:1369). A committed symlink would pass the presence probe and yield its target PATH as the body (measured, delivery/work-history/m5-p6.md) |
| I-8 `schemas/` beside the context | NOT NEEDED | the only context read of it is src/checks.ts:748, inside `charter-mode-enum-matches-modes`, a check of `type: "assurance-modes"` with `requiresContext: true` (src/checks.ts:733), so it runs only when an assurance-modes DOCUMENT is validated with `--context`. The regime read at src/checks.ts:4799 only looks up the mode's `merge-authority`. The grep below the table prints that one line and nothing else |
| I-9 the kernel's registry in the fleet home | REPLACED by the project-owned template `templates/gate-registry.example.yaml` | the template names no kernel command; test/init.test.ts:403 reads the kernel registry's scripts at run time and requires that none appears in it |
| I-10 `.gitignore` line `.ctx-*/` | NOT NEEDED | `grep -rn '\.ctx-' src roles AGENTS.md .claude/skills scripts` exits 1 with no output at this branch, so no kernel code creates or reads such a directory |

The I-8 grep, run at this branch:

```
grep -rnE 'join\(context[A-Za-z]*, *"schemas|"schemas/charter\.schema\.json"|schemas", "charter' src
src/checks.ts:748:      join("schemas", "charter.schema.json"),
```

The fleet home itself consumes none of the four: five fleet-scoped commands were
run in a home made by `init` with only a charter added (delivery/work-history/m5-p6.md).
I-11 (`npm install` in the fleet home) is therefore no longer needed to resolve
any symlink; an installed kernel is still needed to RUN `tiphys`, which is Q-5.

**Q-4 answered: the charter lives in two places, for two readers.**

- `<fleet>/charter/<project>.yaml`, read by doctor and brief compose
  (src/charter.ts:38).
- `<project>/charter.yaml`, read from the commit by the merge regime
  (src/charter.ts:41, src/checks.ts:4750).

**The post-init steps, in order, all declared rather than hidden.**

1. `tiphys init <fleet>`; write `<fleet>/charter/hemma.yaml`.
2. In hemma: `tiphys init --project <hemma>`; COMMIT the written
   `assurance-modes.yaml`.
3. In hemma: write `charter.yaml` at the root (the same charter as step 1) and
   commit it.
4. In hemma: write `gate-registry.yaml` from the template, with hemma's own
   commands, and the adapter scripts those commands name (for example
   `scripts/tiphys-gates/unit-tests.mjs`). Each adapter runs hemma's tool and
   writes one GateResult per the subprocess contract in the template's header.
   These are PREDICATE inputs (DR-0029 Part 1), owned by hemma.
5. Commit one phase declaration per phase to hemma `main` before its branch
   exists (I-12).

**Project-side files that kernel gates read at FIXED paths (CR-002).** Derived
by:

```
grep -nE '"(gates\.manifest\.json|test/behaviors\.json|gate-registry\.yaml|assurance-modes\.yaml|charter\.yaml|witness/?|delivery/[^"]*|package\.json|package-lock\.json|tsconfig[^"]*|schemas/[^"]*|\.github/[^"]*)"|process\.cwd\(\)' src/gates/*.ts
```

The table is that output with the kernel-internal and comment hits removed.
The last column is this intake's RECOMMENDATION for step 3's hemma registry.
Step 3 decides, and must record any change from it.

| kernel gate | fixed project path it reads | step 3 uses it? | how hemma supplies the input |
|---|---|---|---|
| `red-witness` | `gates.manifest.json` at the root, an ERROR if absent (src/gates/red-witness.ts:205); `test/behaviors.json` at head (src/gates/red-witness.ts:217); `witness/` (src/gates/red-witness.ts:266) | NO | not supplied. All three are kernel-format files hemma does not have; hemma's red witness is an `eslint` run recorded in the work history (section 6), outside the kernel gate |
| `suite` | `package.json` test script (src/gates/suite.ts:770); `--registry` default `test/behaviors.json` (src/gates/suite.ts:560) | NO | hemma's tests are vitest, and the suite gate injects a `node:test` reporter, so it does not fit; hemma's `unit-tests` adapter gate replaces it |
| `scope` | declarations directory by `--declarations`; standing extras `test/behaviors.json` and `delivery/work-history/<phase>.md` (src/gates/scope.ts:979); evidence directories `delivery/review/`, `delivery/verification/` (src/gates/scope.ts:565) | YES, it is the scope proof for the two parallel phases | `--declarations` points at hemma's declaration directory (I-12). The standing extras and evidence directories are read as GRANTS added to the allowed list (src/gates/scope.ts:979), so by that reading their absence is not an error; not run against a hemma tree |
| `merge-preconditions` | `charter.yaml` and `assurance-modes.yaml` from the commit, context default the working directory (src/gates/merge-preconditions.ts:1369); review-budget path classes (src/gates/merge-preconditions.ts:880) | ONLY IF step 3 merges through the kernel's regime | `charter.yaml` from post-init step 3, `assurance-modes.yaml` from step 2 |
| `citations` | document roots and `citationRequired` globs hard-coded to this repository's `delivery/` layout (src/gates/citations.ts:213) | NO | not supplied; hemma has no `delivery/` tree |
| `coverage` | this repository's requirement and plan documents (src/gates/coverage.ts:180) | NO | kernel-internal |
| `gate-classes` | declarations and registry by argument, relative to the working directory (src/gates/gate-classes.ts:484); `node_modules/typescript` (src/gates/gate-classes.ts:662) | NO | not supplied |

How a hemma registry INVOKES a kernel gate (the `scope` row) is open: the
command has to name a path in an installed kernel, which is the
operator-machine dependency `init --project` rejected for the modes document.
That is intake Q-9 below, and it has to be settled before step 3's registry is
written.

**Known residue (one line each, from the criteria review).**

- CR-003: nothing checks the project's `assurance-modes.yaml` against the
  kernel after `init --project`, and the regime reads `merge-authority` from it,
  so a stale or edited copy changes the regime silently.
- CR-004: the charter exists twice (fleet and project), and nothing checks that
  the two agree.
- CR-005: right after `init --project`, `tiphys validate --type assurance-modes
  --context .` and `mode show --file assurance-modes.yaml` both exit 1 in the
  project, because those context checks expect the kernel's own tree. The merge
  regime does not run them.

### 4f. Q-9 and Q-5 measured: kernel gates from the INSTALLED package

This section answers Q-9 (how a project registry invokes a kernel gate) and Q-5
(which kernel version hemma pins). Everything here was run against the
PUBLISHED package `@tiphys/kernel@0.2.1` from npm, in a scratch project, not
against this repository's tree. Hemma was not touched: no clone, no read, no
write. The scratch project stands in for hemma's shape (an npm project, a git
repository with an `origin/main`, phase branches).

**Answer to Q-9, in one line.** A project registry invokes a kernel gate by
naming the gate module inside the project's OWN installed dependency:

```
command: [node, node_modules/@tiphys/kernel/dist/src/gates/scope.js, --declarations, phases]
```

That path is created by the project's own `npm ci` from its own lockfile. It is
not a path on an operator's machine, so it is not the dependency that
`init --project` rejected for the modes document. It works as-is in 0.2.1,
measured below. No kernel change is needed for `scope`.

**What 0.2.1 is, measured.**

- `npm view @tiphys/kernel versions dist-tags` lists `0.0.0`, `0.1.0`, `0.2.0`,
  `0.2.1`; `latest` is `0.2.1`.
- Installed into the scratch project with `npm install --save-dev
  @tiphys/kernel@0.2.1`: exit 0. `npx tiphys version` prints `0.2.1`.
- The installed tree was compared with this branch's own build at `9d83db7`
  (`diff -rq dist/src`, and `cmp` on the shipped top-level files). The ONLY
  differences are the M5-P6 changes: `dist/src/cli.js` and
  `dist/src/commands/init.js` differ, `dist/src/commands/conflicts.js` and
  `templates/gate-registry.example.yaml` exist only here. `scope.js`,
  `merge-preconditions.js`, `run.js`, `checks.js`, `schemas/`, `roles/`,
  `checklists/`, `tuition/`, `assurance-modes.yaml`, `gate-registry.yaml`,
  `gates.manifest.json` and `AGENTS.md` are byte-identical. So the source
  citations below, taken from this repository, describe 0.2.1's gates exactly.
- 0.2.1 has no `init --project` and no `conflicts`. Captured:

```
+ npx tiphys init --project .
usage: tiphys init <dir> [--shared-exclusion]
exit 64
+ npx tiphys conflicts
usage: tiphys <brief | checklist | cutover | doctor | gates | init | lock | mode | next | plan | pool | resume | spawn | status | sync | teardown | tuition | validate | version | watch>
exit 64
```

- The package's `exports` map is `.` and `./package.json` only (package.json:19).
  `node <path>` does not go through `exports`, so the gate path above is
  reachable. It is NOT a declared public contract, though: a later release could
  move the file. The exact pin (below) is what keeps it stable.

**The scratch registry.** Written from `templates/gate-registry.example.yaml`
(this branch): the template's `unit-tests` gate kept, with a stand-in adapter
that writes one GateResult with 1 unit; the `typecheck` and `lint` placeholder
gates dropped; `preflight` replaced by `[node, --version]`. Then two kernel
gates added:

```
  - id: scope
    command: [node, node_modules/@tiphys/kernel/dist/src/gates/scope.js, --declarations, phases]
    unitLabel: changed paths audited
    applicability: required
    verified-by: script
    modes: [full, direct-pr]
    events: [pull_request]
    parameters: [base, head, phase]

  - id: merge-preconditions
    command: [node, node_modules/@tiphys/kernel/dist/src/gates/merge-preconditions.js, --token-env, GH_TOKEN]
    unitLabel: merge preconditions evaluated
    applicability: required
    verified-by: script
    modes: [full, direct-pr]
    events: [pull_request]
    parameters: [base, head, phase]
```

One phase declaration, `phases/m1-p1.json`, with `branch: claude/m1-p1-demo`
and `filesToTouch: ["src/a.txt"]`, was committed to `main` and pushed to a
local bare `origin` before the branch was cut. Every run below is
`npx tiphys gates run --registry gate-registry.yaml --mode full --evidence <dir>
--base origin/main --head HEAD` plus the flags shown, on node v26.6.0 unless
stated. Lines are verbatim; the JSON records the runner writes after each run
are left out.

**Runs, what works and what fails.**

| run | state | result |
|---|---|---|
| A | phase branch, one declared path changed | scope GREEN, 1 unit, exit 0 |
| B | same branch plus an UNDECLARED path | scope RED naming the path, exit 1 |
| C | no `--phase` | scope ERROR, exit 21 |
| D | a branch not named in the declaration | scope ERROR, exit 21 |
| E | detached HEAD, as `actions/checkout` gives by default | scope ERROR, exit 21 |
| F | non-phase branch, scope `required` with a branch precondition | scope NOT-APPLICABLE, run exit 20 |
| G | non-phase branch, scope `conditional` with the same precondition | scope NOT-APPLICABLE, run exit 0 |
| H | phase branch, undeclared path, scope `conditional` | scope RED, exit 1 |
| I | merge-preconditions, no `charter.yaml` in the commit | ERROR, exit 21 |
| J | merge-preconditions, charter and modes committed, no verdicts | RED, exit 1 |
| K | run A plus J on node v22.22.2 and on node v24.21.0 | same verdicts as on v26 |

Run A:

```
+ branch: claude/m1-p1-demo head: 1fef5e0
gates: declared 2 applicable 2 verdict 2 green 2 red 0 not-applicable 0 error 0 vacuous 0
gates: unit-tests: green: probe adapter: 1 test executed
gates: scope: green: 1 changed path(s) audited against declaration phases/m1-p1.json at merge base f062712c1d41d8ba82ab8ec49a56c3d38c988449 (sha256 20c3243f35510a2a1a1fc48cc406546fbecda5eac557af925ec69e255f72fcbf)
gates: every applicable gate is green
exit 0
```

Run B, the red witness for the same invocation:

```
+ branch: claude/m1-p1-demo head: 472d91f
gates: scope: red: touched path(s) outside the declared scope: src/b.txt (declaration phases/m1-p1.json at merge base f062712c1d41d8ba82ab8ec49a56c3d38c988449, sha256 20c3243f35510a2a1a1fc48cc406546fbecda5eac557af925ec69e255f72fcbf)
gates: 1 gate(s) reported red: scope
exit 1
```

Runs C, D and E, the three ways a CI job can call it wrongly. All three fail
CLOSED, as `error`, never green:

```
gates: scope: error: gate scope requires --phase, which was not supplied
exit 21
+ branch: feature/hemma-style head: cfd87fc
gates: scope: error: the current branch feature/hemma-style does not match declaration phases/m1-p1.json's own branch claude/m1-p1-demo (read from merge base f062712c1d41d8ba82ab8ec49a56c3d38c988449); refusing to audit a branch against a declaration that does not claim to govern it
exit 21
+ branch: HEAD head: cc45c03
gates: scope: error: the current branch HEAD does not match declaration phases/m1-p1.json's own branch claude/m1-p1-demo (read from merge base 0955ee419e92b6a5fb0932ad18cb869c575cb8c2); refusing to audit a branch against a declaration that does not claim to govern it
exit 21
```

Runs F and G, a non-phase pull request (for example a typo fix on
`fix/typo`). The kernel's own registry handles this with a `branch-matches`
precondition (quoted from `gate-registry.yaml` in this repository, the entry
for `scope`), evaluated by src/gates/run.ts:1213. Copied into the scratch
registry, it behaves as follows:

```
F (applicability: required)
gates: scope: not-applicable: precondition scope-branch-is-a-phase-branch evaluated and unmet: branch fix/typo does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$
gates: required gate(s) not applicable: scope
exit 20
G (applicability: conditional)
gates: scope: not-applicable: precondition scope-branch-is-a-phase-branch evaluated and unmet: branch fix/typo does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$
gates: every applicable gate is green
exit 0
```

Run H confirms that `conditional` does not weaken the phase-branch case:

```
gates: scope: red: touched path(s) outside the declared scope: src/c.txt (declaration phases/m1-p1.json at merge base 0955ee419e92b6a5fb0932ad18cb869c575cb8c2, sha256 20c3243f35510a2a1a1fc48cc406546fbecda5eac557af925ec69e255f72fcbf)
exit 1
```

This repository's own CI accepts F's exit 20 because its harness,
`scripts/m2-exit-test.sh`, asserts scope's expected status per branch kind.
Hemma will have no such harness, so G is the form hemma's registry should use.

Runs I and J, `merge-preconditions` from the installed package:

```
I  gates: merge-preconditions: error: /tmp/claude-0/-home-user/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/q9/proj/charter.yaml does not exist in commit 1fef5e054c8feb3423f185ff7e4397e002481f11, resolved from HEAD, so the declared mode's merge-authority is unknown and no decorrelation verdict can be reached; a merge check that cannot determine the regime reports error, never green
   exit 21
J  gates: merge-preconditions: red: DR-0012 at head cc45c0336b69c029281db13f2732c9117932de3d, phase m1-p1: the diff origin/main...cc45c0336b69c029281db13f2732c9117932de3d changes 1 path(s), 1 of them in the dual-review tier (src/a.txt), so DR-0012 requires 2 approving, decorrelated verdicts for the commit under audit cc45c0336b69c029281db13f2732c9117932de3d; 0 of 2 are admitted and 2 missing. A missing review is RED, never not-applicable (M5-P3); conditions 1 to 6 and the branch-protection encoding were NOT evaluated, because a shipped change without its two reviews is refused whatever they would say
   exit 1
```

For J, `charter.yaml` (the package's `templates/charter.example.yaml`) and
`assurance-modes.yaml` (copied from the installed package, byte-identical to
this branch's) were committed to `main`, which is what post-init steps 2 and 3
in 4e produce. So the gate RUNS from the installed package and fails closed.
Beyond J, it was not run further, because the next conditions need committed
review verdicts and live GitHub reads against a real repository. What it would
need next, read from source and NOT measured:

- verdict documents committed under `delivery/` (src/checks.ts:3234);
- an arbitration document at `delivery/review/arbitration-<phase>.md`,
  overridable by `--arbitrations` (src/gates/merge-preconditions.ts:1641);
- the scope record from the same bundle at `<evidence>/../scope/result.json`
  (src/gates/merge-preconditions.ts:1628), so scope must run in the same run;
- a repository slug from `origin` or `--repo`
  (src/gates/merge-preconditions.ts:1484), a required check named `gates`
  (src/gates/merge-preconditions.ts:115), and an active branch ruleset;
- a review-tier table that names THIS repository's paths
  (src/gates/merge-preconditions.ts:876), so every hemma path falls to the
  dual-review tier. Measured in J: `src/a.txt` is dual tier.

Also, the kernel registry declares this gate `conditional` with a precondition
that runs `scripts/check-dual-review.mjs`, and `scripts/` is not in the
package's `files` list (package.json:26); the installed tree has no `scripts/`
directory (`ls` exit 2). A `conditional` gate must carry a precondition (the
runner refused the registry without one: `INVALID #/gates/2/precondition
required property precondition is missing`), so a project copying the kernel's
entry has to write its own precondition or declare the gate `required`, as
this probe did.

Run K, the toolchain. Hemma's CI pins Node 24 (section 1), and the kernel
declares `engines.node >=26` (package.json:11). On v24.21.0 (fetched to scratch,
SHA-256 checked), `npm ci` printed `npm warn EBADENGINE` and exited 0, and the
run gave the same verdicts as on v26:

```
+ node --version: v24.21.0; tiphys version: 0.2.1
gates: scope: green: 1 changed path(s) audited against declaration phases/m1-p1.json at merge base 0955ee419e92b6a5fb0932ad18cb869c575cb8c2 (sha256 20c3243f35510a2a1a1fc48cc406546fbecda5eac557af925ec69e255f72fcbf)
gates: merge-preconditions: red: DR-0012 at head cc45c0336b69c029281db13f2732c9117932de3d, phase m1-p1: [same sentence as J]
exit 1
```

The bracket in that block is the only edit to a capture in this section: it
stands for the verbatim J sentence, repeated in the run, to avoid printing it
twice. v22.22.2 also gave the same three verdicts. This is a measurement of
these two gates only. It is not support: Node 24 is below the kernel's
declared floor.

**The conflict pre-pass is an orchestrator tool, not a hemma gate.** It reads
declaration FILES given as paths, so it runs from a kernel checkout against
hemma's declarations without being installed in hemma. Measured from this
branch at `9d83db7`, on two scratch declarations:

```
conflicts: 2 declaration(s): M1-P1 (decl/m1-p1.json), M1-P2 (decl/m1-p2.json)
append-only, union-resolved, never an overlap: test/behaviors.json, gates.manifest.json, delivery/requirements/clause-map.json
DISJOINT M1-P1 M1-P2
conflicts: 0 overlapping pair(s), 1 disjoint pair(s), 0 overlapping path(s)
exit 0
```

The default append-only list names this repository's registries
(src/commands/conflicts.ts:66). For hemma those paths are harmless and match
nothing. Any hemma file that should be union-resolved has to be passed with
`--append-only`.

**Recommendations for step 3's hemma registry (step 3 decides and records any
change).**

1. Add `@tiphys/kernel` to hemma's `devDependencies` at the EXACT version
   `0.2.1`, with no range, and commit the lockfile change.
2. Declare `scope` as in G: the installed-path command, `applicability:
   conditional`, and the `branch-matches` precondition
   `claude/m[0-9]+-p[0-9]+-.*`. Point `--declarations` at hemma's declaration
   directory (I-12).
3. The CI job that runs the gates must: check out `github.head_ref` (not the
   default detached HEAD, run E); fetch full history, so the merge base
   resolves (this repository's `gates` workflow records `fetch-depth: 0` as
   load-bearing); and pass `--phase` derived from the branch name, lowercase,
   the same way this repository's workflow does.
4. Do NOT put `merge-preconditions` in hemma's registry for step 3 unless the
   merge is to go through the kernel regime. If it is, hemma must adopt the
   `delivery/review/` verdict and arbitration layout and a required check named
   `gates`, and accept that every hemma path is dual tier. That is a process
   choice for the orchestrator, not a gate command.
5. Run the gates job on Node 26 (the floor), even if hemma's other jobs stay on
   Node 24. Run K shows 24 works for these gates today, but that is not a
   promise the kernel makes.
6. Scope gives hemma phases two standing extras and two evidence directories
   (`test/behaviors.json`, `delivery/work-history/<phase>.md`, and
   `delivery/review/` and `delivery/verification/` for the phase's own evidence;
   src/gates/scope.ts:979, src/gates/scope.ts:565). A hemma phase may touch
   those paths without declaring them. That is a small, named widening. It is
   not an error.

**Answer to Q-5.**

- Pin: `@tiphys/kernel@0.2.1`, exact, in hemma's `devDependencies` and in the
  charter's `identity.kernel-version-pin`. It is the latest published version.
- What step 3 CAN use from 0.2.1: the gate runner with `--registry`, the
  `scope` gate (runs A to H), `merge-preconditions` if the regime is chosen
  (runs I and J), the schemas, `assurance-modes.yaml` and the charter template.
- What step 3 CANNOT use from 0.2.1, and the replacement for each:
  - `tiphys init --project`: absent. Replacement: copy
    `node_modules/@tiphys/kernel/assurance-modes.yaml` to hemma's root and
    commit it. It is a byte copy, which is exactly what `init --project` writes,
    and 0.2.1's file is byte-identical to this branch's.
  - `tiphys conflicts`: absent. Replacement: the orchestrator runs it from a
    kernel checkout at this branch (or `main` after merge) against hemma's
    declaration files. It is a pre-pass, not a hemma gate.
  - `templates/gate-registry.example.yaml`: absent. Replacement: copy it from
    this repository. It is a text starting point with no kernel command in it,
    so hemma does not depend on it at run time.

**Is a kernel release or a kernel change needed before step 3? No.** The
evidence is runs A to K above. Every run-time use step 3 plans in hemma (the
runner with `--registry`, `scope`, and `merge-preconditions` if chosen) ran
from 0.2.1 in those runs, and the three absent items each have a replacement
that gives the same result. What those runs did not exercise is listed in the
work history (delivery/work-history/m5-p6.md), under "What the measurement did
NOT cover". Two things would make this cleaner later. Neither is
needed for step 3, and neither was made:

- A release (0.2.2 or later) after M5-P6 merges would put `init --project`,
  `conflicts` and the registry template into the published package, so hemma
  could run `npx tiphys init --project .` itself. This is optional.
- The gate path `dist/src/gates/scope.js` is not in the package's `exports`
  (package.json:19), so it is an internal path. A kernel change giving gates a
  stable public entry would make the registry command independent of the
  package layout: for example a `tiphys gate <id>` subcommand in `src/cli.ts`,
  or `exports` entries in `package.json`. It would touch `src/cli.ts` (or
  `package.json`), a test, and a declaration grant, and it needs a decision.
  Until then, the exact pin keeps the path stable.

## 5. Suitability against the applicability envelope

The envelope is DR-0029 Part 3, which the owner approved: the six APPLIES
conditions at
delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md:136,
the normative DOES NOT APPLY list at
delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md:151,
and the degraded band at
delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md:182.

### 5a. APPLIES conditions (3a), all six must hold

| # | condition | hemma | evidence |
|---|---|---|---|
| 1 | intent stateable before work | holds | `docs/phases/` carries 12 phase-definition files; hemma `CLAUDE.md:335-346` fixes a definition of done |
| 2 | lands as a reviewable change in version control | holds | PR-based (PR #454, #455 in section 2b) |
| 3 | done decidable by something other than opinion, for `correctness` | holds | `tsc`, `eslint`, 8540 unit tests, Playwright, all exit-code gates (section 2c) |
| 4 | decomposes into phases with a dependency order | holds | `docs/phases/phase-0` to `phase-11` definitions |
| 5 | horizon longer than one sitting | holds | 1332 workflow runs; release `2026.06.1-1` |
| 6 | a wrong merge costs more than the process | holds, strongly | every `main` push deploys to Vercel production and may migrate the production database (section 3) |

### 5b. DOES NOT APPLY list (3b), none may hold for the selected work

| # | exclusion | hemma |
|---|---|---|
| 1 | spikes and exploration | not the repository as a whole; excluded per phase |
| 2 | a human is the only oracle | HOLDS FOR PART OF HEMMA: design, copy and brand work (hemma `CLAUDE.md:216-233`, design system and brand identity) has no falsifiable form. Such phases must not be selected; section 6 selects none |
| 3 | trivial single changes | judged per phase; the section 6 candidates are deliberately small, and whether they count as "trivial" under 3b.3 is a reviewer judgement (Q-6) |
| 4 | incident response | not the selected work |
| 5 | outside version control | no |
| 6 | discovery where requirements are the deliverable | not the selected work |
| 7 | untrusted contributors | does NOT hold: GitHub MCP `list_repository_collaborators` returns exactly one entry, `ThomasHendrickx`, `role_name: admin`. Hemma is private (section 3) |

### 5c. Degraded band (3c)

- **Solo project, no second human reviewer**: holds (one collaborator). The
  `review` class needs the charter's `review-families` declaration (I-4), so
  that one reviewer is not counted as two.
- **No CI**: does NOT hold, hemma has strong CI. But the kernel's own gates are
  not IN that CI (I-14), so kernel evidence stays local-only until a step is
  added.

### 5d. Verdict

**FITS, WITH NAMED CONDITIONS.** Hemma is inside the envelope. Nothing here
requires bending the kernel to admit it. The conditions:

- K-1: p6-charter-only is not met by the kernel as it stands, on the evidence of section 4d (a route this intake did not find is Q-4 and Q-8;
  H-1 to H-4). This is a KERNEL finding, not a hemma unsuitability.
- K-2: phases are selected from the falsifiable part of hemma (3b.2).
- K-3: every merge is a production deploy, so the phases carry no migration
  and no production-code change (section 3).
- K-4: nothing observed requires green CI to merge in hemma (`main`
  unprotected, rulesets unknown, Q-3). The kernel's merge preconditions and the
  orchestrator's observation of each post-merge push run are the only
  enforcement.
- K-5: an owner action for push access (section 7).

## 6. Candidate disjoint phase pair for step 3

Selection rule, stated so it can be checked: test-only changes (spec files are
not in the Vercel bundle, so each post-merge deploy ships an unchanged
application), no migration, a mechanical predicate that is RED today, and
literally disjoint file sets.

Source: hemma's own lint rule `hemma-lint/no-untimed-clock-in-specs`, 70 sites
today. Full warning distribution from the section 2c lint log: 720
`max-lines-per-function`, 70 `no-untimed-clock-in-specs`, 4
`@typescript-eslint/no-unused-vars`, 1 `storybook/no-redundant-story-name`
(795 total). The rule's own message: "`Date.now()` in a spec file without
`vi.useFakeTimers()` reads the real wall clock and is flake-prone under
parallel load". This is a quality outcome hemma itself named, not an invented
task.

| phase | files to touch | predicate, red today | tests today |
|---|---|---|---|
| M1-P1 site-shed frozen clock | `domain/site-shed/site-shed.service.spec.ts`, `docs/work-history/<date>.site-shed-frozen-clock.md` | `npx eslint --max-warnings 0 domain/site-shed/site-shed.service.spec.ts` exit 1, 7 `no-untimed-clock-in-specs` warnings | pass |
| M1-P2 calendar-oauth frozen clock | `integrations/google-calendar/oauth.spec.ts`, `docs/work-history/<date>.google-calendar-oauth-frozen-clock.md` | `npx eslint --max-warnings 0 integrations/google-calendar/oauth.spec.ts` exit 1, 7 warnings | pass |

Measured baseline, both files: `npx vitest run --project unit
domain/site-shed/site-shed.service.spec.ts integrations/google-calendar/oauth.spec.ts`
exit 0, `Test Files 2 passed (2)`, `Tests 64 passed (64)`. Proposed acceptance
per phase: the eslint command exits 0; the vitest invocation exits 0 with the
SAME per-file test count as before, so freezing the clock deleted no
assertion; and the `validate` job is green on the PR and on the post-merge
push run.

Each phase also adds its own hemma declaration as an extra. The ids and
branches follow the kernel's forced pattern (I-12).

### 6a. Conflict pre-pass, run with this branch's command

Fixture declarations were written to scratch in the phase-declaration schema's
shape, carrying the file sets above. Toolchain node v26.6.0. `<scratch>` stands
for `/tmp/claude-0/-home-user/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/hemma-intake`.

```
$ node bin/tiphys.ts conflicts <scratch>/decl/h-p1.json <scratch>/decl/h-p2.json
conflicts: 2 declaration(s): M1-P1 (<scratch>/decl/h-p1.json), M1-P2 (<scratch>/decl/h-p2.json)
append-only, union-resolved, never an overlap: test/behaviors.json, gates.manifest.json, delivery/requirements/clause-map.json
DISJOINT M1-P1 M1-P2
conflicts: 0 overlapping pair(s), 1 disjoint pair(s), 0 overlapping path(s)
semantic coupling: NOT CHECKED. Literal file overlap is the only thing this command computes; zero overlap is not proof of independence. A reviewer must still judge semantic coupling for EVERY pair, disjoint ones included (a test in one phase asserting on what another phase changes, related behaviour in disjoint files, merge order).
exit 0
```

Control, so the green above is shown able to go red: the same pair with
`tests/setup.ts` (hemma's shared unit setup) added to both.

```
$ node bin/tiphys.ts conflicts <scratch>/decl/h-p1-control.json <scratch>/decl/h-p2-control.json
conflicts: 2 declaration(s): M1-P1 (<scratch>/decl/h-p1-control.json), M1-P2 (<scratch>/decl/h-p2-control.json)
append-only, union-resolved, never an overlap: test/behaviors.json, gates.manifest.json, delivery/requirements/clause-map.json
OVERLAP M1-P1 M1-P2 tests/setup.ts
conflicts: 1 overlapping pair(s), 0 disjoint pair(s), 1 overlapping path(s)
semantic coupling: NOT CHECKED. Literal file overlap is the only thing this command computes; zero overlap is not proof of independence. A reviewer must still judge semantic coupling for EVERY pair, disjoint ones included (a test in one phase asserting on what another phase changes, related behaviour in disjoint files, merge order).
exit 1
```

The only edit to the captured output is the `<scratch>` substitution above.

Two observations on the command applied to another project:

- The printed append-only list is THIS repository's three registries, the
  default at src/commands/conflicts.ts:66. None of those paths exist in hemma,
  so the line is harmless here and misleading. Step 3 should pass
  `--append-only` with hemma's own registries. Hemma's generated manifests
  (`check:consumer-manifest`, `check:invalidation-manifest`,
  `check:service-graph`) are the plausible candidates; neither candidate phase
  touches them.
- The first attempt used ids `H-P1` and `H-P2` and got exit 2, `NO VERDICT`
  (I-12). That is correct behaviour, recorded because it is the first
  observation of the kernel's id vocabulary meeting a project that has its own.

### 6b. Semantic coupling: a REVIEWER OBLIGATION, not a result

Zero literal overlap is not independence. What a reviewer of step 3 must
judge, with what this intake did and did not check:

- Shared test infrastructure: both specs load `tests/setup.ts` and
  `.env.test`. Neither phase may edit them; the control run shows the command
  names a literal edit. Vitest isolates fake-timer state per test file, so two
  files freezing their clocks should not interact. That is a Vitest property
  this intake did NOT test.
- Reverse dependencies: a `grep -rln` for importers found the site-shed
  service used by `server/api/routers/site-shed.ts`,
  `domain/site-shed/site-shed.repository.ts` and two stories, and the calendar
  oauth module used by `app/api/integrations/google-calendar/callback/route.ts`
  and `domain/storage-provider/make-storage-provider-service.ts`. No importer is
  shared between the two sets. Neither phase changes a non-spec file, so these
  are context, not coupling.
- Merge order: either order is valid. The second merge re-runs CI on the union,
  and the post-merge push run is observed for EACH head (hemma does not cancel
  `main` runs, section 2a).
- Lint-rule coupling: both phases clear warnings of one rule. A change to the
  rule itself (`eslint.config.mjs`) would couple them, so it is excluded from
  both file sets.

An alternative pair with a production-code outcome exists (the two
`no-unused-vars` warnings in `components/documents/ui/document-list.tsx` and
`components/mobile/capture-radial.tsx`). It is NOT recommended: each merge would
then ship changed production code, against K-3.

## 7. What is blocked

- **Step 3 cannot run.** It needs the orchestrator session to create branches,
  push and open pull requests on `ThomasHendrickx/hemma`, and to create and push
  a fleet-home repository. Push access to hemma is not granted to the
  orchestrator session. This intake attempted no write to test that, because a
  dry-run does not probe push authorization (CLAUDE.md standing warning 14).
  OWNER ACTION CANDIDATE, id to be allocated by the register in
  delivery/STATE.md:1, NOT allocated here: grant the orchestrator push access to
  hemma, and create or authorise a fleet-home repository for it.
- **p6-charter-only is blocked on a scope decision** (section 4d): either a plan
  amendment adding the init or resolver change, or an accepted and declared
  failure of that criterion.

## 8. Open questions

- Q-1: which of the 3 skipped unit test files skip for a reason other than the
  unset `APPLICABILITY_TEST_DATABASE_URL`? The default reporter does not name
  them.
- Q-2: do hemma's gates pass on Node 24, CI's pinned version? Measured here on
  v22.22.2 only. CI push run 35845441652 on the same head is green, and that is
  the Node 24 evidence available. (Section 4f adds a narrower fact: the kernel
  0.2.1 gates `scope` and `merge-preconditions` gave the same verdicts on
  v24.21.0 as on v26.6.0 in a scratch project. That says nothing about hemma's
  own gates.)
- Q-3: does a repository ruleset govern hemma `main`? Classic protection is
  absent; a ruleset read is unavailable through both paths this session has.
- Q-4: where does the charter live for a fleet home with a separate project
  repository: `charter.yaml` in the context directory the checks read, or
  `charter/<project>.yaml` as the pulse precedent stored it? These are
  different files, and a check reading one does not see the other.
- Q-5: which `@tiphys/kernel` version is published and installable today, and
  does it carry `conflicts` (this branch is unmerged)?
  ANSWERED in section 4f: 0.2.1 is the latest published version and hemma pins
  it exactly. It does not carry `conflicts` or `init --project`; each has a
  replacement that gives the same result, so no release is needed first.
- Q-6: are two frozen-clock phases "trivial single changes" under DR-0029 3b.3?
  They were chosen for safety under K-3. A reviewer may judge that they exercise
  the parallel mechanism without much product value; the higher-value
  alternative conflicts with K-3.
- Q-7: `npm run build`, Playwright and `test:full` were not run locally (no
  Postgres). Their current state is known only from CI.
- Q-8: is p6-charter-only to be met by a kernel change (plan amendment) or
  recorded as a declared failure (section 4d)? This is the orchestrator's call.
  ANSWERED: DR-0058 chose the kernel change; section 4e records the result.
- Q-9 (added by the M5-P6 kernel fix round 1): how does hemma's registry
  invoke a kernel gate such as `scope`? Its command must name a path in an
  installed kernel, which is the operator-machine dependency `init --project`
  avoided for the modes document. Open; it must be settled before step 3
  writes hemma's registry (section 4e).
  ANSWERED in section 4f, measured: the command names the gate module inside
  hemma's OWN installed dependency
  (`node_modules/@tiphys/kernel/dist/src/gates/scope.js`), which hemma's
  `npm ci` creates from its lockfile. No kernel change is needed.

**Verdict: FITS WITH NAMED CONDITIONS K-1 to K-5. Step 1 is complete; step 3 is
blocked on the owner action in section 7 and the scope decision in Q-8.**
(Updated by the kernel fix round 1: Q-8 is answered by DR-0058; step 3 is now
blocked on section 7 and on Q-9.)
(Updated again by section 4f: Q-9 and Q-5 are answered, with no kernel
release or change needed. Step 3 is blocked on section 7 only, which is owner
action A-18.)
