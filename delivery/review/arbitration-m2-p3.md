# Arbitration: M2-P3 suite wrapper, round one

- date: 2026-08-06
- head: `6fe8066924ba` (branch claude/m2-p3-suite-wrapper)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: **FIX-ROUND-NEEDED.** One code medium (hazard) and two record
  mediums (criteria); a light round. First fix round.

## The verdicts

| | criteria (Sonnet, CR-M2P3-..) | hazard (Opus, CR-1306) |
|---|---|---|
| verdict | FIX-ROUND-NEEDED | FIX-ROUND-NEEDED |
| high / medium / low | 0 / 2 / 2 | 0 / 1 / 0 |

Both contracts confirm the wrapper mechanism is sound (criterion 11's
cross-toolchain byte-identical counts, the reporter-pin defenses, discovery
parity) and independently reproduced the key defenses. The findings are one
real code defect and two record corrections.

## The code medium (CR-1306, hazard)

**An empty `.test.ts` file's phantom pass is counted as a real test, which
bypasses M2-C-2.** `node --test` emits a nesting-0 `test:pass` named after
the file path for a file that defines zero tests; `bucketPoints` counts every
`entityType === "test"` point, so an emptied-but-present file inflates `units`
by one and, because `units > 0`, the "never green by omission" rewrite never
fires. Captured: three empty `.test.ts` files plus an empty registry ->
GREEN, units 3, exit 0. Latent today (the kernel has no empty test files, and
criterion 1's real count is accurate), but this is the phase's own declared
hazard (a measurement that can shrink silently), and the code comment at
`suite.ts:336` asserts the false generalization that file wrappers emit no
pass/fail. Fix at the mechanism: a walked file whose only reported point is a
nesting-0 pass named after its own path is a shrink finding, not a counted
green; correct the false comment. Red witness: the empty-file suite is an
error/shrink, not green, in both directions, and criterion 1's real count is
unchanged.

## The two record mediums (criteria)

- **CR-M2P3-1:** the work history's criterion-10 line says "216 tests, 216
  pass"; this session measured 217 twice on both toolchains on the exact
  head. Correct the number in the work history (no code change).
- **CR-M2P3-2:** this branch edited `.github/workflows/gates.yml` (its interim
  `--only` push-bundle pin), which is not on its files-to-touch list and not
  in `m2-conflict-pre-pass.md`'s gates.yml contender set. **This dissolves at
  branch update:** the schema self-check fix already pinned `--only
  manifest-self-check` on `main` (PR #13), so P3's edit is now redundant.
  Reconcile `gates.yml` to main's version, dropping P3's edit entirely, so
  the phase no longer touches the workflow at all and the scope finding is
  closed rather than argued. No pre-pass amendment needed once the file
  leaves P3's diff.

## The lows

Two informational: additional real-clock flakes surfaced in untouched files
(the liveness/watcher/gates real-clock family, load-dependent, pass in
isolation), and `walkTestFiles` treating a symlink-to-regular-file as
walkable (pre-existing primitive behavior, no criterion covers it). Both
ride, recorded; the symlink note joins the standing observation set.

## Fix-round contract, binding

Name the mechanism (a self-named nesting-0 phantom pass is not a test), not
the empty-file instance. Publish the derivation and its non-coverage. Red
witness stages the empty-file suite as an error/shrink both directions with
criterion 1 unchanged. Correct the two records. Update the branch onto main
first and reconcile gates.yml to main (drop the redundant edit). Claim grep
last, raw output, commit named. Both toolchains. Suggested tier: Sonnet (the
code fix is small and well-specified).
