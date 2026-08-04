# DR-0007: Orchestration runtime substrate

- id: DR-0007
- project: tiphys-kernel
- task: stage-1-plan
- question: What substrate does a Tiphys fleet run on: a persistent local machine, reclaimable cloud sessions, or both? Raised by finding SC-007: the blueprint's infrastructure (per-machine fleet/, spawn allocating a "window", per-fleet locks, a resident watcher process) assumes a persistent machine, while the process doc that defines the building environment assumes reclaimable cloud containers. The shape of watcher, spawn, lock, and teardown (most of M1) depends on the answer.
- reversibility: costly (building M1 for the wrong substrate is milestone-scale rework; the settled thin-adapter decision covers harness integration, not the substrate the fleet lives on)
- status: decided
- decided: Dual substrate, local machine and cloud sessions both first-class (owner, 2026-08-04)
- date: 2026-08-04

## Decision

Owner rejected the local-only recommendation as too tight: the fleet must run both on a machine the owner controls and in reclaimable cloud sessions, and the owner already runs the current process from cloud sessions today. Consequences: the substrate adapter is a v1 requirement with two first-class targets, and M1 component cores must be substrate-neutral (locks use lease semantics with expiry rather than pid-only liveness; the watcher must be runnable both as a resident process and as an externally triggered single pass; spawn's window allocation is one adapter behind which a cloud session mechanism is equally valid). Triggers a plan revision before M1-P2 or any later phase dispatches.

## Plain-language context (added after owner review round 1)

When Tiphys is live (M4 and later), the orchestrator, its agents, and the watcher have to run somewhere. Two candidate homes exist. First, a machine you control that stays on (laptop, desktop, home server): processes can stay resident, terminal windows can hold agents, a lockfile can point at a live process id. Second, throwaway cloud sessions like the one building Tiphys right now: containers that are reclaimed between uses, where nothing stays resident. The blueprint's M1 components (a watcher that sleeps as a process, spawn allocating a window, pid-based locks) only work as written on the first kind. The recommendation is to build v1 for a machine you control and keep the machine-specific parts behind a small interface so cloud support can be added later without a rewrite. The question in one line: will your fleet run on a machine you control, and is designing v1 for that acceptable?

## Options

1. Persistent local machine. The fleet home lives on a machine the owner controls; the watcher is a resident process; spawn allocates a terminal-multiplexer window (or equivalent) via a small adapter; locks are per-fleet lockfiles with pid liveness. This is what the blueprint reads as intending.
2. Reclaimable cloud sessions only. No resident processes; the watcher becomes a scheduled wake (which the blueprint explicitly replaced: "event watcher + guard (replaces cron)"); locks need lease semantics instead of pid checks. Contradicts several blueprint contracts as written.
3. Persistent local machine as the v1 substrate, with the substrate-touching seams (window allocation, process liveness checks) isolated behind a small adapter interface so a cloud adapter is a later addition, not a rewrite.

## Recommendation

Option 3: persistent local machine is the v1 target (confirming the blueprint's evident intent), with window allocation and liveness probing behind an adapter seam. During construction (M1 through M3, built by the current process, possibly from cloud sessions), the kernel's own correctness is demonstrated by its test suite and CI, not by requiring a resident fleet in the build environment; the M1 exit test runs on a real machine with a real fleet home.

The plan's M1 phases assume this recommendation. A different owner choice triggers a plan revision before M1-P2 or any later M1 phase is dispatched.

## Evidence

- SC-007 in delivery/verification/spec-coherence-report.md (silence-irreversible, severity medium).
- Per-machine fleet, window allocation, resident watcher: delivery/intake/orchestrated-delivery-v1.md sections 3, 4, and 10.
- Reclaimable-container assumptions of the building process: delivery/intake/orchestrated-delivery-process.md section 6.
- Watcher replaces cron by design: delivery/intake/orchestrated-delivery-v1.md section 11 and delivery/requirements/migration-table.md row R-078.
