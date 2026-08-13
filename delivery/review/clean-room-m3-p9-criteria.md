# Clean-room review: M3-P9, acceptance criteria as contract

Reviewer: independent clean-room agent, lens = ACCEPTANCE CRITERIA AS A CONTRACT.
Head under review: `claude/m3-p9-agents-policy` at d9d5a1d, PR #131.
Review branch cut from `main` at 12f84f9 (T-019: never cut evidence from the branch under review).
Started 2026-08-13. This file is written incrementally; an incomplete file means the
reviewer died, not that the review passed.

Toolchain for every command below unless stated otherwise: node v26.6.0 from the
scratch prefix, confirmed by `node --version`.

## STATUS: IN PROGRESS

(sections appended as work proceeds)

## Environment established

- `node --version` prints `v26.6.0` in every shell below.
- Worktree of d9d5a1d cut with `git worktree add --detach` under an absolute
  scratch path. `npm ci` exit 0, `npm run build` exit 0, `git status --short`
  EMPTY after the build (the clean-tree acceptance criterion of the standing
  gate list).
- `origin/main` is 12f84f9 and d9d5a1d is a merge of it, so `origin/main...HEAD`
  is the branch's own change set: 24 files, 5128 insertions.

## Criterion 1: `tiphys validate --type role-brief AGENTS.md`

EXECUTED. Exit 0. The command prints NOTHING on success, which I checked is
this command's normal behaviour rather than a swallow: the same command against
`roles/implementer.md` on the same head is also silent and also exit 0, and both
stdout and stderr are empty. The `role: orchestrator` half of the criterion is
satisfied by the frontmatter's first field, read directly. MET, with the note
that "exits 0 with role: orchestrator" is discharged by validation passing over
a document whose declared role is orchestrator, not by any printed line.

## Criterion 2: `node scripts/check-agents-references.mjs`

EXECUTED at head. Exit 0, printing
`check-agents-references: green (21 references resolved)`.

## Criterion 7 and 7b: dual-review decorrelation, ALL SIX DIRECTIONS

EXECUTED INDEPENDENTLY. I did not run the phase's own test; I built my own
staging lab, copying the head's `assurance-modes.yaml`, writing my own
`charter.yaml`, and dropping the phase's verdict fixtures into
`delivery/review/`. Measured exit codes:

| direction | mode | verdicts | exit | verdict line |
|---|---|---|---|---|
| decorrelated pair | full (delegated-under-conditions) | criteria + hazard | **0** | green, "distinct on produced-by, framing, review-contract" |
| shared `produced-by` | full | both family-a | **1** | red, names `family-a` |
| shared `framing` | full | both criteria-contract | **1** | red, names `criteria-contract` |
| only one verdict | full | one | **1** | red, "only 1 verdict document(s) exist" |
| shared `review-contract` (7b) | full | both `criteria` | **1** | red, names `criteria` |
| owner authority | direct-pr (merge-authority `owner`) | shared-family pair | **0** | green, REPORT names the mode and the authority |

The owner arm is the one worth stating carefully: it exits 0 on a pair that the
delegated arm reddens, which is exactly what criterion 7 asks for, and it does
NOT print the same line as the green pair. It prints a REPORT naming the mode
and the authority, so "nothing to check here" and "checked and fine" are
distinguishable at the terminal, which is SC-011.

## Attack point 1: was the fail-closed property preserved or deleted?

PRESERVED, and I verified it three ways rather than reading the claim. The
derived check now REPORTS on an absent charter (so an M3-P7 verdict context
carrying no charter is not reddened), and the refusal moved to
`scripts/check-dual-review.mjs`, which is the path DR-0012's grant runs
through. Measured, each with a SHARED-FAMILY pair staged so that a green would
be a wrong merge authorisation:

| broken regime state | exit | status |
|---|---|---|
| `charter.yaml` absent | **21** | error, "a merge check that cannot determine the regime reports error, never green" |
| `assurance-modes.yaml` absent | **21** | error, same shape |
| charter names a mode nothing defines | **1** | red, names the mode and both verdict files |

Three structurally different broken-regime states, none of them green. The
teeth are real and they are on the merge path.

