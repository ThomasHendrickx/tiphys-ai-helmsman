# M3-P7 beside M3-P8: the dispatch-time check, written before dispatch

- date: 2026-08-12
- author: orchestrator
- measured at: `origin/main` c75152b, before M3-P6 merges. The staleness
  condition is stated in the last section and it is not hypothetical.
- purpose: DR-0011 permits concurrency only where a recorded pre-pass proves
  the phases disjoint, and the M3 plan makes THIS pair's permission
  conditional on a named dispatch-time check
  (delivery/plan/kernel-plan-m3.md:1250). This document is that check. It is
  written before dispatch because the plan says the resolution rule must be
  written down first, and because a pre-pass produced after a collision is
  not a pre-pass.

## The question, and the question it is NOT

The plan answers the ordering question already and it is worth restating so
this document is not read as reopening it:

- **M3-P8's `blocked-by` is "M3-P6 merged", not "M3-P7 merged."** Revision 3
  corrected it (delivery/plan/kernel-plan-m3.md:1130). The correction is
  derived rather than preferred: M3-P8's `grounding` names `tuition/README.md`
  from M1-P1, M3-P6's seed mechanism index, M3-P1's charter `retention` field
  and the M1-P2 doctor, and **no M3-P7 artifact anywhere**. The old value was
  an ordering habit.
- **Merge order is still dependency order.** P8 merges after P7. Concurrency is
  about work order and never about merge order, which is binding convention 5.

So the question here is narrow: may the two be WORKED at the same time.

**And a pre-pass answers "would these collide", not "may this start."** It is
a VETO, NOT A PERMIT. This orchestrator ruled M3-P7 dispatchable concurrently
with M3-P6 on pre-pass evidence alone and was wrong, because M3-P7's own
`grounding` names two M3-P6 deliverables. The grounding check is done above and
is what actually authorises the pair; the file-overlap analysis below can only
forbid.

## The overlap, recounted rather than inherited

The plan's own count moved twice (revision 1 said one file, revision 2 said
three, revision 3 said four). Rather than trust the latest number, the two
declarations were intersected directly.

Shared entries on both `filesToTouch` lists:

| path | shape of each phase's edit | collides? |
|---|---|---|
| `src/cli.ts` | one entry in the `commands` Map | no, see below |
| `src/validate.ts` | UNDETERMINED, see the gap section | **unknown** |
| `src/checks.ts` | new `export const` bodies plus registry entries | low, see below |
| `src/commands/validate.ts` | one row in the type table, one in the companions table | no, see below |
| `package.json` | one entry in the `files` array | no |
| `witness/` | new files, named per witness id | no, disjoint by name |
| `delivery/requirements/clause-map.json` | append-only, resolved as a union | no, standing rule |
| `test/fixtures/` | new directories per phase | no, disjoint by name |

Note that `src/commands/validate.ts` is a FIFTH shared file and the plan's
revision-3 recount names four. It is on both declarations. Recorded here as a
correction to the plan's count rather than passed over; it does not change the
verdict because its two tables are alphabetically keyed like `src/cli.ts`.

## Why the three keyed lists do not collide, measured

Each is a keyed literal whose entries are single lines, and the two phases'
keys land at different positions, so git resolves them without a conflict
hunk. Measured at c75152b:

- `src/cli.ts:24`, `const commands = new Map<string, CommandHandler>([`, holds
  fourteen entries in alphabetical order. M3-P7 adds `checklist`, which sorts
  between `brief` and `init`. M3-P8 adds `tuition`, which sorts between
  `teardown` and `validate`. Ten lines apart, and `usageLine()` derives its
  text from the map's keys rather than restating them, so neither phase edits
  a second site.
- `src/commands/validate.ts:76` is the type-to-schema table and
  `src/commands/validate.ts:107` the companions table, both keyed by document
  type. P7's types are `checklist` and `verdict`; P8's are `tuition` and
  `mechanism-index`. Disjoint keys.
- `package.json`'s `files` array gains `checklists/` for P7 and `tuition/` for
  P8. Disjoint.

## Why `src/checks.ts` is LOW risk and not NO risk

`src/checks.ts:1934` is `const registry: DerivedCheck[] = [`, a positional
array rather than a keyed map, and both phases append to it. Two appends at the
same array tail are the classic textual conflict even when semantically
independent.

This is called low rather than none, and the resolution rule is stated so the
second phase to merge does not improvise one: **the conflict, if it occurs, is
a both-sides-add at the array tail, and the resolution is to keep both entries;
the array's order carries no meaning that any check reads.** That last clause is
the part that makes the rule safe, and it is an assertion this document does
NOT verify by execution. Whoever resolves such a conflict must confirm it
before applying the rule, by checking that `checksFor` at
src/checks.ts:1966 and `registeredChecks` at src/checks.ts:1973 filter by
declared type rather than by index.

## The gap: `src/validate.ts` is UNDETERMINED

Both declarations list `src/validate.ts` (907 lines) and **neither the plan nor
either declaration says what either phase appends to it.** Candidate sites
exist (`AUTHORING_VOCABULARY` at src/validate.ts:111, `ANNOTATION_KEYS` at
src/validate.ts:131, `DIAGNOSTIC_MESSAGES` at src/validate.ts:175) and picking
one by reasoning is exactly the screen that failed for M3-P6, so none is picked
here.

**This is the file to watch, and it is the reason the permission below is
conditional rather than clean.**

## The permission, and the tripwire that is its real content

The pair MAY be dispatched concurrently, subject to a tripwire that both
implementers carry in their briefs, in these words:

> Your declaration shares `src/cli.ts`, `src/validate.ts`, `src/checks.ts`,
> `src/commands/validate.ts` and `package.json` with a phase being implemented
> AT THE SAME TIME as yours. Your edits to all five are expected to be APPENDS
> to existing lists, maps and tables. If you find you need to RESTRUCTURE any
> of them, reorder an array whose order turns out to matter, rename a key,
> change a table's shape, or move an existing entry, **STOP and tell the
> orchestrator before doing it.** Do not resolve it yourself and do not work
> around it. The pair is parallel only for as long as this holds, and you
> discovering otherwise is the expected way this is found, not a failure.

The honest reading of the plan's condition is that it cannot be discharged in
advance. The plan asks the dispatch-time check to "confirm that both phases'
edits are appends and not restructurings", and the edits do not exist yet.
What CAN be done in advance is what is done here: establish that an append is
the natural shape at every determined site, name the one site where the shape
is undetermined, and convert the rest into a tripwire the implementers trip
rather than a prediction the orchestrator makes. Recording that distinction
matters because a pre-pass that overstates what it verified is worse than a
narrow one: it is relied on.

## What this does NOT cover

- **`src/validate.ts`, entirely.** See the gap section. No site was identified
  for either phase, so nothing about it is established, including whether the
  two phases touch it at all.
- **It is not executed.** Unlike delivery/plan/m3-p7-registry-probe.md:1, which
  ran mutations, this document reads structure. No merge was simulated. The
  cheap execution that would strengthen it, constructing both phases' expected
  appends and running `git merge-tree`, is not possible before the appends
  exist.
- **It is measured at c75152b, BEFORE M3-P6 merges, and one measurement is
  known to be perishable.** M3-P6 changes `src/commands/validate.ts` by seven
  lines and `package.json` by four, so both line numbers cited above will move.
  It does NOT touch `src/cli.ts`, `src/validate.ts` or `src/checks.ts`, so
  those three survive its merge unchanged. Re-derive the two moved line numbers
  after the merge; do not re-derive the other three on this account.
- **It says nothing about M3-P9 or M3-P10**, whose declarations were not read
  for this document.
- **It does not revisit whether P6 may run beside P7.** It may not, and the
  reason is P7's grounding rather than any file overlap.
