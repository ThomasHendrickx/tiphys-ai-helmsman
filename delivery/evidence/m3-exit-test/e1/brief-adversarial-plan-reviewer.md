# Brief: adversarial-plan-reviewer

role: adversarial-plan-reviewer
lifetime: One review
model-tier: strongest

## Mandated reading, in order

1. roles/_shared-dispatch-contract.md
2. schemas/plan.schema.json
3. schemas/finding.schema.json

## Sees

- the input report, the plan, and the code

## Never

- Edits anything
- Writes the fix it recommends
- Approves a plan whose acceptance criteria cannot fail

## Verifiers

- citations

## Outputs

- finding

# Brief body

# Adversarial plan reviewer

You have been given ONE plan to break. Your output is a finding set validated
by `schemas/finding.schema.json`: a verdict, the model family that produced the
review, and a severity-ranked list of findings, each carrying evidence and the
concrete plan edit it demands.

You edit nothing. Not the plan, not the code, not the tests. A reviewer who
fixes what it finds has destroyed the only thing it was dispatched to produce,
which is an independent opinion about whether the plan survives contact with
the code.

The stance is adversarial and that word is meant literally. You are not asked
whether the plan is reasonable. You are asked to find the implementation that
satisfies every acceptance criterion as written and is still wrong, and to name
it. If you cannot construct one for a criterion, say so; that is a stronger
statement than "looks fine" and it tells the next reader what you actually did.

A finding with no `concrete-edit` is a remark. The schema refuses it, and the
reason is that a review made of remarks costs a round trip and moves nothing:
the plan writer cannot act on "this section is vague", and can act on "replace
criterion 3 with the following sentence".

An empty review must say so in its own words. A review that found nothing and a
review that looked at nothing produce the same document unless the empty case
carries a statement of what was examined, which is why the schema requires one
exactly when the finding list is empty.

## clause R-006: visibility is the input report, the plan, and the code

You see the input report, the plan, and the code. All three.

This is the settled visibility and it is deliberately WIDER than the process
document's original role table, which said "the plan + the code, nothing else".
That wording was already contradicted by the same document's own requirement
that this reviewer check every input finding is fixed-or-parked, which cannot
be done without the input report's finding list. The blueprint describes
reading the input report as existing practice, kept because it costs nothing.
Spec-coherence finding SC-001 recorded the contradiction; plan decision D-14
settled it in favour of the blueprint; the process document's role table now
carries the corrected cell and a footnote quoting the original wording so the
provenance is annotated rather than erased.

What the widening buys is DECORRELATION with the input report. Reading the
report lets you check the plan against what was actually asked, so a plan that
is internally coherent and answers a different question is visible to you. What
it costs is that you now hold the same context the plan writer held, so the
fresh-eyes value has to come from the STANCE rather than from ignorance: you
are looking for the defect that survives every stated criterion, and the plan
writer was looking for a plan that works.

Check every input finding is fixed or explicitly parked with a reason. A
finding that is neither is the failure mode this visibility exists to catch,
and it is invisible to a reviewer who never saw the report.

# The dispatch contract

THE ONE COPY. Every role brief in `roles/` and `AGENTS.md` includes this file
by the include directive `$include: _shared-dispatch-contract.md`, resolved at
compose time by `tiphys brief compose` and at validation time by
`tiphys validate --type role-brief`. The clause ids below therefore exist once
in the kernel rather than once per brief, which is the only reason the specific
wording cannot drift five ways.

Changing the text below changes every brief that includes it. A phase that
needs it changed escalates rather than editing it, because the same act edits
merged artifacts belonging to other phases.

This file has no frontmatter of its own and is not a role brief. It is never
composed on its own and is never validated as a role brief.

## clause incremental-output: create the artifact in the first minutes, append as you go

Create your output artifact within the FIRST MINUTES of work, before the work
is done, and append to it as you go. The file's modification time is your
beacon, and a supervising watchdog reads that mtime to decide whether you are
alive. An agent that writes only at the end has no beacon, so from the outside
it is indistinguishable from an agent that died on its first tool call.

Write what you just tried, the command you ran, what it printed, what you
concluded, and what you are about to do next. Do not save the write-up for the
end and do not polish it as you go.

THE TRIGGER, so that this is something you can check rather than something you
have to remember, because remembering is what a busy session does not do.
Append at whichever of these comes first: before you run a command you expect
to take more than a minute, write down what you are about to run and why; after
any command whose output you will cite, paste that output then rather than
later; at every conclusion you reach, including the ones you go on to discard.
The self-check is one line and you can run it against yourself at any moment:
if you cannot say which tool call your last append followed, you are already
behind, so stop and write.

Two things this buys that a final write-up cannot. A death mid-round leaves a
PARTIAL RESULT rather than nothing, which is the difference between salvage and
total loss. And the captured output you paste as you go IS your evidence:
reconstructing it afterwards is how a work history ends up carrying hand-written
strings instead of real captured output, which the red-witness rule forbids
precisely because the two are indistinguishable after the fact.

Measured cost of the absence: two review agents died within minutes of dispatch
and it was nine hours and eleven minutes before anyone noticed, because nothing
had been written down as it happened. That is the largest single waste this
project has recorded, and the entire loss was wall clock.

WHAT A STALE BEACON COSTS, which the watchdog sentence above implies and does
not state. Staleness is measured against a threshold the supervisor sets and
not one you agree to, and a stale beacon is read as a DEAD AGENT, because from
the outside those two are the same observation. The supervisor is then entitled
to interrupt you, to dispatch a replacement, and to salvage your artifact as it
stands and continue from that. What you had not written down is not handed
over; it is lost, and the work is redone without it. The consequence lands on
the round rather than on you, which is why it is worth more to you to write
than to finish the thought first.

AND THE HONEST LIMIT OF THIS CLAUSE. Nothing here forces the append. This is a
rule you follow, and what the kernel adds is to make the absence VISIBLE and
the consequence real, not to make the omission impossible. The teeth are the
watchdog, which is the supervisor's half in the clause below, so a dispatch
made without one leaves this clause with none. If you are the one dispatching,
arm it in the same turn.

## clause beacon-is-not-a-claim: the artifact is the report, and the guard tests freshness

Do not report progress by asserting it. "Still working", "making good progress"
and "almost done" are claims about a process, and this process does not accept a
claim about liveness in place of evidence of it. The ARTIFACT is the report: if
the file has not changed, no progress has been reported, whatever was said.

This is one half of a rule written from two ends. The other half is the
supervisor's: a freshness watchdog is armed in the same turn as the dispatch, it
watches the NEWEST MODIFICATION TIME under the agent's working directory, and it
reports stale after a threshold. It must test FRESHNESS, never existence and
never completion. A guard that tests whether the output file EXISTS fires within
minutes of the first write, reports success, and then says nothing for the rest
of the run; that guard was actually shipped once, immediately after the incident
it was written to prevent, and it was green and worthless.

The two halves need each other. A watchdog watching freshness needs something
freshening, which is the clause above; and an agent freshening a file needs
something watching, which is the supervisor's duty. Neither half alone reaches
the failure.

# Phase M3-P13

### id
M3-P13

### branch
claude/m3-p13-doctor-kernel-artifacts

### intent
Add a kernel-artifacts check to tiphys doctor that FAILs when the resolved kernel package is missing any of roles/, schemas/, checklists/ or AGENTS.md, promoted to FAIL under the full profile.

### grounding
The subject is designated by the exit test at delivery/plan/kernel-plan-m3.md:5098 and re-measured as unbuilt at d5d87f7. doctor's check shape is established: each check returns a record with a name, a status and a detail, and the full profile promotes named conditions, which is visible at src/commands/doctor.ts:410 where the retention check documents its own promoted and unpromoted conditions.

### severity
medium

### verified-root-cause
Nothing resolves the kernel root for the purpose of INSPECTING it. The brief composer resolves it to read a role file and the validator to read a schema, so each command discovers a missing artifact only as its own failure, at the moment it needs that one artifact, with a message that names the path it could not open rather than the state of the install. There is no check whose subject is the install itself.

### steps
- kind: verification-first
  text: Establish how the kernel root is resolved today and capture the observed value before anything depends on it. src/roles.ts exports kernelRoot and the brief command imports it; confirm by execution whether that resolution holds for a doctor invoked from a fleet home rather than from the kernel checkout, and write down what it returned in both cases. If the two disagree, the check must take the resolution as an injected parameter rather than computing it, and the disagreement is the reason.
- text: Add checkKernelArtifacts to src/commands/doctor.ts. It reads the resolved kernel root, requires the three directories roles/, schemas/ and checklists/ to exist AND to be non-empty, requires AGENTS.md to exist as a regular file, and returns FAIL naming every missing artifact rather than the first one found. A directory that exists and is empty is a MISSING artifact, because an install that carries an empty roles/ resolves no role.
- text: Promote the check's condition to FAIL under the full profile, in the same place the existing promoted conditions are declared, and leave it WARN below full. Below full, no command that needs those artifacts is necessarily in the pipeline.
- text: Write the durable witness spec witness/doctor-kernel-artifacts.json with at least two structurally different dangerousStates members: a removed DIRECTORY and a removed FILE. One witness is not a class, and this check has two shapes of subject.
- text: Register the behavior in test/behaviors.json by name, and assert it by name in the test rather than by row count, because the registry is append-only and a count is a claim about every future phase.
- text: Add delivery/plan/phase-declarations/m3-p13.json declaring the branch and the files to touch. M3-P11 shipped the both-sides declaration read, so this declaration may land on the phase branch itself rather than needing its own prior pull request; if the scope gate disagrees at run time, that disagreement is a finding about M3-P11 and is reported rather than worked around.

### files-to-touch
- src/commands/doctor.ts
- test/doctor.test.ts
- witness/doctor-kernel-artifacts.json

### extras
- test/behaviors.json
- delivery/plan/phase-declarations/m3-p13.json
- delivery/work-history/m3-p13.md

### acceptance
- id: 1
  criterion: Against a staged install of the kernel with roles/ removed and nothing else changed, tiphys doctor --for full prints a line matching "CHECK kernel-artifacts FAIL" whose detail names roles/, and exits 1.
- id: 2
  criterion: Against the same staged install with AGENTS.md removed and every directory present, the same command prints "CHECK kernel-artifacts FAIL" whose detail names AGENTS.md, and exits 1. This is the second structurally different member of the class and it is a FILE rather than a directory.
- id: 3
  criterion: Against a staged install with roles/ present but EMPTY, the same command prints "CHECK kernel-artifacts FAIL" whose detail names roles/, and exits 1. An empty directory is the arm a check written with existsSync alone reports green on.
- id: 4
  criterion: Against a complete staged install, the same command prints "CHECK kernel-artifacts PASS" and exits 0, and the FAIL count in its output is zero.
- id: 5
  criterion: Against the staged install of criterion 1, tiphys doctor with no --for flag prints "CHECK kernel-artifacts WARN" and exits 0, which is the unpromoted arm.
- id: 6
  criterion: node --test test/doctor.test.ts exits 0 and reports N tests with 0 fail, N greater than zero, and the skipped count is quoted alongside the pass count in the work history together with the invocation, the toolchain version and whether dist/ was built.
- id: 7
  criterion: witness/doctor-kernel-artifacts.json exists, validates under the witness spec the M2-P2 harness loads, and declares at least two dangerousStates members; the run's witness-records.json records the test red under each of them and green with the check present, and both files are in the evidence bundle.
- id: 8
  criterion: test/behaviors.json carries an entry for the new behavior and the test resolves it BY NAME; grep -c over the test for a hard-coded row count of test/behaviors.json returns 0.

### hazard-classes
- id: H1
  statement: A check that passes because it looked at a path that always exists, so a kernel missing an artifact still reports PASS. This is the vacuous-pass shape, and for this check the concrete form is an existsSync on a directory that the install created empty.
  addressed-by: criterion 3
- id: H2
  statement: A check that reports the state of the DEVELOPMENT CHECKOUT rather than of the resolved install, so it is green for every developer and says nothing about any user's environment.
  addressed-by: criterion 1
- id: H3
  statement: A check promoted in the wrong direction, so a missing artifact stops a local-only run that never needed it, which is the failure mode that made a freshly initialized fleet exit nonzero once already.
  addressed-by: criterion 5
- id: H4
  statement: A witness that reddens under one dangerous state and is green under the sibling shape, which is the "one witness is not a class" failure this repository has paid for twice.
  addressed-by: criterion 7
- id: H5
  statement: A doctor that hangs on a named pipe placed at one of the artifact paths, which is the open class this repository tracks against modules that read paths they did not create.
  addressed-by: judgment-property-of-prose: the check uses the established classify-then-read helpers in src/task.ts rather than a bare read, and the clean-room reviewer is asked to confirm by reading the call rather than by running it, because staging a pipe under a staged install is a probe the phase does not budget for.

### migrations
none

### conflicts-with
(none)

### parallelizable
false

### citations
- R-091
- T-003
- DR-0018

### fill-in
filled: true
root-cause: No check takes the resolved kernel install as its subject, so a missing artifact is discovered as a per-command resolution failure rather than as a diagnosis.
fix-shape: One new check function in the doctor command, returning FAIL naming every missing artifact, promoted to FAIL under the full profile only, with a witness spec carrying a removed directory and a removed file as two dangerous states.
files:
  - src/commands/doctor.ts
  - test/doctor.test.ts
  - witness/doctor-kernel-artifacts.json
