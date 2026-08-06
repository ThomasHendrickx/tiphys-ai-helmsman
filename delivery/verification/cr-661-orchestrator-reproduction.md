# Orchestrator reproduction of CR-661: the guard on the guard does not guard

- date: 2026-08-05
- subject: CR-661, `exit-test-falsifiability-guard-wired` stays green when the
  CI falsifiability guard is defanged
- head: `8954b05` (PR 9, M1-P6 fix round 1)
- why this file exists: the criteria reviewer's finding DIRECTLY CONTRADICTS a
  red-witness claim in the work history (W4: "CI step defanged to `|| true`,
  same test red"). A contradiction between an implementer's claim and a
  reviewer's measurement is exactly where the orchestrator must produce its own
  evidence rather than pick a side.

## What the guard is for

M1-P6 criterion 5 says the harness must be able to FAIL: with stage B skipped,
nothing is merged, so C2's teardown must refuse and the run must exit nonzero.
Finding CR-605 in the previous round observed that nothing automated enforced
this, so a harness that regressed to unconditionally-green would turn nothing
red. The fix added a CI step that runs the real red path and fails the job if
the harness exits 0, plus a test asserting the workflow still wires that step.

That test is the guard on the guard. If it does not bite, CR-605 is not
actually closed.

## Method

Detached worktree at the reviewed head, `npm ci` clean, floor toolchain
(Node v26.6.0). One single-line mutation, applied to the falsifiability step's
own failure path and nothing else, verified by `diff` before running and
restored byte-identically afterwards.

```
$ diff gates.orig .github/workflows/gates.yml
50c50
<             exit 1
---
>             exit 0
```

That is the line reached when the harness exits 0 with stage B skipped, which
is precisely the always-green regression the step exists to catch. With
`exit 0` there, the step prints "FALSIFIABILITY GUARD BROKEN" and then reports
success, so the job passes while the harness is broken.

## Result

```
### baseline
exit=0   pass 1   fail 0

### with ONLY the guard's exit 1 changed to exit 0
exit=0   pass 1   fail 0        <-- STILL GREEN
```

CR-661 is CONFIRMED at MEDIUM. The test asserts that certain TEXT is present
in the workflow: the harness invocation, an `if` followed by the
`FALSIFIABILITY GUARD BROKEN` echo, the `-C2.json` reference, and the C2
message. It never asserts that the guard's failure path actually fails the
job. Every one of those strings survives the mutation.

## Why this matters more than its severity suggests

The finding is graded medium because the LIVE wiring is correct: at this head
the guard does fail the job, criterion 5 holds, and CI is genuinely green for
the right reason. Nothing shipped is broken.

What is broken is the regression protection, and it is broken in the specific
way the round was convened to fix. CR-605 said the falsifiability property had
no automated witness. The fix added a witness. The witness has a reachable
blind spot that leaves the property unwitnessed against the most obvious
defang, which is one character.

There is also a recursion worth naming rather than being clever about: a guard
on a guard is still just a guard, and it needs its own red witness like
anything else. The rule this project already has covers it, and it was not
applied here: a test counts only when it has been demonstrated red against the
DANGEROUS state. The dangerous state is "the guard no longer fails the job",
not "the guard's text is missing".

## The work-history claim this falsifies

The fix round's record lists W4 as a red witness: "CI step defanged to
`|| true`, same test red". The criteria reviewer tried two placements of a
`|| true` defang and both left the test green. This reproduction uses a
different and simpler defang and also leaves it green.

I have NOT established that the implementer's specific `|| true` placement
failed to redden the test; it is possible some placement does, for instance by
breaking the multi-line `if`/`echo` regex. What is established is narrower and
sufficient: **a realistic, minimal defang of the guard leaves its guard test
green**, so the claim that this test protects the wiring does not hold as
written.

Recorded as the seventh instance in this milestone of the T-006 pattern, an
assertion about the world written without the construction that would settle
it. The sixth was the orchestrator's own.

## Fix

Assert the BEHAVIOR, not the text. The workflow step is a shell script and can
be extracted and executed: run it against a stubbed harness that exits 0 and
assert the step exits nonzero, then against a stubbed harness that exits 1 at
C2 and assert it exits zero. That is a witness against the dangerous state
rather than against the absent string, and it cannot be defeated by an
edit that preserves the text while inverting the meaning.
