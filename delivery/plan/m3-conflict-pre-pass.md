# M3 conflict pre-pass (DR-0011)

- date: 2026-08-10
- author: orchestrator
- purpose: DR-0011 turns parallelism ON where a recorded pre-pass proves the
  phases disjoint, and REQUIRES that the pre-pass be written down before
  dispatch rather than asserted. The decision is
  delivery/decisions/DR-0011-early-parallelism.md:1 and the worked example this
  document follows is delivery/plan/m2-conflict-pre-pass.md:1. This is that
  document for M3-P4 onward.
- measured at: `origin/main` a7d5686 and
  `origin/claude/m3-p4-report-and-work-history` 5470207.

## Method, and the false result it started with

The overlap is computed from the phase declarations' `filesToTouch` and
`declaredExtras`, unioned per phase and intersected pairwise. M3-P5's
declaration is delivery/plan/phase-declarations/m3-p5.json:1.

**The first run of this computation returned "disjoint" for every pair and was
worthless.** It read the key `files-to-touch`, and the declarations spell it
`filesToTouch`, so every list was EMPTY and every intersection of two empty sets
was empty. That is the wrong-scope trap this repository has now hit four times:
an empty result from a mis-scoped search is indistinguishable from a real
absence. The key was confirmed against the file before the numbers below were
believed:

```
$ node -e 'console.log(Object.keys(JSON.parse(require("fs").readFileSync(
    "delivery/plan/phase-declarations/m3-p5.json","utf8"))).join(", "))'
id, branch, filesToTouch, declaredExtras, citations
```

## What EVERY pair shares, and why it does not serialise

Four paths appear in nearly every intersection:

| path | why it does not serialise |
|---|---|
| `delivery/requirements/clause-map.json` | append-only registry, resolved as a union against the merge base (M2 pre-pass, binding convention 5) |
| `witness/` | per-behavior witness files, added not edited; two phases add different files |
| `test/behaviors.json` | standing pre-authorized extra, append-only, asserted BY NAME never by count |
| `package.json` | dependency and script additions, union-shaped |

These are the same four the M2 pre-pass ruled non-serialising, and nothing in M3
changes their shape. **A test over any of them asserts by name, never by count.**

## M3-P4 against everything after it

M3-P4's real footprint in shared CODE, measured rather than declared:

```
$ git diff --stat origin/main...origin/claude/m3-p4-report-and-work-history -- \
    src/validate.ts src/commands/validate.ts src/checks.ts src/cli.ts package.json
 delivery/requirements/clause-map.json |  45 +++++
 src/checks.ts                         | 355 +++++++++++++++++++++++++++++++++-
 src/commands/validate.ts              |  40 +++-
 src/validate.ts                       |  64 +++++-
```

`src/cli.ts` and `package.json`: NOT touched by M3-P4 at all, so every later
phase's overlap on them is with each other, not with P4.

The two that matter:

- **`src/commands/validate.ts`.** P4's change is at `TYPE_TABLE` (hunk header
  `@@ -65,8 +65,42 @@ export const TYPE_TABLE`), which is a map from type name to
  schema file. Every later phase that ships a new schema type appends a row to
  the same map: P5 (`role-brief`, `finding`), P6 (`mechanism-index`), P7
  (`checklist`, `verdict`), P8 (`tuition`). **This is a union-shaped conflict in
  TypeScript source rather than in a JSON registry**, so git may report a
  textual conflict where the semantic resolution is "keep both rows". It is
  mechanical and it is not a reason to serialise.
- **`src/validate.ts`.** P4's five hunks are all in the compiler internals
  (`Compilation`, `compileSchema`, `compilationDiagnostics`, `validateInstance`)
  and are keyword-support work. P5, P7 and P8 touch this file to REGISTER types
  and to reach new keywords, not to reshape the compiler.

**RULING: M3-P5 may be dispatched CONCURRENTLY with M3-P4.** Their intersection
is four non-serialising registries plus a `TYPE_TABLE` append. P5 does not touch
`schemas/report.schema.json`, `schemas/work-history.schema.json`,
`schemas/final-report.schema.json`, `src/checks.ts`, or any of P4's templates and
tests, which is where P4's fix rounds have all lived.

**MERGE ORDER IS STILL DEPENDENCY ORDER: M3-P4 merges FIRST.** DR-0011 makes
work order concurrent, never merge order. P5 rebases onto P4's merged head and
resolves the `TYPE_TABLE` union at that point.

**WHAT THIS RULING DOES NOT COVER, stated so a reviewer checks it first.** It is
derived from the DECLARATIONS plus P4's CURRENT diff. M3-P4 is in a fresh-
implementer round under DR-0016 and its diff WILL change. If that round's
derivation drives it outside its declaration, this pre-pass is stale and must be
recomputed before P5 merges. The declaration is the contract that makes that
detectable: a P4 change outside `filesToTouch` reddens its own scope gate.

## The rest of M3, recorded now so it is not re-derived under time pressure

Serialising pairs, meaning a genuine same-file semantic collision beyond the four
non-serialising registries:

| pair | shared beyond the registries | serialises? |
|---|---|---|
| P5 x P6 | `roles/_shared-dispatch-contract.md`, `src/roles.ts`, `src/commands/brief.ts` | **YES.** P6 extends the brief composer and the shared dispatch contract P5 authors. P5 before P6. |
| P6 x P8 | `tuition/mechanism-index.yaml`, `MECHANISMS.md`, `schemas/mechanism-index.schema.json` | **YES.** Both author the mechanism index. P6 before P8, or P8 before P6, but not concurrent. |
| P6 x P9 x P10 | `.github/workflows/gates.yml`, `gate-registry.yaml` | **YES.** Three phases editing the workflow and the canonical registry. Serialise in phase order. |
| P7 x P8 | `src/cli.ts`, `src/validate.ts`, `src/checks.ts` | **PROBABLY NOT**, but not proven here: both register a new type and new derived checks, which is the union shape. Recompute before dispatching them together. |
| P5 x P7, P5 x P8 | `src/cli.ts`, `src/validate.ts` | union shape, not proven serialising |

**The honest summary: M3's phases are far more coupled than M2's.** M2 had seven
mutually disjoint phases; M3 has one clean concurrent pair (P4 with P5) and three
hard serialisation chains. Anyone reading this expecting M2's parallelism will be
disappointed, and that is the measurement rather than a preference.

## What was NOT done

- P7 x P8 was left unproven rather than guessed. It needs the same diff-level
  measurement done for P4 above, and neither branch exists yet to measure.
- No pair was tested by actually attempting a merge. This is a declaration-and-
  diff analysis; a clean intersection is evidence, not proof, and the first real
  conflict outranks this document.

## ADDENDUM, 2026-08-12: M3-P7 may run concurrently with M3-P6

- measured at: `origin/main` 307ed2f and `origin/claude/m3-p6-delivery-role-briefs`
  16bab6f, which is the head M3-P6's dual clean-room review is running against.
- **This pair is not in the table above at all.** The table lists the pairs the
  original pass ruled serialising plus two it ruled union-shaped; P6 x P7 appears
  in neither list. An absence there is an omission, not a ruling, and DR-0011
  requires the ruling to be WRITTEN DOWN BEFORE DISPATCH rather than inferred
  from a gap. This addendum is that writing.

### The intersection, computed both ways

The declaration bound, which is the one that matters because a phase cannot
legally leave it:

```
$ node -e '<pairwise intersection of filesToTouch + declaredExtras, prefix-aware>'
P6 x P7 -> ["package.json","src/commands/validate.ts","witness/",
            "delivery/requirements/clause-map.json"]
```

Three of those four are the non-serialising registries this document already
ruled on. The fourth, `src/commands/validate.ts`, is the `TYPE_TABLE` append
this document also already ruled union-shaped: M3-P6 adds one row,
`["mechanism-index", "mechanism-index.schema.json"]`, in a hunk whose header is
`@@ -87,0 +88,7 @@ export const TYPE_TABLE`, and M3-P7 adds `checklist` and
`verdict` to the same map. Keeping both rows is the whole resolution.

**`test/behaviors.json` does not appear because M3-P7 does not declare it**, and
it does not need to: it is a standing pre-authorized extra under binding
convention 5, append-only, and asserted by name never by count.

M3-P6's ACTUAL diff was measured too, not just its declaration, since unlike the
P4 x P5 case its branch exists and its implementation is complete:

```
$ git diff --name-only origin/main...origin/claude/m3-p6-delivery-role-briefs
.github/workflows/gates.yml       roles/clean-room-reviewer.md
CLAUDE.md                         roles/implementer.md
MECHANISMS.md                     schemas/mechanism-index.schema.json
delivery/requirements/clause-map.json  scripts/check-brief-drift.mjs
delivery/work-history/m3-p6.md    src/commands/brief.ts
gate-registry.yaml                src/commands/validate.ts
gates.manifest.json               src/roles.ts
package.json                      test/behaviors.json
tuition/mechanism-index.yaml      test/clean-room-brief.test.ts
witness/ (5 files)                test/implementer-brief.test.ts
```

The three files M3-P7 does its real work in, `src/cli.ts`, `src/validate.ts` and
`src/checks.ts`, are touched by M3-P6 **not at all**, which is the strongest part
of this result and is why it is stated separately from the intersection.
M3-P6's `package.json` change is two entries added to the `files` array
(`gates.manifest.json` and `tuition`) and touches no script and no dependency.

### RULING

**M3-P7 may be dispatched CONCURRENTLY with M3-P6's review.** Their intersection
under M3-P6's declaration, which bounds anything a fix round can still do to it,
is four non-serialising registries and a `TYPE_TABLE` append.

**MERGE ORDER IS STILL DEPENDENCY ORDER: M3-P6 merges FIRST**, and M3-P7 rebases
onto the merged head and resolves the `TYPE_TABLE` union there. DR-0011 makes
work order concurrent, never merge order.

### What this addendum does NOT cover

- **It does not rule on P7 x P8 or P7 x P9**, which stay unproven and therefore
  serial. Their declaration intersections carry `src/checks.ts`, and P7 x P8 also
  carries `src/cli.ts`, `src/validate.ts` and `test/fixtures/`. That is more than
  a registry union and it needs the diff-level measurement done here for P6,
  which cannot happen before M3-P7's branch exists.
- **It does not revisit the P6 x P8 and P6 x P9 x P10 serialisations** ruled
  above, both of which stand. P6 x P9's intersection has GROWN since that ruling,
  because `CLAUDE.md` was added to M3-P9's declaration, and it grows again with
  `roles/implementer.md` in this same change. That moves it further from
  concurrent, never toward it.
- **It assumes M3-P6's fix rounds stay inside its declaration.** They must, or
  its own scope gate reddens, which is the property that makes a declaration
  usable as a bound rather than as a hope. If M3-P6 is amended to reach
  `src/cli.ts`, `src/validate.ts` or `src/checks.ts`, this ruling is stale and
  must be recomputed before M3-P7 merges.
- **No pair here was tested by attempting a merge**, exactly as the original
  pass says of itself.
