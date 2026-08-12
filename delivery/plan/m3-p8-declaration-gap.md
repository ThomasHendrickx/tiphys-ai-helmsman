# M3-P8 criterion 4c names a path its declaration forbids, and it is amended here

- date: 2026-08-12
- author: orchestrator
- found by: the pre-dispatch criterion read that
  delivery/plan/m3-dependency-screen.md:60 makes a rule, applied to M3-P8
- status: **FOUND AND FIXED IN THE SAME COMMIT.** The declaration is amended in
  this change, which is why this is a record rather than an open item.

## The gap, measured

M3-P8's criterion 4c (delivery/plan/kernel-plan-m3.md:4283) requires a verbatim
capture of `MECHANISMS.md` to be **checked in as
`test/fixtures/mechanisms-interim.md`**, and says why the capture rather than the
live file: this phase DELETES `MECHANISMS.md`, and a test whose input the phase
deletes stops meaning anything the moment it is needed. Criterion 4b
(delivery/plan/kernel-plan-m3.md:4272) separately needs a fixture manifest, to
rename a key in without touching the real `gates.manifest.json`.

`test/fixtures/` was absent from delivery/plan/phase-declarations/m3-p8.json:1.
Measured across the milestone before amending, so the fix is not a guess about
house style:

```
$ for n in 1..10; do git show origin/main:delivery/plan/phase-declarations/m3-p$n.json | grep -c 'test/fixtures'; done
m3-p1: 1   m3-p2: 1   m3-p3: 1   m3-p4: 1   m3-p5: 0
m3-p6: 0   m3-p7: 1   m3-p8: 0   m3-p9: 0   m3-p10: 0
```

Four phases already carry it and M3-P7 writes it exactly as `"test/fixtures/"`,
which is the form used here.

**The four zeroes other than M3-P8 are not gaps.** Searched, rather than
assumed: the M3-P5, M3-P6, M3-P9 and M3-P10 sections of
delivery/plan/kernel-plan-m3.md contain no occurrence of the word "fixture" at
all, so none of their criteria asks for one. M3-P8 is the single case where a
criterion names a fixture path and the declaration does not carry it.

## Why this is the M3-P5 criterion-6 shape, one phase earlier

delivery/plan/m3-p5-criterion-6-gap.md:1 records a criterion assigned to a phase
whose declaration forbade the only edit that could satisfy it. That was found
when the implementer hit it and correctly refused to proceed, which cost a held
pull request and a declaration amendment landed under time pressure.

This is the same shape and it was found BEFORE dispatch, which is the whole
return on the pre-dispatch read. The cost of fixing it now is one line; the cost
of finding it at M3-P8's first push is a red scope gate, an amendment that must
reach `main` before the phase can push again (because the auditor reads the
declaration from the MERGE BASE, delivery/plan/m3-p5-criterion-6-gap.md:74), and
an implementer sitting idle in between.

## The decision, and why it is not an escalation

**Add `test/fixtures/` to M3-P8's `filesToTouch`.** Done in this commit.

The alternative considered: put the two fixtures under `witness/`, which M3-P8
already owns. Rejected because criterion 4c NAMES `test/fixtures/mechanisms-interim.md`
by path, so satisfying the criterion at a different path would require amending
the criterion instead of the declaration, and amending a criterion is a larger
change to a document that has been through two adversarial review rounds. Moving
one directory onto a declaration is the smaller and more honest edit, and it
matches what four sibling phases already do.

Under delivery/decisions/DR-0016-escalation-threshold.md:1 the options are not
comparable and I would defend the recommendation, so there is nothing to put to
the owner.

## A SECOND finding, larger than the first, and it is NOT fixed here

While settling the claim-grep hit on the sentence about criterion 4d, the
sentence turned out to be checkable now rather than "not until those phases are
written", which is what I had first written. Measured:

```
$ git ls-files | grep -v '^delivery/' | xargs -d '\n' grep -c 'MECHANISMS\.md' | grep -v ':0$'
src/gates/run.ts:6                              src/gates/scope.ts:1
test/gates.test.ts:3                            src/gates/schemas/gate-manifest.schema.json:1
src/witness/run.ts:2                            src/gates/result.ts:1
src/gates/suite.ts:2                            src/gates/pin.ts:1
witness/witness-tap-reporter-pin.json:1         src/gates/credentials.ts:1
witness/captures/git-name-status-real.txt:1     src/commands/gates.ts:1
test/m2-exit-test.test.ts:1                     src/validate.ts:1
test/exit-test-local.test.ts:1
test/credentials-gate.test.ts:1
```

**Sixteen tracked files outside `delivery/` already carry the string that
criterion 4d requires to be absent from shipped artifacts after this phase
deletes `MECHANISMS.md`.** None of the sixteen is on M3-P8's declaration.

The criterion (delivery/plan/kernel-plan-m3.md:4297) names the constrained class
as "briefs, `AGENTS.md`, checklists, schemas", and the reading of that last word
decides whether this is a problem:

| reading of "schemas" | status today | consequence for M3-P8 |
|---|---|---|
| the top-level `schemas/` directory | **CLEAN**, zero occurrences, measured | criterion 4d is satisfiable as declared; the sixteen files are out of scope |
| any `*.schema.json` | **VIOLATED**, by src/gates/schemas/gate-manifest.schema.json:60, whose `description` says the parameter-inference approach "is the mechanism MECHANISMS.md forbids" | M3-P8 must edit a file it does not own, which is the criterion-6 shape again and needs a declaration amendment |

**I am not deciding this one, and the reason is a rule rather than caution.** The
two readings assign different MEANINGS to an owner-approved acceptance criterion,
and an agent does not edit what a criterion means. What I can do is make the
choice cheap and evidenced, which is what the table above is for.

**What the M3-P8 dispatch must therefore carry**: resolve this reading first,
with the measurement rather than by preference, and if the second reading wins,
amend the declaration BEFORE the first push. Note also that the other fourteen
files are `src/`, `test/` and `witness/` content, which no reading of "briefs,
`AGENTS.md`, checklists, schemas" reaches, so the question is genuinely about the
one schema file and not about all sixteen.

**Why this was nearly missed.** My first draft said this "cannot be measured until
they are written", meaning the briefs and `AGENTS.md`. That was false: the
criterion constrains schemas too, and schemas exist today. The claim grep
required a command next to the sentence, running the command produced the
sixteen, and the sentence was wrong. This is the second false claim of mine the
claim grep has caught in this batch.

## What this record does NOT establish

- **It does not clear M3-P8.** That phase is blocked behind M3-P6, per
  delivery/plan/kernel-plan-m3.md:4360, and nothing here changes that.
- **It is not a full criterion read of M3-P8.** The read direction was walked far
  enough to find these two; the remaining candidates the screen flagged for this
  phase are unclassified.
- **The BRIEF and `AGENTS.md` half of criterion 4d is genuinely unmeasurable
  today**, as distinct from the schema half above, which was measurable and was
  measured. `roles/implementer.md`, `roles/clean-room-reviewer.md`, `AGENTS.md`
  and `checklists/clean-room.yaml` are all ABSENT from `main` (checked with
  `git cat-file -e`, four for four), so whether M3-P6, M3-P7 and M3-P9 ship a
  reference to a file M3-P8 removes is decided by those phases and not
  observable yet. The dispatch briefs for M3-P6 and M3-P9 should say: do not
  name `MECHANISMS.md` in a shipped artifact, because a later phase deletes it.
- **It says nothing about M3-P9 or M3-P10**, which the screen also left
  unclassified (delivery/plan/m3-dependency-screen.md:48).
