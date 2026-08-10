# M3-P4 declaration pre-check, run before dispatch

- date: 2026-08-10
- checker: the orchestrator
- subject: delivery/plan/phase-declarations/m3-p4.json against the M3-P4 plan
  section in delivery/plan/kernel-plan-m3.md, lines 2626 to 2966
- result: **the declaration is COMPLETE. M3-P4 can be dispatched without an
  amendment.**

## Why this was run

M3-P3's declaration needed amending THREE times, and every one was discovered by
a red scope gate mid-phase rather than before dispatch: once for the charter
files, once for `package-lock.json`, once earlier still. Each cost a round trip
on a phase that was already long. The declaration this check reads is
delivery/plan/phase-declarations/m3-p3.json, and the auditor that reads it is
described in delivery/plan/kernel-plan-m2.md.

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

---

# Addendum, 2026-08-10: the `wt-m3p3` worktree question, SETTLED by measurement

The M3-P3 round-8 implementer freed the phase branch name from a stale worktree
(`scratchpad/wt-m3p3`) so the scope gate could run, and correctly declined to
delete the tree because it appeared to hold **nine uncommitted paths belonging to
another agent**. It handed the question over rather than guessing, which is the
right behaviour.

It is now settled, and the answer is that there is NO uncommitted work there.

Every file was checksummed against the commits it could plausibly have come from:

| file | matches |
|---|---|
| `src/checks.ts` | `218fc12` |
| `test/assurance-modes.test.ts` | `218fc12` |
| `test/behaviors.json` | `218fc12` (and `18c335a`) |
| `delivery/work-history/m3-p3.md` | `218fc12` |

All four are byte-identical to `218fc12`, which is in the branch history. The
tree's apparent modifications are an ARTIFACT of it being switched forward from
`218fc12` to `986f58a` while its working files stayed at the older content, which
is also why three witness specs that round 7 ADDED show as deletions: they never
existed in the state those files came from.

So nothing is at risk. The tree is disk, not evidence.

**The removal was attempted and BLOCKED by the environment's permission
classifier**, force-removing a dirty worktree being the kind of action it
declines. That is recorded rather than worked around. It is not a blocker:
exactly one worktree holds the phase branch now, so the scope gate can run, which
was the actual problem the round-7 verifier reported.

The general point, and the reason this is written down: **"another agent's
uncommitted work" is a claim, and a checksum settles it in seconds.** A stale
worktree that merely LOOKS dirty is otherwise preserved forever by everyone who
touches it, each reasonably declining to be the one who destroys someone else's
work.
