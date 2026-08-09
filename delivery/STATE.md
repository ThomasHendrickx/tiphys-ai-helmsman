# Pipeline state

The single place that answers "where are we right now". Update it whenever
a phase changes state, a decision is answered, or an owner action becomes
runnable. If this file disagrees with reality, reality wins and this file
is wrong: verify against git and the PR list before trusting it.

- as of: 2026-08-09
- main head: `a8d7016` (PR #65, the M3 paperwork batch carrying tuition T-012
  and T-013 and the round-8 arbitration), and its T-009 arm is DISCHARGED: the
  post-merge push run completed with job success AND its `M2 exit test (push)`
  step success, checked as the step rather than inferred from the run. Before
  it, `5f0b1e4` (PR #66, the round-7 delta verification) is discharged the same
  way. Before that, `d718221` (PR #64, the A2 review evidence
  and arbitration): run 31336255684 step 9 success,
  step 8 `M2 exit test (pull request)` correctly skipped, step 10 self-test
  guard success. Before that, `ae674b6` (PR #63, the owner's DR-0022 answer):
  run 31334452662 step 9 success, step 8 correctly skipped, step 10 success.
  And `3c60acb`: run 31331023369 completed success.
  Earlier discharged heads, by STEP rather than run conclusion: `1a683fe`
  (31307121695 step 9 `M2 exit test (push)` success, step 8 correctly
  skipped), `a9ab9bd` (31305337415), `1d5cca5` (31301155195), `826f27d`
  (31298592287). T-009's rule is that a merge is not complete until the
  post-merge push run on the NEW tip is observed, and "the run was green" is
  not that observation; the arm is.
- milestone: **M3 (judgment layer), IN PROGRESS.** M3-P1 and M3-P2 are MERGED.
  M3-P3 is at `218fc12` on its branch (PR #54), round 6, executing the owner's
  DR-0022 answer (option A2). It is under DUAL clean-room review of that head:
  the supply-chain and regression contract returned APPROVE with zero findings
  and is recorded in `delivery/review/clean-room-m3-p3-a2-supply-chain.md`
  (PR #64); the correctness contract is still running. M3-P4 to M3-P10 are not
  dispatched and are blocked strictly behind P3, because M3 is a serial chain
  with no conflict pre-pass. M2 COMPLETE including its post-exit-test fix
  round; M1 complete, exit test passed on `7e1b5f1`, completion record merged
  in PR #10 at `037477e`.
- plan: `delivery/plan/kernel-plan-v1.md` revision 7, owner-approved
- assurance mode: full (adversarial pipeline). Merge authority is DELEGATED
  to the orchestrator under DR-0012, conditional on dual cross-model clean
  review, and DR-0015 extends that to milestone boundaries too: the owner is
  not an approval step anywhere in execution. Exit tests remain HARD GATES and
  their evidence is presented to the owner regardless, which is a reporting
  obligation and not a click.

## The M1 hard stop: DISCHARGED 2026-08-06

The owner confirmed at the boundary, changed the session model, and instructed
M2 to start with maximum safe parallelism and deterministic supervision of
subagents (beacons plus freshness watchdogs per the T-008 dispatch contract).
The stop is kept here as history because a future session should see that it
existed and that it was released by the owner, not optimised away.

## How to resume cold

1. Read `CLAUDE.md`, then this file.
2. `git fetch origin main` and check what is actually merged.
3. Check open PRs and their CI state.
4. Read the newest files in `delivery/review/` and `delivery/tuition/`;
   they carry the most recent hard-won knowledge.
5. Pick up from the "in flight" section below, using the
   `phase-delivery` skill.

## Phases

| Phase | State | PR | Notes |
|---|---|---|---|
| M1-P1 scaffold and CI | merged | #1 | npm scaffold, TypeScript build chain, gates workflow |
| M1-P2 fleet init and doctor | merged | #2 | init as private git repo, doctor with readiness profiles |
| M1-P3 lock and pool | merged | #3 | lease lock, worktree pool; concurrency hardening deferred to M5 |
| M1-P4 spawn and teardown | merged | #6 | carry the criterion-13 meta.json baseOffline clause and P3's holder-identity transport into the brief |
| M1-P5 watcher and liveness | merged | #8 | four fix rounds; class closed for guard, watcher and doctor, not for lock, pool and brief |
| M1-P6 toy sandbox and exit test | merged | #9 | four fix rounds, five review passes; exit test PASSED on the merged head with a falsification control |
| M2-P1 gate contract and runner | merged | #11 | squash `8718852` on head `4811d2e`, 2026-08-06. Three fix rounds; DR-0016's fresh-implementer response fired after round 3 and closed CR-900 at the mechanism in one round. Final clean: derivation audit (Opus) APPROVE plus criteria regression (Sonnet) APPROVE CR-960, CI green on the exact head. Arbitration: `delivery/review/arbitration-m2-p1-round4.md` |
| M2-P6 coverage checker | merged | #14 | `arbitration-m2-p6.md` |
| M2-P5 citation linter | merged | #15 | `arbitration-m2-p5-round2.md` |
| M2-P4 scope auditor | merged | #16 | `arbitration-m2-p4-round2.md` |
| M2-P3 suite wrapper | merged | #19 | `arbitration-m2-p3-round3.md` |
| M2-P7 release verifiers | merged | #20 | `arbitration-m2-p7-round2.md` |
| M2-P8 credential scoping | merged | #21 | `arbitration-m2-p8-round2.md` |
| M2-P2 red-witness harness | merged | #22 | `arbitration-m2-p2-round3.md` |
| M2-P9 exit-test harness | merged | #25 | two fix rounds (DR-0018 semantics; scope detached-HEAD HIGH); dual delta APPROVE at `fbdcc47`; `arbitration-m2-p9.md` |

## In flight

**M2 is COMPLETE (2026-08-07), including its post-exit-test fix round.** All
nine phases merged at `9bb379b`; `main` is now `50bcecb` and carries the full
10-gate set (manifest-self-check, red-witness, suite, scope, citations,
coverage, deploy, migrations, credential-scrub, credential-token) and the exit
harness as the single caller of `gates run` in the single-job CI (DR-0017). The
M2 exit test PASSED with recorded evidence at `delivery/evidence/m2-exit-test/`;
the PR bundle counts (6 green, 4 not-applicable, 0 red, 0 error, 0 vacuous) are
recorded at delivery/evidence/m2-exit-test/pr-bundle.summary.json:128-136;
per-phase green demonstrated; `--self-test` fails both fixtures. Presented to
the owner unasked (DR-0015).

CI decision this milestone: **DR-0017** collapsed CI to a single job named
`gates` after the two-job fan-in starved on runner acquisition. **DR-0018** set
the exit-test semantics for src-scoped gates (accept not-applicable-with-reason
on the exit head, plus per-phase green evidence).

### Post-exit-test fix round, 2026-08-07 (#26 to #32)

The exit test passing did NOT leave `main` green. Seven pull requests landed
after `9bb379b`, and the reason they were needed is itself the milestone's most
expensive lesson (tuition T-009). Recorded here because five of the seven have
no other `delivery/` record and would otherwise exist only in `git log`.

| PR | head on main | what it fixed |
|---|---|---|
| #26 | `8cadeac` | real-clock test flakes: liveness exact-age bands, watcher duplicate-not-drop |
| #27 | `f2df10a` | exit harness required scope green on non-phase PR branches; `resolve_scope_expect` added |
| #28 | `d6a0057` | citations gate scoped to forward-claiming docs, not the historical record; `delivery/work-history/m2-citations-scope.md` carries the 139-reason measurement and the config/manifest two-halves rule |
| #29 | `5f9b058` | M2 paperwork batch: phase arbitrations, clean-room reviews, STATE M2-complete |
| #30 | `4515b48` | the main exit-test bundle must not require a phase |
| #32 | `8fc2fa7` | citations gate: the content-dependent not-applicable arm names its own precondition |
| #31 | `50bcecb` | tuition T-009 and its binding rules in CLAUDE.md |

**`main` was RED for four hours and twenty-one minutes** across five
consecutive `push` runs (`9bb379b`, `f2df10a`, `8cadeac`, `d6a0057`,
`5f9b058`) while every `pull_request` check was green, and four more PRs were
merged onto it before the OWNER surfaced it. Cause: the `gates` workflow runs
different bundles per event, and the exit harness derived `--phase`
unconditionally, so only the `push` arm could reach the failure. Full account,
evidence and the binding consequences: `delivery/tuition/T-009-green-on-the-wrong-event.md`.
The rule that came out of it is in CLAUDE.md and is not optional: **a merge is
not complete until the post-merge `push` run on the new `main` head is observed
green.** Both #32 and #31 were closed that way.

**Merge-authority exception on #32, recorded rather than left silent.** #32
changes `src/` and `test/`, so DR-0012 requires two independent cross-model
clean-room reviews before merge. It was merged WITHOUT them, on the owner's
direct instruction, given during the session and with an explicit constraint
not to spend further time. DR-0012's delegation exists for owner
UNAVAILABILITY; the owner was present and directing, which is why this is an
owner decision overriding the delegation rather than the orchestrator
softening it. Recorded in the squash commit body and here. The change is small
and reviewable after the fact if the owner wants that.

## M3, in progress (2026-08-08)

**The M3 plan is ON `main` at revision 3** (PR #36), reviewed and delta-approved
as fit to dispatch M3-P1 from. Getting there: revision 2 was a DRAFT whose own
status line said the re-grounding was the step BEFORE adversarial review round
2, and round 2 had never run. Two cross-model reviewers with different lenses
both returned CHANGES REQUIRED (20 findings, 10 high) and both independently
found the same defect, the exit test's "CI is green on `main`", which is the
exact incomplete sentence T-009 was written to ban. The arbitration reduced 20
findings to 4 mechanisms; the primary one was that the plan had been grounded
on a PREDICTION of M2 taken from the M2 plan while that plan was DRAFT. Reading
M2 as delivered found three of the first five joints mis-specified, including
that CI is ONE job under DR-0017 rather than the two-job fan-in the plan
modelled and bound five phases to.

| Item | State |
|---|---|
| M3 plan revision 3 + review chain | merged, #36 |
| A-n namespace registered | merged, #35 |
| M3 prerequisites (ten phase declarations, witness clone, citations arm A) | merged, #38 |
| M3-P1 schemas and validator | MERGED #39 |
| M3-P2 canonical gate registry | MERGED #48 |
| M3-P3 assurance modes | PR #54 open, round 7 in flight on `218fc12` after CHANGES REQUIRED |
| A2 review evidence and arbitration | PR #64 open |
| M3-P4 to M3-P10 | not dispatched |

### M3-P3 status, 2026-08-09

Dual clean-room review of `7b3afbf` (criteria and hazard lenses, different model
families) returned CHANGES REQUIRED from both: ten findings, four high, no
disagreements. Arbitration in `delivery/review/arbitration-m3-p3.md`.

Two fix rounds closed the four mechanisms, each verified by the orchestrator
re-running the reviewers' own exploits rather than reading the reports.
Independent delta verification then found one MEDIUM plus two low in
`quotableUnits()`, the helper round 2 introduced.

**A medium blocks merge under DR-0012 condition 2**, and two fix rounds is the
limit, so **DR-0016 applied**: a FRESH implementer and a THIRD review contract
were dispatched immediately rather than the phase waiting on the owner. Both
have reported.

The third contract was given the CONSUMER LENS, a framing neither earlier
reviewer had: it built a scratch consuming project outside this repository and
pointed the shipped tools at it, which both earlier reviews had recorded under
their own non-coverage as undone. **It found two highs neither of them found**,
and they are decided in `delivery/decisions/DR-0020-closed-vocabulary-at-v0-1-0.md`
rather than fixed: the vocabularies ship CLOSED at v0.1.0, because widening a
closed enum later is backward compatible while closing an open one later is
breaking. That decision is ORCHESTRATOR-made under DR-0016 and DR-0015, is
reported to the owner unasked, and is reversible by the owner.

Round 3 (the fresh implementer) replaced the line-scanning extractor with a
block-state machine, and the mechanism predicted two shapes nobody had named
(indented code blocks and tilde fences), both of which were real.

**Rounds 3, 4 and 5 then each produced a new defect in the same function**, all
three found by independent delta verification and none by a gate: V-1 (list-item
continuation admitted as its own unit), V-4 (four more unconditional `flush()`
sites, the same mechanism one level up), and V-5, which was a REGRESSION, a shape
round 4 had correct and round 5 broke. Five rounds, five defects, one function.
Round 5 is the one that settled it, because it satisfied the whole fix-round
contract (nine call sites enumerated with four search keys, closure argued, each
site ruled on individually) and regressed anyway. That is evidence about the
SHAPE of the work, not about the care of five agents.

**Escalated to the owner as DR-0022, and DECIDED: option A2.** Rather than argue
the three options, all three were prototyped and measured on a throwaway branch
(`delivery/review/dr-0022-option-evidence.md`): a 40-shape exploit set with
ground truth from `commonmark` 0.31.2 cross-checked against a structurally
independent second parser, then 15,000 generated documents adjudicated only where
both oracles agree. The current implementation scores 35.3 per cent, A2 scores
100. The prototype also REFUTED the orchestrator's own recommendation: plain
option A walks the parser's AST, which reads inline text and strips markup, and
that breaks DR-0012's condition 0 on eleven of nineteen records. Only A2, which
slices the ORIGINAL SOURCE by `sourcepos` offsets, is byte-identical, and that is
now a falsifiable acceptance criterion so an implementer cannot pass without it.

**Round 6 executed A2 at `218fc12` (PR #54) and its dual review is COMPLETE.**
Supply chain and regression: APPROVE, zero findings (`commonmark` pinned exact,
+4 packages, 920,729 B, BSD-2 and MIT, depth 2; no `fs`, `net`, `child_process`
or `eval` on the reachable chain; `test/behaviors.json` strictly append-only, 30
additions and 0 removals; no assertion deleted; scope 37/37). Correctness:
**CHANGES REQUIRED**, two mediums and a low. Both reports and the arbitration are
on `claude/reviews-m3-p3-a2` (PR #64).

They do not disagree; they asked different questions, which is why T-007 requires
different CONTRACTS and not merely different models. DR-0012 condition 2 blocks
merge on either medium.

- **CR-001 (medium).** A unit keeps its block markers when two block markers open
  on one line (`- - x`, `- 1. x`, `1. - x`, `- > x`, and four more). Fail-open and
  fail-closed at once: the unit set gains a string no document contains and loses
  the real prose.
- **CR-002 (medium), the more serious.** Both defects round 6 reports fixing have
  NO red witness. Fourteen of twenty mutants survive, and with the pre-fix
  `startOffset` restored the FULL suite is 501 tests, 501 pass, exit 0.
- **CR-003 (low).** `NOT_QUOTABLE` has no observable effect; the round's own claim
  about that is confirmed, so the docstrings claiming an exclusion are what change.

**Round 6 did NOT fail the way rounds 1 to 5 failed, and that is measured rather
than assumed.** The orchestrator ran CR-001's shapes against the PRE-A2 head
`18c335a`: all four leak there too, pre-A2 leaking one marker where A2 leaks both.
So CR-001 is an old hole A2 widened, not a defect A2 introduced, and the reviewer
reached the same conclusion independently by finding the class already graded FAIL
for the old code. What the owner decided was delivered correctly: 20 of 20 unit
sets byte-identical, the 40-shape exploit set at 40/40, eight fabrication variants
rejected. Round 7 is therefore an ORDINARY fix round, not a DR-0016 escalation.
That is an orchestrator judgment and is recorded so it can be disagreed with.

**Round 7 is DISPATCHED**, fresh implementer, beacon and freshness watchdog armed
in the same turn. Scope is ordered CR-002 first on purpose: witnesses taken before
a fix must redden against shipped code, while witnesses taken after get written to
match the implementation. A measured starting point for CR-001 is recorded in
`delivery/review/orchestrator-cr-001-fix-feasibility.md` as evidence rather than
as an instruction; the implementer owes its own derivation.

One item rides along and is not optional: a REGISTERED witness asserts an answer
both parsers call wrong, requiring a setext heading's own text to be part of a
unit its own fixture names as one that must not be a unit. No round found it
because the test IS the specification, so nothing existed to contradict it. The
correctness reviewer confirms the corrected assertion is right, against
commonmark's own HTML renderer.

Plan amendments the reviews ruled for are applied: criterion 1 was
UNSATISFIABLE once its own phase's step 2 landed, because M3-P3 ships the
repository's first two `requiresContext` checks; criterion 4's "update the enum"
is four coordinated edits.

**M3 prerequisites (#38) were two blocking escalations the M3-P1 implementer
raised and did not improvise around.** The ten `delivery/plan/phase-declarations/m3-pN.json`
had no owner: the scope auditor reads them from the MERGE BASE so a phase
cannot author its own, and the plan assigned that ownership to nobody. And the
red-witness scratch clone could not resolve `node_modules`, which was harmless
while the kernel had zero production dependencies and became blocking the
moment M3-P1 added its first two. That fix FAILS CLOSED, because a clone that
cannot resolve an import is red for every member and every control, which is
the same observation a genuine witness produces.

The same PR corrected a defect in PR #32: its derivation claimed the citations
gate's other not-applicable arm was unreachable. It is reachable, because the
manifest precondition is a path PREFIX while every documents glob but STATE.md
requires `*.md`, so any non-markdown file under a configured tree reaches it.

`claude/m3-plan-regrounding` is now redundant with `main` and can be deleted.

**Every other `claude/*` branch was DELETED by the owner on 2026-08-07
(action A-4), and the remote is now exactly two refs.** The audit that cleared
them confirmed, for all of them, that no file and no `delivery/` review,
tuition, work-history, evidence or verification document existed on any that
`main` lacked; their remaining deltas were superseded older versions of files
`main` has since rewritten (sampled and verified: `DR-0008` read
`status: open (deferred)` on the old branches while `main` has it decided).
The orchestrator could not perform the deletion itself: this container's
credentials are refused ref deletion with **HTTP 403 on both paths**, the
GitHub API (`DELETE /git/refs/heads/<branch>`) and `git push origin --delete`
alike, while ordinary pushes from the same credentials succeed. That is the
same authorization asymmetry CLAUDE.md standing warning 6 records for `gh`,
and it is why branch cleanup is an owner action rather than a chore.

This is therefore an OWNER ACTION, listed in the section below as A-4. The
branch tips were captured before the attempt so nothing is unrecoverable, and
the audit is mechanical and re-runnable:

```
comm -23 <(git ls-tree -r --name-only origin/<branch> | sort) \
         <(git ls-tree -r --name-only origin/main | sort)
git diff --numstat origin/main..origin/<branch> -- \
  delivery/review/ delivery/tuition/ delivery/work-history/ \
  delivery/evidence/ delivery/verification/
```

Both return empty for every branch except `claude/m3-plan-regrounding`.

Supervision is beacon/transcript freshness, not completion notifications.

## Carried forward, not yet owned

Items discovered during M1 that belong to a later milestone and have no owner
yet. Recorded here so they are not rediscovered the expensive way.

- **Non-atomic task metadata write.** `src/task.ts` writes `meta.json` with a
  plain write, which is the mechanism that produces the torn record the M1-P5
  guard now has to defend against. Out of scope when found and no reviewer
  faulted the phase for it. Real M2 item.
- **Clean presentation of a load-time configuration error.** A malformed
  watcher cadence environment value fails loudly, which is correct, but
  presenting it as a usage error rather than a stack trace needs a top-level
  handler in `bin/tiphys.ts`, a seam no M1 phase owns. **Promoted from cosmetic
  to load-bearing by DR-0013**: YAML parse failures must present through this
  same policy, so M3 depends on it existing.
- **M1-P4's inert liveness hook.** Confirmed dead by two reviewers, left in
  place because it is not M1-P5's to delete. Remove it when a phase owns
  `src/spawn.ts`.
- **Deadline-less abandonment.** A task spawned without a deadline is not
  auto-detected as abandoned. The plan's own not-proven list says so for M1;
  it needs an owner in M2 or M4.
- **A mechanism index** mapping a mechanism to the rules this project has
  established for it, per tuition T-005. Belongs with the M3 tuition flow.
- **Complete the unprobed-open class across `src/lock.ts`, `src/pool.ts` and
  `src/brief.ts`.** M1-P5 closed it for the guard, the watcher and doctor on
  every path a reviewer could construct. `teardown`, four `lock` subcommands
  and `spawn` still hang forever on a FIFO, and the spawn case strands a
  worktree, a pool record, a branch and a task id. These are M1-P3 and M1-P4
  files; patching them from M1-P5's call sites would repeat CR-521. Needs its
  own scope, and it is a strong candidate for the mechanism index of T-005.
- **A second review contract per code phase, declared rather than improvised**,
  per tuition T-007. A criteria-walking review cannot find a defect the
  criteria do not describe, which is how a phase met fifteen of fifteen
  executed criteria while live-locking every supervision command. The plan
  schema should carry a phase's hazard classes beside its acceptance criteria
  so the second contract is derivable. M3 role briefs and M3-P1 plan schema.
- **M1-P6's three tracked lows, merged with under DR-0012 clause 2.** Each is
  recorded here with its reason rather than fixed, because all three are in the
  guard-on-the-guard rather than in the harness that certifies the milestone,
  and this phase has already spent four fix rounds on that test.
  **CR-760**: the `gates` fan-in's own `run:` script is text-asserted, so two
  structurally different edits leave it green. Real fix is ~8 lines executing
  the fan-in script the way tier 1 executes the guard's. Reason for deferring:
  it is a third-order guard, and the second-order one is now sound.
  **CR-761**: residual R6 is stated one level too narrow;
  `defaults.run.working-directory` is green at the WORKFLOW level as well as
  the job level. Documentation fix.
  **CR-762 and the criteria contract's sighting, which are the same thing and
  now NAMED**: `test/liveness.test.ts:671` asserts a hardcoded "age 13s" and
  fails under CPU contention. Seen once by each reviewer, clean on serial
  re-run both times. It is an M1-P5 file, out of this phase's scope, and it is
  a real flake in a suite the rules treat as a hard binary gate. **This is the
  highest-value of the three and should be fixed early in M2.**
- **CI-witnessed exclusivity violation at `test/watcher.test.ts:500`, seen
  once, 2026-08-06.** During M2-P1's merge-gate CI on head `4811d2e` (run
  31092570135, first attempt), the test "a resident watcher and a concurrent
  single pass never both surface a wake" failed with BOTH runs surfacing:
  the `--once` pass printed `signal t1 turn-end` and exited 0, AND the
  resident surfaced the same wake. That is not timing noise; it is one
  witnessed violation of M1-P5 criterion 7's exclusivity (PR-204). The rerun
  was green, and the suite is green locally on both toolchains, so it rides
  as an investigation item, not a blocker: M2-P1's diff does not touch the
  watcher, and a once-in-CI witness against M1-P5 code is M1-P5's defect
  either way. Needs `delivery/verification/watcher-exclusivity.md` before
  anyone calls it settled, per the durability rule's investigation row. Same
  family as the `liveness.test.ts:671` flake above: members of a hard binary
  gate that are not binary.
- **Work-history contract must cover impossibility, coverage and remedy
  claims**, not only universal quantifiers, per tuition T-006. T-003 already
  routed the universal-quantifier rule to M3's report contract; T-006 records
  that the rule as written would have caught none of the three false claims
  M1-P5 produced, because those are existential and causal claims verified by
  CONSTRUCTION rather than by counter-experiment. M3 item, and a reviewer
  checklist item in the same role briefs.

**Paperwork compaction, owner-raised 2026-08-06, falls due at the M2 or M3
boundary.** The owner will challenge what of `delivery/` is useful going
forward: compact without losing information, cut the filler. The measured
split that should drive it: reviews and work histories are ~9,200 of the
~15,300 lines and are mostly READ-ONCE (their probes-run sections were
load-bearing at merge time and dead after), while decisions, tuition,
MECHANISMS.md and STATE are the read-every-dispatch layer and are already
dense. The compaction rule to apply: anything read at dispatch time must be
dense; anything read only in dispute can be archived cold. Git history keeps
deleted files, so compaction is "remove from the working tree, keep an index
row pointing at the sha", never information loss. The kernel connection: M3-P8's
tuition flow and the report contract ARE the productized compactor (incident
text projects to mechanism index; review text projects to findings and
verdicts), so this challenge is an INPUT to M3, not a separate cleanup chore.

**Re-grounding debt for the M2 and M3 plans.** Both were written in parallel
with M1-P5 and predate T-005 and T-006. DR-0011's recorded consequence makes
re-grounding an explicit step before their delta review. The specific inputs
they have not absorbed are T-005 (mechanism index), T-006 (work-history
contract), DR-0014 (release verification becomes a pluggable interface, which
moves M2-P7's centre of gravity), and M1-P5's own defect record.

**Carried forward from M2-P1, placed here because a phase work history is not
where other phases read (CR-902).** For the P2-P8 implementers and M2-P9:

- A consumer of an evidence bundle must know WHICH RUN it asked for; a refused
  run leaves the previous run's summary in place by design, and the runner
  emits `gates: run <id>` on stdout for every outcome so attribution is
  observable. M2-P9 consumes this.
- The evidence claim has NO expiry by design: a killed run needs one `rm`, and
  the refusal message names the file. Do not add a lease.
- A gate's OWN writes into the evidence directory are unguardable by the
  runner; the runner refuses to certify a run whose claim was lost instead.
- `fetch-depth: 0` is required before the first `diff-touches` gate lands
  (M2-P2, M2-P5), and on pull_request events the checkout SHA is the synthetic
  merge commit unless `--head` is passed explicitly (fixed for the bundle step,
  a trap for any new step).
- The pin is five fields including `ctimeMs`; a gate over-reporting `units`
  remains uncloseable by the runner and is recorded, not solved.
- There is no `env` precondition kind; M2-P8's `credential-token` gate wires
  through a command or file check, not an environment probe.

## Owner decisions

| Record | State |
|---|---|
| DR-0001 license | decided: Apache-2.0 |
| DR-0002 Node floor | decided: >=26 |
| DR-0003 CI runner | decided: GitHub Actions, hosted |
| DR-0004 branch protection | DONE 2026-08-05: ruleset active, witnessed refusing a merge on a stale branch. Item 4 (token scoping) queued for M2 |
| DR-0005 language | decided: TypeScript compiled to JavaScript |
| DR-0006 schema technology | decided: lintable schema first, markdown as justified exception |
| DR-0007 substrate | decided: dual, local machine and cloud sessions |
| DR-0008 release registry and package names | decided: public npmjs under @tiphys, `@tiphys/kernel` and `@tiphys/claude-code-plugin` |
| DR-0009 firstmate source | decided: supplied, protocols harvested |
| DR-0010 harness orchestration primitive | open, due at M4 adapter planning |
| DR-0011 early parallelism | decided: maximum safe parallelism, five conditions binding |
| DR-0012 delegated merge authority | decided: delegated under dual cross-model clean review; stop fired once on M1-P5 and was lifted for that phase only |
| DR-0013 schema validator implementation | decided 2026-08-05: Ajv 8.20.0 exact, Draft 2020-12, strict mode; plus `yaml` 2.9.0 for the parser the plan had omitted. M2's validator retired as an engine at M3-P1. Supersedes D-3 from M3 onward |
| DR-0014 release verification | decided in principle: pluggable interface with kernel-shipped reference adapters; interface design investigated, report in `delivery/verification/release-verification-interface.md` |
| DR-0015 owner out of the merge path | decided: dual clean review is the approval, at milestone boundaries too; exit tests stay hard gates and their evidence still goes to the owner |
| DR-0016 escalation threshold | decided: recommendation-backed questions are the agent's to take; only genuine high-impact ties reach the owner. A stalled phase gets a fresh implementer and a third contract, not a wait |

## Owner action items

**This section is the sole allocator of `A-n` ids** (CLAUDE.md identifier
schemes). An `A-n` is an ACT the owner must perform because it needs access an
agent does not hold; a CHOICE is a `DR-nnnn` instead. A plan that needs a new
action asks for an id rather than picking one, because the namespace has
already collided once: `A-4` meant two different things in two live documents
and `A-3` meant three, one of them a literal string inside
`gates.manifest.json` on `main`. Retired ids are never reused.

1. **DR-0004: DONE (owner, 2026-08-05).** The ruleset is active and was
   witnessed refusing a merge whose branch was behind `main`, then allowing it
   after the branch was updated and CI went green on the exact merged head.
   Item 4 (implementer token scoping) remains queued for M2.
2. **A-1: DONE (owner, 2026-08-05).** The toy sandbox repository is
   https://github.com/ThomasHendrickx/tiphys-ai-helmsman-sandbox. Both M1-P6
   scripts take the repository URL as an argument, so nothing needs editing;
   the URL is supplied at dispatch. M1-P6's full mode is unblocked.
3. **A-6, NEW and blocking one criterion.** Grant this session PUSH access to
   `ThomasHendrickx/tiphys-ai-helmsman-sandbox`. The repository was attached to
   the session and READ works (`git clone` exit 0, `git ls-remote` exit 0), but
   the write path is refused: `git push --dry-run` exits 128 with HTTP 403 on
   `git-receive-pack`, while the same dry-run against the kernel repository in
   the same shell exits 0. The refusal arrives before any ref is proposed, so
   it is an authorization asymmetry, not branch protection and not anything the
   push could be adjusted to satisfy. Re-calling the attach with push access
   returns already-present and does not upgrade an attached repository.
   Likely the GitHub App is not installed on the sandbox repository, or
   workspace policy excludes it; an admin can grant it in the Claude GitHub
   settings. What it unblocks: M1-P6 criterion 1's real-repository form, its
   commit-identity assertion, and the idempotence half, plus the M1 exit test's
   FULL mode. Local mode is unaffected and passes.
4. **A-2, before M4.** Provide or approve a private remote per real fleet
   home, for fleet-state durability.
5. **A-4: DONE (owner, 2026-08-07).** The stale `claude/*` branches were
   deleted through the `gh` CLI. The orchestrator could not do it: this
   container's credentials are refused ref deletion with HTTP 403 on both the
   GitHub API and `git push --delete`, though ordinary pushes from the same
   credentials succeed. The remote is now exactly two refs, `main` and
   `claude/m3-plan-regrounding`, which is the state this project wanted:
   `main` is the source of truth and the M3 branch is where M3 is worked,
   rebased onto `main` rather than diverging from it.
6. **A-7, before the M3 exit run.** Provide the npm publish credential and
   claim the `@tiphys` scope, per DR-0008 (public npmjs, `@tiphys/kernel` and
   `@tiphys/claude-code-plugin`). This is elevated access the orchestrator does
   not hold, so it is owner-reserved by construction under DR-0016. It blocks
   M3-P10 only; M3-P1 through M3-P9 run without it.
   **Id note:** the M3 plan called this `A-4` through revision 2, colliding
   with the branch deletion above. Revision 3 renumbered the PLAN's id to A-7.
   M2's `A-3` is deliberately untouched because it is embedded as a literal
   string in `gates.manifest.json` on `main`
   (`implementer-token-present-owner-action-a-3`), where a rename would edit
   shipped configuration. A-5 and A-6 were already taken, which is why the
   next free id is A-7: A-6 is the sandbox push grant at item 3 above, and A-5
   is a standing action allocated by the M3 plan at
   delivery/plan/kernel-plan-m3.md:2538 (DR-0004 items 2 and 3, branch
   protection). A-5 is recorded here so this register actually holds every
   allocated id, which is the point of naming a sole allocator.

## Tracked obligations, sequenced

- **DR-0022 is DECIDED (owner, 2026-08-09): option A2.** `commonmark` for block
  structure, `sourcepos` slicing for text, acceptance criterion "unit sets
  byte-identical on all nineteen records". M3-P3 round 6 is executing it on
  `claude/m3-p3-assurance-modes`. The declaration amendment that answer requires,
  adding `package-lock.json`, is PR #62. Two items ride along, both recorded in
  the decision: a registered witness at `test/assurance-modes.test.ts:2379`
  asserts an answer both parsers call wrong, and V-5's fifth member and V-3 are
  WITHDRAWN as never having been defects.

- **A witness can stop witnessing while every gate stays green (T-011).** Two
  instances in two consecutive M3-P3 rounds, both self-reported by the
  implementer and both confirmed independently. A `find` that stops matching is
  caught by `red-witness` rule (d); a `find` that STILL MATCHES a line whose
  meaning drifted is caught by nothing. The 97-member sweep is structurally blind
  to the second kind, because the drift was in a FIXTURE the witness reads rather
  than in the source its `find` points at. Whether `red-witness` should detect it
  is an open design question on M2-P2's file and may not be decidable
  mechanically; full record in
  `delivery/tuition/T-011-a-witness-can-stop-witnessing-silently.md`. Not assigned.

- **BLOCKING ON M3-P10: `package.json` must reach `version` 0.1.0.** M3-P3's
  five shipped `$comment` disclosures name v0.1.0 (DR-0020), while
  `package.json` declares `"version": "0.0.0"`. M3-P10 step 1
  (delivery/plan/kernel-plan-m3.md:4823) makes it true, so the forward
  reference is correct AS LONG AS that step happens. If M3-P10 ships without
  the bump, a package declaring 0.0.0 carries five present-tense claims about
  a version that does not exist, which is tuition T-006's exact shape. Nothing
  mechanical checks this today; if M3-P10 can make it checkable cheaply, it
  should. Raised by the M3-P3 fresh implementer, which handed it back rather
  than resolving it because neither side is on its declaration.

- **The two-member witness rule is enforced on a strict subset of what it is
  written as.** CLAUDE.md states it without qualification; `src/witness/run.ts`
  gates it on `spec.class === "classification" || derivation.textAsserting`, so
  an `additive` spec may declare two members that collapse to one with the gate
  green. Measured by the delta verifier: 22 of 43 specs exempt, 4 single-member,
  2 of those without a good excuse. Full record and the reason it is NOT being
  fixed in passing: `delivery/verification/red-witness-rule-g-exemption.md`. The
  guard is not wrong, it is narrower than its own statement, and which reading is
  right decides whether the fix belongs in the gate or in the sentence.

- **Two other sites carry the block-state mechanism M3-P3 round 3 fixed**, both
  reported with reproductions and neither edited because both are other phases'
  files: `src/gates/coverage.ts` `extractIdRows` admitted a fenced table row, and
  `scripts/check-clause-map.mjs` `parseInventory` admitted a fenced inventory row.
  The second compounds with the containment defect already reported at line 195
  of that same file.

  **CONFIRMED 2026-08-09, no longer provisional.** The round-3 delta verifier
  reproduced both independently (its finding V-7) and did not edit either, as
  instructed. So each has been demonstrated twice, by two agents that did not
  share a context: once by the implementer that found the mechanism and once by
  a verifier told only to confirm or refute.

  **Neither is assigned yet, and that is the honest state.** `src/gates/coverage.ts`
  is on M2-P6's declaration and `scripts/check-clause-map.mjs` on M3-P1's, so
  fixing either is an orchestrator-side change to shared harness code and owes the
  full fix-round contract under the T-009 corollary. Neither is urgent: both admit
  a FENCED example as real data, and no shipped artifact currently contains the
  triggering shape, which is the same "latent, not live" position V-1's fenced form
  held before `DR-0004` turned out to contain it. That precedent is the reason this
  entry does not read as safe: a latent shape becomes live the first time someone
  writes an ordinary document.

  The cheap check, if either is picked up: grep the artifacts each one parses for
  a fenced block, and say what the search did not cover.

- **`scripts/m2-exit-test.sh` is a structural bottleneck and is on no
  gate-adding phase's declaration.** It is the SINGLE caller of `gates run`
  (delivery/plan/kernel-plan-m3.md:663, settled at revision 3), so a gate is only real when
  this file selects it and gives it an expectation row. It is declared on
  `m2-p9.json` (its author) and nowhere else in M3. Measured: FOUR
  orchestrator-side fixes to it already (#27, #30, #44, and the pending
  `agent-rules-drift` one), and it has now blocked two phases in a row,
  M3-P1 (`clause-map`) and M3-P2 (`agent-rules-drift`).
  **Do NOT pre-emptively widen the remaining declarations**: M3-P6 and M3-P9
  edit the registry, but neither one's acceptance criteria demand CI
  execution, so adding the harness to them now would be inventing scope. The
  mechanism is instead a DISPATCH-TIME CHECK: before dispatching any phase
  that touches `gate-registry.yaml` or `gates.manifest.json`, read its
  criteria and ask whether the gate must RUN to satisfy them. If it must, the
  harness belongs on that phase's declaration; if it must not, expect an
  escalation and land the harness change yourself afterwards, as was done for
  `clause-map` in #44.


Work that is agreed and cannot be done yet, recorded so the sequencing is a
fact rather than a memory.

- **The clause-map gate has no row in the exit test's expectation tables**
  (M3-P1 hazard review finding B-006, high, verified end to end: a red
  clause-map produces ZERO findings in the assertion while a different red gate
  in the same run correctly produces one, so M3's only per-phase orphan check
  cannot fail CI). The fix is a row in `PR_EXPECT_JSON` and `MAIN_EXPECT_JSON`
  in `scripts/m2-exit-test.sh`. **It cannot land before M3-P1 merges**: the
  assertion fails with "no record in the bundle for a gate the table lists"
  when a listed gate is absent, and `clause-map` enters `gates.manifest.json`
  only with M3-P1. It is also not M3-P1's to fix, because
  `scripts/m2-exit-test.sh` is not on that phase's declaration. So it is an
  orchestrator-side harness fix owing the full fix-round contract, to be landed
  IMMEDIATELY AFTER M3-P1 merges and before M3-P2 is dispatched.

## Standing reminders

- Parallelism is on under DR-0011, but MERGE order is still dependency order:
  work may be concurrent, landing may not. A parallel phase's PR never merges
  before the phases its grounding names.
- Milestone exit tests are hard gates, and their evidence goes to the owner
  even while merge authority is delegated.
- A plan written in parallel with implementation is re-grounded against
  everything learned since it was started, as an explicit step BEFORE its
  adversarial review (DR-0011, recorded consequence).
- Process paperwork must reach `main`, not only a side branch. This file
  exists because it once did not.
- A merge is not complete until the post-merge `push` run on the new `main`
  head is observed green. The PR check and the push run execute DIFFERENT
  bundles, so a green PR check is not evidence about `main` (tuition T-009,
  which cost four hours and twenty-one minutes of red `main` and four merges
  landed on top of it).
