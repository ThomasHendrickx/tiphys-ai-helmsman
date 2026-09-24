# M5-P6 step 1: hemma intake (verification-first, read-only)

Status: IN PROGRESS. Sections are appended as evidence is gathered.

Governing plan section: delivery/plan/value-delivery-plan.yaml:395

## 0. Method and the no-mutation guarantee

Subject: `github.com/ThomasHendrickx/hemma`, shallow clone at `/home/user/hemma`,
HEAD a6141d7d0c289d115aeb236853fe9aa881d75788 ("Demo: ground-floor plan with
real, localised annotations (#454)"), single branch `main`, `.git/shallow`
holds exactly that sha.

The clone at `/home/user/hemma` was never written. It was copied once with
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
alias held in the `PREVIEW_BASE_URL` repository variable; by design it can
never block a merge (`golden-path-preview.yml:1-40`).

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

Declared transliteration: the lint summary line begins with U+2716 in the raw
capture, rendered here as nothing (the line is quoted from its first ASCII
character); 1 occurrence. Nothing else in any quoted output was altered.

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
- It refuses any non-empty directory (src/commands/init.ts:112), so it can
  never run IN hemma's repository. It creates a SEPARATE fleet home, the shape
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
| I-5 | the charter's FILE NAME and location | checks read `charter.yaml` from a context directory (src/checks.ts:4616); the pulse precedent stored `charter/pulse.yaml` in the fleet home | CHARTER, location UNRESOLVED | Q-4 |
| I-6 | a project gate registry naming hemma's own commands (`npm run lint`, `npx tsc --noEmit`, `npx vitest run --project unit`, and the kernel-contract gates hemma opts into) | `tiphys gates run --registry <file>` | PREDICATE | hemma's commands exist and pass (section 2c); the registry itself does not exist and no template ships (`templates/` holds no gate-registry example, contrary to DR-0029 Part 1's stated consequence at delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md:50) |
| I-7 | `assurance-modes.yaml` | the merge-authority regime needs BOTH `charter.yaml` and `assurance-modes.yaml` present at the committed source (src/checks.ts:4629); the mode enum check reads it (src/checks.ts:320) | **KERNEL-HANDWORK (H-1)** | none. It is the KERNEL's closed vocabulary (DR-0020), not a hemma predicate. The pulse precedent hand-placed it as a symlink, `assurance-modes.yaml -> node_modules/@tiphys/kernel/assurance-modes.yaml` |
| I-8 | `schemas/` beside the context documents | cross-document checks resolve `schemas/charter.schema.json` beside the document (src/commands/mode.ts:21) | **KERNEL-HANDWORK (H-2)** | none. Pulse precedent: symlink `schemas -> node_modules/@tiphys/kernel/schemas` |
| I-9 | the kernel's `gate-registry.yaml` placed in the fleet home | the pulse precedent symlinked `gate-registry.yaml -> node_modules/@tiphys/kernel/gate-registry.yaml` | **KERNEL-HANDWORK (H-3)**, and a PREDICATE substitution | That symlink makes the KERNEL's predicates stand in for the project's, which is the opposite of DR-0029 Part 1. For hemma it would also not run: the kernel registry's commands are kernel-repository-relative, e.g. `node src/gates/scope.ts --declarations delivery/plan/phase-declarations` at `gate-registry.yaml` line 126 (root-level yaml, quoted because it is not a citation root) |
| I-10 | `.gitignore` line `.ctx-*/` | observed in pulse-fleet, not written by init (src/fleet.ts:29 lists three entries) | **KERNEL-HANDWORK (H-4)** | none |
| I-11 | `npm install` in the fleet home so the pinned kernel is under `node_modules/` | every symlink in I-7 to I-9 resolves through it | OPERATOR | depends on Q-5 |
| I-12 | one phase declaration per hemma phase, committed to hemma `main` BEFORE the phase branch exists | scope gate (src/gates/scope.ts:877) | PREDICATE, with KERNEL-IMPOSED naming | id must match `^M[0-9]+-P[0-9]+$` and branch `^claude/m[0-9]+-p[0-9]+-.+$` (src/gates/schemas/phase-declaration.schema.json:13, src/gates/schemas/phase-declaration.schema.json:18). Measured: `tiphys conflicts` REFUSED declarations with ids `H-P1`/`H-P2`, exit 2, `does not match the required pattern ^M[0-9]+-P[0-9]+$`. Hemma's own phase names (`run17-p4`, `claude/run9-r2-...`) do not fit; the kernel's vocabulary is imposed, which is a declared cost, not handwork |
| I-13 | red-witness specs (`witness/*.json`) for any src change, if hemma's registry includes the kernel's `red-witness` gate | red-witness gate | PREDICATE | none yet; hemma's natural witness is `eslint --max-warnings 0 <file>` (section 6) |
| I-14 | a CI step that runs `tiphys gates run` in hemma | nothing today; hemma's `ci.yml` never invokes tiphys | PREDICATE (hemma owns its CI) | absent. Without it the kernel's gates are local-only evidence, the DR-0029 Part 3c degraded band |
| I-15 | push access for the orchestrator to hemma, and to the new fleet-home repository | step 3 | OWNER ACTION | section 7 |

### 4d. Verdict on p6-charter-only, as the kernel stands at this branch

**Charter plus project-owned predicates is NOT sufficient today.** Four inputs
(I-7, I-8, I-9, I-10) are kernel configuration that init does not produce and
that the charter does not carry. The only onboarded precedent carries all four
as hand-placed files. Step 3 can satisfy p6-charter-only in one of two ways,
and choosing between them is not this intake's decision:

1. a kernel change makes init (or a resolver) produce or locate I-7, I-8 and
   I-10, and I-9 is replaced by a hemma-authored registry (I-6). This touches
   src/commands/init.ts, which is NOT on this phase's files-to-touch
   (delivery/plan/value-delivery-plan.yaml:423), so it needs a plan amendment;
2. the handwork is performed and DECLARED, and the exit report records
   p6-charter-only as failed with each item named. That is honest and it fails
   the criterion.

Bending the kernel silently (placing the symlinks and saying nothing) is the
third option and is excluded by the plan's own hazard `hidden-bootstrap-handwork`
(delivery/plan/value-delivery-plan.yaml:460).

Evidence for the precedent, and its limit: pulse-fleet was cloned read-only
(`git clone --depth 1`, HEAD 7656f67) into scratch and LISTED, never executed.
A shallow clone shows the symlinks exist at that head, not when or by whom they
were added. A read-only clone of `ThomasHendrickx/pulse` itself was refused by
this session's permission layer, so the project side of the precedent is
unobserved here.
