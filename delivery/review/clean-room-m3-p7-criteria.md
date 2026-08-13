# Clean-room review, M3-P7, criteria contract

- Subject: branch `claude/m3-p7-review-checklists`, PR #124, head 4bfa790
- Contract: criteria. Every acceptance criterion of M3-P7 in
  delivery/plan/kernel-plan-m3.md:3861 walked and EXECUTED.
- Reviewer: clean-room agent A. Did not write this code.
- Report branch cut from `origin/main` at d5051e5 (T-019).
- Status: IN PROGRESS (appended incrementally; mtime is the beacon).

## Citation convention in this document

This report sits on `main`. Files the branch CHANGES are quoted in backticks
and are deliberately non-resolving, per CLAUDE.md:155. Only paths byte-identical
on both sides are cited as `path:line`.

## Criteria walked

(appended below as each is executed)

## Toolchain, build state, invocation (the complete suite sentence)

Node v26.6.0 from the scratch prefix (`node --version` checked in the running
shell), `dist/` BUILT via `npm run build` (exit 0), invocation `npm test`, in a
worktree at head 4bfa790:

    npm ci exit=0
    npm run build exit=0
    tests 688 / pass 688 / fail 0 / SKIPPED 0 / todo 0
    npm test exit=0

That matches the work history's own sentence.

## Criterion 1: `validate --type checklist` exits 0 on the checklists

EXECUTED. The literal command in the criterion exits 1:

    $ node bin/tiphys.ts validate --type checklist checklists/clean-room.yaml
    SKIPPED gate-probes-resolve no context
    EXIT=1

All five checklists behave the same way. With `--context` they exit 0:

    $ node bin/tiphys.ts validate --type checklist --context . checklists/clean-room.yaml
    EXIT=0
    $ node bin/tiphys.ts validate --type checklist --context . checklists/hazard-review.yaml
    EXIT=0

This is NOT new behaviour introduced by the phase. The same shape is already
merged on `main` from M3-P3, measured in the same worktree on a file the branch
does not change:

    $ node bin/tiphys.ts validate --type assurance-modes assurance-modes.yaml
    SKIPPED charter-mode-enum-matches-modes no context
    SKIPPED mode-conditions-quote-granted-by no context
    SKIPPED mode-gate-sets-resolve no context
    EXIT=1

Verdict: DISCHARGED under the repository's established `--context` convention.
The criterion's wording (and criterion 4e's) omits `--context`; recorded as
finding CR-01 (LOW).

## Criterion 2: probe injection, all directions (R-054)

EXECUTED, four directions, all against the built branch:

| extra file | exit | output |
|---|---|---|
| disjoint probe | 0 | `probes 24` (23 canonical + 1), the extra last |
| reuses `correctness-zero` | 1 | `probe id correctness-zero is declared in checklists/clean-room.yaml and again in <extra>` |
| `evidence-required: false` | 1 | `... does not require evidence; every extra probe must set evidence-required: true` |
| `evidence-required` ABSENT | 1 | `INVALID #/probes/0/evidence-required required property evidence-required is missing` |

The collision message names BOTH sources, which is what the hazard class asks
for (a silent last-wins override). DISCHARGED.

## Criterion 4c: framings differ at the entry point

EXECUTED:

    --framing criteria-contract  -> exit 0, first probe criteria-walked-with-evidence
    --framing destructive-paths  -> exit 0, first probe destructive-authority-declared
    --framing nope               -> exit 1, "declares no framing nope; it declares
                                    criteria-contract, destructive-paths, fix-round"

Each framing resolves 23 probes, so no framing drops one. DISCHARGED.

## Criterion 4d: `--framing fix-round` heads on `fix-round-not-covered`

EXECUTED at the command level:

    --framing fix-round -> exit 0, "1. fix-round-not-covered [fix-round] evidence-required"

Noted for the test-reachability check below: the DEFAULT resolution, with no
framing at all, also heads on `fix-round-not-covered`, because that probe is
first in the file. This is exactly the confound the fix round says it closed;
checked separately.
