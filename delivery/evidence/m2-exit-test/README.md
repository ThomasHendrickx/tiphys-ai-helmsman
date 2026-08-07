# M2 exit-test evidence bundle (DR-0018)

Produced by `scripts/m2-exit-test.sh` (kernel plan M2, M2-P9) on the
`claude/m2-p9-exit-test` head, floor toolchain Node `v26.6.0`, npm `11.18.0`.
This bundle supersedes the first-run bundle: blocker B (the suite gate reporter
leak) is fixed on `main` (#23), and blocker A is settled by owner decision
DR-0018.

## Fix round 2 re-capture (the scope gate now audits in CI)

A clean-room criteria review found that `scope` reported `not-applicable` on
EVERY CI `pull_request` run and never audited a diff: `actions/checkout` with no
`ref:` leaves a DETACHED HEAD, so `git rev-parse --abbrev-ref HEAD` returns
`"HEAD"`, the branch-matches precondition never matches `^claude/mN-pM-...$`, and
the exit harness accepted that N/A and passed vacuously for `scope`. The prior
bundle's `scope: green` had been captured under a NAMED-branch shortcut that did
not reproduce CI's detached state, so it never verified the deployed condition.

The fix (work-history section 10): `.github/workflows/gates.yml` checks the head
branch out BY NAME (`ref: ${{ github.head_ref }}`, `fetch-depth: 0` preserved),
so `scope` genuinely audits; and `scripts/m2-exit-test.sh` tightens the PR-bundle
expectation for `scope` from `green|not-applicable` to `green` (scope is never
legitimately N/A in a PR bundle). The captures in THIS bundle are re-run under
the faithful CI-checkout state (the head branch checked out by name, which the
`ref:` change now guarantees in CI), against the real `origin/main` (`ef6a796`)
merge base, with `scope` GREEN (12 changed paths audited).

This bundle is committed as paperwork per M2-P9 step 6; the orchestrator routes
it. Files here are the harness stdout captures (scratch absolute paths replaced
by `<evidence-dir>` and the repository root by `<repo>`; the merge-base commit is
the real `origin/main`, `ef6a796`, left verbatim) plus the two `gates run`
summaries.

## The one orchestrator prerequisite (main-side paperwork)

The exit run passes once TWO edits are on `origin/main` (they cannot be on the
phase branch, and an implementer never pushes `main`):

1. `delivery/plan/phase-declarations/m2-p9.json`: add `test/gates.test.ts` to
   `filesToTouch` and `delivery/evidence/m2-exit-test/` to `declaredExtras`.
   The `scope` gate reads the declaration from the MERGE BASE, so this must be
   at the merge base (on `main`) for `scope` to see it; a branch edit is inert
   and would itself be an undeclared change.
2. `delivery/plan/kernel-plan-m2.md`: the section 1.4 `red-witness` PR-bundle
   cell amended to `not-applicable` (DR-0018). Editing this file on the phase
   branch would red `citations` (the plan is a citation-required document that
   carries zero substantive path:line citations), so it too lands on `main`.

Both edits are now on `origin/main` (the declaration at `ef6a796` carries
`test/gates.test.ts` in `filesToTouch` and `delivery/evidence/m2-exit-test/` in
`declaredExtras`), so the captures below are from a run against the REAL
`origin/main` merge base, with the head branch checked out by name (the state
the `ref:` fix in fix round 2 now guarantees on a CI `pull_request` run, not the
old named-branch shortcut).

## What the exit test proves (delivered, DR-0018)

- The PR bundle PASSES honestly. `pr-bundle.summary.json` / `pr-bundle.out`:
  `manifest-self-check`, `suite`, `coverage`, `credential-scrub`, `citations`,
  and `scope` are green; `red-witness` is not-applicable with an evaluated,
  unmet precondition (`red-witness-diff`, `met:false`: the M2-P9 head touches no
  `src/` or `bin/`), which DR-0018 accepts for a diff-scoped gate; `deploy`,
  `migrations`, and `credential-token` are not-applicable as the table expects.
  Zero error, zero vacuous, recomputed counts equal the summary.
- Per-phase GREEN-path evidence (DR-0018 point 3), in `pr-bundle.out` and under
  `per-phase-green/` in a full run: each diff-scoped gate is shown GREEN on a
  state that genuinely triggers it: `red-witness` (4 witnesses) against its own
  merged M2-P2 diff read from real git history; `scope` (2 paths) and
  `citations` (1 citation) against purpose-built scratch repositories exercising
  the real green path (the squash-merged M2-P4 and M2-P5 ranges batched
  paperwork and are legitimately red in isolation, so a fixture is used).
- The main bundle PASSES. `main-bundle.summary.json` / `main-bundle.out`: the
  weaker six-gate run is all green or structural not-applicable; the three
  diff-scoped gates and `credential-token` are NOT run and have no record.
- The harness is NOT vacuous. `self-test.out` shows the SAME assertion program
  rejecting two injected bad bundles (a gate green with units 0, rewritten to
  error+vacuous; and a required gate whose file-exists precondition is unmet)
  and exiting nonzero, naming each gate. A diff-scoped gate reported error,
  red, vacuous, or not-applicable with no evaluated precondition STILL fails the
  harness (guarded by `test/m2-exit-test.test.ts`, red-witnessed).
- No production gate carries a status-override environment variable (asserted
  structurally in `test/m2-exit-test.test.ts`).
- The CI wiring is the single caller of `gates run`, guarded behaviourally.

## Reproduce

```
scripts/m2-exit-test.sh --self-test <dir>                     # exits nonzero, working
scripts/m2-exit-test.sh --base main --head HEAD --phase m2-p9 <dir>   # both bundles, exits 0
```

Run this on the phase branch checked out BY NAME (`claude/m2-p9-exit-test`),
which is the state a CI `pull_request` run is in after the `ref:` fix. With the
paperwork on `origin/main`, `--base main` resolves the merge base to that `main`,
`scope` reads the declaration and is green (it audits the diff; a detached HEAD
would report not-applicable instead, which the PR-bundle expectation now
REJECTS), `citations` is green (the plan doc is in the merge base, not the phase
diff), and `red-witness` is the accepted not-applicable. `--phase m2-p9` is
LOWERCASE, matching the phase-declaration filename the scope gate reads (it
uppercases only for its id check).
