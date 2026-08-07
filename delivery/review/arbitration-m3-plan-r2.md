# Arbitration: M3 plan adversarial review round 2

- date: 2026-08-07
- plan under review: `delivery/plan/kernel-plan-m3.md` revision 2, 4905 lines
- head reviewed: `f9a1e9e` on `claude/m3-plan-regrounding`
- reports: `plan-review-m3-r2-a.md` (completeness lens, Opus family),
  `plan-review-m3-r2-b.md` (falsifiability and hazard lens, Sonnet family)
- verdict of both: CHANGES REQUIRED
- combined: 20 findings, 10 high, 9 medium, 1 low, one duplicate pair

## Disagreements to arbitrate: NONE

The two reports do not conflict on a single finding. They were given different
lenses precisely so that a shared blind spot could not hide a defect from both,
and the result is complementary rather than overlapping: A found defects at the
plan's JOINTS with the world, B found defects where the plan's own prose names
a hazard and then never checks it.

One finding was reached INDEPENDENTLY BY BOTH, by different routes, and that
convergence is the strongest signal in the round: A-002 and B-001 are the same
defect in the exit test's post-merge criterion.

Because there is nothing to adjudicate between them, this document does the
other half of an arbitration's job: it reduces 20 findings to the MECHANISMS
behind them, per the fix-round contract, so revision 3 fixes causes rather than
walking a list.

## Mechanism 1: the plan is grounded on a PREDICTION of M2 that is now readable

**Instances: A-001, A-008, A-009, A-011, A-015 (the statement of it), and the
CI half of A-002. Five of the seven highs in report A.**

Revision 2 re-grounded against `delivery/plan/kernel-plan-m2.md` while that
document was itself DRAFT. The plan states the hazard correctly at its own
lines 228-233 ("a path taken from it is a starting point for that verification,
never a substitute for it") and then relies on it anyway. M2 is now COMPLETE on
`main` at `dbba3c8`; every joint the plan describes is an artifact that can be
READ instead of predicted, and report A read five of them and found three
mis-specified:

| joint | plan says | `main` says |
|---|---|---|
| CI shape | two jobs, a `test` matrix plus a `gates` fan-in; eight `fan-in` references; D-M3-28 is a binding criterion pattern for five phases | ONE job named `gates` (DR-0017, which the plan cites zero times). The hazard those five criteria guard cannot occur in a single-job workflow. |
| phase declarations | `delivery/plan/phases/`, fields `files-to-touch` / `extras` | `delivery/plan/phase-declarations/`, fields `filesToTouch` / `declaredExtras`, `additionalProperties` closed. M3-P1 criterion 10 fails on first attempt. |
| new checks | five wired as raw workflow steps | M2 delivered a gate registry and a single caller of `gates run`; raw steps bypass it |
| M2-P6 coverage checker | reason given for not reusing it | factually wrong against M2 as delivered |

**Ruling: ACCEPTED, and it is the round's primary work.** Revision 3 re-grounds
every joint against M2 AS DELIVERED, reading the artifact rather than the M2
plan. This is one bounded pass, not a re-plan: no requirement row moves, no
phase is renumbered, no decision id is reused. Fixing the four instances
individually is explicitly rejected as the instance-fix shape the fix-round
contract bans.

A stale-grounding statement in the header ("M2 has not started and is held by
the owner's hard stop") is corrected in the same pass.

## Mechanism 2: a hazard named in prose never becomes a falsifiable criterion

**Instances: B-002 (high), B-003, B-004 (medium).**

The plan carries a `hazard-classes[]` field per phase (D-M3-32), which is the
project's own answer to tuition T-007 (a criteria-walking review cannot find a
defect the criteria do not describe). The field is populated with genuinely
sharp, mechanically-checkable hazards. Several then appear NOWHERE in the
phase's acceptance criteria.

The sharpest instance, B-002: M3-P2's hazard class names "a promotion that
silently drops M2's `units`-greater-than-zero rule, so a gate examining nothing
reports green lawfully". That is M2-C-2, the anti-vacuous-green constraint the
whole of M2's gate contract exists to enforce. `grep -in units` over the entire
4905-line plan hits only the hazard prose itself: not one of M3-P2's seven
criteria, not the sixteen-row derived-check table, not the behaviors list, not
the exit test. The promotion of the gate registry could therefore drop M2's
central safety property and pass every criterion M3-P2 declares.

**Ruling: ACCEPTED, at the mechanism.** Revision 3 adds a standing rule and
applies it to every phase: **every item in a phase's `hazard-classes[]` must
name either the numbered acceptance criterion that reddens against it, or an
explicit recorded reason no criterion can.** A hazard class with neither is a
plan defect. B-004 is the same mechanism one abstraction up (M3-P5 builds a
text-specificity witness; M3-P6 reintroduces the identical clauses under the
identical named hazard with only a presence check), and the rule closes it
without a separate fix.

This mechanism is worth more than its three instances: it converts
`hazard-classes[]` from documentation into a checked obligation, which is what
T-007 asked for and what revision 2 declared but did not enforce.

## Mechanism 3: the exit test's witnesses do not cover the arms they claim

**Instances: A-002 + B-001 (the convergent high), B-005 (high).**

Two distinct defects, one mechanism: a witness asserted to cover more than it
demonstrably covers.

- **A-002 / B-001.** Exit stage E3.1 reads "CI is green on `main`". That is the
  exact incomplete sentence tuition T-009 was written to ban, and T-009 is
  newer than revision 2 so the plan cannot have absorbed it. The criterion
  never distinguishes the `push`-event run on the NEW `main` head from the
  already-green `pull_request` check on the source branch, which is precisely
  the confusion that left `main` red for four hours and twenty-one minutes
  across five consecutive runs. T-009 appears once in 4905 lines, as a remark
  about tuition id allocation.
- **B-005.** The exit test's SINGLE falsification control (one schema keyword
  removed) is asserted to prove "the stages are not measuring what they claim"
  across roughly fifteen structurally different E1 mechanisms. That violates
  the plan's own rule, section 2.3 rule 6, "one witness is not a class",
  applied to itself.

**Ruling: BOTH ACCEPTED.** Revision 3 rewrites E3.1 to name the event and the
head sha (the run whose head sha is the new `main` tip, observed to
completion), absorbs T-009's mechanism wherever M3 behavior forks on CI event
or environment, and replaces the single falsification control with controls
covering structurally different E1 mechanisms, or states explicitly which
mechanisms remain unwitnessed and why.

## Mechanism 4: identifier namespaces are not registered, so ids collide

**Instances: A-003 (high, raised from medium by its own addendum).**

`A-n` owner-action ids are used by three live documents with different
meanings. `A-4` means the npm publish credential in the plan and branch
deletion in `delivery/STATE.md`. `A-3` means three different things, one of
them a literal string inside `gates.manifest.json` ON `main`
(`implementer-token-present-owner-action-a-3`), which makes this not merely
cosmetic: a rename now touches shipped configuration.

**Ruling: ACCEPTED.** `A-n` is added to CLAUDE.md's identifier-scheme registry
with a single owning document, and the collisions are resolved by allocating
fresh ids rather than renumbering the one embedded in `gates.manifest.json`.
This is an orchestrator action on CLAUDE.md and STATE.md, not a plan edit, and
is done alongside revision 3.

## Remaining findings, accepted as written

Each is a genuine local defect with no larger mechanism behind it. Revision 3
applies them directly: A-004 (plan v1 outline item 2 dropped from the mapping),
A-005 (section 2.5's parallelism derivation contradicts its own files-to-touch
lists: "nine of ten phases edit `src/cli.ts` or `src/validate.ts`" is seven,
"six edit `package.json`" is nine), A-006 (M3-P7 and M3-P8 declared
parallelizable while P8's `blocked-by` requires P7 merged), A-007 (the clause
map, the sole EXT-F-07 orphan check for seven subphases, has no specified row
inventory, so the missing-row condition it exists to catch cannot fire),
A-010 (M3-P8's files-to-touch enumerates T-001 to T-008 as a fixed list; T-009
already exists and the list is a moving target), A-012 (section 1.5's binding
format table omits two artifact types the plan ships), A-013 (M3-P10's evidence
bundle and pre-run supervision note), A-014 (low: M3-P4 criteria numbered
2, 2c, 2d, 2b).

A-007 deserves a note: it is structurally the same shape as mechanism 2. A
check that cannot see the condition it exists to detect is a guard whose
condition does not test the property that matters, which is the red-witness
rule one level up and is recorded in tuition T-008's own postscript. It is
listed here rather than under mechanism 2 only because its fix is local.

## What this round did NOT cover

Recorded because a search whose scope is wrong returns an empty result
indistinguishable from an absence of defects, and this project has been bitten
by that repeatedly.

- **No code was executed against M3 artifacts, because none exist.** Every
  finding is a document defect. The phases themselves remain unverified by
  anything except reading.
- Report A's path-existence sweep is, in its own words, "structurally blind to
  every defect I actually found": it tests whether a named path exists, not
  whether the plan's description of that path's CONTENT is true. The three
  mis-specified joints were found by opening artifacts, and only five of M2's
  artifacts were opened. **Six M2 gate modules were never read.** Mechanism 1's
  fix must open them rather than assume the remaining joints are sound.
- Report B did not make a full clause-by-clause pass of M3-P5 and M3-P6, and
  read sections 5 through 7 and the appendices only in part.
- Neither reviewer audited Appendix C (recorded residues and options).

## Disposition

Revision 3 is authorised on the four mechanisms and the eight remaining
findings. It is a bounded re-grounding pass: no requirement row moves, no phase
is renumbered, no decision id is reused, and any change of that kind is itself
a finding to be raised rather than made.

Revision 3 then takes a DELTA review scoped to the changes, per the standing
rule that a fix round is not lower risk than the work it fixes.
