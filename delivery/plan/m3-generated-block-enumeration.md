# Every generated block in this repository, enumerated, and the two declarations it amends

- date: 2026-08-12
- author: orchestrator
- status: **ENUMERATION COMPLETE AND TWO DECLARATIONS AMENDED IN THIS CHANGE.**
- measured at: `origin/main` 307ed2f and `origin/claude/m3-p6-delivery-role-briefs`
  16bab6f, on node v26.6.0.

## Why this exists

delivery/plan/m3-registry-implies-claude-md.md:71 derived a general rule from a
single instance: when file A is GENERATED from file B by a checked-in renderer
with a drift gate, A and B are one unit for declaration purposes, and any phase
declaring B must declare A. That document then said, in its own limits section
at delivery/plan/m3-registry-implies-claude-md.md:78, that it had NOT searched
for other generated-file pairs and that the pre-dispatch read for M3-P9 and
M3-P10 should ask.

This is that search. It found a second pair, and that second pair puts M3-P9 and
M3-P10 in exactly the position M3-P6 was in before it was amended: a declaration
that permits editing the source but not the file the source generates.

## The enumeration, which is complete rather than a sample

Every generated block in this repository is delimited by a `BEGIN GENERATED`
marker, because both renderers write one. So the enumeration is a grep rather
than a judgment, and it was run against the M3-P6 head, which is the state that
has the most of them:

```
$ grep -rn 'BEGIN GENERATED' --include='*' . \
    --exclude-dir=node_modules --exclude-dir=.git
./src/roles.ts:520:    `<!-- BEGIN GENERATED GATE LIST (mode: ${mode}): rendered from gate-registry.yaml `
./src/roles.ts:529:  /<!-- BEGIN GENERATED GATE LIST \(mode: ([a-z][a-z0-9-]*)\): ... -->/;
./test/gate-registry.test.ts:803:    const begin = rules.indexOf("<!-- BEGIN GENERATED GATE LIST");
./CLAUDE.md:244:<!-- BEGIN GENERATED GATE LIST: rendered from gate-registry.yaml by scripts/render-agent-rules-gates.mjs. ... -->
./scripts/render-agent-rules-gates.mjs:83:  "<!-- BEGIN GENERATED GATE LIST: rendered from gate-registry.yaml by scripts/render-agent-rules-gates.mjs. ... -->";
./roles/implementer.md, line 369:<!-- BEGIN GENERATED GATE LIST (mode: full): rendered from gate-registry.yaml by scripts/check-brief-drift.mjs. ... -->
```

**ONE ALTERATION TO THAT CAPTURED OUTPUT, DECLARED.** The last line as grep
printed it reads `./roles/implementer.md:369:`, and the colon form is the
citation grammar, so the gate tries to resolve it against THIS branch, where
`roles/implementer.md` does not yet exist. That is one occurrence, and only that
one, rewritten to `./roles/implementer.md, line 369:`. Nothing else in any
captured output in this document was changed. The alternative was to hand-write
the enumeration to avoid the token, which is the fabrication the red-witness rule
exists to prevent, and the reader can reverse this one by restoring the colon.

Six hits, and four of them are the renderers and a test naming the marker rather
than carrying one. **Exactly two files carry a generated block:**

| generated file | rendered from | by | drift gate |
|---|---|---|---|
| `CLAUDE.md` | `gate-registry.yaml` | `scripts/render-agent-rules-gates.mjs` | `agent-rules-drift` |
| `roles/implementer.md` | `gate-registry.yaml` | `scripts/check-brief-drift.mjs` | `brief-drift` |

Both render from the SAME source. So the rule that came out of the M3-P6
incident gets one more consequent rather than a new shape:

> **`gate-registry.yaml` on a declaration implies BOTH `CLAUDE.md` and, from
> M3-P6 onward, `roles/implementer.md`.**

`roles/clean-room-reviewer.md` is the near miss worth naming: M3-P6 ships it,
it sits beside the implementer brief, and it carries NO generated block. The
brief-drift check's default target is the implementer brief alone. A rule
phrased as "the role briefs" rather than as the grep above would have been
wrong about it.

## The coupling is proven by defang, not asserted

The claim being tested is that a gate added to the registry, without
re-rendering, reddens the brief-drift check. Both arms were run in a detached
worktree at 16bab6f with `node_modules` linked in, on node v26.6.0.

**The first attempt measured nothing and is recorded because it is the trap.**
The worktree had no `node_modules`, so both arms exited 1 with
`Cannot find module 'yaml'`: identical exit codes for a reason that had nothing
to do with the defang. A red that the control arm also produces is not evidence.
The baseline is what caught it.

Baseline, after linking `node_modules`:

```
$ node scripts/check-brief-drift.mjs --check
brief-drift: green (18 generated brief gate rows compared)
roles/implementer.md's full gate block matches gate-registry.yaml row for row (18 row(s) compared)
EXIT=0
```

Defang, appending one gate to `gate-registry.yaml` with `modes: [full, direct-pr]`
and NOT re-rendering the brief:

```
$ node scripts/check-brief-drift.mjs --check
brief-drift: red (19 generated brief gate rows compared)
roles/implementer.md's full gate block has drifted from gate-registry.yaml: the
registry has a row the brief does not: | `probe-fake-gate-do-not-keep` | script |
required | fake units probed |. Re-render with node scripts/check-brief-drift.mjs --write
EXIT=1
```

Restoring the registry returns it to green at 18 rows, so the red was caused by
the defang and by nothing else that the run happened to touch.

Two things this establishes beyond the bare coupling. The check NAMES the row
that differs rather than reporting a bare mismatch, and its row count moves with
the registry (18 to 19), which is what a check that re-derives looks like as
against one that compares a block to itself.

**The 18 needs explaining, because an unexplained count is how this repository
has started three investigations.** The registry declares FIFTEEN gates at the
M3-P6 head, and the rendered block's markdown table has fifteen rows. The unit
the check counts is 18 because the block also carries the three numbered steps
that precede the table, `npm ci`, `npm run build` and `node --test`, which are
rendered from the same source and compared with it. Fifteen plus three is
eighteen, and the defang made it sixteen plus three. Counted rather than assumed:

```
$ node -e '...YAML.parse(gate-registry.yaml).gates.length'
registry gate count: 15
$ awk '/BEGIN GENERATED GATE LIST/,/END GENERATED GATE LIST/' roles/implementer.md | grep -c '^| `'
15
$ awk '/BEGIN GENERATED GATE LIST/,/END GENERATED GATE LIST/' CLAUDE.md | grep -c '^| `'
15
```

## The mode question, which decides whether this bites every new gate or some

The brief's marker declares `mode: full`, at line 369 of `roles/implementer.md`
on the M3-P6 head (quoted rather than cited, because that file is on an unmerged
branch and does not resolve from here). Every gate in `gate-registry.yaml` names
`full` in its `modes` list, which is a checked fact rather than a guess, and it
was checked against the REGISTRY rather than against `full`'s gate-set list in
`assurance-modes.yaml`, because that list is the wrong direction: that file's own
header records, under the heading `gate-sets`, that the check over it iterates
the entries present there and never iterates the registry, so a registry gate
missing from it is invisible. The derivation runs the other way:

```
$ node -e 'const d=YAML.parse(fs.readFileSync("gate-registry.yaml","utf8"));
    console.log(d.gates.filter(g=>!(g.modes||[]).includes("full")).map(g=>g.id))'
gates whose modes do NOT include full: []
```

So there is no such thing as a new gate that misses this block. **Any** gate
M3-P9 or M3-P10 adds to the registry will appear in the rendered projection and
will redden `brief-drift` until the brief is re-rendered.

## The two declarations this change amends

Measured over all ten M3 declarations, using the same one-line derivation the
CLAUDE.md gap used:

```
$ for n in $(seq 1 10); do
    f=delivery/plan/phase-declarations/m3-p$n.json
    printf 'm3-p%-3s registry=%s CLAUDE.md=%s implementer.md=%s\n' "$n" \
      "$(grep -c '"gate-registry.yaml"' $f)" \
      "$(grep -c '"CLAUDE.md"' $f)" \
      "$(grep -c '"roles/implementer.md"' $f)"
  done
m3-p1   registry=0 CLAUDE.md=0 implementer.md=0
m3-p2   registry=1 CLAUDE.md=1 implementer.md=0
m3-p3   registry=0 CLAUDE.md=0 implementer.md=0
m3-p4   registry=0 CLAUDE.md=0 implementer.md=0
m3-p5   registry=0 CLAUDE.md=0 implementer.md=0
m3-p6   registry=1 CLAUDE.md=1 implementer.md=1
m3-p7   registry=0 CLAUDE.md=0 implementer.md=0
m3-p8   registry=0 CLAUDE.md=0 implementer.md=0
m3-p9   registry=1 CLAUDE.md=1 implementer.md=0   <== GAP
m3-p10  registry=1 CLAUDE.md=1 implementer.md=0   <== GAP
```

Four phases carry the registry. M3-P2 predates the brief renderer and adds no
gate that would need it re-rendered, since the brief block did not exist then;
it is left alone for the same reason delivery/plan/m3-registry-implies-claude-md.md:84
left it alone. M3-P6 is correct because it is the phase that builds this
coupling. **M3-P9 and M3-P10 are the gaps, and both are amended here.**

M3-P5 reads `implementer.md=0` and that is CORRECT rather than a third gap. It
authors four OTHER briefs and does not touch the implementer brief at all, which
is checked rather than inferred:

```
$ grep -n 'roles' delivery/plan/phase-declarations/m3-p5.json
8:    "roles/investigator.md",
9:    "roles/plan-writer.md",
10:    "roles/adversarial-plan-reviewer.md",
11:    "roles/_shared-dispatch-contract.md",
12:    "src/roles.ts",
14:    "test/roles.test.ts",
17:    "roles/README.md",
```

`roles/implementer.md` and `roles/clean-room-reviewer.md` are M3-P6's, which is
why the generated block arrives with M3-P6 and not a phase earlier. Note also
that the column counts an EXACT string: it is a screen for this specific gap, not
a census of which phases touch the brief, and a declaration using a `roles/`
directory prefix would read 0 while being perfectly in scope. No M3 declaration
does that today, and the reader who assumes the column means more than it does
would be wrong the first time one did.

The `CLAUDE.md` column is 1 on both of them because of the previous amendment,
which is the visible sign that this is the same defect found one renderer later.

## Timing, which is the reason this is not left to the implementer

The scope auditor reads a phase's declaration FROM THE MERGE BASE
(delivery/plan/m3-p5-criterion-6-gap.md:74). An amendment made on the phase
branch is therefore invisible to the gate that reads it, so this has to be on
`main` before M3-P9 or M3-P10 pushes. That is why both are amended now, months
of wall clock before either is dispatched, rather than when the implementer
trips over it.

## Recorded against the orchestrator, again, and what actually changed

The M3-P6 pre-dispatch pre-check missed the first instance of this, and the
lesson written at the time was that a probe list chosen by reasoning is a screen
whose misses are found by execution. That lesson is what produced this document:
the search here is a grep over a marker that both renderers must write, not a
list of places that seemed likely. It returns a complete answer for a
mechanically checkable property, and it found the second instance before an
implementer did.

**The general form, worth more than either instance: the enumeration must be
over a property the artifact CANNOT avoid having.** A generated block cannot
avoid its begin marker, because the renderer writes it and the checker parses
it. A list of files that seemed likely to be generated can avoid anything.

## What this change does NOT do

- **It does not verify the amended declarations against a real M3-P9 or M3-P10
  diff**, because neither branch exists. It bounds them by declaration, which is
  what a declaration is for, and a phase that needs a path outside its list still
  reddens its own scope gate.
- **It does not claim `gate-registry.yaml` is the only source with a downstream
  generated copy in some looser sense.** The claim is narrower and mechanical:
  exactly two files carry a `BEGIN GENERATED` block, and both render from the
  registry. A transcription that no renderer writes and no gate checks would not
  appear in that grep, and this document does not assert there are none.
- **It does not touch `gates.manifest.json`**, which is a SEPARATE file that
  duplicates part of the registry rather than a generated projection of it. Its
  divergence is asserted in both directions by a registered test rather than
  removed, and that is a different problem tracked elsewhere.
- **It does not add `roles/implementer.md` to M3-P2**, which carries the registry
  but predates the brief block entirely.
