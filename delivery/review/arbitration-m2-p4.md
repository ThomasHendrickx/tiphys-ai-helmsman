# Arbitration: M2-P4 scope auditor, round one

- date: 2026-08-06
- head: `2118f68a28e941937efaf08ae5b73dc20e4265dd` (branch claude/m2-p4-scope-auditor)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: **FIX-ROUND-NEEDED.** One HIGH from both contracts (they
  independently found the same defect), two mediums, one low. First fix
  round, same implementer (DR-0016).

## The verdicts

| | criteria (Sonnet, CR-1030..) | hazard (Opus, CR-1045..) |
|---|---|---|
| verdict | FIX-ROUND-NEEDED | FIX-ROUND-NEEDED |
| high / medium / low | 1 / 0 / 1 | 1 / 3 / 1 |
| the HIGH | CR-1030 (yardstick swap), reproduced live | CR-1045 (same mechanism), reproduced live |

Both contracts landed on the same HIGH from opposite directions, which is
strong signal. No disagreement.

## The mechanism, named

**The gate that audits scope lets the audited party choose the yardstick.**
`src/gates/scope.ts` forwards `--phase`, `--base`, `--head` verbatim and
never reads the declaration's own `branch` or `id` fields (grep: zero hits),
though the schema requires them. Consequences both reviewers ran live:
- naming a DIFFERENT, more permissive phase's committed declaration via
  `--phase` passes a diff the branch's own declaration would red (CR-1030);
- the merge base can be forked onto the audited branch so the declaration
  blob read is the branch's, not main's (CR-1045 W2);
- `--head` can hide the last commit from the audit (CR-1045 W3).

The fix is at the mechanism: **every input that selects what is measured is
cross-checked against a property of the branch under audit.** `--phase` must
equal the read declaration's `id`; the current branch must equal the
declaration's `branch`; and the merge base / head must be validated against
the trunk rather than trusted (W1 is closable in-module with the fields the
declaration already carries; W2/W3 need the merge base asserted to be an
ancestor of the configured trunk). A divergence is `error`, naming it.

## The mediums and low

- **CR-1047 (medium):** the gate's own failure path is an uncaught throw
  (`declarationSchema()` throws, `main()` has no try/catch), so a schema
  absent / carrying an out-of-set keyword / a named pipe at the schema path
  exits 1 (EXIT_RED) with no record. Standalone this is indistinguishable
  from a verdict. Wrap it so it errors cleanly (the M2-P1 ingest backstop
  degrades it under `gates run`, but the standalone path the module
  documents must not lie). CR-801 recurring.
- **CR-1046 (medium):** the module comment and the work history's claim-grep
  section certify the anti-widening property as "a structural fact about
  this phase's own code", which CR-1045 W2 falsifies (it holds only when
  the merge base is not on the audited branch, a property of `--base`, not
  of the code). Correct the overclaim; this is a T-006 instance inside the
  section built to catch T-006.
- **CR-1048 (medium, already fixed on main):** the new schema was outside
  `manifest-self-check`. The schema self-check enumeration merged to main
  (PR #13); the branch absorbs it at update time. No P4 action beyond the
  merge.
- **CR-1031 (low):** the branch pattern in plan text (`...-p[0-9]+-*`)
  matches zero real branches as a regex; the delivered manifest correctly
  uses `...-p[0-9]+-.*`. A necessary, correct fix that is undeclared. Record
  it as a fourth deviation and correct the plan text.

## Deviations judged (both reviewers, concurring): all three acceptable

Standalone script (matches M2-P1's `manifest-self-check` precedent, no phase
owns `cli.ts`); `parameters: [base, head]` (necessary, the runner only
auto-adds `phase`); lowercase-hyphenated `--phase` (matches the real
declaration/work-history filenames). Recorded, not findings.

## The aggregate-policy question (item 7): decided, and routed

Both reviewers reproduced it: once the full bundle runs, a `required` gate
that reaches not-applicable fails the aggregate through `decideAggregate`,
so a non-phase PR (where `scope` is structurally inapplicable) would exit
nonzero. The criteria reviewer recommends reclassifying `scope` to
`conditional` (matching `deploy`/`migrations`).

**Decision (orchestrator, DR-0016): keep `scope` `required`; do not
reclassify.** "Required" is exactly the guarantee that scope RAN and passed
on a phase PR; a `conditional` scope that silently failed to run on a phase
branch would be undetectable, which is the property worth protecting. The
paperwork/non-phase-PR inapplicability is a BUNDLE-level concern, and it is
already handled two ways: the CI bundle is pinned to `--only
manifest-self-check` in the interim (PR #13), and M2-P9's exit test asserts
against plan 1.4's per-gate expected-status table rather than a blanket
"every required gate green". This is the same resolution already recorded as
the M2-wide policy item in STATE.md; P4 does not change the manifest
classification and M2-P9 owns the confirmation against real bundle evidence.

## Fix-round contract, binding

Name the mechanism (inputs cross-checked against the branch under audit),
not the three witnesses. Publish the derivation: enumerate every `--phase`
/`--base`/`--head`/declaration read and show each is now validated; run the
yardstick-swap and the merge-base-fork constructions and show both now
`error`. Red witnesses stage the dangerous state (a different phase's
declaration named via `--phase`; a merge base forked onto the branch; a
`--head` that hides a commit). Claim grep last, raw output, commit named,
and re-run it against the corrected CR-1046 claim. Both toolchains. Update
the branch onto main first (absorbs CR-1048).
