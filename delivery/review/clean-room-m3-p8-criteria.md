# Clean-room review: M3-P8 (tuition flow), criteria walk

Reviewer: clean-room agent A. Subject: branch `claude/m3-p8-tuition-flow`,
PR #125, head 26ee653. Report branch `claude/review-m3-p8-a`, cut from
`origin/main` at 2a3892b (T-019).

Status: IN PROGRESS. This file is appended to as work proceeds; its mtime is
the beacon.

Reference anchor for the process rules this review follows: CLAUDE.md:1

## Log

- Started. Toolchain node v26.6.0 confirmed.

## Method

All commands run in a worktree of the branch under review at 26ee653, on node
v26.6.0 from the session scratch prefix (`node --version` checked in the shell
that ran them), with `dist/` built (`npm run build` exit 0, `git status
--porcelain` empty afterwards). Every schema mutation below is applied to the
working tree and restored from a pristine copy; `git status --porcelain` is
checked empty after each block.

## Criterion 1: every promoted entry plus the two tickets validate

DISCHARGED.

```
for f in tuition/T-*.yaml; do node bin/tiphys.ts validate --type tuition --context . "$f"; done
validated=15 failures=0
node bin/tiphys.ts validate --type mechanism-index --context . tuition/mechanism-index.yaml
mi exit=0
```

The relation the plan asks for (validated = kernel-relevant entries in
`delivery/tuition/` plus two) was recomputed rather than read out of the work
history. `grep -L -i 'kernel-relevant' delivery/tuition/T-*.md` names eight
files (T-010 to T-014, T-018, T-019, T-020), so twelve declare it; T-018 is
promoted by the work history's rule (b) as the incident that paid for
`checking-a-generated-artifact-against-its-own-generator`. 12 + 1 = 13 promoted,
plus T-021 and T-022, is 15. The feed holds exactly 15 `T-*.yaml` files.

## Criterion 2: Kind A dangerous-instance rejections, both directions

DISCHARGED, with two structurally different members on each half.

| instance | at head | with the keyword removed |
|---|---|---|
| `kernel-relevant: true`, `structural-consequence: []` | exit 1, `INVALID #/structural-consequence array has 0 items, fewer than the required minimum 1` | exit 0 (`then.properties.structural-consequence.minItems` deleted) |
| `kernel-relevant: true`, field ABSENT | exit 1, `INVALID #/structural-consequence required property structural-consequence is missing` | exit 0 (`then.required` deleted) |
| `mechanisms[0].evidence: []` | exit 1, `INVALID #/mechanisms/0/evidence array has 0 items ...` | exit 0 (`evidence.minItems` deleted) |
| `mechanisms[0].evidence` ABSENT | exit 1, `INVALID #/mechanisms/0/evidence required property evidence is missing` | exit 0 (`evidence` dropped from the item's `required`) |

The schema file was restored from a pristine copy after each mutation and
`git status --porcelain schemas/tuition.schema.json` printed nothing.
