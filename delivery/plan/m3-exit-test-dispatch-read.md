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

## 1. Stage E3.1 is an ORCHESTRATOR action, and no agent can discharge it

E3.1 requires identifying the `gates` run whose EVENT is `push` and whose head
sha equals the new `main` tip, observing it TO COMPLETION, and recording run
id, event, head sha and conclusion (delivery/plan/kernel-plan-m3.md:5319).

No agent in this container can do any of that. Standing warning 6 records the
measurement: `GH_TOKEN` and `GITHUB_TOKEN` are both SET and the REST API answers
`{"message":"Bad credentials","status":"401"}` to every request made with them,
so a poll loop written the obvious way emits nothing and **a watcher with no CI
access is indistinguishable from a CI run still in progress**. That is the
T-008 shape in the one family where the environment guarantees it.

The GitHub MCP tools do work and they are the orchestrator's, not an agent's.
So the division of labour is fixed rather than negotiable:

| stage | who |
|---|---|
| E1, E2, the three controls, E4.1 to E4.3 except the publish itself | the dispatched agent |
| E3.1, E3.1b | the ORCHESTRATOR, by hand, recording the record into the bundle |
| the publish itself | the OWNER (A-7 part 2, then a dispatch of the release workflow) |

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
