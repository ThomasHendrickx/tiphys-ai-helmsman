# Arbitration: harness fix round 2 and its delta verification

- date: 2026-08-12
- author: orchestrator
- subject: the exit-test harness assertion-direction change on
  `claude/exit-test-harness-assertion-direction`, head `9b7752d`
- outcome: **MERGE BLOCKED on two MEDIUM findings. A THIRD fix round was
  dispatched to a FRESH implementer**, which is what DR-0012's stop rule means
  as modified by DR-0016.

## The decision first, because it is the only thing that gates anything

Round 2 closed all four findings from the dual review and is green by step on
three consecutive heads with byte-identical code. The independent delta
verification then found **two new MEDIUM findings in code that round 2 ADDED**.

DR-0012 condition 2 requires no unresolved high or medium, so the merge is
blocked. This would be the third fix round on this branch, which trips the stop
rule at delivery/decisions/DR-0012-delegated-merge-authority.md:34.

**DR-0016 changes what stopping means and that is the operative rule here**: the
work does not wait for the owner. A fresh implementer is dispatched immediately
and the owner is notified asynchronously. Only if THAT round also fails does it
go to the owner. The property being protected is that **something different must
happen**, and the recorded evidence is that the fresh implementer, not the owner
decision, is the half that worked.

So round 3 is a different agent. Not the round-2 implementer resumed. That is
the entire point of the rule and it is the one part of this that was not a
judgement call.

## Why a delta verification ran instead of a merge

Round 2 was green by step on `8db93b2`, `16a3ec6` and `9b7752d`. Three greens
would ordinarily be a strong signal. Four things made them insufficient, and
they are recorded because each one on its own would have been a weak argument:

1. **Both clean-room reviews' premise was VOID.** H-A and H-B each verified the
   harness sha256 as `9f53425f` and reasoned explicitly from "no production code
   changed, this is a witness-only fix". Measured at the current head it is
   `4b607dd9`: 22 lines of new production code from the CR-V-2 fix. The round
   flagged this itself rather than letting it pass, which is the behaviour the
   process wants and is also exactly why it could not be waved through.
2. **`red-witness` did not run on this pull request.** Its precondition is
   `diff-touches src/ bin/` and this diff is `scripts/`, `test/`, `.github/`,
   `delivery/`. Confirmed from the registry and from the runs' own output:
   `gates: required gate(s) not applicable: citations, scope, red-witness`. So
   **no gate evaluated whether the new witnesses can fail**, on a change whose
   entire subject is witnesses that could not fail.
3. **This program asserts every other gate.** A silent defect here does not
   fail, it stops noticing, on every pull request afterwards.
4. **T-003, measured**: twelve of thirteen re-reviewed fix rounds produced a new
   finding attributable to the round itself.

The verification vindicated the dispatch, and it is worth being precise about
which part: it did NOT overturn any claim round 2 made. All three central claims
survived falsification, several with stronger instrumentation than the round's
own. What it found was new.

## What was upheld, since a verification that only reports failures is misread

- **probe-4 discriminates.** Verified with a 4-harness by 4-probe by 2-arm
  matrix, built by instrumenting the probe loop to report per probe instead of
  aborting at the first failure. Round 2's own table could only show which probe
  failed FIRST under each defang, leaving three of twelve cells unmeasured. The
  stronger method confirmed the weaker claim.
- **The mechanism's derivation.** Re-derived with a deliberately DIFFERENT
  method, a character-scan tokenizer rather than the round's script, reproducing
  24 tokens line for line. The tokenizer was itself red-witnessed by planting
  four decoy `fail(` inside comments and template strings: naive grep went 19 to
  23, the tokenizer did not move.
- **The byte-identity of a reverted capture**, verified by RE-EXECUTION rather
  than comparison: the pasted script was extracted and run against a `fdb3120`
  worktree, `diff` exit 0 over all 62 lines. That is the right instrument for
  evidence that was edited and restored, and round 2 flagged the edit rather
  than hiding it, which is why it was checked rather than trusted.

## The two blocking findings

**DV-3 (MEDIUM), and it is the serious one.** A manifest with `gates: []`
empties the manifest leg silently and neither new check fires: `Array.isArray`
of the empty array is true, and the shipped expectation tables keep the expected
set non-empty so the second check can never fire. A/B against the REAL eleven
gate manifest with `red-witness` omitted from the bundle: the real manifest
gives exit 1 and detects it; `gates: []` gives **exit 0, certified, "10 gate(s)
asserted, zero red"**.

**That is the original assertion-direction defect restored in full**, inside the
fix built to remove it. The shipped check's own message reads "a manifest that
declares no gates cannot certify a bundle", and it is falsified by the program
that prints it.

**How it was found is the transferable part.** The verification fed the check a
REAL manifest with a gate omitted. Round 2's tests fed it hand-built degenerate
inputs. **A check exercised only against inputs an author constructs is
exercised against the author's model of what can go wrong, and DV-3 is what sits
outside that model**: an ordinary manifest with an ordinary empty list, which no
degenerate fixture happened to represent.

(That sentence originally read "tested against the cases that cannot happen".
It was caught by grepping this document for `cannot X` forms, which the binding
claim grep does not cover, and it was wrong twice over: a degenerate manifest
CAN happen, and the failing input here is not degenerate at all.)

The verifier also wrote a mitigation, measured it, found it FALSE, and recorded
the falsification rather than deleting it. That saved round 3 from a dead end
and is why the record is more useful than a clean one would have been.

**DV-4 (MEDIUM).** The fourth-leg guard reads union sources with a regex
matching a bare identifier after the spread, so a leg spelled as an expression
is invisible to it, and that spelling is this codebase's own idiom. The verifier
added such a leg, proved it FUNCTIONAL by watching a gate id enter the expected
set through it and flip the verdict, and the guard still exited 0. **So a
behaviour registered in `test/behaviors.json` is false as written.** Round 3 must
either make the guard catch that spelling or restate the registered behaviour to
what is true, and say which.

## The two non-blocking findings

- **DV-1 (LOW)**: `probe-3` is red in all four single-deletion columns and green
  only when two legs go together, while its assertion message credits it with
  witnessing a source that has exactly one real witness. The message overstates.
- **DV-2 (observation, explicitly not a finding)**: round 2's claim that each leg
  reddens a DIFFERENT named assertion is looser than its evidence, though the
  property that matters holds. Recorded so nobody "fixes" a non-problem.

## What NEITHER round nor verification covered

- **The `push` arm.** It skips on `pull_request` and first executes post-merge.
  Nothing on a pull request can discharge it, and it is the orchestrator's under
  T-009 rule 1.
- **`red-witness` on this diff.** It has not run and will not, given its
  precondition. The evidence that the new witnesses can fail is lab work in the
  work history, not a gate result. That gap is recorded separately as a MEDIUM
  against `main` at delivery/verification/red-witness-does-not-run-on-scripts.md:1.
- **Whether DV-3's class has other members.** The verifier ran the `src/` grep
  round 2 had declined and found exactly one negated attribution-key filter in
  the repository, the site being fixed. That bounds one mechanism, not the
  broader class of checks whose condition cannot fire on shipped inputs.

## One correction this produced for a binding file

CLAUDE.md's standing warning 12 records that the no-dist arm skips NINE tests.
The measured number at this head is **TEN**; the extra is a fifth dist-gated
test that does not exist on `origin/main`. Round 3 was told it may correct the
warning, after re-measuring rather than trusting the figure.
