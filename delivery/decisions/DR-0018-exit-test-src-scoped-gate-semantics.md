# DR-0018: M2 exit-test semantics for src-scoped gates

- status: DECIDED (owner, 2026-08-07)
- raised by: the M2-P9 exit test's first full-gate-set integration run.

## The question

The M2 exit test's PR bundle runs on M2-P9's own pull-request head
(`--base main --head HEAD --phase m2-p9`), which touches no `src/` or `bin/`.
Three gates are diff-scoped: `red-witness` (precondition `diff-touches src/,
bin/`), `scope` (branch/`--phase`), and `citations` (`diff-touches` configured
documents). On the exit head, `red-witness` is legitimately `not-applicable`
(its precondition is correctly evaluated and unmet), and the runner treats a
required gate reporting `not-applicable` as a failure (exit 20). But section
1.4's table marked these gates `required -> green` for the PR bundle. The exit
phase cannot, by its own nature, make a src-scoped gate green on its own head,
so the table as written is unsatisfiable by the exit test. This is a plan
contradiction the exit test surfaced, not an implementation defect.

## The decision: accept N/A, and assert per-phase green

1. Amend section 1.4's PR-bundle column so a diff-scoped gate whose trigger the
   exit head does not touch is expected `not-applicable` with a recorded reason
   (its precondition id and evaluation), not `green`.
2. The exit harness passes when, on the exit head: every non-diff-scoped
   required gate is green; every diff-scoped gate is either green (if its
   trigger is touched) or `not-applicable` with a valid recorded reason; zero
   `error`; zero vacuous; recomputed counts equal `summary.json`.
3. ADDITIONALLY, the harness carries green-path evidence for each diff-scoped
   gate: it demonstrates the gate green against a state that actually triggers
   it (its own phase's merge diff, or a committed representative fixture that
   exercises the gate's real green path), and records that in the bundle. This
   is what distinguishes the chosen option from a bare "accept N/A": the exit
   bundle proves the diff-scoped gates WORK, not merely that they report
   not-applicable correctly on a head that does not exercise them. The
   green-path demonstration must exercise the gate's real applicability, not a
   trivial or vacuous case (a reviewer confirms this).
4. The exit run stays on M2-P9's real PR head; no synthetic src-touching head
   is substituted.

## Consequences

- Section 1.4's table is amended accordingly (batched with the other M2
  plan-text amendments).
- The M2-P9 harness assertions (step 2) implement 1-3; its `--self-test`
  falsifiability path is unchanged.
- DR-0015 governs: this evidence is reported to the owner unasked; it is a
  reporting obligation, not an approval step. The decision itself was the
  owner's because it defines what the milestone exit test asserts.
