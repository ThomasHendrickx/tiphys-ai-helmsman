# Arbitration: M3-P3 round 6 (DR-0022 option A2), head `218fc12`

- date: 2026-08-09
- arbitrator: the orchestrator
- inputs: two clean-room reviews of the same head, on different contracts, plus
  the orchestrator's own independent reproduction
- outcome: **CHANGES REQUIRED. Round 7 is dispatched. Merge is blocked by
  DR-0012 condition 2, which forbids merging with an unresolved medium.**

## The two reviews

| contract | verdict | findings |
|---|---|---|
| supply chain and regression | APPROVE | none |
| correctness | CHANGES REQUIRED | CR-001 medium, CR-002 medium, CR-003 low |

They do not disagree. The supply-chain contract asked whether the dependency,
the registries and the salvaged tree were sound, and they are. The correctness
contract asked whether the extractor is right, and on two counts it is not. Two
contracts finding different things is the point of running two, and it is why
T-007 requires different CONTRACTS rather than merely different models.

## Round 6 did NOT fail the way rounds 1 to 5 failed, and the difference is measured

The tempting reading is "five for five became six for six". That reading is
wrong, and it was worth measuring rather than assuming.

The orchestrator ran CR-001's shapes against the PRE-A2 head `18c335a` in a
separate worktree (`delivery/review/orchestrator-reproduction-cr-001.md`). All
four leak there too: pre-A2 strips the outer marker and leaks the inner one, A2
leaks both. **CR-001 is a pre-existing hole that A2 widened, not a defect A2
introduced.** The correctness reviewer reached the same conclusion by a different
route, noting that the project already graded this class FAIL for the old code as
shape S28 and that the top-level form was fixed while the in-list form was not.

So round 6 delivered what the owner decided, correctly: 20 of 20 unit sets
byte-identical (re-derived by the reviewer from `git archive 18c335a` rather than
from the round's own staged copy, which is the right paranoia), the 40-shape
exploit set at 40/40, the four previously unmodelled forms handled, eight
fabrication variants rejected. A fresh lens then found an old hole. **That is an
ordinary review outcome, not a repeat failure**, and round 7 is therefore an
ordinary fix round rather than a DR-0016 escalation. This is an orchestrator
judgment and it is stated here so it can be disagreed with.

## CR-001, and the mechanism is not the finding

The finding is "nested list markers leak into the unit". The mechanism is this:

`startOffset` verifies the parser's start column instead of trusting it, which
was the correct lesson from the earlier rounds. It verifies by testing the
skipped span against `SKIPPABLE_PREFIX`, and that regex models **at most one list
marker**; its own comment says so in those words. The guard therefore has two
causes it cannot tell apart:

1. the column describes a DIFFERENT line, the real hazard it was built for, and
2. the column is CORRECT and simply describes a prefix richer than the regex can
   spell.

It takes the same fallback on both, and that fallback consumes only `quoteDepth`
quote markers. On a line opening with a list marker, `quoteDepth` is 0, so it
returns 0 and the slice is the ENTIRE RAW LINE.

**The defect is the fallback direction, not the regex's incompleteness.** A round
that widens the regex by one marker moves the boundary and leaves the shape
intact at three. A fix must be argued against the mechanism.

Both directions are live at once, which is worth stating plainly: the unit set
GAINS a marker-carrying string that no document contains (fail-open, a fabricated
condition equal to it is accepted) and LOSES the real prose unit (fail-closed, a
legitimate quote is rejected).

## CR-002 is the more serious finding, and it is about the tests

Fourteen of twenty mutations of the new code survive. The decisive measurement is
not the ratio: it is that **M04, which is literally the pre-fix `startOffset`,
leaves the FULL suite at 501 tests, 501 pass, exit 0.** M01, the pre-fix
`carriesProse`, is the same.

So both defects this round reports fixing have no red witness. No witness spec
names `startOffset`, `SKIPPABLE_PREFIX`, `sourceSlice`, `carriesProse` or the
line-split regex.

The mechanism: **a behavior can be registered in `test/behaviors.json` and
resolve green without any witness spec naming the code that implements it.** The
registry couples a NAME to a test; the red-witness rule couples a test to a
DANGEROUS STATE; and nothing couples the second to the first automatically. Rule
(d) can only check specs that exist, so a round that adds none is silent rather
than red. The round added thirty behavior rows and zero witness specs for the
helpers carrying its mechanism.

This is the fifth member of the family CLAUDE.md records, and it is the T-011
shape at one more level of abstraction: T-011 is a witness that STOPS witnessing,
this is a witness that never STARTED while every gate stayed green.

## CR-003, low

`NOT_QUOTABLE` has no observable effect because all four of its types are AST
leaves and heading children are inline. The round's own claim about this is
CONFIRMED. Take the reviewer's judgment: keep the set as declared intent and fix
the docstrings that claim it performs an exclusion, because a comment asserting a
behavior the code does not have is the thing that misleads the next reader. Two
witness specs also carry byte-identical `dangerousStates`, which is a separate
small item in the same area.

## Round 7 scope, and the ordering is deliberate

1. **CR-002 first.** Take real witnesses for the mechanisms this phase
   introduced, starting with the two that are literally the pre-fix code. A
   witness for the CR-001 class must redden under at least TWO structurally
   different members, and three-deep nesting is the natural second.
2. **CR-001 second**, argued against the mechanism above rather than against the
   seven shapes the reviewer listed. The derivation must enumerate every call
   site that reaches this fallback and state what the search did not cover.
3. **CR-003 third**, docstrings only.
4. Re-check the owner's DR-0022 acceptance criterion after every change: unit
   sets byte-identical on all twenty records. It is the criterion that caught the
   A-versus-A2 error and it is cheap to re-run.

Ordering CR-002 first is not cosmetic. If the witnesses are taken first, they
must be red against the shipped code, and then the CR-001 fix has something to
turn green. Fixing first and witnessing after is how a witness gets written to
match the implementation, which the red-witness rule exists to prevent.

## A measured starting point, which the implementer may reject

`delivery/review/orchestrator-cr-001-fix-feasibility.md` records that widening
`SKIPPABLE_PREFIX` to allow any number of interleaved quote and list markers
closes all seven reported shapes plus the unreported three-deep member, keeps
rejecting all four column-is-lying spans, leaves the suite at 501 with 0 failures,
and preserves the twenty byte-identical unit sets exactly.

That is offered as evidence, not as an instruction. The implementer owes its own
derivation and is free to conclude the mechanism needs a different treatment. It
is recorded because DR-0022 established that prototyping beats arguing here, and
because a round that starts from a measurement is cheaper than one that starts
from a paragraph.

## Two traps relayed from the reviewer, both costly and both mechanical

- The scope gate needs `--phase m3-p3` AND `--base $(git merge-base HEAD origin/main)`,
  which is `3c60acb`. Local `main` in these worktrees is stale at `c2e2009`, and
  using it produces a FALSE red of 57 out-of-scope paths that are main's own. A
  measurement artifact that looks exactly like a finding.
- The reviewer's own first ASCII check reported exit 0 because `head` swallowed
  grep's status. It re-ran it correctly and both are clean. This is the pipeline
  form of the same trap CLAUDE.md records for the missing `-a`: a check whose
  exit code is not the check's exit code is green and worthless. Report the
  status of the grep, not of the pipeline.

## An open item neither review settles

The orchestrator's feasibility run reported 492 passed with 9 skipped out of 501,
where both reviewers report 501 of 501 passing at the same head. All runs exit 0
and none has a failure, so nothing is red, but these are not the same statement.
Round 7 should establish which nine and why before quoting either figure as the
phase's evidence. Recorded rather than averaged away.
