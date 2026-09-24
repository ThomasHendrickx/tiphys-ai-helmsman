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
