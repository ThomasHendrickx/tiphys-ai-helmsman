# M3-P7 pre-dispatch criterion read, both directions

- date: 2026-08-12
- author: orchestrator
- discharges, for M3-P7, the rule at delivery/plan/m3-dependency-screen.md:62
- same method as delivery/plan/m3-p6-dispatch-read.md:1, which is where the
  method and its limits are stated in full
- status: M3-P7 is blocked behind M3-P6 by its own `blocked-by` line. This does
  not clear it. It removes work from the dispatch turn and records one
  write-direction candidate that was refuted rather than assumed away.

## Why M3-P7 is worth reading early

The screen at delivery/plan/m3-dependency-screen.md:37 gave M3-P7 five candidate
cross-phase reads and classified none of them. M3-P7 is also the phase whose
criteria mutate a MERGED artifact as a red witness, which is the one shape that
turns a read into a write, so it is the phase most likely to need a declaration
it does not have.

## The read direction

Declaration: delivery/plan/phase-declarations/m3-p7.json:1. Criteria:
delivery/plan/kernel-plan-m3.md:3831 onward.

| criterion | reads a file M3-P7 does not own | owner | on `main`? |
|---|---|---|---|
| 3, 3c | `gate-registry.yaml` | M3-P2 | yes |
| 3b | `gates.manifest.json`, for the `destructiveCommands` list the probe must cite by name | M2-P1 | yes |
| 4b | a plan phase's acceptance criteria, and a work history's declared deviations | this build's own paperwork | yes |
| 5 | a real captured harness evidence file from M2-P2 | M2-P2 | yes, under `delivery/evidence/` |

Every one is present on `main` today and every one is READ ONLY, so the read
direction produces no blocker and no declaration change. Reading a file outside
the declaration is not a scope-gate event, because the auditor audits CHANGED
paths.

## The write direction, and the one candidate that mattered

**Criterion 3c requires RENAMING a gate id in `gate-registry.yaml` and DELETING a
gate entry, as its two structurally different red witnesses**
(delivery/plan/kernel-plan-m3.md:3871 states the rename and
delivery/plan/kernel-plan-m3.md:3875 names the two members). `gate-registry.yaml` is a MERGED M3-P2
deliverable and is absent from M3-P7's `filesToTouch`. If those witnesses had to
mutate the real file, this phase would be unable to satisfy its own criterion
without a declaration amendment, which is the M3-P5 criterion-6 shape exactly
(delivery/plan/m3-p5-criterion-6-gap.md:1).

**Refuted by measurement.** The criteria say the check runs `--context`, and the
checks engine resolves that document RELATIVE TO THE CONTEXT DIRECTORY:

```
$ grep -n 'readContextDocument' src/checks.ts
640:    const registryDocument = readContextDocument(contextDirectory, "gate-registry.yaml");
```

`readContextDocument` joins the context directory to the relative path
(src/checks.ts:388), so a witness stages a scratch context holding a MUTATED COPY
of the registry and the real file is never touched. `test/fixtures/` is on the
declaration, so the staging has somewhere to live.

**So M3-P7 dispatches against its declaration unamended**, on this evidence.

## What an implementer must be told anyway

The refutation above is about what the criterion PERMITS, not about what an
implementer will naturally reach for. The obvious way to witness "renaming a gate
id" is to edit `gate-registry.yaml`, run the check, and put it back. That is a
red scope gate and, worse, `git checkout --` to put it back is destructive in a
tree holding uncommitted work, which this repository has paid for twice.
**The dispatch must say: stage a context, never mutate the merged registry.**

## What this document does NOT establish

- **It did not execute any criterion.** `checklists/` does not exist on `main`
  yet, so nothing in this phase can be run; the reads were derived from the
  criteria text, the declaration and the checks engine's source.
- **It did not classify M3-P8, M3-P9 or M3-P10.** M3-P8 and M3-P9 are the two the
  screen flagged as planning-relevant (delivery/plan/m3-dependency-screen.md:48)
  and they remain unread.
- **It did not run the declaration-completeness probes** that
  delivery/plan/m3-p6-dispatch-read.md:1 runs for M3-P6. M3-P7 carries
  `src/cli.ts`, `src/validate.ts`, `src/commands/validate.ts` and `src/checks.ts`
  on its declaration already, which is a wider list than M3-P6's and covers the
  places those probes examined, but that is an observation and not the measured
  five-probe pass. It should be run before dispatch.
- **A criterion that depends on a file WITHOUT naming its path is invisible to
  this method**, which is the same false-clean limit the screen declares at
  delivery/plan/m3-dependency-screen.md:77.
