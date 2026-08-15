# Arbitration: witness ownership scoping, merging at the two-round cap

- date: 2026-08-15
- arbitrator: orchestrator
- head merged: `f90c614`
- reviews: delivery/review/clean-room-witness-ownership-criteria.md:1 and
  delivery/review/clean-room-witness-ownership-hazard.md:1, both at `deea501`
- verification: delivery/review/verification-witness-ownership-fix-round-1.md:1,
  scoped to `deea501..e722f65`
- outcome: **MERGES.** Two fix rounds spent of a hard cap of two.

## Why this branch exists at all

It is not a planned M3 phase. The M3 exit test's stage E1.6 could not be
satisfied: the designated subject change must edit
src/commands/doctor.ts:53, a single-line array quoted verbatim by two M3-P8
witness specs, and both escapes were measured dead. Repairing the specs reddened
rule (d) on their unrelated members; leaving them errored on a mutation find
text that no longer occurred.

The mechanism was that ownership of a witness spec was derived from the spec
FILE appearing in the phase diff (src/gates/red-witness.ts:277 at the base)
while rule (d)'s obligation was applied per MEMBER (src/witness/run.ts:1251 at
the base). File-granular fact, member-granular obligation.

**Shipped behaviour at risk, named before dispatch as DR-0027 requires:**
`tiphys gates run --mode full` emitted a false red for any change editing one
member of a multi-member witness spec, blocking a legitimate delivery. Reachable
by any consumer maintaining witness specs, not only by a future editor of the
guard.

## What the reviews found, and the pair earned its keep

Both returned FIX-ROUND-NEEDED. They found **CR-001 independently of each
other**, and only the hazard contract found **CR-002**. That is T-007's property
observed rather than asserted: two contracts, two framings, two model families,
and the second contract found a class the first did not.

- **CR-001**: `canonicalMember` returned `["patch", member.patch]`, a POINTER,
  where the mutation arm returned file, find and replace, the CONTENT. Seven
  patch members across three shipped specs.
- **CR-002**: ownership read `dangerousStates` alone, so rewriting a spec's
  CLAIM authored nothing and skipped rule (d) entirely. A phase could point an
  earlier phase's dangerous state at a behavior and test it had just introduced.

Both are one mechanism: **ownership was computed over a projection of the spec,
and load-bearing content lived outside that projection.** The round was
dispatched against the mechanism, not the two instances.

## Why a delta verification ran, and it was right to

The M3-P12 argument for skipping one was that the round changed zero non-comment
lines of the guarded file. That argument was **not available here**: this round
rewrote ownership semantics again. Two reviewers had each found a hole in the
previous version of that logic, so the prior on a fresh hole was not low.

It found one, MEDIUM, reproduced on both trees with a control: extending a
spec's `tests[]` fell into the same branch as re-pointing it, so a phase
strengthening an existing multi-member spec falsely reddened every untouched
sibling. Over-strict rather than a hole, and blocking anyway, because DR-0027
makes reachability the test and not the direction.

**The round's own test could not have caught it**, because that test replaces
`tests[]` and never extends it. That is the fix-round contract's dominant
failure shape landing on the round that was written to obey it.

## Round 2, and the two things that make it merge rather than grind

1. **It checked the instruction's load-bearing premise instead of implementing
   it.** The brief asserted extension is safe because execution demonstrates the
   new test red. The round measured both arms, src/witness/run.ts:918 and
   src/witness/run.ts:1677, and established that extension adds obligations on
   both and removes none. Had the premise been false, the fix would have been
   wrong in the dangerous direction.
2. **It derived a comparison class the arbitrator did not name.** Three were
   named in the brief; the round found a fourth, the establishment tests at
   src/witness/spec.ts:443, and reported all four with their verdicts. The
   expectation that the patch sha and the multiset matching were correctly
   equality-based was confirmed by derivation rather than left as assumption.

The over-correction guard is stronger after the round, not merely intact: M16
reddens eight tests at this head against seven at `e722f65`. That matters
because the round narrows the same predicate M16 exercises, and a narrowing that
weakened its own guard would be invisible.

## Merged carrying these, none of them blocking

| id | what | why not blocking |
|---|---|---|
| CR-003 residue | M10 survives the mutation sweep, 19 of 20 caught | proven an equivalent mutant; a test for it would be a test that cannot fail |
| CR-004 | the demonstration's blast radius shrank and the compensating catch is a different gate row | `scripts/`, tracked under DR-0027 |
| kernel-side stored spec | a stored spec absent from the audited head is judged against it anyway | reaches a user only by deliberately running with a head differing from the working tree |
| `consumesExternalOutput.captures` | CR-001's pointer shape one rule over | rule (c) is not ownership-gated and never substitutes a pointer for content it compares; pre-existing |
| rule (g) patch bodies | flagged open by the round | ARBITRATOR MEASURED IT: rule (g) already reads bodies via `readPatch` and normalises them, so it never had the pointer shape. Closed, not carried |
| leaked `/tmp` prefixes | eleven other test files leak scratch repos | `test/`, one round under DR-0027 |

## What this arbitration does NOT establish

- **No reviewer has seen `f90c614`.** The two clean-room reviews are at
  `deea501` and the verification is at `e722f65`. The cap is spent, so this
  merges on the strength of the round's own evidence and the arbitrator's
  reading, which is weaker than a third review and is stated as such rather than
  papered over.
- **It does not claim the mechanism is closed as a class.** The round bounds its
  derivation by the single-consumer grep over `phaseOwnedMembers`; that bound is
  only as good as the grep, and a future rule reading ownership would sit
  outside it.
- **The exit test has not been re-run.** E1.6 is expected to pass at a head
  carrying this, and expectation is not measurement. The re-run is what settles
  it.
- **A self-inflicted incident is recorded in the work history rather than
  here**: the round published a wrong diagnosis to itself, ran two concurrent
  mutation sweeps over one tree for about twenty minutes, then caught it,
  restored the tree file-by-file and verified it byte-clean. The containment
  argument is checkable and was checked; it is named here so a later reader does
  not discover it only from the work history.
