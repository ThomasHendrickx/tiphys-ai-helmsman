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
   Authored files must be pure ASCII **and free of control characters**, and
   that is TWO checks because one grep cannot do both:

   ```
   grep -raP '[^\x00-\x7F]' <paths>                    # non-ASCII
   grep -raP '[\x00-\x08\x0B\x0C\x0E-\x1F]' <paths>    # control characters
   ```

   **The `-a` is LOAD-BEARING and its absence is why the second check was
   itself blind until 2026-08-09.** Without `-a`, GNU grep detects a file
   containing NUL as binary and stops reporting matches from it, so the check
   silently skips exactly the file it exists to catch. Measured, GNU grep 3.11,
   one byte per fixture:

   | fixture | `grep -qP` | `grep -qaP` |
   |---|---|---|
   | `hello\x00world` | **MISSED** | detected |
   | `hello\x01world` | detected | detected |
   | `hello\x1bworld` | detected | detected |
   | `hello world` | miss (correct) | miss (correct) |

   NUL is the one byte it cannot see, and NUL is the one that makes git call a
   source file binary and strip its diff. `test/status.test.ts` was caught in
   the incident below only because it ALSO carried SOH. Two files were then
   found on `main` that the fixed check catches and the old one did not, one of
   them `delivery/review/arbitration-m3-p1.md`, which is the document that RULED
   on that incident: its sentence saying control characters belong in escapes
   contained a literal NUL inside the backticks meant to hold the escape. Every
   "ASCII clean" report since, the orchestrator's and CI's alike, was true and
   useless. Recorded as `delivery/tuition/T-010-the-control-character-check-could-not-see-nul.md`.

   The first check ALONE is what this repository used until 2026-08-08, and it
   is blind to control characters BY CONSTRUCTION: `NUL`, `SOH` and friends are
   inside `\x00-\x7F`, so a file full of them is "pure ASCII" and the check
   passes. That is not hypothetical. `test/status.test.ts` reached a pull
   request carrying raw NUL and SOH bytes; git classified it as binary
   (`Bin 0 -> 9332 bytes`), so it had NO REVIEWABLE DIFF at all, and every
   "ASCII check passes" report on that branch, including the orchestrator's,
   was TRUE and USELESS. A clean-room reviewer found it by reading the file,
   not by running the check.

   The general shape is the one this project keeps paying for: a guard whose
   condition does not test the property that matters is green and worthless
   (T-008's postscript, the red-witness rule one level up). Control characters
   a test genuinely needs AS DATA belong in escapes, never as literal bytes in
   source. A quick way to see the failure mode is `git diff --stat`: a source
   file reported as `Bin` is unreviewable whatever the ASCII check says.

   **AUTHORED is the operative word, and two exemptions are real.** Measured on
   `main` at `dd42ccb`: ZERO tracked files carry control characters, and
   exactly one carries non-ASCII,
   `delivery/intake/orchestrated-delivery-process.md`, which is the
   owner-supplied process document this build executes. It is INPUT, not
   agent-authored, and must not be transliterated. The other exemption is
   VENDORED fixtures such as `test/fixtures/json-schema-test-suite/**`, where
   non-ASCII content is the thing under test and transliterating it would
   destroy the test. Both exemptions are scoped BY PATH, never by judgment, so
   run both checks over `git ls-files` minus those two trees and expect zero.
4. Falsifiable acceptance criteria only; "works correctly" is banned; the
   register is "node --test exits 0 and reports N tests, N > 0".
5. One phase = one branch = one PR, always. Parallelism is ON where a
   recorded pre-pass proves the phases disjoint (DR-0011, superseding the
   original "off until M5"). MERGE order is always dependency order even when
   work order is concurrent, and the pre-pass must be written down before
   dispatch, not asserted. M2's is `delivery/plan/m2-conflict-pre-pass.md`:
   M2-P1 serialises, M2-P2 to M2-P8 are mutually disjoint, M2-P9 runs last.
   The shared registries (`test/behaviors.json`, `gates.manifest.json`,
   `delivery/requirements/clause-map.json`) are append-only and resolved as a
   union against the merge base; they never re-serialise phases.

   **A test over an append-only registry asserts BY NAME and never BY COUNT,
   and never on a specific row's presence.** The rule was written for
   `test/behaviors.json` and it generalises to every registry above, because
   the property that makes it necessary is the append-only-ness, not the file.
   A count is a claim about every FUTURE phase, and it is false the moment the
   next one appends. Measured 2026-08-08: M3-P1's `test/checks.test.ts` pinned
   `clause-map: green (12 clause-map rows checked)`, `R-094 pending M3-P2`, and
   a pending-row count. All three would have reddened for M3-P3 and every phase
   after it, not only for M3-P2 which happened to find them. A fourth site no
   grep could see was found only by execution: a test helper hand-listed the
   four directories it staged, and M3-P2's rows name a file at the repository
   root.

   The consequence for scope: a phase that extends a registry may have to edit
   the TEST that over-asserts on it, so that test belongs on the phase's
   declaration. Derive counts from the registry at run time instead of pinning
   them.
6. Milestone exit tests are hard gates: no milestone starts before the
   previous exit test has passed with recorded evidence.
7. Commit messages carry no AI model or tool names.

## Gates

**`gate-registry.yaml` is the canonical gate registry and the source this
section is generated from (R-094).** The block below is RENDERED from it by
`scripts/render-agent-rules-gates.mjs`. To change a gate, edit the registry and
re-render with `node scripts/render-agent-rules-gates.mjs --write`; editing the
block by hand makes `--check` exit nonzero, and the `gates` workflow runs that
command as a step on BOTH CI events, so a hand edit fails the build. This
replaces the hand-maintained list that line 3 of this file promised the
registry would take over.

**R-094 is PARTIALLY delivered, and the half that is not is stated here rather
than left to be discovered.** The briefs half is done: this section is
generated. The CI half is not: `scripts/m2-exit-test.sh` invokes the gate
runner with `--manifest gates.manifest.json` on both arms and `--registry`
occurs nowhere in it or in the workflow, so a gate declared only in the
registry does not run in CI. `agent-rules-drift` is that case and runs only
because the workflow carries a direct step for it. `test/gate-registry.test.ts`
asserts the divergence in both directions, so a new registry-only script gate
reddens rather than silently not running. Closing it is an edit to
`scripts/m2-exit-test.sh` and is tracked with the orchestrator.

<!-- BEGIN GENERATED GATE LIST: rendered from gate-registry.yaml by scripts/render-agent-rules-gates.mjs. Do not edit by hand; edit the registry. -->

Every change must pass these, in order:

1. `npm ci` (install exactly the lockfile, npm only, never pnpm or yarn)
2. `npm run build` (the type gate (tsc -b); emits dist/, which is never committed, and git status must be clean afterwards)
3. `node --test` (sources are TypeScript run natively via Node type stripping, so the suite needs no prior build)

Then the registry's gates, run by `tiphys gates run --registry gate-registry.yaml --mode <mode>`:

| Gate | Verified by | Applicability | Modes | CI events | One unit is |
|---|---|---|---|---|---|
| `manifest-self-check` | script | required | full, direct-pr, local-only | pull_request, push | schema documents validated |
| `coverage` | script | required | full, direct-pr | pull_request, push | finding ids checked |
| `credential-scrub` | script | required | full, direct-pr, local-only | pull_request, push | credential sources probed |
| `credential-token` | script | conditional | full, direct-pr | pull_request | tokens probed |
| `suite` | script | required | full, direct-pr, local-only | pull_request, push | tests reported |
| `citations` | script | required | full, direct-pr | pull_request | citations resolved |
| `scope` | script | required | full, direct-pr | pull_request | changed paths audited |
| `deploy` | script | conditional | full | pull_request, push | release verifications satisfied |
| `migrations` | script | conditional | full | pull_request, push | migrations compared |
| `clause-map` | script | required | full, direct-pr | pull_request | clause-map rows checked |
| `red-witness` | script | required | full, direct-pr | pull_request | witnesses evaluated |
| `agent-rules-drift` | script | required | full, direct-pr, local-only | pull_request, push | rendered gate rows compared |
| `unit-tests-for-changed-service-methods` | clean-room-checklist (probe `unit-tests-for-changed-service-methods`) | conditional | full, direct-pr | pull_request | changed service methods checked |
| `fixtures-for-changed-component-states` | clean-room-checklist (probe `fixtures-for-changed-component-states`) | conditional | full, direct-pr | pull_request | changed component states checked |

<!-- END GENERATED GATE LIST -->

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

## Branch names are load-bearing, not labels (binding)

The scope auditor derives a phase id from the BRANCH NAME. Any branch matching
`^claude/m[0-9]+-p[0-9]+-` is treated as that phase's one branch: the gate
reads `delivery/plan/phase-declarations/<phase-id>.json` from the MERGE BASE
and requires the declaration's own `branch` field to equal the current branch.

So a non-phase branch named after the phase it relates to is not a naming
preference, it is a red gate. Two shapes, both measured on 2026-08-08:

- `claude/m3-p1-prereqs` (a prerequisites branch) derived phase `m3-p1` and
  looked for a declaration that the branch itself was adding. The check could
  never pass.
- `claude/m3-p1-reviews` (a review-evidence branch) derived `m3-p1`, found the
  declaration, and errored because the declaration's branch is
  `claude/m3-p1-schemas-and-validator`.

**Rule: only the phase's own implementation branch may match that pattern.**
Every other branch (prerequisites, review evidence, paperwork, harness fixes)
puts the phase id somewhere the pattern cannot match, for example
`claude/reviews-m3-p1` or `claude/m3-prereqs-<slug>`.

This entry exists because the orchestrator made the same mistake TWICE in one
session, the second time within an hour of fixing the first, which is the exact
shape tuition T-005 and T-006 record: a rule that depends on remembering does
not survive a busy session, and the answer is a written mechanism. Check the
name before pushing:

```
node -e 'console.log(/^claude\/m[0-9]+-p[0-9]+-/.test(process.argv[1]))' <branch>
```

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
- `A-n` owner ACTIONS: things only the owner can perform because they need
  access an agent does not hold. Distinct from `DR-nnnn`, which is a CHOICE.
  **`delivery/STATE.md` is the sole allocator**, and its "Owner action items"
  section is the register; a plan that needs a new action asks for an id
  rather than picking one. This entry exists because the namespace was
  unregistered and collided: `A-4` meant the npm publish credential in the M3
  plan and branch deletion in STATE.md, while `A-3` meant three different
  things, one of them a literal string inside `gates.manifest.json` on `main`
  (`implementer-token-present-owner-action-a-3`). A shipped configuration
  string is why an id here is not free to renumber, so allocate a fresh id and
  never reuse a retired one.

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
