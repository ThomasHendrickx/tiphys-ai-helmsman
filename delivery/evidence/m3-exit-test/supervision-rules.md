# M3 exit test: supervision rules for the controlled exception

- date: 2026-08-15
- author: exit-test runner, dispatch A
- status: written and committed BEFORE stage E1 begins. This file's commit
  precedes the first E1 evidence record in this branch's history, which is the
  checkable form of "the controls were not chosen after seeing which stages
  turned out to be weak" (delivery/plan/kernel-plan-m3.md:5177).
- discharges: E0.2, E0.3 and E0.5 of delivery/plan/kernel-plan-m3.md:5080.

The run is the controlled exception settled decision 6 authorizes (SC-013):
the kernel's own `full` mode drives one change, under current-process
supervision. This file states what that supervision is, what it does not
relax, and the three falsification controls with their expected failure
stages.

## 1. Current-process safeguards: which remain active during the run (E0.2)

Plan v1 names the open question directly at delivery/plan/kernel-plan-v1.md:362:
"which current-process safeguards remain active during the exception". No
document enumerates them, so the enumeration is made here, from the binding
rules file, and the answer is recorded per safeguard rather than as a blanket
sentence. The default is ACTIVE; every row that is not active says so and says
why.

| # | Safeguard | Source | Active during the run? |
|---|---|---|---|
| S1 | The gate list: `npm ci`, `npm run build`, `node --test`, then the registry gates | CLAUDE.md:280 | ACTIVE, unchanged. The exit branch passes them like any other branch. |
| S2 | Scope audit against a phase declaration | CLAUDE.md:599 | ACTIVE AS A GATE, NOT APPLICABLE AS A PHASE CHECK. The exit test is not a phase and the branch name deliberately does not match the auditor's phase pattern, so no phase declaration is read. This is a deliberate non-application, not a suspension, and it is recorded so nobody later reads a green `scope` as evidence that a phase declaration was honoured. |
| S3 | Dual cross-model clean-room review before any merge (DR-0012) | CLAUDE.md:694 | ACTIVE, and DOUBLED IN ROLE. For the subject change it is the ordinary merge condition; for this exit test it is also stage E2's authorization artifact (delivery/plan/kernel-plan-m3.md:5288). One artifact, two duties, and neither weakens the other. |
| S4 | Red-witness rule, including its stronger form | CLAUDE.md:322 | ACTIVE. The subject change's new behavior carries a committed witness spec and a run record at E1.6. |
| S5 | Fix-round contract (mechanism, derivation, uncovered regions) | CLAUDE.md:333 | ACTIVE, and it binds any fix round the run's own review produces at E1.8. |
| S6 | Dispatch contract: incremental beacon plus freshness watchdog (T-008) | CLAUDE.md:423 | ACTIVE. This runner writes `delivery/evidence/m3-exit-test/run-log.md` incrementally and the orchestrator armed a freshness watchdog over the runner's scratchpad in the dispatch turn. |
| S7 | Durability rule: all truth in files and git, conversation memory is a cache | CLAUDE.md:35 | ACTIVE. Every stage result is a committed evidence record before the producing session ends. |
| S8 | Branch naming rule | CLAUDE.md:599 | ACTIVE and satisfied: `claude/m3-exit-test` does not match `^claude/m[0-9]+-p[0-9]+-`. |
| S9 | Authored-bytes check (pure ASCII, no control characters) | CLAUDE.md:80 | ACTIVE over every file this run authors. |
| S10 | The claim grep, in both the line-based and the wrap-insensitive form | CLAUDE.md:369 | ACTIVE over every document this run authors. |
| S11 | Never push to `main`, never merge your own work | CLAUDE.md:1067 | ACTIVE. The runner pushes only `claude/m3-exit-test` and its subject-change branch. Merge authority stays with the orchestrator under DR-0012. |
| S12 | T-009: a merge is not complete until the `push`-event run whose head sha is the new tip is observed green | CLAUDE.md:543 | ACTIVE. It is stage E3.1 and it is also half of precondition E0.1. |
| S13 | DR-0031: a pull request is a unit of self-contained value and carries all its evidence | CLAUDE.md:718 | ACTIVE. The bundle lands through one pull request at E4.4. |
| S14 | Orchestrator supervision of the exception itself (SC-013) | delivery/plan/kernel-plan-v1.md:38 | ACTIVE BY DESIGN. It is the exception's defining condition, and section 2 below is what bounds it. |
| S15 | Owner in the merge path at a milestone boundary | DR-0015 | NOT ACTIVE, and it was already removed before this run. DR-0015 supersedes DR-0012's milestone-boundary carve-out and removes owner action A-3. Stage E2's signatory is the dual review, not the owner. This row exists because a reader comparing against revision 1 of the plan would otherwise read its absence as a relaxation taken for the exit test's convenience. |

Nothing in this run relaxes S1 to S14. The exception is about WHO drives the
delivery (the kernel's `full` mode rather than the orchestrator's own
procedure), not about which checks apply to the result.

## 2. Binding rule on interventions (E0.3)

Stated here so it cannot be softened during the run. It is the plan's rule at
delivery/plan/kernel-plan-m3.md:5087, and this file adopts it without
weakening:

> Every intervention by the supervising current process is recorded in the
> evidence bundle with what was done and why. An intervention that substitutes
> for a kernel artifact (a human writing the brief the kernel failed to
> compose, a human running a gate the registry did not select, a human applying
> a review finding the verdict schema rejected) is an exit-test failure, not a
> footnote. Interventions that only observe, or that stop the run, are not
> failures.

Three consequences, written out because each is a way the rule gets softened in
practice:

1. **A substituting intervention is recorded as a FAILURE of the exit test in
   this bundle, not as a caveat in a report.** The bundle carries the verdict,
   so a later reader does not have to reconstruct it from prose.
2. **"It was a small fix" is not an exemption.** The test is whether the action
   stood in for something a kernel artifact was supposed to produce, not how
   large the action was.
3. **The bound is only over interventions somebody noticed.** An intervention
   that filled a gap without either party noticing is not recorded and no check
   over the record can see it. This is the plan's own residual at
   delivery/plan/kernel-plan-m3.md:5420 and it is copied here so the bundle does
   not read as a stronger guarantee than it is.

## 3. The three falsification controls (E0.5)

Defined before stage E1 runs and before this runner has seen which stages turn
out to be weak. Each reaches a different KIND of assurance mechanism, because
standing one witness in for a heterogeneous plural claim is the "one witness is
not a class" failure this project polices everywhere else
(delivery/plan/kernel-plan-m3.md:5124).

### The inversion rule, first, because reading it backwards inverts the report

**A control that PASSES is an exit-test FAILURE**, per control, at its own
declared stage. **Passing at the WRONG stage is also a failure**, because a
control that fails somewhere else has not exercised the mechanism it was
defined for. A run that reports "all three controls passed" as good news has
reported the exact inverse of the truth.

The success condition per control is therefore: the re-run of the E1 sequence
under the named mutation FAILS, and fails AT THE NAMED STAGE, with the exit
code and the failing command captured.

### C1, Kind A: schema validation

- Mutation: re-run the E1 sequence with ONE shipped schema keyword removed, so
  an instance the run validated is now accepted where it was rejected.
- Expected failure stage: **E1.1**, the charter validation, whose own negative
  half (a charter with `escalation-contract` removed) must stop exiting
  nonzero.
- What it reaches that the others do not: whether the shipped schemas are the
  thing doing the rejecting.

### C2, Kind B: a cross-document derived check actually running

- Mutation: re-run the E1 sequence with one Kind B check DEREGISTERED from
  `src/checks.ts`, namely `verdict-criteria-complete`, and with a verdict
  fixture whose `criteria[]` omits one of the phase's acceptance ids.
- Expected failure stage: **E1.7**, where
  `tiphys validate --type verdict --context <plan dir>` must stop exiting 0 on
  the deficient verdict.
- What it reaches that C1 cannot: whether the derived checks are INVOKED with
  `--context` during the real run rather than skipped.

### C3, review-contract distinctness: prose and judgment

- Mutation: re-run E1.7 dispatching BOTH review contracts with
  `--review-contract criteria`, everything else unchanged.
- Expected failure stage: **E1.7**, where
  `node scripts/check-dual-review.mjs` must exit nonzero naming the shared
  `review-contract` value.
- What it reaches that no schema control can: that two DIFFERENT questions were
  actually asked (T-007). It also catches a `check-dual-review.mjs` invocation
  whose exit code is captured into the bundle but is not gating anything (a
  `|| true`, or evidence recorded from a run made after the fact rather than
  from the one that produced the merge), because under C3 the script MUST turn
  the run red and a non-gating invocation will not.

### What the three controls do NOT witness

Copied from delivery/plan/kernel-plan-m3.md:5161 and repeated at
delivery/plan/kernel-plan-m3.md:5464, so the bound travels with the bundle
rather than only with the plan. An exit test whose control set has an unstated
boundary reads as complete.

No control covers:

- **E1.2's fleet and lock behaviour.** M1 machinery, witnessed by the M1 exit
  test and not re-witnessed here.
- **E1.3's stage-list-to-evidence mapping**, whose failure is a missing record
  rather than a wrong one.
- **E1.5's "findings were applied to the plan"**, which is witnessed as a state
  change in the plan file and has no control.
- **E1.6's mechanism-index consultation**, which is a work-history claim and
  not a machine check.
- **E1.8's fix-round-verification stage**, which is not-applicable on an
  APPROVE run and so may not execute at all.
- **The release stages E4.1 to E4.3**, which run once and irreversibly.

E1.9's and E1.10's validation are the same Kind A mechanism C1 stands for and
are covered BY KIND rather than by instance, which is a weaker statement than
being covered and is written here as the weaker statement.

## 4. Who runs what, and what this dispatch does not run

This file is authored in dispatch A, which runs stage E0 in full and stages
E1.1 to E1.5. Dispatch A does NOT run E1.6 onward, does not run stage E2, E3 or
E4, and does not run the three controls above. Defining the controls before
running any of E1 is the point of the ordering constraint; executing them
belongs to whichever dispatch reaches the end of E1.

Two prohibitions on this runner, restated because they are the irreversible
ones: it does not run `npm publish` (the publish is the owner's dispatch of the
release workflow, and `@tiphys/kernel@0.1.0` is already published), and it does
not merge anything or push to `main`.
