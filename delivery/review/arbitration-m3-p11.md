# Arbitration, M3-P11: two reviews, one verification, two fix rounds, and what merges open

- date: 2026-08-14
- arbitrator: orchestrator
- reviews: `delivery/review/clean-room-m3-p11-criteria.md`,
  `delivery/review/clean-room-m3-p11-hazard.md`
- verification: `delivery/verification/m3-p11-fix-round-1.md`
- all three land in THIS pull request rather than their own, which is DR-0031's
  first application: a pull request is a unit of self-contained value and carries
  all its evidence
- outcome: MERGES, at the hard two-round cap, with residues recorded below

## The reviewers did not disagree, which is itself worth recording

There is no conflict to arbitrate between them. The criteria reviewer credited
the hazard reviewer for the mechanism behind one of its own findings, and each
reported plainly where it found nothing. What follows is therefore a
consolidation rather than a ruling.

Both reported all eleven criteria MET AS LITERALLY WRITTEN, and both requested
changes anyway, on findings the criteria did not ask about. That combination is
the argument for having criteria AND an adversarial lens rather than either
alone.

## What the round trip actually cost, and what it bought

| step | outcome |
|---|---|
| implementation | three changes, all eleven criteria met as written |
| two clean-room reviews | 1 HIGH, 3 MEDIUM, 1 LOW, plus three SPEC defects |
| fix round 1 | closed both mechanisms; **introduced a regression** |
| delta verification | NOT VERIFIED: found the regression's blast radius, plus a third finding outside scope |
| fix round 2 | closed three mechanisms and the residue round 1 called unclosable |

**The verification is what makes this phase honest.** Round 1's own note called
its false-error trade an "accepted cost". The verifier measured that
`decideAggregate` checks `counts.error > 0` FIRST, so a single false error fails
the ENTIRE bundle regardless of applicability. An honest, correctly written
precondition would have blocked a consumer's whole delivery. That is a worse
failure than the silent skip the phase set out to fix: wrong and total rather
than wrong and quiet.

Nothing in CI would have caught it. The pull request was GREEN at the round-1
head, because no gate in the bundle exercises an honest nonzero-exit precondition
containing a slash. **A green bundle and a real defect coexisted**, which is the
gap reviews and verifications exist to fill and the reason DR-0027 keeps the full
contract for shipped code.

## Round 2 closed what round 1 called unclosable, and the method transfers

Round 1 stated the no-slash operand could not be closed, because both rules test
for a slash and must, since `.` and `src` are real non-path elements. That
reasoning was sound and it was not the end of the question: round 1 never tried a
SECOND, narrower way to be path-shaped. Round 2 added a closed list of script
suffixes.

The orchestrator's condition was that closing it must not widen the false-error
class round 2 existed to narrow. Measured over 30 declared commands: **round 1's
rule gives 2 false gaps, round 2's gives 0.** It adds one false-error shape and
removes four plus an entire timing class.

The transferable lesson: **"I could not find a way" is a true sentence and is not
the same as "there is no way".** Round 1 wrote the true one, which is why round 2
knew where to look. That is the norm at CLAUDE.md:1 working as intended.

## Merged carrying these

| # | residue | why not a blocker |
|---|---|---|
| 1 | `--opt=/path` is now UNPROBED rather than correctly probed | round 1's treatment of it was a guaranteed false error, never a check, so this is strictly better than the state being replaced. Splitting on `=` would close it and was not attempted in the last round |
| 2 | the extensionless bare operand (`node check`) is still a silent skip | narrower than the class closed, and the same shape the suffix list cannot see by construction |
| 3 | seven further residues, listed by number in the work history and split into "still a false error" and "still a silent skip" | the split is the useful part: the two directions have different costs and the register should not flatten them |
| 4 | mechanism C (a directory operand read as a non-regular file) is LATENT, not live | this repository's own `scope` gate is declared with a directory operand but carries no precondition, so nothing exercises it today. The implementer said so rather than letting the fixed-count imply otherwise |

## The finding that is NOT this phase's, and is not being buried

`src/gates/credentials.ts` reads a signal-killed `git` or `gh` subprocess as a
benign "clean" verdict rather than `error`, inside `credential-scrub`, which is a
REQUIRED gate. Found by the delta verifier, reproduced with a wrapper that
self-inflicts SIGSEGV.

It is the same mechanism one file over, in a gate whose whole job is to refuse a
credential leak. It is pre-existing rather than a regression of this phase, it is
outside this declaration, and it was deliberately kept out of the LAST round
because loading a fourth file into a final round is how a round fails.

**It needs an owner.** It is recorded in
`delivery/review/tracked-findings-register.md` and reported to the owner rather
than filed quietly.

## What this arbitration does NOT establish

- **It does not re-derive either review or the verification.** Their measurements
  are taken as reported, except where round 2 re-measured them itself.
- **It does not claim the class is exhausted.** Nine residues are recorded, three
  derivations published, and each derivation states its own gaps. The most
  important gap is that D2 covered ONE file, so the sibling sites in
  `citations.ts`, `credentials.ts`, `pool.ts`, `witness/run.ts` and `doctor.ts`
  are unexamined and no claim is made about them.
- **It does not evaluate CI.** No agent read a CI run; every result above is a
  local measurement, and the pull request's own checks are the orchestrator's to
  read by step.
