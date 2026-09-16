# M4-P10 clean-room review (correctness and data loss lens) - IN PROGRESS

## Setup (2026-09-16)
- Clean clone of the repo at /tmp/claude-0/m4p10, checked out
  claude/m4-p10-verdict-head-and-medium, HEAD 6a5e5af4ca2a108ae5c55edc429bf0ea631307b5.
- Interpreter /home/user/n26-review/bin/node v26.6.0 (NOT under /tmp, so the
  CLAUDE.md:803 EACCES trap does not apply).
- npm ci exit 0, npm run build exit 0, git status clean after build.
- Lens: correctness and data loss.

## Check 0: the not-covered statement (fix-round contract item 3)
Work history section 4 "What the derivation did NOT cover" and section 8
"What this phase did NOT cover" both exist and are unusually specific.

## FINDING 1 (HIGH): the regime lift silently de-fanged FOUR stored witness specs
The block moved from inside `dualReviewDecorrelation.run` (4-space indent) into
the new top-level `establishDelegatedRegime` (2-space indent). Four witness
specs mutate that block by EXACT TEXT, and their find strings no longer occur.
Measured with the shipped `findOccurrenceLines` at head 6a5e5af:

  dual-review-distinct-model-families member 1   includes=false
  dual-review-requires-two-verdicts member 1     includes=false
  dual-review-merge-authority-lookalike member 0 includes=false
  dual-review-unestablished-merge-authority m0   includes=false
  dual-review-unestablished-merge-authority m1   includes=false
  dual-review-requires-two-verdicts member 0     lines=[3645,3859]  (was 1, now 2)

At base 3b40118 all four strings occur exactly once. src/witness/run.ts:798
returns ok:false for an unmatched find; src/witness/run.ts:1602 records it as
`problem`; src/witness/run.ts:1523 turns a problem into evaluation status
"error"; src/gates/red-witness.ts:326 puts every spec whose member touches a
changed file into `triggeredStored`, and src/gates/red-witness.ts:437 makes any
"error" evaluation the gate's status. red-witness is a REQUIRED gate on
pull_request. Work history section 8 states the bundle was not run.

## FINDING 2 (MEDIUM): an unreadable third review is silently dropped and the gate prints "the pair approves"
Reproduced at head 6a5e5af, node v26.6.0, dist built:
  delivery/review/ = decorrelated-criteria.yaml (APPROVE), decorrelated-hazard.yaml
  (APPROVE), third-refusing-broken.yaml (FIX-ROUND-NEEDED + one malformed line).
  $ node scripts/check-dual-review.mjs $D
  check-dual-review: green (2 review verdicts examined for decorrelation)
  2 verdict(s) examined ... no decorrelation violation and the pair approves
  exit=0
The third file is never named in the output. Control: with the same third file
well-formed but missing `phase`, the gate is RED (exit 1), so the refusal is
specific to the decode failure, not to the third document.
Mechanism: loadCommittedVerdicts (src/checks.ts:2920) and the script's
committedVerdictPaths both `continue` on a decode failure. M4-P10 did not
introduce the skip; it introduced the affirmative claim that rests on it.

## FINDING 3 (MEDIUM, tracked): scope gate red, and the branch carries 27 files that are not this phase's
  $ node bin/tiphys.ts gates run --only scope --base origin/main --head HEAD --phase m4-p10
  scope: red: ... no phase declaration exists at
  delivery/plan/phase-declarations/m4-p10.json in the merge base 3b40118
Also: git diff --name-only origin/main HEAD = 41 files; the phase's own commits
(6961186..HEAD) touch exactly 14, every one of them declared. The other 27 are
the M4 plan, ten decision records, CLAUDE.md, STATE.md and nine probe documents
inherited from the unmerged base branch plan/pstack-borrow-review.

## Checks that HELD
- Red witnesses: criterion 3's class has two structurally different members
  (old join key ignores head; a sibling with an unusable head falls out). The
  pre-change tree is derived from git and the staging ASSERTS it lacks the new
  code, so it cannot silently become a comparison against itself.
- Claim grep: 32 matching lines / 64 occurrences whole-document, reproduced
  exactly. Section 10's accounting is honest and names two false positives.
- Passive-form grep: 4 real hits (lines 89, 93, 96, 209), each with an adjacent
  citation or inside quoted program output.
- Citations: 65 file:line tokens, 65 resolve, content matches the claim on the
  ~25 checked semantically. The citations gate reports 504/504 at 6a5e5af.
- C-1/C-2/C-3: no pid, no process liveness, no log tail, no backgrounding in
  the added code.
- Suite: git CHECKOUT, /home/user/n26-review/bin/node v26.6.0, dist built,
  `npm test`: 878 tests, 877 pass, 1 fail, 0 skipped, exit 1. The one failure is
  test/gates.test.ts:3571, MODULE_NOT_FOUND under the unprivileged spawn because
  my clone sits under /tmp/claude-0 (drwx------), CLAUDE.md:803. The branch
  touches neither test/gates.test.ts nor bin/. The implementer's failure
  (test/coverage-gate.test.ts:233) PASSED here, corroborating their reading.
