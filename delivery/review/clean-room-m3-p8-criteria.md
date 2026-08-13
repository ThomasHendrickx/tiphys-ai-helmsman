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

## Criterion 3 and 4b: Kind B rejections, both directions

DISCHARGED.

| instance | at head | with the check deregistered from the registry array |
|---|---|---|
| `applied` consequence targeting `roles/there-is-no-such-brief.md` | exit 1, `INVALID #/structural-consequence/0/target structural consequence is marked applied and its target ... does not exist (check: tuition-target-exists)` | exit 0 |
| `mechanisms[0].evidence[0]` naming an absent file | exit 1, `INVALID #/mechanisms/0/evidence/0 evidence names ... which does not exist (check: mechanism-rule-evidence-resolves)` | exit 0 |
| `machine-readable-form` naming key `destructiveCommandsRenamed` | exit 1, `INVALID #/mechanisms/0/machine-readable-form/key machine-readable form names key ... which gates.manifest.json does not carry (check: mechanism-rule-evidence-resolves)` | exit 0 |

Deregistration was done by removing the entry from the registry array in
`src/checks.ts` and restoring from a pristine copy; `git status --porcelain
src/checks.ts` printed nothing afterwards.

## Criterion 4: projection drift, all directions

DISCHARGED, four directions measured rather than the two the criterion asks for.

| mutation | result |
|---|---|
| a `mechanisms[]` entry appended to `tuition/T-004.yaml`, index untouched | exit 1, `DRIFT mechanism rebasing-a-branch-under-review is declared by tuition entry T-004 and is missing from the committed index` |
| the same tree, `tuition index --out tuition/mechanism-index.yaml` then `--check` | `wrote 16 mechanism(s) from 15 entr(ies)`, then exit 0 |
| a whole row deleted from the committed index, feed untouched | exit 1, `DRIFT mechanism claim-file-mutual-exclusion-by-o-excl is declared by tuition entry T-005 and is missing from the committed index` |
| one word of a rule hand-edited in the committed index | exit 1, `DRIFT mechanism shared-worktree differs from the projection of tuition entry T-004` |
| unmutated head | exit 0, `15 mechanism(s) projected from 15 entr(ies); the committed index matches` |

## Criterion 7: list filter and add refusal

DISCHARGED.

Every entry in the SHIPPED feed is kernel-relevant, so `tuition list` and
`tuition list --kernel-relevant` print identical output against `tuition/`; the
filter therefore has no negative instance in the tree and was exercised against
a staged feed instead (`--dir`), holding `T-005`, `T-015` and a probe entry
`T-777` with `kernel-relevant: false`. All three print under `list`; only the
two kernel-relevant ones print under `--kernel-relevant`. This is the same gap
the implementer recorded finding in its own witness, and the shipped behaviour
matches.

`tuition add --file <invalid> --into <dir>` exits 1, prints `is not a valid
tuition entry` plus the INVALID lines, and leaves the directory listing
byte-identical (`ls -la | sha256sum` equal before and after). A second add of an
id already present exits 1 with `already exists, and a tuition id is never
reused`.

## Criterion 4d: the interim index is gone and its readers redirected

DISCHARGED UNDER THE DIRECTORY READING, with a residue that is a tracked item
rather than a finding (see finding L-1 below).

`MECHANISMS.md` is absent from the tree and from `git ls-files`.
`tuition/README.md:6` names `tuition/mechanism-index.yaml` as the index. The
walk over `roles/`, `schemas/`, `checklists/`, `tuition/`, `templates/` and
`AGENTS.md` finds zero occurrences. The reverse direction is witnessed for real,
not only by the test's staged copy: witness member 1 of
`interim-index-removed-and-redirected` rewrites a line of `tuition/README.md`
to mention the deleted file, which the registered test's own `walk()` reads.

## Criterion 6: the composed brief names the generated index

DISCHARGED.

```
node bin/tiphys.ts brief compose --role implementer --phase templates/plan.example.yaml --phase-id M9-P1
exit=0
line 11:  3. tuition/mechanism-index.yaml
```

The named path is the generated file: `tuition index --check` against it exits 0
with `the committed index matches`.
