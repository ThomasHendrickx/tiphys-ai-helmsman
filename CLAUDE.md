# Tiphys kernel: repository rules

This file is the agent-rules single source for this repository until the M3
gate registry replaces it. It records the binding conventions of kernel plan
v1 section 1.4 (delivery/plan/kernel-plan-v1.md), the repository's gate list,
and the delivery procedures that must survive any single session.

Read this file first. Then, for the task you are about to do, read the
matching skill in `.claude/skills/`.

## What this repository is

Tiphys is a delivery-process kernel: a versioned npm package that will run
orchestrated delivery for other projects. It is being built BY the existing
orchestrated delivery process, not by itself. Nothing runs on Tiphys before
milestone M4 (settled owner decision). Do not treat the kernel's own future
artifacts as available tooling.

The governing documents, in precedence order:

1. `delivery/intake/orchestrated-delivery-process.md`, the process being run.
2. `delivery/plan/kernel-plan-v1.md`, the owner-approved plan. Its binding
   rule holds: if it is not written there, it is not being made. Unanswered
   questions go to the orchestrator, and from the orchestrator to the owner.
3. `delivery/decisions/`, owner decision records. A decided record is
   settled and is never reopened by an agent.
4. This file.

## Durability rule (why this file exists)

Principle 4 of the blueprint: restart is a non-event, all truth lives in
files and git, and any session's conversation memory is a cache. That rule
is only real if it is obeyed while the work is happening.

Anything in the table below must be a committed file before the producing
session ends. An agent that discovers something and reports it only in chat
has lost it.

| What | Where | When |
|---|---|---|
| Where the pipeline currently stands | `delivery/STATE.md` | whenever a phase, decision, or owner action changes state |
| Owner decision, asked or answered | `delivery/decisions/DR-nnnn-<slug>.md` | when raised, updated when decided |
| Plan and every revision | `delivery/plan/kernel-plan-v1.md` | before dispatch of anything it governs |
| Requirements extraction | `delivery/requirements/` | before the plan cites it |
| Review of a plan | `delivery/review/plan-review-<round>.md` | before findings are applied |
| Review of a PR | `delivery/review/clean-room-<phase>.md` | before merge |
| Verification of a fix round | `delivery/review/verification-<phase>-fix-round.md` | before merge |
| Investigation of a mystery | `delivery/verification/<subject>.md` | before the question is called settled |
| What an implementer did and why | `delivery/work-history/<phase>.md` | in the phase branch, before the PR |
| A failure mode worth not repeating | `delivery/tuition/T-nnn-<slug>.md` | when discovered, not at the end |

Evidence beats assertion everywhere: exit codes, counts, file paths with
line numbers, captured output, URLs. An agent's claim with no verifiable
artifact behind it is treated as unknown.

## Where things live

- `delivery/` is the build's own paperwork. It is not shipped in the npm
  package and is not a kernel deliverable.
- `src/`, `bin/`, `test/` are the kernel itself.
- `schemas/`, `roles/`, `tuition/` at the repository root are reserved for
  M3 kernel deliverables. Do not populate them early; placeholders only.
  The root `tuition/` directory is the future cross-project tuition feed
  and is not the same thing as `delivery/tuition/`, which is this build's
  own failure log.
- `.claude/skills/` holds the procedures for running this repository's
  delivery. This is harness configuration for the current process. It is
  not a kernel deliverable and must not be confused with the role briefs
  that M3 ships.

## Binding conventions

1. English only.
2. npm only, never pnpm or yarn.
3. No em dashes in any authored text (commas, colons, parentheses instead).
   Authored files must be pure ASCII; check with `grep -rP '[^\x00-\x7F]'`.
4. Falsifiable acceptance criteria only; "works correctly" is banned; the
   register is "node --test exits 0 and reports N tests, N > 0".
5. Parallelism is OFF until M5: every M1 phase is sequential, one phase =
   one branch = one PR, and the next phase starts only after the previous
   PR is merged.
6. Milestone exit tests are hard gates: no milestone starts before the
   previous exit test has passed with recorded evidence.
7. Commit messages carry no AI model or tool names.

## Gates

Every change must pass, in order:

1. npm ci
2. npm run build
3. node --test

Notes: sources are TypeScript run natively via Node type stripping (tests
need no prior build); the build (tsc -b) is the type gate and emits dist/,
which is never committed (plan decisions D-17, D-18).

Beyond the mechanical gates, a phase is not done until: every acceptance
criterion in its plan section has been walked with evidence or explicitly
marked CI-deferred with a reason; the scope audit passes (changed files are
on the phase's files-to-touch list, plus `test/behaviors.json` and the
phase work history, which are standing pre-authorized extras); and every
new behavior is registered in `test/behaviors.json` and resolves by name.

## Red-witness rule

A test only counts as guarding a behavior if it has been demonstrated red
without the behavior and green with it. Applies to fix-round tests too.

Stronger form, learned the hard way (delivery/tuition/T-003): the test must
be red against the DANGEROUS state, not merely against the absent feature.
A test that exercises a destroy on a branch carrying nothing, or a
concurrency path where no contention can occur, is green, registered, and
worthless. Where the behavior under test consumes another program's output,
assertions must include real captured output from that program, not
hand-written strings chosen to match the implementation.

## Identifier schemes

Stable IDs, never renumbered, cited across documents:

- `SC-nnn` spec-coherence findings (intake verification)
- `R-nnn` requirement rows (migration table)
- `FM-nnn` firstmate scout findings
- `PR-nnn` internal plan-review findings; `EXT-F-nn` external review findings
- `CR-nnn` clean-room review findings on a PR
- `V-n` and `U-n` verification findings and unrefuted candidates
- `DR-nnnn` owner decision records
- `T-nnn` tuition entries
- `C-n` binding implementation constraints declared in the plan
- `D-nn` decisions taken inside the plan

## Delivery protocol

One phase, one branch, one PR. Branch names are given by the plan
(`claude/m1-pN-<slug>`). The orchestrator never writes feature code and
never lets a review be skipped; implementers never open PRs and never merge.

Merge authority normally rests with the owner. It is currently DELEGATED to
the orchestrator under DR-0012, conditional on dual cross-model clean review:
two independent clean-room reviews of the same head, produced on different
model families, both APPROVE with no unresolved high or medium finding, CI
green on that exact head, and the scope audit passing. Read
`delivery/decisions/DR-0012-delegated-merge-authority.md` before merging
anything; it also records the limits the orchestrator holds itself to,
including stopping rather than grinding when a phase needs more than two fix
rounds or a high-severity finding recurs in one component.

The full procedure is in `.claude/skills/phase-delivery/SKILL.md`. Read it
before dispatching or implementing a phase.

Process paperwork (`delivery/**`) reaches `main` through a pull request like
everything else, batched rather than one PR per file. Do not let evidence
accumulate only on a long-lived side branch: if that branch is lost, the
code survives and its proof does not.

## Standing environment warnings

Each of these bit someone once. Forward them to every implementer.

1. Local Node is 22.x while the declared floor is `>=26`. EBADENGINE
   warnings on every npm operation are expected. Never lower the floor and
   never set engine-strict. Node 22.18+ runs TypeScript natively so the
   suite works locally, but CI on Node 26 is the authority. Any assertion
   that depends on the floor being met (for example doctor exiting 0) must
   be floor-gated locally and witnessed in CI.
2. `typescript` is pinned exact. Do not remove `"types": ["node"]` from
   either tsconfig; the strict build cannot resolve Node builtins without it.
3. `*.tsbuildinfo` is gitignored deliberately; `tsc -b` writes one at the
   repository root and a clean `git status` after build is an acceptance
   criterion.
4. Importing a `src` module from `test/` with a literal relative path fails
   the build with TS2878 under `rewriteRelativeImportExtensions` across the
   project reference. Use the computed-URL dynamic import pattern already
   present in `test/doctor.test.ts`.
5. Tests that create scratch git repositories must set command-scoped
   `GIT_AUTHOR_*` and `GIT_COMMITTER_*`; CI runners have no git identity.
   The fleet's own bootstrap commit does this by design (decision EXT-F-02
   option B) and must never touch user or global config.
6. `gh` is absent locally and present in CI. Use a deterministic gh-free
   PATH in tests rather than assuming either.
7. `--test-name-pattern` must precede the positional test path, or it is
   silently ignored.
8. `git checkout --` wipes uncommitted sibling edits. Copy before
   experimenting.
9. `git remote set-url` resolves relative paths against the repository, not
   the current working directory. Use absolute paths in test staging.
10. Concurrent git operations against one clone contend on ref locks, and
    the real transient message names a ref, not a lock file. Never derive a
    retry signature from hand-written examples; capture real stderr under
    forced contention (delivery/tuition/T-003).
11. Suite wall time grows with real-clock lease waits. Budget harness
    timeouts accordingly rather than shortening the waits.

## Never

- Never push to `main` directly; never merge your own work.
- Never reopen a decided owner decision record; raise a new one instead.
- Never improvise an irreversible choice the plan is silent on. Stop and
  escalate to the orchestrator, which escalates to the owner.
- Never use pid, process liveness, signals, or `/proc` for identity or
  exclusion (constraint C-2). Liveness is lease freshness.
- Never read current state from the tail of an append-only log (C-1).
- Never auto-background a long-running process (C-3).
- Never soften a work history. It is the artifact a later reviewer trusts,
  and an overstated claim in one is how a real defect stayed hidden here
  once already.
