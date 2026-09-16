# DR-0041: the M4 exit test stays bound to the pilot, and the kernel is not its subject

- id: DR-0041
- project: tiphys-kernel
- task: consequence of DR-0037, raised while establishing M4's plan
- question: DR-0037 puts `pulse` out of this orchestrator's reach. The M4 exit
  test requires "the pilot project's next phase" to be merged and
  deploy-verified entirely on v1. Does the kernel become the exit test's
  subject instead?
- reversibility: fully reversible. Nothing is built either way before the
  cutover workstream, which is last.
- vetoable: yes
- revert-cost: none before cutover entry.
- status: **DECIDED BY THE ORCHESTRATOR (2026-09-15) under DR-0016**, and
  reported to the owner rather than asked.
- **SUPERSEDED IN PART, the same day, by
  delivery/decisions/DR-0042-reading-the-pilot-is-allowed-and-the-pilot-can-be-rebooted.md:1.**
  The refusal of a kernel-only exit test STANDS and is reinforced. The TRIGGER
  below is replaced in both clauses: reading the pilot is permitted, and its
  reachability is an owner action rather than a state of the world. A review
  noted that this record carried no forward pointer, so a reader arriving here
  first would have followed a trigger that no longer applies.
- decided: NO. The exit test is not amended and is not attempted kernel-only.
  The first conjunct stays bound to the pilot and is currently undischargeable
  by this orchestrator. The question falls due at cutover entry, on a written
  trigger.
- date: 2026-09-15

## Why this is not the owner's question today

DR-0016 escalates only when two or more options are genuinely comparable AND
the consequence is high impact and costly to reverse. Here the analysis yields
a recommendation this orchestrator would defend, and more decisively, **the
decision is not due**. Every workstream before cutover runs identically
whichever way it goes, and cutover is last by construction. Asking now would
spend the owner's focus on a question the schedule may answer for free, and
would lock in the weaker assurance before anyone has measured whether the
stronger one is reachable.

## The binding, traced

The exit test at delivery/plan/kernel-plan-v1.md:368 reads: "the pilot
project's next phase runs through v1, merged and deploy-verified entirely on
v1; the old process is retired". The blueprint's own M4 row says the same
(delivery/intake/orchestrated-delivery-v1.md:215).

**DR-0034 does NOT bind the exit test.** Read in full, it names the PILOT
PROJECT and never mentions the exit test; its only exit-test content is about
M3's falsification controls. The binding runs through the plan's phrase "the
pilot project" plus DR-0034 fixing that referent. So amending the exit test
would be a PLAN revision, not a reopening of a decided record. That is stated
here so a later reader does not think the option is closed when it is merely
unattractive.

**The plan distinguishes "the pilot project" from "pilot-class" in the same
sentence**: "From M4 exit onward the kernel is its own pilot-class project on
v1". The kernel is pilot-CLASS. It is not THE pilot.

## The conjunct that is NOT blocked

The exit test has two conjuncts with DIFFERENT subjects. "The old process is
retired" refers to THIS repository's live process, per the blueprint's
construction method: "the current live process builds its successor ... The
old process's final delivery is the new system; then cutover"
(delivery/intake/orchestrated-delivery-v1.md:206).

**That conjunct is untouched by DR-0037.** Treating the exit test as one
blocked thing was wrong; half of it is not blocked at all.

## Why kernel-only is refused, and it is a mechanism rather than a preference

**The exit test's job is to prove the kernel can deliver a project that is not
itself.** DR-0036 names self-hosting as the cannot-go-red shape by
construction
(delivery/decisions/DR-0036-the-harness-adapter-leads-m4-and-the-kernel-is-the-second-subject.md:85).
A kernel-only exit test applies that shape to the handover: the milestone that
retires the supervisor would be verified by the thing the supervisor watches.
This repository's most frequently paid-for failure is a guard that cannot go
red, and this would be that guard at the one moment it matters most.

**It also collides with cutover rather than dodging it.** DR-0036's condition
keeps planning, review, credentials, pull request, merge, recovery and closeout
authority with the current process for every kernel phase "until the cutover
workstream says otherwise". While that stands, no kernel phase can be described
as running "entirely on v1". Lifting it IS the cutover freeze point.

## Measured while deciding: the npm publish COULD satisfy the gate, and that is the trap

A scratch clone of the kernel was given a hand-written declaration pointing the
shipped `http-json` adapter at the public npm registry. Both arms ran:

| arm | result |
|---|---|
| `satisfiedValue "0.1.0"` | `deploy: green (1 release verifications satisfied)`, exit 0 |
| `satisfiedValue "9.9.9"`, 1500ms deadline | `deploy: red (0 release verifications satisfied)`, exit 1 |

So an npm publish CAN drive the deploy gate today with no code change. **And it
would be green for every commit forever.** The green above was reported for
subject `b8eaf56`, a commit made minutes earlier, while the published 0.1.0 was
built from a different commit a month before. Nothing compares them: the
adapter's observe step tests a static configured value
(src/gates/adapters/http-json.ts:320), and its only subject-binding path
requires an ARRAY at the list pointer (src/gates/adapters/http-json.ts:245)
while the npm packument's `versions` is an object keyed by version.

**That is a real defect in the shipped release contract, found by asking this
question, and it is owed work regardless of which subject the exit test gets.**

Two supporting absences, each with its probe. `release-verification.json` is
the declaration the deploy gate reads (src/gates/release.ts:67) and it is NOT
tracked: `git ls-files | grep -c release-verification.json` returns 0, so the
deploy gate has never been applicable on the kernel. The gate's own source records a post-merge
call site as deferred to M4 by M2-D-11 (src/gates/deploy.ts:13,
delivery/plan/kernel-plan-m2.md:601). **CORRECTED 2026-09-15 by measurement:
saying the gate "has no post-merge call site anywhere" was wrong.** `deploy` is
already in the main bundle and already runs on every push to `main`; it reports
not-applicable only because the declaration file is absent. The binding and the
call site are one phase. See delivery/verification/m4-prototype-probes.md:1.

## What is decided

1. **Do not amend the exit test and do not attempt it kernel-only.** M4's plan
   records that the first conjunct is bound to the pilot and is currently
   undischargeable by this orchestrator, and that the second conjunct is not.
2. **Run all five non-cutover workstreams with the kernel as the subject**, per
   DR-0036. None of them needs the pilot.
3. **Build the kernel's release verification as owed work, not as an exit-test
   substitute.** Commit `release-verification.json`, close the subject-binding
   gap, wire the post-merge call site. M2-D-11's deferral is unconditional M4
   work for any subject, and doing it on the kernel gives the deploy gate its
   first real green anywhere in this project's history.
4. **The subject question falls due at cutover entry, on a WRITTEN trigger**,
   not on anyone remembering: if cross-environment exclusion is delivered and
   the pilot is reachable, run the exit test as written. If it is not, the
   owner receives the amendment option with measured evidence behind it instead
   of a forecast.

## The assurance this costs, stated rather than left to be inferred

DR-0036 justified two subjects on the ground that they test DISJOINT halves:
the pilot tests charter-to-first-release from an empty directory, the kernel
tests adoption of a repository that already has opinions
(delivery/decisions/DR-0036-the-harness-adapter-leads-m4-and-the-kernel-is-the-second-subject.md:64).
It says in the same breath that the kernel "is not a substitute" for the pilot.

**One of the two halves now has no subject, and M4 tests adoption only.**

The precise effect on the self-hosting hazard, which is easy to overstate in
both directions:

- **What SURVIVES.** The control M4's intake actually names, in its hazard
  register under mechanism H-A, is reproducing a failure against the subprocess
  adapter with no plugin. `subprocessAdapter` ships (src/spawn.ts:155) and is
  the default (src/spawn.ts:463), so plugin-defect versus kernel-defect stays
  discriminable. That control is unaffected.
  (`delivery/plan/m4-intake.md` is QUOTED here without a line, deliberately: an
  earlier version cited a line into a document being edited in the same change,
  the line moved twice, and both times it resolved SILENTLY to the wrong text.
  That is the H-H failure the intake itself describes, so the fix is to stop
  citing a moving target rather than to re-point it again.)
- **What is LOST.** The control on the OTHER axis, subject versus instrument,
  for which the pilot was the answer. Every M4 observation is now self-hosted,
  and the only remaining mitigation on that axis is DR-0036's retained-authority
  condition, which is a HUMAN control and not a mechanical one.

This is a reduction in assurance of the same kind DR-0034 recorded when it cut
its three falsification controls. It is written down for the same reason: a
reader should not have to infer that two mechanical mitigations still stand
when one of them is now a person paying attention.

**The sentence M4's plan should carry**: DR-0037 barely shrinks M4's decision
load. What it shrinks is M4's ability to VERIFY what it decides.

## What this does NOT decide

- **Whether reading the public pilot repositories is inside "stay away".**
  Treated as forbidden here, and nothing was probed. One owner sentence settles
  it, and it is the only thing that decides whether a read-only
  verify-the-pushed-evidence option exists at cutover.
- **The charter's release-verification field.** Its enum admits only `none` and
  `reserved` (schemas/charter.schema.json:117) and the kernel's own charter
  says `reserved` (delivery/evidence/m3-exit-test/e1/charter.yaml:56). Its
  designed shape was to be settled by "the first real project charter at M4's
  pilot". That premise is now suspended, and M4's plan must either design the
  field or record that it stays reserved through M4.
