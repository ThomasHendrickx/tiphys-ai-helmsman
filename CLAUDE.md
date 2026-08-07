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
5. One phase = one branch = one PR, always. Parallelism is ON where a
   recorded pre-pass proves the phases disjoint (DR-0011, superseding the
   original "off until M5"). MERGE order is always dependency order even when
   work order is concurrent, and the pre-pass must be written down before
   dispatch, not asserted. M2's is `delivery/plan/m2-conflict-pre-pass.md`:
   M2-P1 serialises, M2-P2 to M2-P8 are mutually disjoint, M2-P9 runs last.
   The two shared registries (`test/behaviors.json`, `gates.manifest.json`)
   are append-only and resolved as a union against the merge base; they never
   re-serialise phases.
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

## Fix-round contract (measured, 2026-08-05)

A throughput analysis of M1 measured sixteen completed fix rounds. Thirteen
were re-reviewed and TWELVE of those thirteen produced a new finding
attributable to the round itself. The dominant cause, roughly a third of the
milestone's elapsed time, is a single shape: **the fix addressed the instance
the reviewer named, when the defect was the mechanism.** M1-P3 chained four
rounds that way, M1-P5 chained four, M1-P6 chained two.

Every avoidable instance had a counterfactual that was a COMMAND or a DECLARED
SCOPE, never a judgment call. So this is mechanical, and it is binding on every
fix round from now on.

A fix round is not done, and a work history is not acceptable, without all
three of these:

1. **Name the MECHANISM, not the finding.** "A FIFO at the beacon hangs the
   guard" is a finding. "Reading a path whose type has not been established"
   is the mechanism. The round fixes the second.
2. **Publish the derivation.** The exact command that enumerates every call
   site of that mechanism, and its full output. Not a summary of it.
3. **State what the derivation did NOT cover.** The regions the search
   excluded, and why. A search whose scope is wrong returns an empty result
   that is indistinguishable from an absence of defects, and this project has
   been bitten by that three times: `state/session.lock` probed when the lease
   is `state/orchestrator.lock`; an inventory scoped to `tasks/`, `state/` and
   `worktrees/` while the missed path sat at the fleet root; a usage error
   read as a clean result.

**The reviewer's FIRST check is item 3**, before examining any row.

This is proven inside this repository rather than imported. M1-P5's fourth
round used exactly this method and derived eleven call sites where the review
had listed eight, closing in one round a class that three prior rounds had each
closed one path at a time.

### The claim grep, also binding

Before submitting any work history, run:

```
grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/<phase>.md
```

Every hit must carry an adjacent captured command that settles it, or be
restated as an open question. "I did not find a way to force this arm" is a
true sentence; "this arm cannot be forced here" is a false one, and the first
invites the next reader to try. Tuition T-006 records seven instances of this
across M1, one of them the orchestrator's own, and notes that the pattern
survived being documented as a norm. A grep is mechanical; a reminder is not.

### One witness is not a class

A witness for a CLASS must redden under at least TWO structurally different
members of it. M1-P6 produced two consecutive mediums from this alone: one
defang reddened a guard test, three others left it green, and the round after
it repeated the mistake one abstraction up.

## Dispatch contract: no agent without a beacon and a guard (T-008, binding)

Measured 2026-08-06: two review agents died within minutes of dispatch and the
orchestrator did not notice for **nine hours and eleven minutes**, while
answering the owner and dispatching other work throughout. Nothing was lost but
wall clock, and it was the largest single waste in the project.

The orchestrator's supervision was "wait for a completion notification". That
is PROCESS LIVENESS, which constraint C-2 forbids for exactly this reason: a
dead process sends no notification, and no notification is indistinguishable
from work in progress. This repository is building the watcher and liveness
guard that prevent precisely this, and the rule was not applied to the process
building it.

A stated stall rule is not sufficient. It addresses attention, and attention is
what a busy session does not have. This project has recorded twice that a rule
depending on memory does not survive; the answer both times was a mechanism.

**Two rules, both mechanical, binding on every dispatch:**

1. **Every dispatched agent writes its output INCREMENTALLY.** It creates its
   artifact within the first minutes and appends as it works. The file's mtime
   is its beacon. A death then leaves a partial result rather than nothing,
   which is the difference between salvage and a total loss.
2. **A freshness watchdog is armed in the SAME TURN as the dispatch.** It
   watches the newest mtime under the agent's working directory and reports
   stale after a threshold. It must test FRESHNESS, never existence and never
   completion.

The second rule has its own recorded failure: the first watchdog written after
this incident tested whether the report file EXISTED, so it fired two minutes
in, reported success, and said nothing. A guard whose condition does not test
the property that matters is green and worthless, which is the red-witness rule
one level up.

## Green is scoped to the run that produced it (T-009, binding)

Measured 2026-08-07: `main` was red for **four hours and twenty-one minutes**
across five consecutive push runs while every pull-request check was green, and
the orchestrator merged four more PRs onto it without noticing. The owner
surfaced it, not the process.

The `gates` workflow fires on two events and they run DIFFERENT bundles: the
`pull_request` event runs the strong PR bundle with `--phase` from
`github.head_ref`, and a `push` to `main` runs `--bundle main` with no `--phase`.
A defect on the arm only one event takes is invisible to the other.

**The mechanism: a gate result is evidence only for the configuration it ran
under.** "CI is green" is never a complete sentence here. The complete sentence
names the event and the head sha.

Two rules, both mechanical:

1. **A merge is not complete until the post-merge `push` run on the new `main`
   head is observed to completion.** Not the PR check on the branch: the run
   whose head sha is the new tip. The phase does not close until that run is
   green. Watch it with the same watchdog discipline T-008 requires.
2. **Where behavior forks on the CI event, BOTH arms need a witness.** One
   witnessed arm and one unwitnessed arm is the exact shape that broke here, and
   the unwitnessed one is the one that broke.

Corollary, paid for in the same incident: an orchestrator-side hotfix to shared
harness code IS a fix round and owes the full fix-round contract above. PR #27
fixed one arm of "the harness assumes a run has a phase" and left the sibling
arm twelve lines away, because it was treated as too small to open the contract
for. PR #30 is what that exemption cost.

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

**When to involve the owner (DR-0016, binding).** Escalate ONLY when two or
more options are genuinely comparable AND the consequence is high impact and
costly to reverse. If the analysis yields a recommendation you would defend,
the options are not comparable and there is nothing to ask: decide, record it
as a decision record with its reasoning, and report it. Asking the owner a
question whose answer was already obvious is a FAILURE of the system, because
it costs them the focus they were spending elsewhere. Write your recommendation
first; doing so is what reveals whether a question was ever a question.
Unchanged: anything needing elevated access the agent does not hold, and
milestone exit-test evidence, which is reported unasked.

Merge authority normally rests with the owner. It is currently DELEGATED to
the orchestrator under DR-0012, conditional on dual cross-model clean review:
two independent clean-room reviews of the same head, produced on different
model families, both APPROVE with no unresolved high or medium finding, CI
green on that exact head, and the scope audit passing. Read
`delivery/decisions/DR-0012-delegated-merge-authority.md` before merging
anything; it also records the limits the orchestrator holds itself to,
including stopping rather than grinding when a phase needs more than two fix
rounds or a high-severity finding recurs in one component. **DR-0016 changes
what "stopping" means**: the phase no longer waits for the owner. A fresh
implementer plus a third review contract is dispatched immediately and the
owner is notified asynchronously. Only if THAT round also fails does the phase
go to the owner. The property being protected is that something different must
happen, and the measured evidence is that the fresh implementer, not the owner
decision, is the half that worked.

The full procedure is in `.claude/skills/phase-delivery/SKILL.md`. Read it
before dispatching or implementing a phase.

Process paperwork (`delivery/**`) reaches `main` through a pull request like
everything else, batched rather than one PR per file. Do not let evidence
accumulate only on a long-lived side branch: if that branch is lost, the
code survives and its proof does not.

## Standing environment warnings

Each of these bit someone once. Forward them to every implementer.

1. THREE Node versions are installed and which one you get depends on how
   the shell was started. Measured 2026-08-05: a login shell resolves `node`
   to v22.22.2 via `/opt/node22/bin`, but a STRIPPED environment
   (`env -i bash -c`, and some subagent or hook contexts) resolves it to
   **v20.20.2** via `/usr/local/bin/node`, a symlink to `/opt/node20`. Node 20
   has no TypeScript type stripping, so the suite fails there in a way that
   does not look like a version problem. A second trap in the same family: an
   exported PATH survives for the rest of a shell invocation, so a run intended
   to measure the default toolchain can silently measure the floor one. Always
   check `node --version` in the shell that actually runs the command, and prefer an absolute path or an explicit
   PATH prefix over trusting the ambient one. A reviewer hit this and had to
   run the default-toolchain gates through `bash -lc`.
   The container's default Node is 22.x while the declared floor is `>=26`.
   EBADENGINE warnings on every npm operation are expected. Never lower the
   floor and never set engine-strict. Node 22.18+ runs TypeScript natively so
   the suite works on the default toolchain, and CI on Node 26 remains the
   authority. Tests must still be floor-gated, because the default toolchain
   is below the floor.
   A floor-satisfying toolchain CAN be fetched, which removes "witnessed in
   CI" as the only way to discharge a floor-dependent assertion. Measured
   2026-08-05: `curl -O https://nodejs.org/dist/v26.6.0/node-v26.6.0-linux-x64.tar.xz`
   then `tar -xJf` into a scratch prefix and put its `bin` first on PATH.
   Against `main` at `bcefc98` that toolchain gave npm 11.18.0, `npm ci`
   exit 0 with no EBADENGINE line, `npm run build` exit 0, a clean
   `git status` after build, and `npm test` exit 0 with 106 tests, 106 pass,
   0 fail and 0 SKIPPED, where the default toolchain skips the floor-gated
   ones. Install to a scratch prefix, never over the system Node.
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
   MEASURED 2026-08-05, and it matters for the M1 exit test's FULL mode: `gh`
   CAN be installed here (release tarball from github.com, same pattern as the
   Node 26 toolchain) and `gh api user` does authenticate as the owner. But it
   is NOT usable for the exit test. `gh auth status` reports the GH_TOKEN
   invalid, `permissions.push` reads FALSE even on the kernel repository where
   git pushes demonstrably succeed, and GraphQL is refused with "only the
   pinned set of PR-review operations is served". So the API path and the git
   path have different authorities in this container, and `gh pr create`,
   `gh pr merge` and `gh pr view` cannot be relied on. Full mode needs a real
   runner or the owner's machine; local mode is the form that runs here.
7. `--test-name-pattern` must precede the positional test path, or it is
   silently ignored.
8. `git checkout --` wipes uncommitted sibling edits. Copy before
   experimenting. SHARPER FORM, paid for twice: ANY `git checkout --` in a
   tree holding uncommitted work is destructive, INCLUDING when it names a
   single path, and especially the path you have been editing. An implementer
   used it to clean up one control probe and silently lost four rounds' worth
   of uncommitted harness edits, having read this warning beforehand. Commit or
   copy out of tree first; there is no safe narrow form.
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
