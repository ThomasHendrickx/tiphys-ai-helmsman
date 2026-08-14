# M3 exit test: the dispatch read

- date: 2026-08-14
- author: orchestrator
- status: written BEFORE dispatch, deliberately. The exit test is the last
  thing M3 does and it has an ordering constraint that no later commit can
  satisfy, so the reading that would otherwise happen inside the dispatched
  session happens here where it can be reviewed.

This document does not restate the exit test. Section 4 of
delivery/plan/kernel-plan-m3.md:5039 is the specification and it is long and
precise. What follows is only the part a dispatched agent would get wrong, and
the part it structurally cannot do at all.

## 1. Stage E3.1: WITHDRAWN AS WRITTEN, and the correction is the point

**This section originally said E3.1 was an orchestrator action that no agent
could discharge. That was wrong, and it was wrong on the day it was written.**
It is corrected in place rather than quietly rewritten, because the reason it
was wrong is more useful than the conclusion.

The M3-P10 criteria reviewer reported CR-001: plain `curl` with `$GH_TOKEN`
read pull-request, rate-limit and check-run data in its session, contradicting
standing warning 6. The orchestrator re-measured rather than picking a side,
and the API answers 200 to every probe including a real `push`-event run, with
a **deliberately invalid token getting the same 200 and the same 15000 rate
limit**. The agent proxy substitutes credentials, so the token value is
irrelevant and "is the token good" was never the question. CLAUDE.md:841
carries the measurement table.

So an agent CAN discharge E3.1, and this section's original instruction would
have hand-carried a stage back to the orchestrator for no reason.

**The part of the original reasoning that survives**, and it is the part that
matters: a watcher that pipes a failure into `|| true` emits nothing, and a
watcher with no CI access is indistinguishable from a run still in progress.
That is the T-008 guard-that-cannot-go-red shape, and it does not depend on
which HTTP status the failure was. Whoever discharges E3.1 writes the FAILURE
arm first and proves it can go red.

**What is genuinely not established**: why the 2026-08-13 401 measurement,
which was real, does not reproduce. Nobody has shown whether the proxy changed
or the grants did. So the exit-test brief should PROBE reachability as its
first step rather than assume it in either direction, and record the probe.

The division of labour that remains:

E3.1 requires identifying the `gates` run whose EVENT is `push` and whose head
sha equals the new `main` tip, observing it TO COMPLETION, and recording run
id, event, head sha and conclusion (delivery/plan/kernel-plan-m3.md:5319).

| stage | who |
|---|---|
| E1, E2, the three controls, E4.1 to E4.3 except the publish itself | the dispatched agent |
| E3.1, E3.1b | the dispatched agent, with the orchestrator as fallback if its reachability probe fails |
| the publish itself | the OWNER (A-7 part 2, then a dispatch of the release workflow) |

Only the publish is genuinely reserved, and it is reserved because it needs npm
account access, not because of anything about CI.

The worked form of the E3.1 reading, which the orchestrator has now done twice
in this milestone: list the `gates` workflow runs filtered to branch `main` and
event `push`, take the one whose `head_sha` equals the new tip, then read its
JOB STEPS rather than its check-runs, because check-runs has served stale state
here. A run reported `in_progress` is not a green run and an absent conclusion
is not a green conclusion; both are named as failures by the criterion itself.

**A `pull_request`-event check on the source branch does NOT discharge this**,
and the plan states that as a prohibition rather than leaving it to inference,
because the failure mode is that both are real green runs on related shas and
the wrong one is read.

## 2. The ordering constraint that no later commit can satisfy

`delivery/evidence/m3-exit-test/supervision-rules.md` carries the three
controls and their expected failure stages, and it must be committed BEFORE
stage E1 begins, with its commit preceding the first E1 evidence record
(delivery/plan/kernel-plan-m3.md:5183).

That ordering is the checkable form of "the controls were not chosen after
seeing which stages turned out to be weak", and it is asserted FROM THE BUNDLE
rather than promised. An agent that writes the controls file at the end,
however honestly, has destroyed the property: a commit made after the E1
records does not precede them, and the only operations that would make the
bundle assert otherwise are history rewrites, which is fabrication rather than
repair. It is the first instruction in the brief for that reason.

A related trap in the same family: **a control that PASSES is an exit-test
failure**, per control, at its own declared stage, and passing at the WRONG
stage is also a failure. An agent reading its control results as ordinary test
results will report the exact inversion of the truth.

## 3. Three blockers, in order, and only one of them is ours

The M3-P10 implementer reported these and they are recorded here so the exit
test is not dispatched into a wall:

1. **M3-P10 and M3-P11 both merged.** M3-P11 is merged. M3-P10 is pull request
   #140, under dual clean-room review at the time of writing.
2. **The publish.** Owner action A-7 part 2 is the npm trusted-publisher
   configuration, which names `release.yml` and therefore could not be
   performed before M3-P10 existed. Then a dispatch of that workflow with
   `dry-run` false. Stages E4.1 to E4.3 run once and irreversibly, which is why
   the plan itself records that no control covers them.
3. **E3.1**, which is section 1 above.

Blocker 1 must complete before blocker 2, because the release workflow builds
from `main` and the version it publishes is the one in `main`'s
`package.json`.

## 4. What the dispatched agent must NOT do

- **It must not publish.** The publish is the owner's dispatch of the release
  workflow. An agent that runs `npm publish` has taken the one action in this
  milestone with no clean undo.
- **It must not treat a control's pass as good news**, per section 2.
- **It must not name its branch to match `^claude/m[0-9]+-p[0-9]+-`.** The exit
  test is not a phase and the scope auditor derives a phase id from the branch
  name, so a branch called `claude/m3-p12-exit-test` would look for a
  declaration that does not exist. Put the milestone somewhere the pattern
  cannot match.
- **It must not report a bare suite count.** Standing warning 12: the complete
  sentence names the invocation, the toolchain and the build state, and quotes
  the SKIPPED count alongside the pass count.

## 5. What this dispatch read does NOT establish

- **It has not been checked against section 4.5**, which the plan says repeats
  the control-boundary list so that the bound travels with the bundle. If 4.5
  and this document disagree, 4.5 is the plan and wins.
- **It says nothing about stages E1.1 to E1.10 individually.** They are
  specified and the agent reads them; nothing here shortens that reading.
- **It assumes the release workflow behaves as written.** Nothing in it has
  run, by design, and the hazard reviewer of pull request #140 was asked to
  attack exactly that assumption. If that review changes what the workflow
  does, section 3's blocker 2 changes with it.
