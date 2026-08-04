# T-002: Agent death mid-fix-round, salvage discipline exercised for real

- id: T-002
- project: tiphys-kernel
- date: 2026-08-04
- stage: M1-P3 fix round (PR 3, lock and pool)
- kernel-relevant: yes (salvage is a toolbelt obligation, not a prompt rule)

## What happened

The M1-P3 implementer was resumed to apply four clean-room findings and died partway through on a provider usage limit, holding uncommitted work: a partial edit to src/lock.ts covering part of CR-202 and the start of CR-204. Nothing was committed and nothing was pushed, so a container reclaim at that moment would have lost it silently.

The orchestrator applied the process's salvage rule by hand: inspect the leavings, measure their true state (build exit 0, suite 56 tests 54 pass 0 fail), commit them with the "WIP-UNREVIEWED (do not treat as reviewed)" prefix, push for durability, then resume the implementer with a binding verify-or-rewrite instruction rather than letting it continue as if its own uncommitted work were trustworthy.

## Lesson

Two structural gaps this exposed, both currently prompt-only:

1. Salvage is manual. The process doc mandates it (section 6) and the plan carries it as a teardown --salvage flag (M1-P4), but nothing detects an agent that stopped holding uncommitted work. The detection half belongs with the watcher and liveness guard: an executor whose task is open with no turn-end record and a dirty worktree is exactly the abandoned-task case the plan's executor.json deadline detection was designed for (PR-207). This incident is evidence that the deadline path must be exercised, not just specified.

2. Agent death from provider limits is a distinct failure class from crash or timeout, and it produces a clean, quiet stop with the work intact on disk. Any liveness design keyed only to process exit codes or heartbeats would classify this as an ordinary completion. The turn-end contract must therefore carry the exit reason, and a missing turn-end must never be read as success (already the design; this is the first real instance proving why).

## Structural consequence to consider

- M1-P4 (spawn and teardown) must witness the salvage path with a real dirty worktree, not a simulated one, and its --salvage commit prefix must match what this incident used so the audit trail is uniform.
- M1-P5 (watcher and liveness guard) should treat "task open, no turn-end, worktree dirty" as a wake condition with its own reason line, so the human is told rather than discovering it later.
- Consider recording provider-limit deaths in task meta when detectable, so a resumed run can distinguish "died with work in hand" from "finished cleanly".

## Evidence

- Salvage commit 2250266 on branch claude/m1-p3-lock-and-pool, message prefix "WIP-UNREVIEWED (do not treat as reviewed)".
- Measured salvage state recorded in the commit message and in delivery/work-history/m1-p3.md fix-round section.
- Process rule: delivery/intake/orchestrated-delivery-process.md section 6, salvage discipline.
- Related plan design: PR-207 executor launch record and deadline detection, M1-P4 teardown --salvage.
