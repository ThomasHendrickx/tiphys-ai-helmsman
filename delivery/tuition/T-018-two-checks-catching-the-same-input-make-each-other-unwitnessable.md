# T-018: two checks that catch the same input make each other unwitnessable

- date: 2026-08-12
- author: orchestrator
- discovered by: the M3-P6 fix round 2 implementer, by ATTEMPTING the fix its
  brief instructed, watching it stay red, and then reading the witness runner
- status: CORRECTED 2026-08-12, after the implementer handed back. The first
  version of this entry said the round "refused the fix it was instructed to
  make". **That overstated the implementer and is wrong**, and the implementer
  asked for the credit to be placed accurately rather than accept it. It tried
  the instructed fix FIRST. The correction is applied below and the original
  framing is described rather than deleted, because an entry that quietly
  rewrites its own account is worth less than one that shows the change.
  The remaining PROVISIONAL caveat: this is still the orchestrator's account,
  and delivery/work-history/m3-p6.md is the primary one.

## The mechanism, stated first

**Two checks that catch the same input make each other unwitnessable.** Neither
is individually necessary, so mutating either leaves the other covering the
arm, and a red-witness harness correctly reports that no named test reaches
the mutated line. Redundancy that cannot be observed is indistinguishable from
dead code.

Reordering does not dissolve it. It only changes which of the two is shadowed.

This is the red-witness rule (CLAUDE.md:284) turned one level up. That rule
says a test counts only if it has been demonstrated red without the behavior.
The corollary this incident supplies is about the CODE rather than the test: a
line can be un-reddenable not because no test exercises the feature, but
because a second line in front of it already rejects every input that would
have reached it.

## What actually happened

The M3-P6 brief for fix round 2 was written by the orchestrator and said, in
substance, "add a named test reaching `scripts/check-brief-drift.mjs` line
421". That instruction was WRONG, and the round establishing so is the
valuable part.

The gate said this, verbatim from the failing run (workflow `gates`, event
`pull_request`, head 64e1ba8, run 31604059724, step "M2 exit test (pull
request)"):

```
m2-assert (PR bundle): FAIL with 1 finding(s):
  - [red-witness] expected status green or not-applicable, observed red
    (19 witness(es) evaluated (5 own, 14 stored re-evaluated in 129151ms);
    witness implementer-brief-gate-list-drift: red: member 1 (mutation of
    scripts/check-brief-drift.mjs): no named test reaches this arm
    (scripts/check-brief-drift.mjs line(s) 421; stayed green: adding a gate to
    the registry without re-rendering makes check-brief-drift --check exit
    nonzero naming the gate, and --write returns it to 0))
```

Read literally that says "write a test". **The round tried exactly that first,
and it stayed red.** The failed attempt is in the work history at its entry
R2-18, kept rather than tidied away, and it is what made the rest possible.

**THE DECISIVE FACT, WHICH NO AMOUNT OF READING THE GATE MESSAGE WOULD GIVE
YOU, is in the witness runner** at src/witness/run.ts:886:

```
red: exitCode !== 0 && failed.length === tests.length,
```

A witness member counts as red only when EVERY named test fails. The witness
here names two tests. So adding a THIRD named test makes the member STRICTLY
HARDER to redden, never easier: the new test would have to fail as well, on top
of the one that was already stuck green. The orchestrator's instruction was
therefore not merely aimed at the wrong thing, it was **counterproductive**, and
following it to completion could never have produced a green gate.

That is why the round's report of "no named test reaches this arm" has to be
read as a statement about REACHABILITY and not about test COUNT. Read for the
mechanism it says The witness member is a mutation collapsing `describeDrift`'s
result to the empty list. Earlier in the same round a row-and-field check had
been added in FRONT of that call as belt and braces. That check caught every
input the drift comparison caught. So with the mutation applied, the earlier
check still rejected the drifted block, the named test still failed the way it
was supposed to, and the mutation changed nothing any test could observe.

The witness was not complaining about a missing test. It was reporting,
accurately, that an arm which had been genuinely covered for the whole phase
had been made VACUOUS by adding a stronger-looking check in front of it.

The fix was to DELETE the addition, not to write a test against it. The
implementer did that and recorded the reasoning in place, in a comment block
above the surviving call, so the next reader who thinks "this file should
really check the rows here too" finds the answer before repeating it.

## Why this is worth an entry rather than a line in a work history

Three reasons, and the third is the one that generalises.

1. **The instruction to write a test was unsatisfiable, and looked
   satisfiable.** An implementer that obeyed it would have written a test
   asserting something true, watched it pass, and shipped a still-vacuous arm
   with a green suite. There is no gate that catches that; the red-witness gate
   would have stayed red and the next round would have been told the same
   thing again.
2. **The defect was introduced by an attempt to be more careful.** Belt and
   braces is normally free. Here it is not free, and the cost is invisible at
   the point where the decision is made. Any reviewer asking "does this add
   safety" gets yes. The question that finds it is "can this new check ever
   fire ALONE".
3. **It has a mechanical test.** For a newly added check C placed near an
   existing check D: is there an input that C rejects and D accepts? If not, C
   is unwitnessable and so is D. That is a question about inputs, answerable by
   construction, and it does not depend on anyone remembering this entry.

## Relationship to what is already recorded

Closest neighbour is delivery/tuition/T-011-a-witness-can-stop-witnessing-silently.md:1,
which records a witness going quiet without anything going red. The difference
is worth keeping straight rather than merging the two:

- T-011 is about a witness that STOPS APPLYING while the code it guarded is
  unchanged. The guard drifts away from its subject.
- T-018 is the subject drifting away from the guard. The witness is still
  pointed at exactly the right line, is still evaluated, and correctly goes
  RED. Nothing is silent here. The gate worked.

That last point is why this entry is not filed as a gate failure. The
red-witness harness did its whole job: it named the file, the line, the member,
and the test that stayed green. What was missing was the READING, and the
orchestrator supplied the wrong one first.

Also adjacent, CLAUDE.md:380, one witness is not a class: a class needs two
structurally different members. This incident is the neighbouring hazard, where
two members exist and one of them cannot discriminate because of something in
the production code rather than something in the witness.

## What this entry does NOT cover

- **It is not established that this is the only shadowed pair in the
  repository.** The implementer was asked for the derivation, the exact command
  enumerating candidate pairs and its full output, and that derivation is not
  in the orchestrator's hands at the time of writing. Until it is, the scope of
  the class is UNKNOWN, and this entry must not be read as saying the
  repository has one instance.
- **No mechanical detector is proposed here.** The test in section "why this is
  worth an entry" item 3 is stated as a question a human or reviewer can
  answer, not as a check anything runs. Whether it can be automated at all is
  open; a general "can C ever fire alone" is a reachability question and is not
  obviously decidable in the cases that matter.
- **It says nothing about whether the removal was the best of the available
  remedies.** Deleting the shadowing check restores witnessability, and so
  would merging the two checks into one, or making the inner check catch a
  strictly larger input set. The round chose deletion and gave a reason; the
  alternatives were not measured.
- **The evidence here is the gate output, the shipped comment block and the
  witness specification, all read by the orchestrator.** It is not the
  implementer's reasoning, which is not yet written down. That is the reason
  for the PROVISIONAL marking at the head of this file.

## The correction the orchestrator owes itself

The brief said "add a named test reaching line 421". That is an INSTANCE
instruction, and the fix-round contract at CLAUDE.md:297 exists precisely to
stop instance instructions being handed out: name the mechanism, not the
finding. The orchestrator read a gate message that named a line and passed the
line along.

The right brief would have been: "the witness reports this arm unreachable.
Establish WHY it is unreachable before writing anything, and if the cause is
that another check shadows it, the remedy is not a test."

**And the corrected account is BETTER for the process than the version it
replaces, which is why the correction matters and is not pedantry.** The first
version said the implementer refused a wrong instruction on insight. That is a
story about an unusually good agent, and it is not reproducible. What actually
happened is reproducible: it followed the instruction, the instruction did not
work, and instead of trying harder at the instructed thing it went and read the
code that decides what red means. The generalisable rule is the last step, and
it is available to anyone.

The failure mode being avoided is the one where an agent, told to make a gate
green, keeps adding to the thing it was told to add to. Here that path was not
merely unproductive, it was moving away: each additional named test raises the
bar that `failed.length === tests.length` sets. **When two rounds of the
obvious fix leave a gate red, the next move is to read the gate's own
definition of its verdict, not to do more of the obvious fix.**

Credit is placed as the implementer asked. It requested this correction itself,
having been given the more flattering version, which is the behaviour a work
history is supposed to have and is recorded here as such.
