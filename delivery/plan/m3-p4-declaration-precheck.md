# M3-P4 declaration pre-check, run before dispatch

- date: 2026-08-10
- checker: the orchestrator
- subject: `delivery/plan/phase-declarations/m3-p4.json` against the M3-P4 plan
  section (`delivery/plan/kernel-plan-m3.md`, lines 2626 to 2966)
- result: **the declaration is COMPLETE. M3-P4 can be dispatched without an
  amendment.**

## Why this was run

M3-P3's declaration needed amending THREE times, and every one was discovered by
a red scope gate mid-phase rather than before dispatch: once for the charter
files, once for `package-lock.json`, once earlier still. Each cost a round trip
on a phase that was already long.

The scope auditor reads the declaration from the MERGE BASE, so a phase cannot
author its own. That is what makes a missing entry expensive: the phase must
stop, the orchestrator must land an amendment separately, and only then can the
gate pass. Checking before dispatch costs minutes.

## Method

Every repository path named anywhere in the M3-P4 plan section was extracted
mechanically and tested against the declaration's `filesToTouch`, treating a
trailing slash as a prefix and allowing the two standing pre-authorized extras
(`test/behaviors.json` and the phase work history).

**16 paths named, 4 not covered by the declaration.** Each of the four was then
read IN CONTEXT rather than reported as a gap, because a path in a plan is more
often a citation than a file to edit.

## The four, and why none is a real gap

| path | verdict |
|---|---|
| `CLAUDE.md` | CITATION. The section cites its fix-round contract and claim grep as rules that become kernel deliverables here. It is not edited by this phase. |
| `delivery/plan/kernel-plan-m2.md` | CITATION. The M2 traceability table routes four uncovered M1 defects to this contract by name. |
| `warnings.md` | RUNTIME ARTIFACT. Acceptance criterion 5 places `templates/warnings.md` as a fleet `warnings.md` and runs a spawn. The bare name is the file the spawn creates at run time; the repository file is `templates/warnings.md`, which IS on the declaration. |
| `brief.md` | RUNTIME ARTIFACT. Same criterion: the M1-P4 brief assembly produces a `brief.md` containing the full warnings text. Nothing in the repository is at that path. |

So all four are the extractor being deliberately over-inclusive, which is the
correct direction for a pre-check to err.

## What this pre-check does NOT establish

Stated because a check whose scope is wrong returns a clean result
indistinguishable from an absence of problems, which this project has recorded
three times.

- It only reads paths the plan NAMES. A file the phase turns out to need but the
  plan never mentions is invisible to it, and M3-P3's `package-lock.json`
  amendment was exactly that shape: `npm ci` installs the lockfile, so adding a
  dependency touches it, and no plan sentence says so.
- It does not check that every declared path is one the phase will actually
  touch. An over-broad declaration is a scope-audit weakness rather than a red
  gate, so it is not what this check is for.
- It says nothing about the CITATIONS array, only `filesToTouch`.
- It was run against the plan at this head. A plan amendment after this point
  invalidates it.

## Consequence

M3-P4 is dispatch-ready on the declaration axis. It remains BLOCKED on M3-P3
merging, because both phases list `src/checks.ts`, `src/validate.ts` and
`src/commands/validate.ts`, and M3 is a strictly serial chain with no conflict
pre-pass.
