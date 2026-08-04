# DR-0007: Orchestration runtime substrate

- id: DR-0007
- project: tiphys-kernel
- task: stage-1-plan
- question: What substrate does a Tiphys fleet run on: a persistent local machine, reclaimable cloud sessions, or both? Raised by finding SC-007: the blueprint's infrastructure (per-machine fleet/, spawn allocating a "window", per-fleet locks, a resident watcher process) assumes a persistent machine, while the process doc that defines the building environment assumes reclaimable cloud containers. The shape of watcher, spawn, lock, and teardown (most of M1) depends on the answer.
- reversibility: costly (building M1 for the wrong substrate is milestone-scale rework; the settled thin-adapter decision covers harness integration, not the substrate the fleet lives on)
- status: open
- decided: (pending)
- date: 2026-08-04

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
