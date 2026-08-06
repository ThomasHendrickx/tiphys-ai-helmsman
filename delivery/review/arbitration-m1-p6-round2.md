# Arbitration: M1-P6 round two, both contracts on one medium

- date: 2026-08-05
- head: `8954b05` (PR 9)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: FIX-ROUND-NEEDED. One medium, found INDEPENDENTLY by both
  contracts. The DR-0012 stop-and-wait limit does not fire: this is the
  phase's second round, and neither contract returned a high.

## The verdicts

| | hazard (Opus) | criteria (Sonnet) |
|---|---|---|
| verdict | FIX-ROUND-NEEDED | APPROVE |
| high / medium / low | 0 / 1 / 7 | 0 / 1 / 0 (+1 informational) |
| gates Node 26 | 155 / 155 / 0 skip | 155 / 155 / 0 skip |
| gates Node 22 | 155 / 153 / 2 skip | 155 / 153 / 2 skip |

There is no real disagreement this time. Both found the SAME defect
(CR-640 and CR-661 are one finding) by different routes and different
mutations. The verdict split is only that the criteria contract graded its
own medium as non-blocking for the criteria and the hazard contract graded
it blocking; DR-0012 clause 2 settles that, and an unresolved medium blocks.

The orchestrator reproduced it a third time with a single-line mutation,
recorded in `delivery/verification/cr-661-orchestrator-reproduction.md`.

## The finding

`exit-test-falsifiability-guard-wired` asserts that TEXT is present in the
workflow. It catches deletion of the CI falsifiability step. It does NOT
catch a defang: three constructed mutations leave it green (`exit 1` to
`exit 0` in the guard-broken branch, `continue-on-error: true`, and dropping
`process.exit(1)` from the C2 arm), while both the test's own comment and the
work history claim it catches "deleted or defanged".

Nothing shipped is broken. The live wiring is correct and criterion 5 holds.
What is broken is the regression protection, in the exact way the previous
round was convened to fix.

## What the round genuinely achieved, recorded so the fix round is not read as failure

The hazard contract established that the harness is now HARDER to fool than
at `79604ec`, with constructions rather than argument:

- The predecessor's unconditional-emit watcher mutation now dies at **A5**,
  where at the previous head it reached C3 green.
- A blind watcher emitting after 25 seconds goes green only with A1 stubbed,
  and dies at A1 with A1 intact.
- `run_step` sabotage alone and `assert_step` sabotage alone are each caught
  independently; only both together go green, and then both arms of the CI
  step catch it. W7b's double sabotage is genuinely the minimum.
- CR-601's watcher trap holds on all SEVEN exit paths the reviewer enumerated
  and built, with a control confirming the leak returns when the trap is
  removed.

CR-600, CR-602, CR-603, CR-604, CR-606 and CR-609 are RESOLVED. CR-605 and
CR-607 are partial, and their remainders are CR-640 and CR-643.

## Two corrections the orchestrator accepts against itself

**CR-645.** The orchestrator told the owner that CR-608 was "a plan question,
not a harness question". That is overstated. The plan sentence IS wrong, and
separately the harness can be made safe today: `lock acquire --duration`
exists, and a non-fatal observational renew is available. DR-0015 has since
adopted exactly that (option 1, size the lease), which makes it a harness work
item now rather than a deferred plan matter.

**CR-646.** The recursion argument in the test header cites `003-A1.out`
reporting `tests 153`; it reports `155` at this head. The substance was
verified true; the number is stale.

## Disposition

Fix round dispatched under normal process, no owner escalation. If the round
comes back with a high, or if this phase needs a third round, the DR-0012
limit applies as written.
