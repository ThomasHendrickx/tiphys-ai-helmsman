# T-006: Claimed impossibilities and claimed safety nets, written without execution, three times in one phase

- id: T-006
- project: tiphys-kernel
- date: 2026-08-05
- stage: M1-P5 (watcher and liveness guard), across its fix rounds
- kernel-relevant: yes (work-history contract, red-witness harness, reviewer checklist)

## What happened

Three separate assertions in M1-P5's record were statements about the world
that the implementer had not executed. All three were false. All three were
caught by reviewers rather than by the implementer, and the implementer said
so plainly in the work history rather than letting the pattern pass:

1. **A claimed safety net.** Key decision 9 asserted that doctor would catch a
   condition. It would not.
2. **A prescribed remedy that could not work.** CR-509's fix text advised a
   recovery action that does not recover.
3. **A claimed impossibility, plus a claimed coverage.** The work history
   recorded that forcing the `problems` arm of `surveyTaskRecords` "needs a
   stat or readdir failure that is neither ENOENT nor a permission bit, and
   this suite runs as root where permission bits do not bite", and separately
   that FIFOs were covered. A reviewer disproved the impossibility in minutes
   with `symlinkSync(p, p)`, which makes `statSync` raise ELOOP and needs no
   privileges at all. The coverage claim was false in the most expensive
   direction: a named pipe at `tasks/<id>/meta.json` blocked `guard()` and the
   watcher forever, on that head and every earlier one, live-locking doctor,
   spawn and teardown.

## Why this is not T-003 again

T-003 lesson 3 already recorded that an unfalsified universal claim in a work
history is worse than no claim, and routed the structural fix to M3's report
contract: a claim of universality ("always", "never", "in all cases") requires
a cited counter-experiment that could have falsified it.

That mitigation, as written, would not have caught any of these three. None of
them is a universal quantifier over observed data. They are a different
grammatical class:

- **An impossibility claim**: "this state cannot be constructed here."
- **A coverage claim**: "this case is handled" / "this check catches that."
- **A remedy claim**: "doing X recovers from Y."

Each is an existential or a causal claim, not a universal one, and each is
verified by CONSTRUCTION rather than by counter-experiment. The check is
different: a universal claim needs someone to try to falsify it; an
impossibility claim needs someone to try to BUILD the thing.

## Why the impossibility claim is the worst of the three

A wrong universal claim misleads a reader about what was measured. A wrong
impossibility claim closes the question. The next implementer reads "this
cannot be witnessed here", accepts it as settled, and the gap becomes
permanent, because nobody re-attempts a construction that the record says is
unavailable. The false coverage claim is the same defect one step further
along: the record says the case is handled, so nobody tests it, and in this
instance the unhandled case was a permanent hang of every supervision command.

## Lesson

**An assertion about the world belongs in a record only with the command that
produced it.** Where the assertion is that something cannot be built or cannot
happen, the record must show the attempt that failed, not the reasoning that
predicted failure. Reasoning about what a syscall will do is not evidence
about what it does.

The three instances share one mechanical property that makes them checkable:
each could have been settled in under five minutes by running something. None
of them was expensive to verify. They were cheap to verify and were not
verified, which means the gap is procedural rather than a matter of effort.

## Structural consequences

- **Work-history contract (M3)**: extend T-003's rule beyond universal
  quantifiers. An impossibility claim, a coverage claim, or a remedy claim
  must carry the executed construction or be restated as an open question. The
  honest restatement is available and costs nothing: "I did not find a way to
  force this arm" is a true sentence where "this arm cannot be forced here" is
  a false one, and the first invites the next reader to try.
- **Reviewer checklist (M3 role briefs)**: hunt impossibility and coverage
  claims specifically. This phase's evidence is that reviewers are already
  good at this (three for three) but were doing it by instinct rather than by
  instruction; an instruction makes it repeatable across reviewers.
- **Red-witness harness (M2)**: an arm of a classifier that no test reaches is
  a reportable state, not an acceptable one. The measurement that flagged this
  here was the implementer's own sabotage run coming back 0/3, which is the
  right signal produced by the right mechanism, and the failure was in what
  was written next to it rather than in the measurement.
- **Mechanism index (T-005, M3-P8)**: "read a file whose type you have not
  established" is a mechanism, and the rule attached to it is the ordering now
  enforced in `surveyTaskRecords`: lstat the link, stat what it resolves to,
  open only a regular file. It should be indexed there so the next component
  that reads an untrusted path finds it.

## What went right, recorded because it is the part worth reproducing

The implementer wrote the pattern down against itself, in the artifact a later
reviewer trusts, at the moment of the third instance rather than at the end of
the phase. That is what made this entry possible. A work history that reports
its own defect rate is worth more than one that reads clean, and this project
has already been bitten once by a softened work history concealing a real
defect (T-003, U-5).

## Evidence

- The three instances, named and corrected in place:
  `delivery/work-history/m1-p5.md` at head `1bdfce5`, the honest-scope section
  of the factoring round and the per-item disposition of the final round.
- The FIFO hang, its ordering fix, and the bounded hang witness H1 (red 3/3
  against a hang rather than a wrong answer): the NEW-2 section of the same
  file, and `src/liveness.ts` `surveyTaskRecords`.
- The reviewer's ELOOP construction and the resulting registered behavior
  `liveness-unexaminable-entry-reported`: the CR-512 disposition in the same
  file.
- The prior entry this one extends rather than repeats:
  `delivery/tuition/T-003-fix-rounds-need-verification.md`, lesson 3 and its
  report-contract consequence.
- The mechanism-index consequence this one feeds:
  `delivery/tuition/T-005-lessons-do-not-propagate-between-phases.md`.
