---
name: phase-delivery
description: Run one plan phase of the Tiphys kernel from dispatch to merge. Use when starting, implementing, reviewing, fixing, or merging any M1 to M5 phase, when opening or handling a phase pull request, or when resuming a phase after a session break. Covers the orchestrator's whole loop including scope audit, clean-room review, fix rounds, and post-merge duties.
---

# Phase delivery

One phase, one branch, one PR, merged by the owner. This is the loop the
orchestrator runs. Read `CLAUDE.md` first for conventions, gates, and the
standing environment warnings.

Roles never blur: the orchestrator does not write feature code and does not
let a review be skipped; the implementer does not open PRs, does not merge,
and does not re-decide settled questions; the clean-room reviewer has not
seen the implementation session and edits nothing.

## 0. Before dispatch

Confirm all of these, and stop if any fails:

- The previous phase's PR is merged. Phases are sequential until M5.
- The plan section for this phase exists and its `blocked-by` decisions are
  all decided. A phase blocked on an undecided owner decision is not
  dispatchable; raise or chase the decision record instead.
- If a milestone boundary is being crossed, the previous milestone's exit
  test has passed with recorded evidence.

## 1. Create the phase worktree

Always branch from the merged `main`, never from a stale local ref.

```
git fetch origin main
git worktree add <scratch>/wt-<phase> -b claude/<phase-branch> origin/main
git -C <scratch>/wt-<phase> log -1 --oneline
```

Keep phase work in its own worktree so the main checkout stays free for
orchestration commits and so a dying agent cannot corrupt the checkout.

## 2. Brief and dispatch the implementer

Use `references/implementer-brief.md`. Every section in that template is
load-bearing; a brief missing the reporting contract or the environment
warnings produces work you cannot audit.

Dispatch one implementer per phase. Keep it running to the end of the phase
including fix rounds: resuming the same agent preserves context and is far
cheaper than a fresh agent re-reading everything.

## 3. Receive the report and audit scope

The implementer's final message is the record. Before anything else, audit
scope yourself; do not take the report's word for it.

```
git fetch origin claude/<phase-branch>
git diff --name-only origin/main..origin/claude/<phase-branch>
```

Every file must be on the phase's files-to-touch list, or be one of the two
standing pre-authorized extras (`test/behaviors.json`, the phase work
history). Anything else is a finding, not a footnote.

Then check the report itself: every acceptance criterion walked in order,
each with a command and exit code or file evidence; CI-deferred items named
with a reason rather than quietly passed; deliberate-failure witnesses
actually performed and reverted; deviations declared rather than absorbed.

## 4. Open the PR

The orchestrator opens it, never the implementer. Body structure that has
worked: what this delivers (grouped by component, naming the decisions and
findings each satisfies), evidence summary (criteria counts, witnesses,
registry counts, what CI still has to prove), declared deviations with their
justification, and the merge authority line.

Then subscribe to PR activity and schedule an hour-out self check-in, so a
missed webhook cannot strand the PR.

## 5. Clean-room review

Dispatch a fresh agent that has not seen the implementation session, using
`references/clean-room-brief.md`. Its contract is the plan's acceptance
criteria, not the implementer's account of them.

Always instruct it to execute rather than admire: re-run the criteria, and
mutation-test the tests by breaking the behavior and confirming the named
test goes red. A review that only reads is worth much less than one that
sabotages.

## 6. Fix rounds

Findings go back to the SAME implementer, resumed. Rules:

- Dispute is allowed with concrete evidence, surfaced for the orchestrator
  to arbitrate. Silent non-application is forbidden.
- **"RECORD THE OBSERVED CI CONCLUSION IN THE WORK HISTORY" IS SELF-INVALIDATING
  AT THE LAST STEP, and briefs must stop asking for it in that form.** Writing
  the green for head H produces H+1, a head with no completed run; recording the
  green for H+1 produces H+2, and so on. The observation cannot be written into
  the artifact it describes. Measured 2026-08-12: an M3-P6 fix round was
  instructed exactly this way, and it terminated correctly on its own by
  refusing the last write and explaining why.
  The resolution it used, which is the one to ask for: **record the green on the
  CODE head, and record separately that every commit after it is prose-only and
  verifiable with `git diff --name-only`.** Then the final head's own run is a
  CONFIRMATION of a recorded claim rather than a new claim needing its own
  entry, and the recursion stops at one. The orchestrator observes the final
  head's run itself; it does not belong to the implementer.
- One push per fix round, not six. A fix round is 1 to 2 pushes.
  **COMMITTING AND PUSHING ARE SEPARATE DECISIONS, and a brief that fuses them
  breaks this rule while looking like it obeys the beacon rule.** Measured
  2026-08-12: a brief said "commit and push as you go" beside "let the gates
  workflow complete before reporting"; the agent obeyed both faithfully, pushed
  six heads in two hours, and each push CANCELLED the in-flight run on the
  previous head. Five cancellations, and for two hours there was no completed
  gate evidence for the branch on the milestone's critical path. This line
  already said "not six" and the brief overrode it, which is the actual defect:
  a per-dispatch brief silently beats a standing rule because it is more recent
  and addressed to the agent personally.
  The wording to use:
  > Append to your work history and COMMIT LOCALLY after each command whose
  > output you will cite. PUSH when a cancelled run would cost nothing: before
  > you have triggered a run, or after the in-flight one has already given you
  > its answer. Never push while a run you intend to rely on is in flight.
  Durability is satisfied by the LOCAL commit plus the file's mtime; pushing is
  a different act with a different cost. Before writing any dispatch brief,
  re-read this procedure and treat a divergence as a defect in the brief unless
  the brief says explicitly that it is overriding. Full account in
  delivery/tuition/T-017-the-beacon-instruction-asks-for-a-habit.md:113.
- Every new regression test must be red on the pre-fix code and green after.
- Applying a fix must not break what already passed review; completeness
  invariants stated in the brief must be re-verified and reported.

**A fix round is not lower risk than the work it fixes.** In this project a
fix round closing four low-severity findings introduced two high-severity
defects, neither visible to a green suite (delivery/tuition/T-003). Do not
merge a fix round on green CI alone. Either run an independent verification
of the delta (see the `adversarial-verification` skill) or, at minimum, a
delta clean-room review scoped to the change.

## 7. Merge

Merge authority is the owner's. Merge only when: CI is green on the final
head, the clean-room verdict is APPROVE with findings closed or explicitly
accepted, any fix round has been verified, and the owner has approved (a
recorded approval on the PR counts).

Squash merge, with a commit message that tells the story: what the phase
delivered, the decisions it realized, and the evidence that it works.

## 8. Post-merge duties

Do all of these before starting the next phase:

1. Unsubscribe from the PR and cancel the phase's self check-in.
2. Remove the phase worktree.
3. Commit any review artifacts still uncommitted, and make sure the
   evidence reaches `main`, not only a side branch.
4. Carry forward: environment warnings the phase discovered, and any
   cross-phase obligation the plan or a review named for the next phase.
5. Create the next phase's worktree from the newly merged `main`.

## Failure handling

- An agent that dies or stalls: use the `agent-salvage` skill immediately.
  Uncommitted work is one container reclaim away from gone.
- A finding that cannot be explained: do not merge around it. Dispatch an
  investigation that must produce a runnable reproduction or an honest
  "could not reproduce, here is the harness and what was ruled out".
- CI red: read the log before re-running. A real bug and a flake look
  identical until you read it. Three reds from the same flake means stop
  paying the lottery and fix the flake first.
- An implementer reporting that the plan is wrong: stop, do not improvise.
  The plan is revised (and re-reviewed) before the phase continues.
