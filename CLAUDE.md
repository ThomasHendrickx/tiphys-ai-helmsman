# Tiphys kernel: repository rules

The binding rules for working in this repository. Current rules only: the
incidents behind them are in git history, `delivery/tuition/` and
`delivery/decisions/`, cited where a rule needs its reason.

Read this file first. Then, for the task you are about to do, read the
matching skill in `.claude/skills/`. To prepare the environment, run
`bash scripts/setup-env.sh` (full clone, Node at the `engines.node` floor,
`npm ci` when needed, `npm run build`); cloud sessions run it from the
SessionStart hook in `.claude/settings.json`.

## What this repository is

Tiphys is a delivery-process kernel: a versioned npm package that runs
orchestrated delivery for other projects. It is built by the orchestrated
delivery process it implements.

The governing documents, in precedence order:

1. `delivery/intake/orchestrated-delivery-process.md`, the process being run.
2. The owner-approved plan in `delivery/plan/` (`kernel-plan-v1.md` and the
   milestone plans after it, currently `m6-review-and-rule-economy.md`). If it
   is not written there, it is not being made. Unanswered questions go to the
   orchestrator, and from the orchestrator to the owner.
3. `delivery/decisions/`, owner decision records. A decided record is settled
   and is never reopened by an agent.
4. This file.

## Durability rule

All truth lives in files and git; a session's conversation memory is a cache.
Anything below must be a committed file before the producing session ends. A
finding reported only in chat is lost.

| What | Where | When |
|---|---|---|
| Where the pipeline currently stands | `delivery/STATE.md` | whenever a phase, decision, or owner action changes state |
| Owner decision, asked or answered | `delivery/decisions/DR-nnnn-<slug>.md` | when raised, updated when decided |
| Plan and every revision | `delivery/plan/` | before dispatch of anything it governs |
| Requirements extraction | `delivery/requirements/` | before the plan cites it |
| Review of a plan | `delivery/review/plan-review-<round>.md` | before findings are applied |
| Review of a PR | `delivery/review/<phase-id>-<contract>.json`, valid against `schemas/verdict.schema.json` | before merge |
| Verification of a fix round | `delivery/review/verification-<phase>-fix-round.md` | before merge |
| Investigation of a mystery | `delivery/verification/<subject>.md` | before the question is called settled |
| What an implementer did and why | `delivery/work-history/<phase>.md` | in the phase branch, before the PR |
| A failure mode worth not repeating | `delivery/tuition/T-nnn-<slug>.md` | when discovered, not at the end |

Evidence beats assertion: exit codes, counts, paths with line numbers,
captured output, URLs. A claim with no verifiable artifact is unknown.

## Where things live

- `delivery/` is the build's own paperwork. Not shipped, not a deliverable.
- `src/`, `bin/`, `test/` are the kernel itself.
- `schemas/`, `roles/`, `tuition/`, `templates/`, `checklists/` at the root
  are SHIPPED kernel deliverables. Extend them through the phase that owns
  them, never casually. The root `tuition/` is the cross-project tuition feed;
  `delivery/tuition/` is this build's own failure log.
- `.claude/` is harness configuration for the current process (skills,
  orchestrator scripts, the SessionStart hook). Not a kernel deliverable, and
  not the same thing as the role briefs in `roles/`.

## Binding conventions

1. English only.
2. npm only, never pnpm or yarn.
3. No em dashes in authored text. Authored files are pure ASCII and free of
   control characters; check with `node scripts/check-authored-bytes.mjs`
   (it refuses a dirty tree, so run it after committing). Control characters
   a test needs as data are written as escapes, never as literal bytes. Two
   path-scoped exemptions: `delivery/intake/orchestrated-delivery-process.md`
   (owner input, never transliterated) and vendored fixtures such as
   `test/fixtures/json-schema-test-suite/**`
   (delivery/tuition/T-010-the-control-character-check-could-not-see-nul.md:1).
   **Captured output with non-ASCII glyphs** (Node's test reporter prints
   U+2139 and U+2716): never hand-write the output to avoid them. Transliterate
   and DECLARE it: name each codepoint replaced, its replacement, and how many
   of each, and state that nothing else was changed. Silent transliteration is
   indistinguishable from fabricated evidence.
4. Acceptance criteria are tests (DR-0064): each criterion names the test(s)
   or command that proves it (`check`). A criterion that cannot be a test is
   marked `not-testable: <reason>` and goes to the hazard reviewer's brief.
   "Works correctly" is never a criterion.
5. One phase = one branch = one PR. Phases may run concurrently only where a
   pre-pass, written down before dispatch, proves them disjoint (DR-0011);
   merge order is always dependency order. Shared registries
   (`test/behaviors.json` and the like) are append-only and resolved as a
   union against the merge base. **A test over an append-only registry
   asserts BY NAME, never BY COUNT and never on one row's presence**: a count
   is a claim about every future phase. Derive counts at run time. A phase
   that extends a registry may have to edit the test that over-asserts on it.
6. Milestone exit tests are hard gates: no milestone starts before the
   previous exit test has passed with recorded evidence.
7. Commit messages carry no AI model or tool names.

## Gates

`gate-registry.yaml` is the only gate list; each gate states what it
`prevents` (DR-0061). Every change passes `npm ci`, `npm run build` and
`npm test`, then the registry, exactly as CI runs it on each event:

```
node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
  --event <pull_request|push> --evidence <dir> --base <sha> --head <sha> [--phase <id>]
```

Use `--only <gate>` to run one gate locally. A phase is not done until every
acceptance criterion's `check` passes (or is `not-testable` with a reason),
the scope audit passes (changed files are on the phase's files-to-touch list,
plus `test/behaviors.json` and the phase work history, the two standing
extras), and every new behavior is registered in `test/behaviors.json` and
resolves by name.

## Red-witness rule

A test guards a behavior only if it has been shown red without the behavior
and green with it. This applies to fix-round tests too.

- **Red against the DANGEROUS state**, not merely the absent feature. A test
  of a destroy on a branch carrying nothing, or of a concurrency path where no
  contention can occur, is green and worthless
  (delivery/tuition/T-003-fix-rounds-need-verification.md:1).
- **Real captured output**: where the behavior consumes another program's
  output, assert on real captured output from that program, never
  hand-written strings chosen to match the implementation.
- **One witness is not a class**: a witness for a class must redden under at
  least TWO structurally different members of it.
- A changed `src/` or `bin/` file needs a witness spec under `witness/`
  (the `red-witness` gate). Removals owe no witness (DR-0061).

## Fix-round contract

A fix round is not done, and a work history is not acceptable, without all
three:

1. **Name the MECHANISM, not the finding.** "A FIFO at the beacon hangs the
   guard" is a finding; "reading a path whose type has not been established"
   is the mechanism. The round fixes the mechanism.
2. **Publish the derivation**: the exact command that enumerates every call
   site of the mechanism, and its full output, not a summary.
3. **State what the derivation did NOT cover**: the regions excluded, and
   why. A wrongly scoped search returns an empty result indistinguishable
   from an absence of defects.

**The reviewer's FIRST check is item 3.** An orchestrator-side hotfix to
shared harness code is a fix round too and owes the same contract.

**The claim grep.** Before submitting any work history, run:

```
grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/<phase>.md
```

Every hit carries an adjacent captured command that settles it, or is restated
as an open question. "I did not find a way to force this arm" is true; "this
arm cannot be forced" is a claim
(delivery/tuition/T-006-unexecuted-claims-about-the-world.md:1). The command is
line-based and prose is hard-wrapped, so a multi-word phrase split across a
line break escapes it. Also run the wrap-insensitive form and compare:

```
tr '\n' ' ' < delivery/work-history/<phase>.md \
  | grep -oEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to'
```

## Dispatch contract: no agent without a beacon and a guard

A dead process sends no notification, so waiting for a completion
notification is process liveness, which constraint C-2 forbids
(delivery/tuition/T-008-the-orchestrator-had-no-beacon.md:1). Binding on
every dispatch:

1. **Every dispatched agent writes its output INCREMENTALLY**: it creates its
   artifact within the first minutes and appends as it works. The file's
   mtime is its beacon, and a death leaves a partial result.
2. **A freshness watchdog is armed in the SAME TURN as the dispatch.** It
   watches the newest mtime under every path the agent writes and reports
   stale after a threshold. It tests FRESHNESS, never existence and never
   completion.
3. **The watchdog expires, and re-arming it is part of the rule.** Read the
   timeout the tool reports it used, not the one you asked for. Track monitor
   lifetime: treat a monitor older than its reported timeout as expired and
   re-arm it without waiting for a notice, because the timeout notice does not
   always arrive and an expired monitor looks like a quiet system.

Answer in writing in the dispatch turn, before arming:

1. **Where does this agent write? MEASURE it, do not predict it**, and
   re-measure at every stale reading; agents create directories no brief
   names. Watch the union, plus `/tmp` scratch used by gate runs:

   ```
   find "$SCRATCHPAD" -maxdepth 1 -printf '%T@ %y %p\n' | sort -rn | head -15
   ```

2. **What is the baseline?** Dispatch time on a first arm, never an inherited
   mtime; on a re-arm, the newest existing write.
3. **What does silence mean?** Say which of "dead", "in a long run" and
   "finished" the watchdog can tell apart, and label its output accordingly.

Isolation (delivery/tuition/T-026-worktree-isolation-needs-a-git-cwd-and-fails-instantly-without-one.md:1):

- **Isolate EVERY dispatched implementer in its own worktree**, including
  those that only write documents; an agent told to commit on its own branch
  creates that branch wherever it stands.
- **The orchestrator takes its own worktree before dispatching**:
  `git worktree add -f <scratch>/orch <orchestrator-branch>`.
- **Exclude the orchestrator's own worktrees from any agent watchdog**; a
  watchdog that cannot go red is trusted and worse than none
  (delivery/tuition/T-014-the-watchdog-watched-the-wrong-place-six-times.md:1).
  If an agent is not isolated, watch its path too and say which agents the
  watchdog covers.

## Green is scoped to the run that produced it

A gate result is evidence only for the configuration it ran under
(delivery/tuition/T-009-green-on-the-wrong-event.md:1). "CI is green" is never
a complete sentence: name the event and the head sha. The `pull_request` and
`push` events select different gates from the registry.

1. **A merge is complete only when the post-merge `push` run on the new
   `main` head is observed to completion and green**, with the same watchdog
   discipline as a dispatch.
2. **Where behavior forks on the CI event, BOTH arms need a witness.**

**Merging quickly cancels post-merge runs.** `.github/workflows/gates.yml`
uses `group: gates-${{ github.ref }}` with `cancel-in-progress: true`, so
merge N+1 cancels the running `push` run for head N. A cancelled run is
neither red nor green. Do not re-run it and do not report red: verify the
CURRENT `main` head's push run to completion (`main` is cumulative, so it
exercises head N's changes; it says nothing about the intermediate tree at
head N, which is an accepted trade) and say in the evidence that head N's
run was cancelled by head N+1. Waiting for each push run before the next
merge also works and costs a CI cycle per merge; pick one and say which.

**A green bundle is not evidence that a particular gate asserted anything.**
Quote the gate's own row: the runner prints one `gates: <id>: <status>:
<detail>` line per gate, and the job uploads `summary.json` (artifact
`gates-summary-<pull-request|push>-attempt-<n>`, 7-day retention), whose
`gates[]` row carries the gate's `status`, `units`, `applicable` and
`vacuous`. Say which half of a claim is observed and which is deduced.

## Branch names are load-bearing

The scope gate derives a phase id from the branch name. A branch matching
`^claude/m[0-9]+-p[0-9]+-` is that phase's one branch: the gate reads
`delivery/plan/phase-declarations/<phase-id>.json` and requires its `branch`
field to equal the current branch. **Only the phase's own implementation
branch may match the pattern.** Every other branch (prerequisites, reviews,
paperwork, harness fixes) puts the phase id where the pattern cannot match,
for example `claude/reviews-m3-p1`. Check before pushing:

```
node -e 'console.log(/^claude\/m[0-9]+-p[0-9]+-/.test(process.argv[1]))' <branch>
```

## Identifier schemes

Stable ids, never renumbered, cited across documents. **A retired id is never
reused in ANY scheme**: deletion does not free it, because the documents that
discuss the retirement still cite it
(delivery/tuition/T-039-two-tuition-ids-each-carried-two-different-entries.md:1).
Before allocating, run:

```
node scripts/check-id-collisions.mjs
```

Exit 0 means no live collision; exit 1 names every colliding file. It reads
all of history and prints the next free `T-nnn` and `DR-nnnn`. For the schemes
that live inside documents, search all history with the prefix changed:

```
git log --all --oneline -- 'delivery/decisions/DR-nnnn*'
git log --all --oneline -S'DR-nnnn'
```

The schemes:

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
- `A-n` owner ACTIONS: things only the owner can do because they need access
  an agent does not hold (a `DR-nnnn` is a CHOICE). **`delivery/STATE.md` is
  the sole allocator**; its "Owner action items" section is the register. A
  plan that needs one asks for an id rather than picking one.

## Delivery protocol

One phase, one branch, one PR, branch names from the plan. The orchestrator
never writes feature code and never lets a review be skipped; implementers
never open PRs and never merge. The procedure is
`.claude/skills/phase-delivery/SKILL.md`; read it before dispatching or
implementing a phase.

**When to involve the owner (DR-0016).** Escalate ONLY when two or more
options are genuinely comparable AND the consequence is high impact and
costly to reverse. If you would defend a recommendation, there is nothing to
ask: decide, record it as a decision record with its reasoning, and report
it. Write the recommendation first; that reveals whether it was a question.
Anything needing access an agent does not hold, and milestone exit-test
evidence, still go to the owner.

**Review and merge.** Merge authority is delegated to the orchestrator
(DR-0012) under these conditions, as narrowed by DR-0062, DR-0063 and DR-0064:

- **The review tier follows the diff (DR-0063).** `pair` when the diff touches
  the runtime set (`src/`, `bin/`, `plugin/`, `schemas/`, and `package.json`,
  `package-lock.json` or `plugin/package.json` when a non-version key
  changes): two hazard reviews on distinct observed model families, or under
  the declared single-vendor exception (`review-families` in `charter.yaml`,
  DR-0038); the orchestrator arbitrates disagreements with evidence; an
  unresolved high or medium blocks. `single` for everything else: one hazard
  review on the cheaper tier, no arbitration, one fix round, and a finding
  blocks only if it makes a shipped artefact wrong. Every change is reviewed.
- **The kernel launches reviewers (DR-0062).** Review count, reviewed head and
  model family come from kernel records, never from fields a reviewer writes;
  a review the kernel did not launch does not count toward the pair.
- CI green on the exact head being merged, and the scope audit passing.
- **Stop rather than grind.** When a phase needs more than two fix rounds, or
  a high-severity finding recurs in one component, dispatch a fresh
  implementer plus another review at once and notify the owner
  asynchronously; only if that round also fails does the phase go to the
  owner. Something different must happen.

Read `delivery/decisions/DR-0012-delegated-merge-authority.md` before merging;
it records the limits the orchestrator holds itself to.

## A commit, a pull request and a CI run are three different things (DR-0031)

1. **A commit is a unit of work.**
2. **A pull request is a unit of self-contained value and carries ALL its
   evidence**: the code, the work history, the reviews, any arbitration and
   verification. Do not split a phase's evidence into its own pull request,
   and batch process paperwork rather than one PR per file.
3. **CI enforces that `main` stays green; it is not how you find out.**
   Establish green locally first, on the union: merge `main` in and run the
   gates. If CI tells you something you did not know locally, fix the local
   procedure. Genuinely CI-only: the macOS smoke job and the M1 exit test in
   full mode.

`main` is the record of work actually done: evidence about an abandoned phase
stays with its branch. Check both directions before opening a PR: it must not
carry code it is not delivering, nor evidence about code that has not landed
(delivery/tuition/T-019-a-verification-branch-carried-the-code-it-was-verifying.md:1).

Scope declarations: a new phase's declaration FILE must exist at the merge
base before its branch is created (the scope gate is red otherwise). ENTRIES
added to a declaration on the phase branch are allowed and printed by name for
the reviewer; a removal is refused. So a declaration grant lands with the
phase that needs it.

## Standing environment warnings

`scripts/setup-env.sh` fixes the clone depth, the Node floor and the build.
What it cannot fix is below. The numbers are stable ids cited from `src/`,
`test/` and `scripts/`: 1 is retired (the toolchain is the script's job) and
never reused.

**2. `typescript` is pinned exact; keep `"types": ["node"]` in both
tsconfigs.**

**3. `*.tsbuildinfo` is gitignored**, and `git status` is clean after a build.

**4. Import a `src` module from `test/` with the computed-URL dynamic import
pattern** in `test/doctor.test.ts`; a literal relative import fails the build
with TS2878.

**5. Tests that create scratch git repositories set command-scoped
`GIT_AUTHOR_*` and `GIT_COMMITTER_*`**; CI runners have no identity and tests
never touch user or global config.

**6. `gh` is absent here and present in CI**, so tests use a deterministic
gh-free PATH. GitHub REST reachability is probed per session, not assumed
either way (the agent proxy supplies credentials; the value of `GH_TOKEN` is
irrelevant). The GitHub MCP tools are a working path. A CI watcher writes its
failure arm first: one that turns an error into silence cannot go red.

**7. `--test-name-pattern` must precede the positional test path**, or it is
silently ignored.

**8. `git checkout -- <path>` is destructive** in a tree holding uncommitted
work, including a single path. There is no safe narrow form: commit or copy
out of the tree first.

**9. `-C` changes where git resolves, not where your shell is.** `git -C
<repo> worktree add <relative>` and `git remote set-url` resolve relative
paths against the repository. Pass absolute paths. `git worktree list` finds
a stray worktree; `git worktree remove --force` removes it.

**10. Derive an error signature from real captured output** under forced
conditions, never from a hand-written example: the transient error of two git
operations contending on one clone names a ref, not a lock file (T-003).

**11. Suite wall time grows with real-clock lease waits.** Budget harness
timeouts for them; never shorten the waits.

**12. A suite result names its toolchain, build state and invocation**, and
quotes the skipped count: "N tests, N pass, 0 fail, 0 skipped" from `npm test`
on node vX with `dist/` built. Tests that need `dist/` skip when it is absent
and the run still exits 0; bare `node --test` also picks up `sandbox/test/`,
which `npm test` does not. **The default toolchain can FAIL a floor-dependent
test** that CI passes: a red there is not proof of a red branch, so establish
the base's result on the same interpreter before blaming your change. New
floor-dependent tests are floor-gated like those in `test/doctor.test.ts`.

**13. `git diff main..branch` is not a merge preview**: on a branch behind
`main` it shows `main`'s additions as deletions. Use `git diff main...branch`
for the branch's own changes and `git merge-tree --write-tree main <branch>`
for the merge result.

**14. `git push --dry-run` does not probe authorization**, for any ref. Only
`refs/heads/*` is pushable from this container. **Deleting a remote branch is
an OWNER action**: do not attempt it; ask for an `A-n` id.

**15. A toolchain must sit where an unprivileged uid can traverse it**; some
tests run `process.execPath` as one. A private `$HOME` is not such a place.

## The orchestrator does not decide when it is finished

A stop is computed, never judged. `.claude/orchestrator-next.mjs` derives the
next action from git and files, prints what it cannot see (open PRs, CI
conclusions, post-merge push runs), and **exits nonzero whenever work
remains**. A server-side hourly Routine re-creates the in-memory 20-minute
kick if it is missing, because in-memory jobs die with the session. **None of
these is a reason to stop**: having just answered the owner, having written a
status report, a subagent being in flight (verify its beacon and keep
working), or something looking blocked (name the blocker in one line and do
everything that is not blocked).

## Agent concurrency (DR-0044)

One workflow in flight, two agents at a time
(delivery/decisions/DR-0044-two-agents-in-parallel-is-enough.md:1). Do not
open a second workflow to get around the cap; check that nothing else is
running and queue rather than launch. **Before dispatching, state in writing:
how many agents, in how many workflows, therefore how many run at once (never
more than 2), and a token estimate** (a clean-room review costs 150,000 to
490,000 subagent tokens, a fix round 115,000 to 400,000). Read the number the
tool reports, not the one you passed. Write the dispatch script once with an
args filter so one script serves every slice. Model choice is per agent;
review stages benefit from a different family than the stage they review.

## Reporting to the owner

The owner's screen is for DECISIONS, not a log of the work; everything else
goes in a committed file. Surface exactly four things:

1. A decision the owner must take, with the options and a recommendation.
2. An action only the owner can perform. **Verify it is not already done
   before asking.**
3. A finished result.
4. A blocker, in one line, naming what is blocked and by what.

Do NOT surface progress narration, which agents are running, what is being
measured, the reasoning behind a recommendation already given, or a
restatement of what was just decided. **Plain language**: short sentences, one
idea per sentence, no nested clauses, ordinary words. This binds owner-facing
text only; work histories, reviews and decision records keep their register.

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
