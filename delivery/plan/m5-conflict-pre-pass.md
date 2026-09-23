# M5 conflict pre-pass, 2026-09-23

Written before dispatch, as CLAUDE.md binding convention 5 requires. Subject:
the six phases of delivery/plan/value-delivery-plan.yaml:1, at `main` head
`e81c5e8`. Owner instruction, 2026-09-23: "do execute parts in parallel as much
as possible". Recorded as
delivery/decisions/DR-0050-m5-runs-in-waves-rather-than-serially.md:1.

## Literal overlap

Derived from the six phase declarations, filesToTouch plus declaredExtras,
minus `test/behaviors.json` (append-only, union-resolved) and each phase's own
declaration file:

```
$ node -e '<pairwise intersection over delivery/plan/phase-declarations/m5-p*.json>'
P1 P5 delivery/STATE.md
P1 P6 delivery/STATE.md
P2 P3 roles/clean-room-reviewer.md
P3 P4 test/gate-registry.test.ts
P3 P5 test/clean-room-brief.test.ts
P5 P6 delivery/STATE.md
```

Every other pair is literally disjoint.

## Semantic coupling a file diff cannot see

These are reviewer obligations, not proofs of independence.

1. **P3 and P4 over the gate registry.** P4 makes `assurance-modes.yaml`
   equal the registry's full-mode set and adds a test that reddens on any
   difference. P3 edits `gate-registry.yaml` and `gates.manifest.json` and does
   NOT declare `assurance-modes.yaml`. If P3 adds or renames a full-mode gate,
   P4's test goes red after P3 merges. P3's reviewers must check this against
   P4's merged test.
2. **P2 and P3 over the review contract.** P2 adds a delivered-outcome object
   to the final report and names it in `roles/clean-room-reviewer.md`; P3
   rewrites the same role's output contract. P3 is cut from `main` after P2
   merges and must keep P2's text.
3. **P5 prunes the rule files every earlier phase reads.** It runs after P3 so
   that the rules P3 adds to the skills and roles exist before pruning, and so
   no earlier phase runs under pruned rules.
4. **P6 proves the corrected kernel.** Its kernel half (the conflict command)
   touches `src/commands/conflicts.ts`, `src/cli.ts` and
   `test/conflicts.test.ts` only, which no other phase touches. Its hemma half
   needs P2 to P5 merged, because the plan's intent is to prove the corrected
   kernel, and it needs owner access to hemma.
5. **P4 changes `.claude/orchestrator-next.mjs`**, which the orchestrator reads
   between phases. No other phase touches it.

## Waves

| wave | phases, concurrent | starts when |
|---|---|---|
| A | M5-P1, M5-P2, M5-P4, M5-P6 kernel half | now |
| B | M5-P3 | M5-P2 and M5-P4 merged |
| C | M5-P5 | M5-P3 merged |
| D | M5-P6 hemma half, then its one pull request | M5-P5 merged and hemma access granted |

Merge order is dependency order even when work is concurrent: P2 and P4 before
P3, P3 before P5, P5 before P6. M5-P1 has no code dependency and merges when
its evidence is complete; it waits on an owner reboot of pulse. Whichever of
P1, P5 and P6 merges second merges `main` into its branch first and resolves
`delivery/STATE.md` there; that file is edited by all three and is not
append-only, so the resolution is by hand and is reviewed.

## What this pre-pass did NOT cover

- Test files that read files owned by another phase, without editing them.
  The derivation is over declared edit lists only. A test in one phase that
  asserts on text another phase changes would redden after merge and is not
  visible here. Each phase runs the full suite on a `main`-merged tree before
  its pull request, which is where that shows up.
- Anything under hemma. Its files are in hemma's own repository.
