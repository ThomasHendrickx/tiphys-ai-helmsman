# M3-P5 declaration pre-check, run before dispatch

- date: 2026-08-10
- checker: the orchestrator
- subject: the declaration at delivery/plan/phase-declarations/m3-p5.json:2
  against the M3-P5 plan section beginning at
  delivery/plan/kernel-plan-m3.md:2975 and running to line 3209
- result: **the declaration is COMPLETE. M3-P5 can be dispatched without an
  amendment.**

This is the second phase pre-checked this way. The first,
delivery/plan/m3-p4-declaration-precheck.md:8, was run because M3-P3's
declaration needed amending THREE times and every amendment was discovered by a
red scope gate mid-phase rather than before dispatch. M3-P4 has since run
without a declaration amendment.

## Method, and the bug the method had

Every repository path named anywhere in the section was extracted mechanically
and tested against `filesToTouch`, treating a trailing slash as a prefix and
allowing the two standing pre-authorized extras (`test/behaviors.json` and the
phase work history).

**The first run of the extractor was WRONG, and it is recorded rather than
quietly fixed**, because the failure shape is the one this project keeps paying
for. Its extension alternation listed `js` before `json`, and JavaScript regex
alternation is first-match rather than longest-match, so `finding.schema.json`
matched as `finding.schema.js`. That produced THREE phantom uncovered paths
(`schemas/finding.schema.js`, `schemas/plan.schema.js`,
`schemas/role-brief.schema.js`) and one phantom `package.js`, none of which
exist. Two of the four were files the declaration DOES cover.

A pre-check whose extractor silently truncates names reports gaps that are not
gaps, and would have sent an implementer to amend a declaration that was already
correct. The fix orders the alternation longest-first and adds a trailing
`(?![A-Za-z0-9])`.

**The fix was validated against a known-good result rather than by inspection.**
Re-running the corrected extractor over the M3-P4 section reproduces that
pre-check's four uncovered paths EXACTLY: `CLAUDE.md`, `brief.md`,
`delivery/plan/kernel-plan-m2.md` and `warnings.md`. A control that reproduces a
prior independent result is what makes this run's numbers usable; without it the
counts below would be one more assertion.

Measured, corrected extractor: **23 paths named, 16 covered, 7 not covered.**

## The seven, and why none is a real gap

| path | verdict |
|---|---|
| `src/brief.ts` | **READ, AND EXPLICITLY FORBIDDEN AS A WRITE.** The section says it is "consumed, not rewritten", and again that this phase "does NOT fix `src/brief.ts`" because patching it from here would repeat CR-521. Its absence from the declaration is DELIBERATE and correct, and adding it would be the error. |
| `warnings.md` | RUNTIME ARTIFACT. The fleet `warnings.md` that `tiphys spawn` reads, not a repository file. Same disposition as in the M3-P4 pre-check. |
| `delivery/STATE.md` | CITATION. Cited as the record that scopes the unprobed-open class. |
| `role-model-config.yaml` | READ. The role brief's `model-tier` is "resolved against" it. An M3-P3 deliverable, already merged. |
| `schemas/plan.schema.json` | READ. The plan-writer's output is validated by it. An M3-P1 deliverable, already merged. |
| `templates/plan.example.yaml` | READ, at run time. It appears as the `--phase` argument of an acceptance-criterion command, not as a file this phase edits. |
| `MECHANISMS.md` | CITATION, and a FORWARD one: it is an M3-P8 deliverable and does not exist yet. Flagged below. |

## Two paths declared but never named in the section

`src/commands/validate.ts` and `delivery/requirements/clause-map.json`. Both are
the standing shape of every M3 phase (register the derived checks, append the
clause rows) and both appear in M3-P4's declaration on the same footing. An
over-broad declaration is a scope-audit weakness rather than a red gate, so it is
noted and not changed.

## One thing to carry into the dispatch brief

`MECHANISMS.md` is cited by M3-P5's grounding and is delivered by M3-P8, which
runs LATER. A forward citation to a file that does not exist yet resolves to
nothing. It is harmless in the plan, which is already merged, but an implementer
that copies the grounding's phrasing into a new `delivery/` document would
produce a citation the gate cannot resolve. The gate's rule is that a citation is
`path.ext:LINE` outside backticks; a path in backticks is deliberately
non-resolving and is the correct form for naming a file that does not exist yet.

## What this pre-check does NOT establish

Stated because a check whose scope is wrong returns a clean result
indistinguishable from an absence of problems.

- It only reads paths the plan NAMES. A file the phase turns out to need but the
  plan never mentions is invisible to it. M3-P3's `package-lock.json` amendment
  was exactly that shape, and M3-P5 declares `package.json`, so if it adds a
  dependency the lockfile is the same trap again. **This is the one gap most
  likely to bite, and it is not closed by this check.**
- It does not check that every declared path is one the phase will actually
  touch.
- It says nothing about the `citations` array, only `filesToTouch`.
- It was run against the plan at this head. A plan amendment after this point
  invalidates it.
- It does not verify that the declared `branch` matches what the dispatcher will
  use, which is a separate red-gate shape recorded in CLAUDE.md's branch-name
  section.

## Consequence

M3-P5 is dispatch-ready on the declaration axis. It remains BLOCKED on M3-P4
merging: the section's own `blocked-by` names "M3-P4 merged", and M3 is a
strictly serial chain with no conflict pre-pass.
