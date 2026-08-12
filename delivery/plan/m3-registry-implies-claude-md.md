# Editing `gate-registry.yaml` forces a `CLAUDE.md` re-render, and three declarations did not say so

- date: 2026-08-12
- found by: the M3-P6 implementer, by doing the work; confirmed and derived by
  the orchestrator while the implementer held its push
- status: **FIXED IN THIS CHANGE** for all three affected phases, and the
  derivation below is complete over all ten M3 declarations.

## The coupling, which is mechanical rather than a convention

`CLAUDE.md`'s gate table is GENERATED from `gate-registry.yaml` by
`scripts/render-agent-rules-gates.mjs`, and the `agent-rules-drift` gate fails
when the two diverge. The renderer's own header says so at
scripts/render-agent-rules-gates.mjs:10.

So a phase that adds a gate to the registry **cannot** leave `CLAUDE.md` alone:
re-rendering is not optional tidying, it is what keeps the drift gate green.
**`gate-registry.yaml` on a declaration therefore implies `CLAUDE.md` on it.**

## The derivation, complete over all ten phases

```
$ for n in 1..10; do
    f=delivery/plan/phase-declarations/m3-p$n.json
    echo "m3-p$n: gate-registry=$(grep -c '"gate-registry.yaml"' $f) CLAUDE.md=$(grep -c '"CLAUDE.md"' $f)"
  done
m3-p1:  gate-registry=0 CLAUDE.md=0      m3-p6:  gate-registry=1 CLAUDE.md=0   <== GAP
m3-p2:  gate-registry=1 CLAUDE.md=1      m3-p7:  gate-registry=0 CLAUDE.md=0
m3-p3:  gate-registry=0 CLAUDE.md=0      m3-p8:  gate-registry=0 CLAUDE.md=0
m3-p4:  gate-registry=0 CLAUDE.md=0      m3-p9:  gate-registry=1 CLAUDE.md=0   <== GAP
m3-p5:  gate-registry=0 CLAUDE.md=0      m3-p10: gate-registry=1 CLAUDE.md=0   <== GAP
```

Four phases carry `gate-registry.yaml`. **M3-P2 is correct** and is the one that
delivered the registry and the renderer together, which is exactly why it is the
one that got this right. **M3-P6, M3-P9 and M3-P10 are gaps**, and all three are
amended here. The six phases that do not touch the registry need nothing.

## How it surfaced, and what it cost

The M3-P6 implementer added `brief-drift` to the registry and re-rendered the
generated block: a one-line table row, with
`node scripts/render-agent-rules-gates.mjs --check` green at 18 rows. That edit
is CORRECT and required. Its declaration did not permit it, so the scope gate
would have reddened at the phase's first push.

Cost: zero, because it was caught before the push. The scope auditor reads the
declaration FROM THE MERGE BASE (delivery/plan/m3-p5-criterion-6-gap.md:74), so
this amendment has to be on `main` before M3-P6 pushes, which is why the
implementer was told to hold rather than to push and iterate.

## Recorded against the orchestrator

**The M3-P6 pre-dispatch declaration-completeness pre-check MISSED this**, and it
is the same class of gap that pre-check was written to find. It ran five probes
(delivery/plan/m3-p6-dispatch-read.md:1) chosen by asking where the phase EXTENDS
something shared, and it examined `src/cli.ts`, `src/validate.ts`,
`test/schemas.test.ts`, `src/gates/manifest.ts` and `scripts/check-clause-map.mjs`.
It did not probe the registry-to-`CLAUDE.md` coupling, even though the phase's own
plan section says its script is registered as a registry entry rather than wired
as a raw workflow step.

The pre-check's own limits section said it probed "five named places chosen by
reasoning, not an enumeration of the repository", and that a sixth site of the
same shape would not appear. That was true, and this is the sixth site. The
honest lesson is not "probe harder": it is that **a probe list chosen by
reasoning is a screen, and a screen's misses are found by execution.** The
implementer found it in twenty minutes by doing the work.

**The generalisable form, which is worth more than this instance**: when file A
is GENERATED from file B by a checked-in renderer with a drift gate, A and B are
one unit for declaration purposes. Any phase declaring B must declare A. The
same question should be asked of every other generated-file pair before the
phase that owns it is dispatched.

## What this change does NOT do

- **It does not search for other generated-file pairs.** `CLAUDE.md` from
  `gate-registry.yaml` is the one this incident names. Whether the repository has
  others was not enumerated, and the pre-dispatch read for M3-P9 and M3-P10
  should ask.
- **It does not amend any plan TEXT.** Only the three declarations move; the plan
  sections already say these phases register registry entries.
- **It does not revisit M3-P2**, which is correct as it stands.
