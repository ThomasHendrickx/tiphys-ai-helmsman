# DR-0010: Harness-native orchestration primitive as an executor implementation

- id: DR-0010
- project: tiphys-kernel
- task: stage-2-execution (raised during M1-P3 verification)
- question: The build harness now offers a native multi-agent orchestration primitive (deterministic script control flow spawning disposable agents, with structured outputs and parallel fan-out). The blueprint was written before this existed. Should the Claude Code harness adapter (M4) implement the kernel's ExecutorAdapter on top of that primitive, and should any judgment-layer fan-out (M3 review stages) target it?
- reversibility: reversible (it is an adapter implementation choice behind an interface the kernel already owns), but it shapes how thin the harness adapter really is and how much orchestration the kernel needs to own itself
- status: open (no action required before M4; recorded now so the observation is not lost)
- decided: (pending)
- date: 2026-08-04

## Why this was raised

During the M1-P3 fix-round verification, the orchestrator ran a five-lens adversarial verification with per-finding refutation using the harness's own workflow primitive. The owner observed that this looks structurally like what Tiphys is being built to do, and asked whether the system was already running on itself.

It was not, and it must not be before M4 (settled owner decision). But the observation is architecturally real: a harness-native primitive now provides deterministic control flow over disposable agents, which is one of the shapes the kernel formalizes.

## What the primitive does and does not provide

Provides: deterministic control flow (loops, conditionals, fan-out) over disposable agents; structured outputs validated at the tool boundary; parallel execution with a concurrency cap; a per-run journal and same-session resume.

Does not provide, and these are precisely the kernel's reasons to exist:
- Durable fleet state. The run's truth lives in session context and a run journal, not in files, worktrees, and git. A container reclaim loses it. Blueprint principle 4 requires the opposite.
- Deterministic verification. Its checks are LLM lenses; the kernel's gate layer is scripts with exit codes (placement rule, blueprint section 1). LLM verification of LLM work is exactly what the kernel refuses to rely on where computation is possible.
- Exclusion and isolation. No session lock, no per-task worktree, no credential scoping, no teardown guard.
- Owner interface. No charter, no decision records, no escalation contract.
- Structural coverage. No orphan-finding checker, no citation linter, no scope auditor; the no-orphans discipline in this run was enforced by hand.
- Portability. It is one harness's capability. The kernel is distributed by npm and pinned per fleet, and must survive a harness change (blueprint section 3).

## Options for M4

1. Implement the harness adapter's ExecutorAdapter on top of the primitive: the kernel dispatches a phase, the adapter runs it as a workflow step. Keeps the kernel's contracts and state, borrows the harness's execution machinery.
2. Keep the adapter on plain subprocess or window execution (the M1 local implementation), and treat the primitive as unrelated tooling.
3. Hybrid: subprocess execution for ship phases (which need worktree isolation and durable evidence), primitive-backed execution for read-only fan-out shapes such as multi-lens review, where isolation matters less and parallel judgment is the whole point.

## Preliminary recommendation (not a decision)

Option 3, decided properly at M4 with evidence. The M1-P3 verification is a data point that primitive-backed fan-out is strong for read-only judgment work, and equally a data point that it carries none of the durability the ship path requires: the same session had an implementer die mid-fix-round holding uncommitted work (tuition T-002), which the kernel's own salvage and teardown contracts exist to handle and the primitive does not address.

## Cost observation worth carrying into assurance-tier policy

That verification cost roughly 700k tokens and an hour of wall time for one fix round on one phase. This is a concrete instance of why assurance is tiered and declared per project rather than improvised (blueprint section 8). The kernel should make that spend an explicit mode choice, not something an orchestrator can decide to do quietly on a routine phase.

## Evidence

- Blueprint distribution and adapter decision: delivery/intake/orchestrated-delivery-v1.md section 3.
- Placement rule (computable work is a script, not an LLM): delivery/intake/orchestrated-delivery-v1.md section 1.
- Durability principle: delivery/intake/orchestrated-delivery-v1.md section 0, principle 4.
- Assurance tiers: delivery/intake/orchestrated-delivery-v1.md section 8.
- ExecutorAdapter contract and the M1/M4 obligation split: delivery/plan/kernel-plan-v1.md, M1-P4 section and section 3.
- Agent death and salvage in this same session: delivery/tuition/T-002-agent-death-mid-fix-round.md.
