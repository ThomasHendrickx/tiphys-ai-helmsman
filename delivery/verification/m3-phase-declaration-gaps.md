# M3 phase declarations: three systematic gaps in the projection

- date: 2026-08-08
- raised by: the orchestrator, at the dispatch-time check before M3-P3
- branch: `claude/m3-declarations-derived-gaps`
- scope: `delivery/plan/phase-declarations/m3-p3.json` through
  `delivery/plan/phase-declarations/m3-p10.json`

## Why this exists

The dispatch-time check before M3-P3 is: read the phase's plan section and its
declaration, and confirm the declaration covers every path the plan names IN
PROSE as well as in backticks. That check has now fired four times
(`delivery/plan/phase-declarations/m3-p2.json` twice, in the merges recorded as
#46 and #47, and three declarations truncated at a glob in #45). A rule that
fires four times is not four mistakes; it is a lossy projection.

So this pass did not fix M3-P3. It audited P3 through P10 and found the SAME
THREE gaps in every one of the eight.

## The mechanism

**The `files-to-touch` line in the plan is a hand-written prose list, and the
declaration is a hand transcription of it.** Anything the phase must touch but
the plan does not spell out on that one line is absent from BOTH. Three classes
of such path exist, and each is derivable rather than a judgement call.

### Class 1: the type table moved, and the plan still names its old home

The plan writes `src/validate.ts (edit, type table)` for every phase that
registers a new `--type`. Measured on this head:

```
$ grep -n "TYPE_TABLE" src/commands/validate.ts | head -3
51:export const TYPE_TABLE: ReadonlyMap<string, string> = new Map([
105:  const filename = TYPE_TABLE.get(type);
134:  if (typeof kind !== "string" || !TYPE_TABLE.has(kind)) {
```

The table is at src/commands/validate.ts:51, not in `src/validate.ts`. Both
files exist, so the plan's path is not obviously wrong to a reader; it is merely
no longer where the edit lands. The step that registers the types is
delivery/plan/kernel-plan-m3.md:2795:

```
  5. Register the four types with the validator's `--type` table and the `auto`
```

and its files-to-touch line, delivery/plan/kernel-plan-m3.md:2809, names
`src/validate.ts (edit, type table)`.

### Class 2: touching `src/` or `bin/` obliges a witness, and witnesses live in a tree nobody declared

The red-witness gate reddens on a changed source file under `src/` or `bin/`
with no witness spec covering it, at src/gates/red-witness.ts:310. Specs, their
patches and their captures all live under `witness/`. Every one of the eight
phases changes `src/`, so every one of them must add witness files, so every one
of them must declare `witness/`.

### Class 3: the clause-map gate puts the clause map in force

A phase that anchors a requirement clause writes the anchor into
`delivery/requirements/clause-map.json`. The gate that reads it is
scripts/check-clause-map.mjs:195, whose condition 4 asserts the named clause
occurs in the artifact.

## The derivation, published in full

The additions are not judgement. The two M3 phases that have ALREADY passed dual
clean-room review and merged carry exactly these three entries, and the eight
unmerged ones did not:

```
$ for f in delivery/plan/phase-declarations/m3-p*.json; do
    echo "$f: $(node -e 'const d=require(process.cwd()+"/"+process.argv[1]);
      console.log(["src/commands/validate.ts","witness/",
        "delivery/requirements/clause-map.json"]
        .filter(x=>!d.filesToTouch.includes(x)).join(",")||"-")' "$f")"
  done
```

Before this change, on `9e87c61`:

```
m3-p1.json: -
m3-p2.json: -
m3-p3.json: src/commands/validate.ts,witness/,delivery/requirements/clause-map.json
m3-p4.json: src/commands/validate.ts,witness/,delivery/requirements/clause-map.json
m3-p5.json: src/commands/validate.ts,witness/,delivery/requirements/clause-map.json
m3-p6.json: src/commands/validate.ts,witness/,delivery/requirements/clause-map.json
m3-p7.json: src/commands/validate.ts,witness/,delivery/requirements/clause-map.json
m3-p8.json: src/commands/validate.ts,witness/,delivery/requirements/clause-map.json
m3-p9.json: src/commands/validate.ts,witness/,delivery/requirements/clause-map.json
m3-p10.json: src/commands/validate.ts,witness/,delivery/requirements/clause-map.json
```

`m3-p1` and `m3-p2` are the control. They reached those three entries the
expensive way: two amendment PRs and a review round. The eight below them are
being given the same coverage before dispatch instead of after.

M3-P4 is worth naming separately, because the FIRST pass of this audit, done by
reading, missed it and the mechanical check above caught it. P4 registers four
new types (`delivery/plan/kernel-plan-m3.md:2795`) and so needs
`src/commands/validate.ts` like the rest; a read of its files-to-touch line does
not say so, because that line says `src/validate.ts`.

## Verification

Against the schema the scope gate itself compiles,
`src/gates/schemas/phase-declaration.schema.json`, all eighteen declarations are
valid, filenames match ids, no entry contains a glob metacharacter, and no
entry is duplicated:

```
valid: 18/18
```

Regression, the property these additions could plausibly break. An addition can
only widen an allow-list, so the two merged phases must remain exactly covered:

```
M3-P1: changed 73 | uncovered 0
M3-P2: changed 30 | uncovered 0
```

Both ASCII checks over `git ls-files` minus the two path-scoped exemptions
return zero hits, and `node --test` on the floor toolchain (v26.6.0) exits 0.

## Postscript: this document's own first version was red, for the reason it is about

The first version of this file cited every path in backticks, which felt like
the careful thing to do. The citations gate reported it red with zero
SUBSTANTIVE citations, and it was right: M2-D-22 (src/gates/citations.ts:41)
defines a citation inside an inline code span or a fenced block as QUOTED, not
made, precisely so a document can write a non-resolving path on purpose. So the
more carefully every path was formatted, the fewer citations the document made,
and a document whose whole subject is a lossy projection was itself unreadable
to the gate that reads citations.

That is the same shape as the three classes above and it is the reason this
postscript is here rather than deleted: the convention is inverted relative to
intuition, so it will be got wrong again. Bare in prose resolves; backticked
does not.

## What this derivation did NOT cover

- **It is scoped to the three classes it names.** It asked, for eight
  declarations, whether they carry the three entries the two merged
  declarations carry. It did NOT re-derive each phase's files-to-touch line
  from its plan section from scratch, so a path missing from BOTH the plan and
  the merged control is still missing here.
- **It did not audit the M2 declarations** (`m2-p2` through `m2-p9`). Those
  phases are merged and their scope gate passed on their own heads, so a gap
  there would be historical rather than live, but it is unexamined.
- **It cannot prove the additions are sufficient**, only that they close a
  measured difference. The scope gate on each phase's own branch remains the
  authority, and a ninth gap class would show up there as a red gate exactly as
  these three did.
- **`witness/` is a directory-prefix grant**, and src/gates/scope.ts:477
  treats a trailing slash as exactly that. It is therefore a WIDER grant than a
  file list would be. It is accepted here because the two merged declarations
  set that precedent under dual review, not because a narrower form was shown
  impossible: witness spec filenames are chosen by the implementer at
  implementation time, so they cannot be enumerated before dispatch.
