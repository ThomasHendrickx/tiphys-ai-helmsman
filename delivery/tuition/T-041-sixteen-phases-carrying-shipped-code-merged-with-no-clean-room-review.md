# T-041: sixteen phases carrying shipped code merged with no clean-room review,
# and every guard that should have caught it was asleep

**Measured:** 2026-09-18, on `main` at `0eaf453`.

**Found by:** the orchestrator, while checking whether a phase branch may carry
verdict documents under its scope declaration. Not by a gate, not by a review,
and not by the process that was supposed to run the reviews.

## The finding

Of the twenty-eight merged M4 phases, **sixteen have no review document on
`main` and had no review agent dispatched**. All sixteen changed files inside
the shipped npm package, which is the row of DR-0027's table that requires the
FULL contract: dual cross-model clean-room review, delta verification, and a
MEDIUM blocking the merge.

| phase | merge | shipped-tree files it changed (first three) |
|---|---|---|
| M4-P3 | `4460fde` | `schemas/executor-record.schema.json`, `src/commands/spawn.ts`, `src/commands/validate.ts` |
| M4-P4 | `e85a3f2` | `src/adapters/load.ts`, `src/commands/spawn.ts`, `src/index.ts` |
| M4-P5 | `2d8596c` | `plugin/src/adapter.ts`, `plugin/src/index.ts` |
| M4-P6 | `8ff6738` | `plugin/src/adapter.ts`, `plugin/src/hooks/tool-call-observer.ts`, `plugin/src/hooks/turn-end.ts` |
| M4-P7 | `752f792` | `plugin/src/adapter.ts`, `plugin/src/model-resolution.ts`, `plugin/src/vocabulary.ts` |
| M4-P8 | `d5bc932` | `src/commands/spawn.ts`, `src/exec/env.ts`, `src/gates/credentials.ts` |
| M4-P9 | `713731f` | `plugin/src/hooks/project-write-block.ts`, `schemas/write-bypass.schema.json`, `src/commands/validate.ts` |
| M4-P12 | `0a14cb9` | `roles/implementer.md`, `src/gates/merge-preconditions.ts` |
| M4-P14 | `d044a52` | `roles/implementer.md`, `src/gates/gate-classes.ts`, `src/gates/schemas/phase-declaration.schema.json` |
| M4-P17 | `8d9ebd9` | `src/commands/doctor.ts`, `src/lock.ts` |
| M4-P18 | `14ba6fd` | `src/cli.ts`, `src/commands/init.ts`, `src/commands/status.ts` |
| M4-P21 | `5ec129e` | `src/commands/init.ts`, `src/commands/lock.ts`, `src/exclusion.ts` |
| M4-P22 | `ac8288f` | `src/commands/doctor.ts`, `src/exclusion.ts`, `src/spawn.ts` |
| M4-P28 | `95bbd27` | `src/gates/coverage.ts` |
| M4-P29 | `d938557` | `src/gates/credentials.ts`, `src/gates/red-witness.ts`, `src/gates/suite.ts` |
| M4-P30 | `fe16ff1` | `schemas/assurance-modes.schema.json`, `src/commands/doctor.ts` |

## The derivation, published in full so it can be re-run and disputed

Which phases have a review document:

```
git ls-files 'delivery/review/*' | grep -oE 'M4-P[0-9]+' | sort -u -V
M4-P1 M4-P2 M4-P10 M4-P11 M4-P13 M4-P15 M4-P16 M4-P19 M4-P20 M4-P23 M4-P26 M4-P27
```

Twelve. The merged set is every phase except M4-P24 and M4-P25, so the
complement is the sixteen in the table.

Which phases had a review AGENT dispatched. Every subagent this delivery ran was
a workflow agent, and each workflow writes a `journal.jsonl` recording a
`started` record per agent with its label. Joining labels across all ninety
journals gives nineteen `review:` labels, covering exactly M4-P1, P2, P10, P11,
P13, P15, P16, P19, P20, P23, P26 and P27, and no others. The wave phases appear
only under implementer labels (`w4:` through `w13:`).

The record is complete rather than partial, and that is checked rather than
assumed: the journals hold 158 `started` records and the transcript directory
holds 158 `agent-*.jsonl` files, and `/root/.claude/projects/-home-user/` has
carried ONE session id since 2026-09-15, which is before M4 began.

Which trees each merge touched:

```
git show --name-only --format='' <merge> \
  | grep -cE '^(src/|bin/|schemas/|roles/|tuition/|plugin/src/)'
```

Nonzero for all sixteen. DR-0027's table puts that row in the full contract.

## The mechanism, which is not "the reviews were skipped on purpose"

**The triage discipline existed and was applied, and then it was not carried
forward.** delivery/STATE.md:65 records it working on 2026-09-16: each of the
first twelve phases was classified with `git diff --name-only` per branch, three
were found to touch shipped artifacts and got full dual review, five were found
to touch only `scripts/`, `test/`, `.github/` and paperwork and got one recorded
round. That is DR-0027 working exactly as written.

The wave phases M4-P3 onward were dispatched after that, two at a time under
DR-0044, and the classification step was never run for them. **A step that
happens because someone remembers to do it does not survive the next batch**,
which is the finding this repository has now recorded under T-005, T-017 and
T-039, each time with the same answer: the rule needs a mechanism.

**And four guards that each look like they would catch it did not.**

1. `check-dual-review` is the command form of DR-0012 condition 1. It reported
   not-applicable on every head because the corpus was empty, which is T-040.
   The gate that exists for exactly this could not see it.
2. `merge-preconditions` takes `check-dual-review`'s precondition, so it
   inherited the same silence.
3. The scope gate audits which paths a branch changed. Its own unit label is
   "changed paths audited" (src/gates/scope.ts:747), and a grep of that file for
   a required-paths concept returned nothing. Whether it COULD be made to require
   a path is the open question T-040 already records as unmeasured; what is
   established is only that it does not.
4. The orchestrator's own stop condition counts merged phases. A merged phase
   with no review is merged.

So the absence was invisible at every layer, and it was found by reading a
directory listing for an unrelated reason. That is the same way T-039 and T-040
were found this morning, which is three in one session and is itself the signal:
**the paperwork this delivery produces has no guard that reads it back.**

## What is NOT established, stated because an empty result is not an absence

- **Whether anything reviewed those sixteen by a route that leaves no trace
  here.** The journals cover subagents. They do not cover reading the diff in
  the orchestrator's own turn. An orchestrator self-read would not satisfy
  DR-0012 in any case, because that condition is two INDEPENDENT reviews on
  different model families, but the distinction matters for how the gap is
  described: unreviewed by the contract is established, unread is not.
- **Whether any of the sixteen carries a real defect.** Nothing here is a claim
  about the code. Every one of them passed the full gate bundle, both CI arms
  and a green post-merge run. What is missing is the review contract, not
  necessarily correctness.
- **What the fix-round and delta-verification halves would have found.** They did
  not run either, and their absence is part of the same gap.

## What was done about it

Recorded here, raised to the owner as a decision with options, and NOT fixed
unilaterally: retrospective review of sixteen merged phases is thirty-two
reviewer agents at two concurrent, which is a real cost in calendar time before
cutover entry, and choosing whether to spend it is the owner's under DR-0016
because the options are genuinely comparable and the consequence is expensive
either way.

Nothing is reverted. The code is on `main`, green, and reverting sixteen phases
to re-land them reviewed would be a far larger and riskier operation than
reviewing them where they stand.
