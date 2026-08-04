---
name: agent-salvage
description: Rescue work from an agent that died, stalled, or hit a usage limit mid-task, then resume it safely. Use when a subagent fails or terminates early, when a worktree has uncommitted changes whose author is gone, when a task is open with no completion report, or before abandoning any in-flight work. Prevents silent loss and prevents trusting unreviewed leavings.
---

# Agent salvage

An agent that stops holding uncommitted work is one container reclaim away
from losing it silently. This happened here for real: an implementer hit a
provider usage limit mid-fix-round with edits to the lock's mutation
primitive sitting uncommitted (delivery/tuition/T-002).

The rule is from the process document, section 6: commit whatever it left
as an explicitly labelled unreviewed WIP commit rather than losing it; the
resumed implementer verifies or rewrites, never trusts.

## Procedure

### 1. Inspect before touching

```
git -C <worktree> status --short
git -C <worktree> log --oneline origin/<branch>..HEAD
git -C <worktree> diff
```

Establish three things: what is uncommitted, what is committed but
unpushed, and what the change actually attempts. Read the diff; do not
salvage blind.

### 2. Measure its real state, do not assume

Run the gates on the leavings and record the true result:

```
npm run build ; echo "BUILD_EXIT=$?"
npm test 2>&1 | tail -12
```

A salvage commit whose state you did not measure is worse than none,
because the next reader assumes it was fine. If it does not build, say so
in the commit message; commit it anyway.

### 3. Commit with the mandated label

The prefix is not decoration. It is what stops a later reader from treating
partial work as a settled decision.

```
git -C <worktree> add <files>
git -C <worktree> commit -m "WIP-UNREVIEWED (do not treat as reviewed): <what it attempts>

Salvaged from an agent that died mid-task on <cause>. Contains <what is
present>; <what is not started> is missing. <Measured build and test state
at salvage time.> The resumed implementer must verify or rewrite this,
never trust it."
git -C <worktree> push -u origin <branch>
```

Push it. Durability is the entire point; an unpushed salvage commit solves
nothing.

### 4. Resume with a binding verify-or-rewrite instruction

Prefer resuming the SAME agent: its context is intact and far cheaper than
a fresh agent re-reading everything. Its message must include:

- That it died, and what was salvaged and committed on its behalf, by SHA.
- The measured state of the salvage, marked as the orchestrator's
  measurement rather than ground truth.
- Your reading of what the salvage contains and what is missing, explicitly
  flagged as a reading to be checked, not a fact.
- The binding rule: it must VERIFY OR REWRITE the salvaged content, and may
  not trust it merely because it is its own work or because it builds. If
  the design is right, keep it and say why. If it is half-thought, rewrite
  it and say so.
- The full original task, restated. Do not assume the agent remembers its
  own brief.

### 5. Expect the salvage to be wrong

In this project the salvaged code built, passed the full suite, and its
stated rationale was still false: it claimed a stranded file would be
overwritten by the next mutation, which held only on one of three code
paths. The resumed implementer found it because it was ordered to
re-derive rather than re-read, and proved the rewrite necessary with a
deliberate-failure witness that reproduced the salvaged behavior.

Ask for that proof. "I checked it and it is fine" is not evidence.

## Record it

A death mid-task is a tuition entry, not just an inconvenience: it is
evidence about the system being built. Record what was lost, what was
salvaged, what the detection gap was, and which future component should
have caught it (`delivery/tuition/T-nnn-<slug>.md`).

## Related failure shapes

- **Stalled, not dead**: no transcript activity for a long period with no
  report. Same procedure, but check first whether it is waiting on
  something (a long test run) before declaring it stalled.
- **Died after pushing**: nothing to salvage, but the branch may carry
  work that never got a report. Treat the pushed commits as unreviewed and
  audit them against the phase's files-to-touch list before continuing.
- **Killed mid-write**: a file may be truncated. Check that every touched
  file parses and builds before committing the salvage.
