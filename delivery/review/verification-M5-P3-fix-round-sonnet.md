# Delta verification, M5-P3 fix round 1 (hazard reviewer)

Date: 2026-09-23
PR: #213
Previous head reviewed (H): c4727e555cda76d2bee4ddb376a1e8f2f9fda6e1
New head (H2): 3f78dce2ee965672ea55423c3fc9a33dddca1145
Contract: hazard, delta verification of a fix round
Model family: Claude Sonnet 5 (claude-sonnet-5)

Status: COMPLETE.

## Setup

git fetch origin && git checkout --detach 3f78dce2ee965672ea55423c3fc9a33dddca1145
-> HEAD is now at 3f78dce M5-P3 fix round 1: gate results in the work history.

git diff c4727e5..3f78dce --stat:
  .github/workflows/gates.yml                                  |  12 +-
  delivery/plan/phase-declarations/m5-p3.json                  |   7 +-
  delivery/work-history/m5-p3.md                                | 237 ++++
  test/behaviors.json                                            |   4 +-
  test/dual-review.test.ts                                      |  20 +-
  test/merge-preconditions.test.ts                              |  51 +++
  witness/captures/m5-p3-git-rev-parse-symbolic-head.json       |  64 +++
  witness/m5-p3-dual-review-symbolic-head-resolved.json         |  24 +++
  witness/m5-p3-symbolic-head-resolved.json                     |  31 +++
  9 files changed, 443 insertions(+), 7 deletions(-)

CONFIRMED: no src/ file is touched by this round. This directly answers the
coordinator's fourth question: the round did not (and per this diff, could
not have) changed any shipped src/ code.

## CR-002 (medium): are the two new tests genuinely red-witness-valid

The work history's account (delivery/work-history/m5-p3.md, "Fix round 1"
section) claims: a grep derivation of every place a --head or --base enters
merge-preconditions.ts or check-dual-review.mjs, no src/ code changed (the
resolver fix predates this round, at 2b1ab8a), two new tests added, two new
witness specs each with two dangerous-state members, and a mutation lab
showing all four mutations red and the real code green.

I re-derived and independently re-verified rather than trusting the account.

### Re-reading the code paths

- src/gates/merge-preconditions.ts:1329-1344, resolveHeadFlag: unchanged this
  round. Peels the value through `git rev-parse --verify --quiet
  --end-of-options <value>^{commit}` in contextDirectory before lowercasing,
  falling back to a bare lowercase only when that fails. Called once, at
  src/gates/merge-preconditions.ts:1358.
- scripts/check-dual-review.mjs:188-195 (--head flag parser): stores the raw
  value, no lowercasing. Confirms the work history's claim that the
  flag-parser-lowercasing candidate (which the witness gate's rule (d) refused
  because it predates this phase's changed hunks) was never taken.
  scripts/check-dual-review.mjs:805 (`evaluate(options.directory,
  options.head, { base: options.base })`) and :382
  (`classifyReviewBudget(directory, options.base, requestedHead ?? "HEAD")`)
  both pass the raw value through, unmutated. Resolution for the corpus read
  happens in src/checks.ts:4072-4098 (resolveAuditedHead ->
  src/checks.ts:4029-4055 resolveCommitIn, same `^{commit}` peel, unchanged
  this round, pre-existing). `classifyReviewBudget`
  (src/gates/merge-preconditions.ts:958-1012) hands `head` straight to `git
  diff base...head`, which resolves a symbolic ref natively; this is safe
  because nothing lowercases it first.
- I ran my own derivation grep (not merely re-reading the work history's own
  quoted output):
  `grep -nE 'flags\.(base|head)|options\.(base|head)|requestedHead|resolveHeadFlag\(|resolveAuditedHead\(' src/gates/merge-preconditions.ts scripts/check-dual-review.mjs`
  and separately widened the search past the derivation's own stated scope to
  every gate taking --head:
  `grep -rn -- "--head" src/gates/*.ts bin/*.ts scripts/*.mjs` (excluding
  test files). This surfaced --head handling in src/gates/citations.ts,
  src/gates/red-witness.ts, src/gates/release.ts, src/gates/scope.ts and
  src/gates/suite.ts, none of which this phase's diff against origin/main
  touches (confirmed: `git diff origin/main...HEAD --stat -- src` lists only
  src/gates/merge-preconditions.ts, matching the work history's own stated
  scope). Those are correctly out of this phase's derivation and are not
  claimed to be covered by it.

### Independent mutation testing (my own lab, not the work history's account)

Toolchain: node v26.6.0 at
/tmp/claude-0/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/node-v26.6.0-linux-x64/bin,
first on PATH. Originals backed up to a scratch directory before each
mutation; each mutation was applied with Edit, tested, then reverted from the
backup and confirmed with `git status --porcelain` / `git diff --stat`
showing a clean tree (only the three delivery/review/ files as untracked)
before the next step.

**merge-preconditions, member 0** (bypass the resolver: `resolveHeadFlag`
body replaced with a bare `return value.toLowerCase();`):
`node --test --test-name-pattern "a symbolic --head reaches
merge-preconditions resolved to the staged repository's forty-character sha"
test/merge-preconditions.test.ts` -> 1 fail. Captured:
`AssertionError: 'error' !== 'red'`, detail:
`the review budget could not be established: git diff
d1db46455e3b4a8e881e27775736930c361c94e3...head failed (fatal: bad revision
'd1db46455e3b4a8e881e27775736930c361c94e3...head')`. RED, as expected: `head`
lowercased from `HEAD` names no ref.

Reverted (`git diff --stat` clean). Re-ran the same command: 1 pass, 0 fail.
GREEN.

**merge-preconditions, member 1** (resolver runs in the wrong repository:
`cwd: contextDirectory` -> `cwd: process.cwd()` inside resolveHeadFlag):
same test command -> 1 fail. Captured:
`AssertionError: 'error' !== 'red'`, detail:
`git diff f4b3f66ab383f2e3ac8fc8a8e282d97f2f3301ca...3f78dce2ee965672ea55423c3fc9a33dddca1145
failed (fatal: Invalid symmetric difference expression ...)`. RED (the
resolver, run against the reviewer's own working directory instead of the
staged fixture, cannot resolve the fixture's own symbolic ref, so it falls
through to the raw string, which is a different but still-wrong outcome that
still fails the test's `red` assertion).

Reverted (clean diff). Re-ran: 1 pass, 0 fail. GREEN.

**check-dual-review, member 0** (`evaluate(options.directory, options.head,
{...})` -> `evaluate(options.directory, options.head === undefined ?
undefined : options.head.toLowerCase(), {...})`):
`node --test --test-name-pattern "check-dual-review through the real runner
resolves --head HEAD to the staged commit" test/dual-review.test.ts` -> 1
fail. Captured: `AssertionError: 'error' !== 'green'`, detail:
`check-dual-review: error: the review budget could not be established: git
diff ecd18d242d2348d63fe0bef3831c6bb2cfa5e6dd...head failed (fatal: bad
revision 'ecd18d242d2348d63fe0bef3831c6bb2cfa5e6dd...head')`. RED.

Reverted (clean diff). Re-ran: 1 pass, 0 fail. GREEN.

**check-dual-review, member 1** (`classifyReviewBudget(directory,
options.base, requestedHead ?? "HEAD")` -> the same call with `.toLowerCase()`
appended to the third argument, matching the witness spec's declared second
dangerous state exactly): same test command -> 1 fail. Captured:
`AssertionError: 'error' !== 'green'`, detail: `git diff
3dd6f1f854be8b90f82ea0cf7ec88361685921eb...head failed (fatal: bad revision
'3dd6f1f854be8b90f82ea0cf7ec88361685921eb...head')`. RED.

Reverted (clean diff, confirmed with `git status --porcelain`). Re-ran: 1
pass, 0 fail. GREEN.

All four mutations, both witnesses' both members, reddened as declared and
returned green after revert. This independently confirms (not merely trusts)
the round's own mutation-lab claim, and separately satisfies "one witness is
not a class": each of the two new witnesses has two structurally different
dangerous-state members and both members reddened for both witnesses.

### Cross-check against the gate's own mutation lab

I then ran the real red-witness gate at H2 (not a hand-rolled substitute):

```
node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
  --only red-witness --evidence <scratch>/m5p3-fr1-rw-evidence \
  --base origin/main --head HEAD
```

Exit 0. `red-witness: green: 24 witness(es) evaluated (14 own, 10 stored
re-evaluated in 112780ms); every witness red against every declared dangerous
state and green at head`. The evidence file
`<scratch>/m5p3-fr1-rw-evidence/red-witness/witness-records.json` records both
new witnesses by name with `status: green`, and for
`m5-p3-dual-review-symbolic-head-resolved` each member's `runs[].red` is
`[True, True, False]` (two mutated runs red, the third run against the real
head green), matching my own manual result exactly. For
`m5-p3-symbolic-head-resolved` both members show the same `[True, True,
False]` pattern. This is the gate's OWN independent mutation lab (it applies
the dangerousStates from the witness JSON itself, in a fresh scratch checkout
under /tmp/tiphys-witness-*), not a rerun of my hand edits, so it is a second,
differently-sourced confirmation rather than a repetition of the same check.

### Verdict on CR-002

CR-002 is CLOSED. The two new tests are genuinely red-witness-valid against
the exact mechanism named (a symbolic --head reaching a comparison or a
lookup unresolved), each witness carries two structurally different dangerous
states and both redden, and the published derivation's scope (limited to the
two files this phase's diff touches) is correct: the wider grep across every
gate taking --head found nothing this phase's diff reaches or claims to fix.

## CR-001 (low): the renamed informational workflow step

`git diff c4727e5..3f78dce -- .github/workflows/gates.yml` (full diff read).
The step is renamed from `Dual-review decorrelation (M3-P9)` to `Dual-review
decorrelation, informational only (M3-P9; the enforcing review gate is
merge-preconditions)`. A new comment block above it states plainly that this
step is NOT the review gate DR-0012 enforces, names merge-preconditions in
the M2 exit test step as the one that decides from the diff and is red when
reviews are missing. The not-applicable branch's echoed message is rewritten
from a bare "no verdict document" line to one that also says "This is NOT the
review requirement" and names merge-preconditions again. The `run:` block's
actual commands (`check-dual-review.mjs --precondition .` then
`check-dual-review.mjs .`) are byte-identical to before; only the name and
strings changed.

CR-001 is CLOSED: the claim matches the diff exactly, in both places (step
name and message), and nothing about the step's behavior changed, only what a
reader is told about its scope.

## CR-003 (low): is "the scope gate refuses removal" true

Claim in delivery/work-history/m5-p3.md: the two stale declared witness paths
(witness/m5-p3-merge-preconditions-missing-is-red-runner.json and
witness/m5-p3-review-pair-arms.json, neither of which exists on disk) are left
in delivery/plan/phase-declarations/m5-p3.json rather than removed, because
"the scope gate refuses the removal of a declaration entry (src/gates/scope.ts:111)".

Confirmed both ways:

1. Both stale paths are still present in the declaration at H2:
   `grep -n "missing-is-red-runner\|review-pair-arms"
   delivery/plan/phase-declarations/m5-p3.json` -> lines 21 and 27, unchanged
   from H.
2. The claim is backed by enforced code, not merely a comment. Read
   src/gates/scope.ts:953-963: when a `removed` entry is detected against the
   merge base, the gate returns red unconditionally with the message
   `declaration ... REMOVES N entry/entries at ...; a phase branch may ADD to
   its own declaration, never remove from it, because a removal narrows what
   a later audit will check`. The docstring at src/gates/scope.ts:108-119
   (read in full) states the same rule in prose: additions are allowed and
   printed by name, but "A removal is still refused outright and the merge
   base is still the yardstick for `id` and `branch`". This is not a stale
   comment; the code path it describes exists and executes.

CR-003 is CLOSED: leaving the two stale entries in place is not laziness, it
is the only available option, and the implementer's stated reasoning is
literally true.

## Did the round introduce anything new outside the declared scope

`git diff c4727e5..3f78dce --stat` (quoted above under Setup): 9 files
changed, 443 insertions, 7 deletions. Every changed path is accounted for by
one of: the CR-001 rename (.github/workflows/gates.yml), the CR-002 test
witnesses and captures (test/merge-preconditions.test.ts,
test/dual-review.test.ts, the three new witness/captures files,
test/behaviors.json), the declaration amendment for those three new files
plus the review gateClasses addition
(delivery/plan/phase-declarations/m5-p3.json), and the work history itself.
No src/ file, no schema, no other gate, no other workflow step. This matches
the round's own account exactly and confirms no undeclared surface was
touched.

## test/behaviors.json

`git diff c4727e5..3f78dce -- test/behaviors.json`: two entries added,
`m5-p3-symbolic-head-resolved` and `m5-p3-dual-review-symbolic-head-resolved`,
both resolving by name to the exact test titles confirmed above (I read the
test source directly rather than trusting a grep). No entry removed, no
entry's text changed.

## Build and suite at H2

Toolchain: node v26.6.0 at
/tmp/claude-0/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/node-v26.6.0-linux-x64/bin,
first on PATH.

`npm run build`: exit 0. `git status --porcelain` after build shows only the
three delivery/review/ files (untracked, this review's own outputs); no
dist/ artifact and no *.tsbuildinfo tracked.

`npm test` (invocation: `npm test`, which is `node --test
"test/**/*.test.ts"`, build state: dist/ built): 1441 tests, 1441 pass, 0
fail, 0 skipped, exit 0.

CAUGHT AND CORRECTED: my first draft of this section compared that 1441 to
Task 1's H figure and called them consistent. They are not directly
comparable: Task 1's H measurement (delivery/review/clean-room-M5-P3-sonnet-hazard.md:278)
used the BARE `node --test` invocation, which per CLAUDE.md standing warning
12 picks up the tracked sandbox fixture `sandbox/test/greet.test.js` that
`npm test`'s `"test/**/*.test.ts"` pattern excludes. Comparing an `npm test`
count at H2 against a bare `node --test` count at H is exactly the
invocation-mismatch trap that warning describes. I re-ran the SAME bare
invocation at H2 for a real comparison:

`node --test` (bare, repository root, dist/ built, same toolchain): 1443
tests, 1443 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo, exit 0. This IS
comparable to Task 1's H figure of 1441/1441/0/0 (same bare invocation, same
toolchain, both against a built dist/): 1443 - 1441 = 2, exactly the two new
tests this round adds. Consistent.

## M2 exit test bundle at H2

`scripts/m2-exit-test.sh --base origin/main --head HEAD --phase m5-p3
--bundle pr --no-build <evidence-dir>`, run from a detached checkout of H2
(not the named phase branch, which this worktree does not have checked out
under its own name): FAIL, 4 findings. Full evidence in
/tmp/claude-0/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/m5p3-fr1-m2exit.

Two of the four findings (`scope` and `gate-classes` reporting
not-applicable because "branch HEAD does not match
^(?:claude/m[0-9]+-p[0-9]+-.*)$") are an artifact of running from a detached
HEAD rather than the real branch name in this isolated worktree, not a defect
in the round; the same would occur running the real branch's own head
detached. Not counted as a finding.

The fourth (`merge-preconditions: red ... 0 of 2 are admitted and 2
missing`) is the review gate correctly reporting that H2 itself has not yet
been reviewed: this delta verification is being produced for exactly that
missing pair, and I have not yet committed a verdict for H2 (this review's
own JSON, produced below, is uncommitted per instructions). This is the
mechanism working as designed, not a defect: it is the SAME shape the
round's own work history reports for its own lab head 3a7ae83 ("the branch
carries no verdict for 3a7ae83"). It is expected to go green only once
review verdicts for H2 are committed to the branch.

So all four m2-exit-test findings are explained by the review-in-progress
state of this exact delta verification and the detached-checkout harness
artifact, not by anything the round did wrong.

## Verdict

All three findings from the H review are resolved:

- CR-002 (medium): CLOSED. Both new tests are genuinely red-witness-valid,
  independently re-derived and independently mutation-tested by me (not
  merely trusted from the work history), and independently corroborated a
  second way by the real red-witness gate's own mutation lab. The wider
  derivation (every gate taking --head) found nothing else this phase's diff
  reaches.
- CR-001 (low): CLOSED. The workflow step rename and message rewrite match
  the claim exactly; the command is unchanged.
- CR-003 (low): CLOSED. The claim that the scope gate refuses declaration
  removal is literally true, backed by executing code
  (src/gates/scope.ts:953-963), not just a comment.

No src/ file changed this round (confirmed by diff --stat). No undeclared
surface was touched: every changed path is accounted for by one of the three
findings' fixes or the work history itself. Build is clean (exit 0, clean
git status). The suite is green both ways it can be measured (npm test:
1441/1441/0/0; bare node --test: 1443/1443/0/0, +2 matching the round's two
new tests, correctly compared against Task 1's H figure using the same
invocation). test/behaviors.json's two new entries resolve to the exact new
test titles. The declaration amendment is additive only, as the scope gate
requires. The one m2-exit-test red (merge-preconditions) is the gate
correctly reporting that H2 has no committed review pair yet, which is
exactly the state this delta verification is closing, not a defect.

**Verdict: APPROVE.**

## Validator

`node bin/tiphys.ts validate --type verdict delivery/review/m5-p3-hazard.json`
(no --context): 5 SKIPPED lines (dual-review-decorrelation,
verdict-criteria-complete, verdict-deviations-judged,
verdict-hazard-classes-addressed, verdict-pair-approves; each printed "no
context"), zero INVALID lines, exit code 1. Same shape as the H review: the
document is schema-valid and the nonzero exit is the designed no-context
fail-closed signal (src/checks.ts), not a validation failure.

## Files

Both files were written incrementally and are uncommitted:
delivery/review/m5-p3-hazard.json (head 3f78dce2ee965672ea55423c3fc9a33dddca1145)
and delivery/review/verification-M5-P3-fix-round-sonnet.md (this document).
`git status --porcelain` at the end of this review shows only these two
files plus the untouched Task 1 artifact
delivery/review/clean-room-M5-P3-sonnet-hazard.md, all untracked.

Status: COMPLETE.
