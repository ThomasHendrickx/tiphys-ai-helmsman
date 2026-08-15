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

## I-3: the orchestrator's ruling on the subject change's branch name

- **Kind: a RULING plus a DECLINED action.** It changed no kernel artifact, ran
  no gate the registry did not select, and wrote no output by hand. It changed
  where the subject change's work is named, and it declined to create a phase
  declaration.
- **Decided by: the orchestrator**, mid-dispatch, on measuring that
  `delivery/plan/phase-declarations/m3-p13.json` does not exist on `origin/main`.

### The ruling, in the orchestrator's terms, with its reasoning

Rename the branch so it does NOT match `^claude/m[0-9]+-p[0-9]+-`, and do not
create an `m3-p13` phase declaration. The declaration route was considered and
rejected: it would need its own pull request to `main` first, which DR-0031
permits, but M3 has TWELVE phases in the plan and minting a thirteenth id would
put a phantom phase into the milestone's accounting permanently. The exit-test
subject change is not a phase; it is the exit test's subject.

The runner checked the harvesting claim rather than accepting it.
`.claude/orchestrator-next.mjs:126` reads phase numbers from three sources: the
`delivery/plan/phase-declarations/` listing on `origin/main`, the
`delivery/work-history/` listing on `origin/main`, and remote branches matching
`origin/claude/<milestone>-p*`. So all three of a declaration file, a
`m3-p13.md` work history and a phase-shaped branch would each have minted the
phantom. All three were avoided: the declaration was deleted, the work history
was renamed to `delivery/work-history/exit-subject-doctor-kernel-artifacts.md`,
and the branch is `claude/exit-subject-doctor-kernel-artifacts`, which the
pattern one-liner reports false for.

### The consequence the orchestrator is accepting, stated without softening

**On a non-phase branch the scope gate has no phase to audit, so it reports
not-applicable, and the scope audit therefore asserts NOTHING about the subject
change.** That is a real reduction in what E1.6's expected-status table
witnesses, and the orchestrator chose it over a permanent phantom phase.

**This kind of not-applicable is WEAKER than the diff-scoped kind DR-0018's
table contemplates.** There the trigger is "the head does not touch the gate's
configured paths", which is a statement about the DIFF and leaves the gate's
subject genuinely absent. Here the trigger is "this branch is not a phase",
which is a statement about the BRANCH: the diff it would have audited exists and
is unexamined. Reading the two as the same word in a table is exactly the
substitution this exit test keeps finding, so it is named here.

### What the runner measured before complying

The orchestrator asked whether `tiphys spawn` derives the branch name from the
task id, because a name hand-corrected outside the kernel is a weaker artifact
than one the kernel produced. Measured: `taskBranchName` at src/pool.ts:52
returns `task/<id>`, and the first spawn's `meta.json` recorded branch
`task/m3-p13`, which does NOT match the phase pattern. **The kernel never
produced the offending name; the runner applied it from the plan's `branch`
field.** The fix was nevertheless made AT THE TASK ID rather than by a git
rename: a second `tiphys spawn --task exit-subject-doctor-kernel-artifacts`
exited 0 and the kernel created `task/exit-subject-doctor-kernel-artifacts`, and
the eleven commits were carried over with `git merge --ff-only`, so no commit
was rewritten.

### A-n: deleting the old remote branch needs access this agent does not hold

The ruling's step 3 is to delete `claude/m3-p13-doctor-kernel-artifacts` from
the remote. **The runner cannot do it, measured three ways:**

| attempt | result |
|---|---|
| `git push origin --delete claude/m3-p13-doctor-kernel-artifacts` | `RPC failed; HTTP 403`, remote hung up |
| `git push <url> ":refs/heads/claude/m3-p13-doctor-kernel-artifacts"` | `RPC failed; HTTP 403` |
| `DELETE /repos/.../git/refs/heads/claude%2Fm3-p13-doctor-kernel-artifacts` | HTTP 403, `Write access to this GitHub API path is not permitted through this proxy` |

A readback confirms the branch still exists at 4a719d6994877900a4d05ecfc41825f6cd838354.
**Until it is deleted the ruling is not fully in force**, because the third
harvesting source is remote branch names: `orchestrator-next.mjs` will read
`origin/claude/m3-p13-...` and report M3 as having a thirteenth phase. This is
an owner or orchestrator action item rather than a note, and it is recorded here
so it is not lost in a handback.

## I-4: E1.6 is BLOCKED, and the orchestrator fixed the harness rather than re-designating the subject

- **Kind: a RULING plus a DISPATCH.** No kernel artifact was substituted for, no
  gate was run that the registry did not select, and no result was rewritten.
  The E1.6 measurement stands exactly as `delivery/evidence/m3-exit-test/e1-6.md`
  recorded it before this entry existed.
- **Decided by: the orchestrator**, after independently re-deriving the runner's
  mechanism rather than accepting it.

### The state this records

**Stage E1.6 is UNSATISFIED.** The full-mode bundle at the subject head reports
9 green, 1 red, 6 not-applicable, 0 error, 0 vacuous, and the red is
`red-witness`, which E1.6 names as the one gate that must be green on a head
touching `src/commands/doctor.ts`. Nothing below softens that. What changes is
its DISPOSITION: it is blocked pending a fix, not failed and abandoned, and
E1.6 will be re-run at a head that carries the fix.

### The mechanism, in the orchestrator's tighter form

The runner reported the mechanism as "a witness spec's `mutation.find` is a
verbatim quotation of a source line". The orchestrator re-derived it and made it
sharper, and the sharper form is the one to keep:

**Ownership is FILE-granular and the obligation is MEMBER-granular.**
src/gates/red-witness.ts:277 computes the phase's own witnesses by filtering
specs on whether the spec FILE appears in the diff, and src/witness/run.ts:1251
then applies rule (d) to EVERY member of that file. So an edit to any one member
drags its untouched siblings into the intersection requirement, whatever the
edit was for.

The surface was bounded rather than sampled: `grep -rn "phaseOwn" src/ test/`
returns exactly four lines, two producers (src/gates/red-witness.ts:330 and
src/gates/red-witness.ts:344) and one consumer (src/witness/run.ts:1251) beside
its declaration at src/witness/run.ts:96. The runner re-ran that grep and
reproduces the same four lines.

The collision is concrete rather than theoretical: src/commands/doctor.ts:53 is
a SINGLE-LINE array, so the designated subject cannot add its condition without
editing the exact line two M3-P8 specs quote. The runner verified that line at
this head and it is
`  full: ["gh-missing", "remote-missing", "retention-undeclared"],`.

### The action taken

A fix is dispatched on the branch `claude/witness-ownership-scoping`, under the
full review contract, and it changes shipped `src/`. This runner has not touched
that branch and did not re-run E1.6.

### Why re-designating the subject was REFUSED, which is the part worth keeping

The cheaper move was available and was rejected: E0.4 carries a fallback rule
that lets the orchestrator designate a different subject, and a subject that
does not touch `src/` would have made `red-witness` not-applicable and the
bundle green.

**E0.4's fallback is scoped to BEFORE stage E1 begins**
(delivery/plan/kernel-plan-m3.md:5107), and stage E1 had begun: its first
evidence record, `e1/records/E1.1-charter-valid.json`, carries
`startedAt` 2026-08-15T08:44:02.256Z, and this ruling is hours later on the same
day. Choosing a different subject after seeing which one turned out hard
is exactly what the ordering constraint at delivery/plan/kernel-plan-m3.md:5177
exists to prevent, one level up: that constraint stops the CONTROLS being chosen
after seeing which stages were weak, and this would have been the SUBJECT being
chosen after seeing which subject was weak. An exit test that swaps its subject
when the subject finds something has stopped being a measurement.

So the finding is being paid for rather than routed around, and the cost is one
harness fix plus a re-run of E1.6.

## F-3: this container's proxy permits ref creation and update, and refuses ref DELETION

**An id note first, because the dispatch that asked for this referred to an
existing `F-3` and there was none.** The bundle carried F-1 and F-2 only,
verified by grep over `delivery/evidence/m3-exit-test/` before writing this. F-3
is therefore ALLOCATED here rather than added to, and nothing else in the bundle
or the repository has ever used it.

**The measurement**, three methods by the runner and a fourth by the
orchestrator from a different clone, all today, all against a branch this
container had pushed minutes earlier:

| method | result |
|---|---|
| `git push origin --delete claude/m3-p13-doctor-kernel-artifacts` | `RPC failed; HTTP 403`, remote hung up |
| `git push <url> ":refs/heads/claude/m3-p13-doctor-kernel-artifacts"` | `RPC failed; HTTP 403` |
| `DELETE /repos/.../git/refs/heads/claude%2Fm3-p13-doctor-kernel-artifacts` | HTTP 403, `Write access to this GitHub API path is not permitted through this proxy` |
| the same `git push origin --delete`, from the orchestrator's own clone | the same 403 |

Creation and update are permitted from the same credentials in the same
container: `claude/exit-subject-doctor-kernel-artifacts` was created and then
updated four times during this dispatch, each push exit 0, and the remote
readback matches the local head. So the refusal is a property of the OPERATION,
not of the credential, the repository or the branch.

**It is a REDISCOVERY, and that is why it is a finding rather than a note.** The
identical refusal was measured on 2026-08-07 while closing owner action A-4, and
is recorded in the A-4 row of `delivery/STATE.md` in almost the same words.
It sat in the owner-action register and not in the standing environment
warnings, which are what an agent reads before acting, so the next agent to
attempt a deletion met it fresh and spent three attempts establishing it. The
general shape is one this project keeps paying for: a measured environment fact
filed where it will not be read again.

**Not fixed here.** Adding it to the standing environment warnings edits
`CLAUDE.md`, which is agent-rules configuration rather than exit-test evidence,
and doing it from inside the exit test would be a second intervention on an
artifact this run is supposed to be observing. Recorded as owed, with the owner
action it blocks allocated as A-8 in `delivery/STATE.md`.

### I-4's RESOLUTION, recorded here rather than in a new entry

**The blocker is fixed, merged, and re-measured by the runner rather than taken
on report.** `main` is at 7b18144, the subject work was rebased onto it, and
stage E1.6 was re-run in full.

#### What unblocked it

The harness changed, not the exit test's subject. Ownership in the red-witness
gate is now scoped per MEMBER instead of per FILE, so an edit to one member of a
multi-member spec no longer drags its untouched siblings into rule (d)'s
intersection requirement. The change is in src/gates/red-witness.ts,
src/witness/run.ts and src/witness/spec.ts.

#### The two arms, re-measured at base 7b18144 with the same branch content

| arm | before the fix | after the fix |
|---|---|---|
| A, both M3-P8 specs repaired (what the subject branch carries) | `rule (d)` red on their untouched members | **green**: "every witness red against every declared dangerous state and green at head", exit 0 |
| B, both left exactly as `main` has them | `error: mutation find text ... does not occur` | **unchanged: the same error**, exit 21 |

**One correction to what the dispatch expected.** It said both escapes should be
gone. Arm B's is not, and it should not be: a spec whose `find` text no longer
occurs cannot be applied: the harness reported exactly that, `mutation find text
... does not occur`, so there is nothing to run and an error is the verdict the
measurement supports. Measured rather than inferred: arm B's output is
byte-identical before and after the fix. What the fix removes is the
TRAP BETWEEN the two arms, which is the thing that blocked E1.6: repairing the
quotation used to be punished by rule (d), so both routes were closed at once.
Now the repair route is open and the stale route still errors, which leaves
exactly one correct action for a phase that edits a quoted source line.

#### The fix landed as its own delivery, with its own review evidence on `main`

Not as a hotfix riding on this exit test, and not inside the subject branch.
Merged as pull request #147 at 7b18144, and every document below is on `main`
and readable at the head this bundle branch now carries:

| document | what it is |
|---|---|
| delivery/review/clean-room-witness-ownership-criteria.md:1 | clean-room review, CRITERIA contract, `produced-by` Claude Sonnet 5, verdict FIX-ROUND-NEEDED, 392 lines |
| delivery/review/clean-room-witness-ownership-hazard.md:1 | clean-room review, HAZARD contract, `produced-by` Claude Opus 5, 613 lines |
| delivery/review/verification-witness-ownership-fix-round-1.md:1 | delta verification of the fix round, 329 lines |
| delivery/review/arbitration-witness-ownership.md:1 | the arbitration that ruled on the pair, 126 lines |

Two contracts, two model families, one fix round with its own verification, and
an arbitration: the same shape DR-0012 requires of any merge, applied to the
harness change that the exit test's own finding produced. That matters for what
this bundle can claim: the exit test found a defect in a shipped gate, and the
defect was repaired through the ordinary process rather than around it.

#### The E1.6 result after the fix

Recorded in full at `delivery/evidence/m3-exit-test/e1-6.md`, revised in the
same commit as this entry. In one line: **`red-witness` is GREEN with 7
witnesses evaluated, zero red, zero error, zero vacuous, and recomputed counts
equal `summary.json`** at the rebased head. The runner still exits 20, for two
REQUIRED-and-not-applicable gates, `citations` and `scope`, each carrying its
precondition id and evaluation. That is a different and much weaker condition
than the one that blocked the stage, it is structural for a non-phase branch
that touches no citation-gated document, and it is the orchestrator's to rule on
rather than the runner's to work around.
