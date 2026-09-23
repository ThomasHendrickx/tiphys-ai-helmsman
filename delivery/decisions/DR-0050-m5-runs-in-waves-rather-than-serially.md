# DR-0050: M5 runs in waves rather than serially

- id: DR-0050
- status: DECIDED
- decided-by: owner, with the wave split taken by the orchestrator under DR-0016
- date: 2026-09-23
- supersedes: nothing
- relates-to: DR-0011, DR-0012, DR-0049

## The decision

Every phase of the M5 plan carries `parallelizable: false`
(delivery/plan/value-delivery-plan.yaml:94). The owner instructed, on
2026-09-23: "do execute parts in parallel as much as possible". That overrides
the flag for M5.

DR-0011 already permits parallel work where a recorded pre-pass proves phases
disjoint. The pre-pass is delivery/plan/m5-conflict-pre-pass.md:1. It splits M5
into four waves, and merge order stays dependency order.

## Two consequences stated rather than left to be found

M5-P6 is one phase, one branch and one pull request. Its kernel half starts in
wave A and its hemma half in wave D, so its branch stays open across the whole
milestone and is refreshed from `main` before its hemma half starts.

`delivery/STATE.md` is edited by M5-P1, M5-P5 and M5-P6, and waves do not
separate all three. Whichever of them merges second merges `main` into its
branch first and resolves that file by hand, and the resolution is reviewed.
The pre-pass records this under its merge order.
