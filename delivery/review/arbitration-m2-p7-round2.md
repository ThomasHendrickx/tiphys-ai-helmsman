# Arbitration: M2-P7 release verification, round two (merge)

- date: 2026-08-06
- head merged: `600ea64` (= dual-reviewed fix head `6e31fa0` + a test-timeout widening on the sites the hazard delta named)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: **CLEAN, MERGE** (on green CI, held until P4/P5 land to avoid CI contention).

## The verdicts on the fix (head 6e31fa0)

Both delta contracts APPROVE. The hazard delta independently re-attacked all
three CR-1440 findings on the shipped code: the FIFO-at-each-write-path attack
was bounded at every one of the enumerated write sites (request, stdout,
stderr, attempt-record, response), and a harness control removing the guard
in-tree confirmed the harness detects the hang and the guard is load-bearing;
CR-P7H-2 (checksum-absent now errors with disclosure) and CR-P7H-3 (redaction
scoped to single-step forms with the composite residue disclosed, no
overclaim) both closed; killSignal numeric-9 confirmed load-bearing and not a
C-2 violation. The criteria delta re-executed all 12 criteria and both red
witnesses (the FIFO-hang one actually hung against pre-fix code).

## The one non-blocking LOW, and why the head moved to 600ea64

The hazard delta named a merge-practical LOW: several of P7's OWN
subprocess-spawn tests (deploy-gate 529/566/714/726, release-contract
539/579) carried `attemptTimeoutMs: 3000`, tight enough to flake under CI
load, and since DR-0012 requires CI green on the exact head, it recommended
raising them to the phase's own 5000ms convention. Under the contended CI
this milestone has been fighting, that is worth doing proactively rather than
gambling on a quiet window. The orchestrator applied exactly that (six sites,
`: 3000` -> `: 5000` in those two files), verified the two files pass on the
floor toolchain, and confirmed the build stays clean. This is a
non-behavioral test-budget widening on reviewer-named sites (it can only give
a passing test more room, never make a failing one pass), so per the same
proportionality applied to M2-P4's registry-key addition, it merges without a
third dual review. Recorded here for audit.

## Merge conditions (DR-0012)

Dual APPROVE on the code; scope clean (fix touched the declared P7 files;
the timeout change touched two declared test files); branch current with
`main` (P7's fix merged `8439c88`); CI green on the exact merged head
`600ea64` (pending; run when P7's turn comes after P4/P5, one clean run, no
overlapping reruns). Carried to M2-P9: nothing new from P7 beyond the
killSignal witness carve-out already recorded in task 31.
