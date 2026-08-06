# Arbitration: the two M1-P5 third-round reviews disagree

- date: 2026-08-05
- head: `1bdfce5fcf0ecfa88d7318f58f77b378544045b5` (PR 8)
- arbitrated by: the orchestrator, under DR-0012 clause 6, which requires that
  a disagreement be resolved with evidence and recorded, and never by
  preferring the more convenient verdict
- outcome: the FIX-ROUND-NEEDED verdict stands; the phase does not merge

## The disagreement

| | hazard lens (Opus) | criteria lens (Sonnet) |
|---|---|---|
| verdict | FIX-ROUND-NEEDED | APPROVE |
| high | 1 (CR-520) | 0 |
| medium | 1 (CR-521) | 1 (CR-540) |
| low | 2 (CR-522, CR-523) | 1 informational (CR-541) |
| criteria walked | all 15, executed | all 15, executed |
| gates observed | 139 tests, 137 pass, 2 skip | 139 tests, 137 pass, 2 skip |

Both reviews agree on every mechanical fact: the gate exit codes, the test
counts, the registry (145 mappings, 139 titles, nothing lost), the scope
audit, the ASCII and constraint scans, and that all fifteen acceptance
criteria are met by direct execution. They agree the work history is honest;
the criteria lens sampled it aggressively and found no new instance of the
unexecuted-assertion pattern.

They disagree on one thing only: whether the phase carries a high-severity
defect.

## How the disagreement is resolved

It is not resolved by weighing two opinions. It is resolved by asking what
each reviewer actually probed.

**The criteria lens did not test the beacon read path.** Its report contains
zero occurrences of `readBeacon`, and no probe of a beacon of a non-regular
file type. That is not a lapse: its assigned contract was the fifteen
acceptance criteria, and no criterion in M1-P5 covers what happens when a
file in `state/` is not a regular file. Its APPROVE is therefore SILENCE on
CR-520, not a refutation of it.

**The hazard lens did test it, and so did I.** The orchestrator reproduced
CR-520 independently before accepting it, on the declared Node floor rather
than the container default, recorded in
`delivery/verification/cr-520-orchestrator-reproduction.md`. One `mkfifo` at
`state/watcher.beacon` turns `doctor` from exit 0 with four `CHECK` lines
into exit 124 with zero output, and `watch --once` into exit 124.

A finding reproduced with captured output is not outweighed by a review that
did not look. CR-520 stands at HIGH.

## What this says about the criteria as a contract

The more useful reading is not that one reviewer was better. It is that the
acceptance criteria did not contain the defect, so a reviewer executing them
faithfully and completely could not have found it. Fifteen for fifteen, all
executed, and the phase still carries a live-lock of every supervision
command.

This is the same lesson as tuition T-001 in a sharper form: decorrelating
reviewers works, and it works because they probe different things, not
because one is more careful. Both lenses earned their place in this round.
The hazard lens found the high the criteria could not express; the criteria
lens found CR-540, a red-witness failure the hazard lens did not, by
mutating criterion 7's exclusivity flag and observing that both of the tests
registered for that criterion stayed green.

## Both findings that block merge under DR-0012 clause 2

**CR-520 (HIGH), unrefuted and reproduced twice.** The fix round closed the
instance NEW-2 named and not the class it described. Six read paths remain
unprobed, including the beacon, which takes the guard itself down and so
defeats the mechanism that would notice every other hang.

**CR-540 (MEDIUM), from the criteria lens.** Criterion 7's two registered
tests stay green when the claim file's exclusive-open flag is removed
(`"wx"` to `"w"` in `src/watcher.ts`). The reviewer went further than
reporting it and established that the SHIPPED CODE IS CORRECT, by building a
genuine dual-simultaneous-release race and observing the unmutated source
resolve it 3/3 while the mutated source produced a real duplicate signal from
both processes. So this is a test-coverage defect, not a running-code defect,
and its remedy is one registered test using that construction, with no source
change. It is nonetheless a red-witness failure of exactly the shape tuition
T-003 lesson 2 describes: a test green, registered, and worthless for the
property it claims to guard.

## Why the orchestrator does not simply take the fix

DR-0012's stop-and-wait limit fires on both clauses for the second time on
this phase: more than two fix rounds after the first dual review, and a
high-severity finding recurring in the same component across consecutive
rounds (`src/liveness.ts`, unprobed blocking read, NEW-2 then CR-520). The
owner's lift of 2026-08-05 was explicitly scoped to this round coming back
clean on both reviews. It did not.

The limit exists because of what M1-P3 cost, and the pattern it names is
precisely what is happening: each round fixes the instance in front of it and
the next round finds the same defect one path over.

## Note for whoever takes the next round

The recurrence has a nameable cause. "Read a file whose type you have not
established" is a MECHANISM, and this project has now paid for a rule about
it twice in one phase. It has no mechanism index to look it up in, which is
tuition T-005 exactly, and the structural answer is already planned in M3.
The interim measure T-005 prescribes applies here: the rule belongs at the
mechanism's definition, which means at the file-reading boundary every path
shares, not at one classifier that one pair of callers happens to use.

The two false claims in `src/liveness.ts` and in commit `e0d4fce`'s subject
must be corrected whichever option the owner takes, because a record that
says supervision cannot hang is worse than no record when supervision can.
