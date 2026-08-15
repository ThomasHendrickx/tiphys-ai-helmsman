# M3 exit test: interventions by the supervising current process

- date: 2026-08-15
- author: exit-test runner, dispatch B, recording decisions taken by the
  orchestrator
- discharges: the recording duty of E0.3
  (delivery/plan/kernel-plan-m3.md:5087), restated without weakening in
  `delivery/evidence/m3-exit-test/supervision-rules.md` section 2.

E0.3 binds every intervention by the supervising current process to be recorded
here with WHAT was done and WHY, and it classifies interventions: one that
substitutes for a kernel artifact is an exit-test failure, and one that only
observes, or that stops the run, is not. Each entry below states which kind it
is and who decided it, so a reader can disagree with the classification rather
than having to reconstruct it.

**Nothing in this file is a fact the runner derived.** Every entry is a decision
by the supervisor, recorded as the supervisor's. The E2 dual reviewers are free
to judge any of them wrong, and the bundle is written so that they can: the
argument is quoted in full, its citations resolve, and the measurement the
ruling rules on is in `delivery/evidence/m3-exit-test/e1-1-to-e1-5.md` unchanged
from before the ruling existed.

## I-1: the orchestrator's ruling on E1.4's citation criterion

- **Kind: a RULING on what a stage's text means.** It is not an action taken in
  place of a kernel artifact: no gate was run that the registry did not select,
  no output was hand-written, and no configuration was changed. The gate ran
  once, produced `not-applicable`, and that record is unchanged.
- **Decided by: the orchestrator.** Communicated to the runner in the dispatch
  B brief.
- **What the runner did before it: reported the criterion UNMET and stopped**,
  on the reasoning that forcing the linter would be "a human running a gate the
  registry did not select", which E0.3 names as an exit-test failure outright.
  The orchestrator recorded that as the correct call.

### The ruling, in the orchestrator's terms

The criterion is discharged by a recorded `not-applicable` carrying its
precondition id and evaluation, and this is a CONSISTENCY CORRECTION rather
than a relaxation. The argument, which the runner was told to check rather than
accept:

1. **The plan contradicts itself here and already knows it does.** Its own
   migration table at delivery/plan/kernel-plan-m3.md:274 was corrected at
   revision 3 to read that the citation linter "is a GATE with a diff-scoped
   precondition, not a free-standing linter over a file". E1.4's wording, "the
   M2-P5 citation linter exits 0 over it", is exactly the free-standing-linter
   reading that line 274 supersedes. Revision 3 corrected the migration table
   and did not propagate the correction into section 4.
2. **What a diff-scoped gate should do on a head that does not touch its
   configured documents is not a matter of taste.** DR-0018's expected-status
   table, as the plan states it in E1.6 at
   delivery/plan/kernel-plan-m3.md:5220, says a required diff-scoped gate whose
   trigger the head does not touch is expected `not-applicable` WITH ITS
   PRECONDITION ID AND EVALUATION RECORDED, and not green.
3. The observed result is that outcome, produced by the gate itself rather than
   by anybody's reading of it.

### The runner checked the argument and reports what it found

Line 274 resolves and says what the ruling quotes; it was read at
delivery/plan/kernel-plan-m3.md:274 in the tree under test. The gate's recorded
output, from `delivery/evidence/m3-exit-test/e1/records/E1.4-gate-citations.json`
and unchanged since before the ruling:

```
gates: citations: not-applicable: precondition citations-diff-touches-documents
  evaluated and unmet: no changed path under delivery/plan/,
  delivery/verification/, delivery/decisions/, delivery/tuition/,
  delivery/requirements/, delivery/STATE.md
```

Precondition id `citations-diff-touches-documents`; evaluation, that no changed
path lies under the six configured trees; runner exit 21, which is "no
applicable gate" for a single-gate invocation. So the record carries both of
the things DR-0018's table requires a not-applicable to carry.

**What the runner does NOT assert.** It does not assert that the ruling is
right. Two readings of E1.4 are available (the free-standing-linter reading its
own sentence carries, and the diff-scoped-gate reading line 274 carries), the
plan supports both because it was corrected in one place and not the other, and
choosing between them is a supervisor's call rather than a measurement. The
runner's contribution is that the measurement is unchanged and that line 274
says what the ruling says it says.

### F-1, the residue, recorded as a finding and NOT fixed here

The ruling settles which STATUS is correct. It does not deliver what E1.4's
sentence was reaching for, and recording it as though it did would be the
softening E0.3 forbids.

**Nothing in this run witnesses that a kernel plan instance's citations
resolve.** The gate's `documents` globs at src/gates/citations.ts:233 are
markdown-only under five `delivery/` trees plus `delivery/STATE.md`. A plan
instance is a YAML document, so it matches no glob under any of those trees,
and a plan instance authored by a CONSUMER of the shipped kernel lives outside
this repository's `delivery/` tree entirely.

**Severity argument, which is about reachability rather than about this exit
test.** The gap is not "a guard a future editor of the kernel could trip over".
It is reachable by an ordinary consumer: a project installs the kernel, writes
a plan instance under whatever path it uses, and the shipped verifier attached
to the plan-writer role (R-010a names `citations` as that role's verifier) never
looks at it. The plan-writer brief tells the role its citations will be
verified; for a consumer's plan instance, nothing verifies them.

**Not fixed here, and the reasoning is stated rather than left implicit.**
Changing the shipped gate's configuration in the middle of the exit test would
be a scope widening and a second intervention, and it would change a merged M2
artifact from inside a run whose whole point is to observe the artifact set as
shipped. The exit test is not the place to do it. Recorded as owed, unfixed,
with the two shapes a repair could take already named in
`delivery/evidence/m3-exit-test/e1-1-to-e1-5.md`: widen the gate's `documents`
configuration, or amend E1.4's text to name the linter's real subject. No
recommendation between them is offered here because both edit a merged
artifact.

## I-2: the orchestrator's decision NOT to re-run E1.5 with a fresh agent

- **Kind: a decision to STOP rather than to substitute.** E0.3 classifies
  interventions that only observe, or that stop the run, as not failures. This
  one declines an action.
- **Decided by: the orchestrator**, in the dispatch B brief, in its own words:
  a second bite after seeing the first result "would muddy the record more than
  it strengthens it".

**The bound this leaves, stated so the E2 reviewers see it rather than finding
it in a handback.** E1.5's adversarial plan review was produced by the same
agent that wrote the plan. The plan requires decorrelation at E1.7, not at
E1.5, so this is NOT a criterion failure; it is a bound on what E1.5's pass
means. What E1.5 witnessed: the checklist resolved, the brief composed, the
finding schema accepted a real finding set and rejected an empty
`no-findings-statement`, the findings were applied, and the amended plan
revalidated. What it did not witness: the fresh-eyes property, which is the
whole reason a review is a separate role. The finding set says so in its own
`produced-by` field
(`delivery/evidence/m3-exit-test/e1/findings-plan-review.yaml`), which is where
a reviewer reading only that document will meet it.

## F-2: `--type finding-set` does not exist, recorded as a finding

Same family as F-1: a plan-to-implementation mismatch where the plan's stage
text names something the delivered kernel does not have.

E1.5's text at delivery/plan/kernel-plan-m3.md:5209 says
`tiphys validate --type finding-set` exits 0. The delivered CLI's type list
carries `finding`; the schema's own title is "Tiphys finding set", so the
document TYPE is a finding set and the CLI's TYPE ID is `finding`. Measured, and
the record is
`delivery/evidence/m3-exit-test/e1/records/E1.5-findings-type-name-as-the-plan-writes-it.json`:
the command as the plan writes it exits **64** with a usage line, and the same
document under `--type finding` exits **0**.

**Not fixed here, either side.** Renaming a shipped CLI type in the middle of
the exit test would change a merged artifact; amending the plan's text is the
orchestrator's call and is not a runner's edit. Recorded as owed.

## What this file does NOT cover

**Only interventions somebody noticed.** The plan's own residual at
delivery/plan/kernel-plan-m3.md:5420 says an intervention that filled a gap
without either party noticing is not recorded, and no check over the record can
see it. This file inherits that bound exactly: it is a complete list of the
interventions the runner and the orchestrator each know about, and it is not
evidence that no other intervention occurred.
