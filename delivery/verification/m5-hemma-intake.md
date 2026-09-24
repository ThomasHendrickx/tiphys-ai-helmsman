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
