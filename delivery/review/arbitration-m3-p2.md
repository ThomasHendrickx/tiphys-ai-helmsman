# Arbitration: M3-P2 dual clean-room review

- date: 2026-08-08
- phase: M3-P2 (canonical gate registry)
- head reviewed: `ee7042b`, PR #48
- reports: `clean-room-m3-p2-criteria.md` (Opus family, 673 lines),
  `clean-room-m3-p2-hazard.md` (Sonnet family, 558 lines)
- verdicts: criteria CHANGES REQUIRED (0 high, 4 medium, 2 low); hazard
  CHANGES REQUIRED (1 high, 1 medium)
- combined: 8 findings, 1 high, 5 medium, 2 low, with two overlapping pairs

## Disagreements to arbitrate: NONE

No conflict on any finding. The two reports overlap on exactly two, and BOTH
overlaps are the same defect reached from opposite directions, which is the
round's strongest signal: A-005 with B-001, and A-003 with B-002.

## What both reviewers CONFIRMED, and why it is the headline

M3-P2 promotes the registry every gate in the project now flows through, so a
silent weakening here would weaken every gate at once. Both reviewers attacked
that and both failed to break it, INDEPENDENTLY and by construction rather than
by reading the implementer's tests.

- **M2-C-2 and M2-C-3 survive the promotion on BOTH selection paths.** The
  criteria reviewer built its OWN zero-units-green fixture gate rather than
  reusing the phase's: exit 21, record rewritten to `error` with
  `vacuous: true`. The hazard reviewer's independent fixture attacks reproduced
  exactly what `test/gate-registry.test.ts` already witnesses. This is the
  hazard the M3-P1 review found had no criterion at all, and criteria 3b and 3c
  now hold under attack from two directions.
- **SC-011 holds**: an unmet precondition reports not-applicable and never
  green, through the registry path.
- **The strongest single result in the round.** An A/B of
  `--registry --mode full` against `--manifest gates.manifest.json` on the same
  head is identical ROW FOR ROW, status for status, unit count for unit count,
  plus exactly `agent-rules-drift`. The phase's central claim, "a projection,
  and after it the M2 runner untouched", is therefore TRUE BY MEASUREMENT and
  not by assertion.
- The workflow is still ONE job named `gates` with no matrix (DR-0017,
  DR-0004), verified with an independently written extractor.
- The drift check is a real behaviour, caught by three structurally different
  defangs including a T-009 event-arm narrowing.

## Mechanism 1: prose asserting a present-tense fact that nothing checks

**Findings: A-005 + B-001 (high), A-003 + B-002 (medium). Both overlaps land
here.**

Two documents state, in the present tense, things the system does not do.

- `CLAUDE.md:148` and `gate-registry.yaml:4` say CI runs the gates through
  `tiphys gates run --registry gate-registry.yaml --mode <mode>`. It does not.
  Verified independently by the orchestrator: `--registry` appears NOWHERE in
  `.github/workflows/gates.yml` or `scripts/m2-exit-test.sh`, and both CI arms
  call `--manifest gates.manifest.json`.
- `gate-registry.yaml`'s `$comment` on the two D-11 checklist entries says
  their precondition "is evaluated and unmet" and that they report
  not-applicable. The runner filters them out BEFORE any evaluation: no record,
  no evidence directory, no status. That is criterion 3c's own distinction
  asserted backwards, in the document that defines the gate.

This is tuition T-006 exactly, and the first instance is in the worst possible
file: every later agent reads `CLAUDE.md` as fact.

**The guard closest to catching it cannot.** `clause-map` marks R-094
discharged because the string "R-094" OCCURS in the file, since
`scripts/check-clause-map.mjs:195` is a substring check. A guard whose
condition does not test the property that matters, for the fourth recorded time
in this project.

**Ruling: ACCEPTED, high.** Correct both documents to state what is true. Do
NOT re-architect: see the R-094 note below. Where a claim can be made
checkable, make it checkable; where it cannot, do not write it in the present
tense.

## Mechanism 2: the phase's headline feature has no exclusion witness

**Finding: A-002 (medium), and it is the most consequential medium.**

Deleting the `--mode` filter entirely (`inMode = document.gates`) leaves the
WHOLE 470-test suite green. Every mode test uses `modes: [mode]`, so no test
has a member that must be EXCLUDED. `modes[]` made live is this phase's
headline addition and **M3-P3 consumes it**.

Five other mutations the reviewer tried all reddened correctly, which is what
makes this one a real gap rather than a thin suite.

**Ruling: ACCEPTED.** This is the red-witness rule's own subject: a test that
stays green when the behaviour is deleted does not guard it. Add a witness with
a gate that must be excluded by mode, and red-witness the deletion.

## Mechanism 3: evidence recorded against a world that no longer exists

**Finding: A-006 (medium).**

The work history's criterion-3 walk and PR-bundle evidence record `scope` RED
against a merge base that no longer exists. On the current head `scope` is
GREEN and the actual unmet row is `citations`; the reviewer's own PR bundle
exits 0 with `m2-assert (PR bundle): OK`.

The cause is benign, the two declaration amendments (#46, #47) moved the merge
base under the branch, but the consequence is not: a work history is the
artifact a later reviewer trusts, and this one describes a failure that no
longer occurs and omits the one that does.

**Ruling: ACCEPTED.** Re-run the bundle on the current head and re-record. This
is the same rule revision 3 of the plan learned for embedded derivations: a
derivation published as evidence must be re-run against the FINAL state it
ships with.

## R-094 and the "one source" question, settled here so the fix round does not reopen it

The phase's intent cites R-094: the canonical registry CI and briefs both read
FROM ONE SOURCE. It is worth being precise about how far that is delivered,
because the false prose above makes it look further along than it is.

- Briefs: DELIVERED. `CLAUDE.md`'s gate list is GENERATED from
  `gate-registry.yaml` by `scripts/render-agent-rules-gates.mjs`, with a drift
  gate that is red-witnessed three ways.
- CI: NOT YET. CI reads `gates.manifest.json`. The parity test at
  `test/gate-registry.test.ts:257-267` asserts every manifest gate is still in
  the registry, which is manifest SUBSET registry, ONE DIRECTION. It prevents
  the registry losing a gate; it does not make CI read the registry. A gate
  added only to the registry therefore does not run in CI, which is exactly
  what happened to `agent-rules-drift` and why the implementer escalated it.

**Ruling: NOT a defect of this phase, and NOT to be fixed in it.** Making CI
read the registry means editing `scripts/m2-exit-test.sh`, which is not on this
phase's declaration and which plan revision 3 settled as the single caller of
`gates run`. It is orchestrator work, it is the FOURTH such fix to that one
file (#27, #30, #44 and now this), and it is tracked in `delivery/STATE.md`.
The fix round must therefore describe R-094 as PARTIALLY delivered rather than
claim it whole.

## Remaining findings, accepted as written

- **Low.** Criterion 3's "exits 0" is unsatisfiable: `citations` is
  legitimately not-applicable because its own glob set excludes `.json` and
  `work-history/`, and the M2 path gives the identical exit 20, so the
  promotion did not cause it. Record it as a plan defect rather than working
  around it.
- **Low.** "naming the entry id" is discharged by a JSON pointer per DR-0013.

## Stopping rule

DR-0012's limit is more than two fix rounds after the first dual review, or a
high recurring in the same component across rounds. This is round one. The
limit has NOT fired.

## What this round did NOT cover

- Neither reviewer ran the phase against a real consuming project; both worked
  in the kernel repository.
- Neither audited whether registry entries OTHER than `agent-rules-drift` are
  unreachable by both bundles. The hazard reviewer was asked to and reported it
  under non-coverage. That question stays open and belongs with the
  orchestrator's harness work.
- The `push` arm still has no witness, which the implementer declared. It is
  the orchestrator's to watch post-merge under T-009.
