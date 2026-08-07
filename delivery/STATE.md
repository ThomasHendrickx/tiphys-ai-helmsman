# Pipeline state

The single place that answers "where are we right now". Update it whenever
a phase changes state, a decision is answered, or an owner action becomes
runnable. If this file disagrees with reality, reality wins and this file
is wrong: verify against git and the PR list before trusting it.

- as of: 2026-08-07
- main head: `50bcecb`, green on BOTH CI events (pull_request and push)
- milestone: M2 (gate registry), COMPLETE including its post-exit-test fix
  round. M1 complete, exit test passed on `7e1b5f1`, completion record merged
  to main in PR #10 at `037477e`.
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

Next: M3. **M3 plan re-grounding** lives on `claude/m3-plan-regrounding`,
rebased onto this `main`. That branch holds a substantial revision of
`delivery/plan/kernel-plan-m3.md` (4905 lines there against 2799 on `main`,
"M3 plan revision 2: sections 6-8 and appendices re-grounded") which is NOT on
`main` and is the reason the branch is kept rather than deleted.

**Every other `claude/*` branch is CLEARED FOR DELETION but is still present.**
The audit ran on 2026-08-07 and confirmed, for all 35 of them, that no file and
no `delivery/` review, tuition, work-history, evidence or verification document
existed on any of them that `main` lacked; their remaining deltas were
superseded older versions of files `main` has since rewritten (sampled and
verified: `DR-0008` reads `status: open (deferred)` on the old branches while
`main` has it decided). The deletion itself did NOT happen: this container's
credentials are refused ref deletion with **HTTP 403 on both paths**, the
GitHub API (`DELETE /git/refs/heads/<branch>`) and `git push origin --delete`
alike, while ordinary pushes from the same credentials succeed. That is the
same authorization asymmetry CLAUDE.md standing warning 6 records for `gh`.

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
5. **A-4, NEW, ready to execute.** Delete the 35 stale `claude/*` branches.
   They are audited and cleared (see "In flight" above for the audit and the
   re-runnable commands); the orchestrator cannot do it because this
   container's credentials are refused ref deletion with HTTP 403 on both the
   GitHub API and `git push --delete`, though ordinary pushes succeed. Keep
   exactly two refs: `main` and `claude/m3-plan-regrounding`. Fastest route is
   the GitHub branches page, or from a machine with delete rights:
   `git fetch --prune && git branch -r | grep '^  origin/claude/' |
   grep -v m3-plan-regrounding | sed 's#origin/##' |
   xargs -n1 git push origin --delete`.
   Until this runs, `main` is the source of truth but is not the ONLY ref.

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
