# Arbitration: M2-P5 citation linter, round two (merge)

- date: 2026-08-06
- head reviewed: `2d7efc3` (branch claude/m2-p5-citation-linter)
- head merged: `7e31632` (= reviewed fix head `2d7efc3` + a clean merge of
  `origin/main` 8439c88; no P5 source or test change on top of the reviewed head)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: **CLEAN, MERGE** on green CI.

## The verdicts on the fix (head 2d7efc3)

| | criteria delta | hazard delta |
|---|---|---|
| verdict | APPROVE | APPROVE |
| the three round-one HIGHs | criteria 1-9 re-executed against the rewritten suite, closed | CR-1015 (gate red on own head), CR-1017 (--head vs working tree), and the third HIGH re-attacked at the mechanism, closed |

The two contracts ran on different model families per T-007 and DR-0012. Both
independently confirmed the decisive round-one HIGH is closed: the citation
gate no longer exits red on the head that delivers it (the quoted-versus-made
citation distinction, settled as M2-D-22), and `--head` now reads git blobs at
the ref rather than the working tree (CR-1017). The criteria delta re-executed
all nine acceptance criteria against the rewritten test suite. The hazard delta
recorded one LOW/bounded observation: four-space indented code blocks are not
modeled as a citation-quoting form, which is within M2-D-22's decided boundary
("code span or fence") and is diff-scoped, so it does not block.

## Why `7e31632` merges on the reviews of `2d7efc3`

`7e31632` is `2d7efc3` with `origin/main` (8439c88) merged in to bring the
branch current. The diff of the merged head against `main` is exactly P5's
reviewed contribution plus the two append-only registry unions:

- `git diff --name-status origin/main...HEAD` = work-history (A),
  `src/gates/citations.ts` (A), `src/gates/schemas/citation-config.schema.json`
  (A), `test/citation-gate.test.ts` (A), `gates.manifest.json` (M),
  `test/behaviors.json` (M). No `.github/workflows/gates.yml` change.
- `gates.manifest.json` union is correct: main carried
  `[manifest-self-check, coverage]`; the merged head carries
  `[manifest-self-check, citations, coverage]`, adding P5's gate and clobbering
  neither of main's. Both registries parse (`test/behaviors.json` 265 keys,
  `gates.manifest.json` 3 gates).

This is the same main-merge-on-top-of-a-reviewed-head pattern accepted for P4
(arbitration-m2-p4-round2.md): the reviewed code is unchanged, only the
already-merged main content and the registry unions are added.

## Merge conditions (DR-0012)

Dual APPROVE on the code; scope audit clean (declared files plus the two
standing-extra registries and the phase work history); branch current with
`main`; CI green on the exact merged head `7e31632` (pending, merge on green).
