# Clean-room review: M3-P11, criteria-contract lens

Reviewer: clean-room A (criteria lens). Head under review:
`claude/m3-p11-precondition-crash-verdict` at a73313d, PR #137.
Started 2026-08-13. This file is written incrementally; it is the liveness
beacon for this round.

Lens: THE ELEVEN ACCEPTANCE CRITERIA AS A CONTRACT. A second reviewer
covered the hazard lens; its report is quoted as
`delivery/review/clean-room-m3-p11-hazard.md` (a file this branch does not
carry). This review was formed before that report was opened, and the two
findings it recorded (H-1, the readability gap in the runnability probe, and
M-1, the directory-prefix addition) are NOT re-derived here.

The spec under contract is delivery/plan/m3-p11-phase-spec.md:112 (criteria
1 to 7) and delivery/plan/m3-p11-phase-spec.md:186 (the amendment, criteria
8 to 11).

## NOT COVERED (read this first)

In progress. Final list before the verdict.

## Environment, stated with all three axes

- toolchain: node v26.6.0 (scratch prefix on PATH), npm 11.x
- worktrees: three, all under an absolute scratch path, cut with
  `git worktree add`. The primary repository was never mutated.

## Findings

In progress.

### Progress log (appended as the round runs)

- Build and suite measured at head (criterion 7): `npm ci` exit 0,
  `npm run build` exit 0, `git status` clean afterwards.
- `spawnSync` premise re-derived independently: the implementer's four-row
  table reproduces exactly.
- Criteria 1, 2, 3 executed on a purpose-built one-gate manifest through the
  real CLI, with a `main` control.
- Criterion 5 executed against a packed tree from `npm pack`, with a `main`
  control.
- Criterion 4 executed, both members, on the precondition path.
- Criteria 8, 9, 10, 11 executed on a purpose-built scope-gate lab repo,
  both directions on the same declaration, plus a prefix-boundary control.
- FINDING IN HAND: the criterion-9 amendment note does not reach the
  runner's stdout on the GREEN arm. Measured, see C-1 below.
