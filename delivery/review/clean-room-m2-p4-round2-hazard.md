# Clean-room DELTA re-review (hazard lens) -- M2-P4 fix round one

Subject: branch `claude/m2-p4-scope-auditor` @ `c9b00c96c923426ed1da3a2077e02047b17a4095`
Verified checked out: `git rev-parse HEAD` = c9b00c9 (clean `git status --porcelain`).
Merge base with origin/main: `e1390f3195be72c31d73c5707f9957ed9fd85a7e` (branch is behind
latest origin/main; P6 merged after it, expected per the dispatch).
Reviewer: hazard delta re-reviewer, fix round one, findings from CR-1045.
Floor toolchain: node v26.6.0 / npm 11.18.0.

## VERDICT: APPROVE

The HIGH (CR-1045, and CR-1046 which the arbitration folded into the same
mechanism) is closed AT THE MECHANISM. All three witnesses now `error`,
reproduced by independent construction (not merely the phase's own tests).
CR-1047 (medium) closed: all three arms exit 21 with a clean error record.
CR-1046 overclaim corrected. CR-1031 plan-text corrected. Scope clean.
Phase suite 16/16 on both toolchains. No unresolved high or medium.

## True P4 delta (scope audit) -- CLEAN

`git diff --stat e1390f3..HEAD`, 7 files:
- src/gates/scope.ts                                   (declared)
- src/gates/schemas/phase-declaration.schema.json      (declared)
- test/scope-gate.test.ts                              (declared)
- gates.manifest.json                                  (declared)
- test/behaviors.json                                  (declared + standing extra)
- delivery/work-history/m2-p4.md                       (standing extra)
- delivery/plan/kernel-plan-m2.md                      (the one authorized plan-text line, CR-1031)

All within declared files + standing extras + the one plan-text line the
arbitration authorized. No stray paths.

Note (not a finding against the fix): running the REAL gate on this branch
(`tiphys gates run --only scope --base origin/main --head HEAD --phase m2-p4`)
reports RED naming exactly `delivery/plan/kernel-plan-m2.md`, because that
line is an out-of-declaration authorized exception and P4 cannot add it to
its own declaration (read anti-widened from the merge base). Manual scope
audit (this review) overrides it via the arbitration authorization. The RED
doubles as live proof the gate + runner integration work and that
anti-widening reads main's blob (declarationSha256 7cd0bc70..., merge base
e1390f3, 7 paths audited).

## The four cross-checks (src/gates/scope.ts)

1. `--phase` (uppercased) == declaration.id            scope.ts:702
2. currentBranch == declaration.branch                 scope.ts:714
3. merge base is ancestor of self-resolved trunk       scope.ts:629-660
   (origin/main, fallback local main; resolveTrunk :288)
4. resolved --head == `git rev-parse HEAD`             scope.ts:589-620
Plus try/catch on main()'s whole body (:568/:803) and a second at the
invokedDirectly entry (:830) -> EXIT_GATE_ERROR (21), never 1.

## Fix-verification table (independent construction, lab/attack.sh)

| witness | construction | outcome |
|---|---|---|
| baseline honest | --phase m2-p4 --base origin/main, undeclared src/evil.ts | exit 1 red (correct) |
| W1 yardstick swap | --phase m2-p9 on the m2-p4 branch | exit 21 error, caught by CHECK 2 (branch mismatch) |
| W2 merge-base fork | self-widen decl on branch, --base HEAD~1 | exit 21 error, caught by CHECK 3 (not ancestor of origin/main) |
| W2 honest control | same, --base origin/main | exit 1 red (self-widen visible) |
| W3 hide last commit | --head HEAD~1 | exit 21 error, caught by CHECK 4 (resolved head != actual HEAD) |
| CR-1047 arm A | schema absent (copied install) | exit 21 error record (not exit 1) |
| CR-1047 arm B | schema with out-of-keyword-set key | exit 21 error record |
| CR-1047 arm C | named pipe at schema path | exit 21 error record |

W1 is caught by check 2, NOT check 1: naming m2-p9.json reads an
internally-consistent file (id M2-P9 == --phase m2-p9), so check 1 passes;
it is the file's `branch` field (claude/m2-p9-exit) disagreeing with the
checked-out branch that errors. The work history states this correctly.

## Attack table (attacks on the fixes themselves, lab2/lab3)

| attack | construction | outcome | assessment |
|---|---|---|---|
| A: forged branch, id differs from --phase | decl file id M2-P4, branch forged, --phase m2-p88 | exit 21 error via CHECK 1 (id mismatch) | closed |
| B: fully-consistent forged decl on TRUNK | decl on main: id matches filename, branch forged to audited branch | exit 0 GREEN | trust-root residual: requires trunk write + review; audited party does not control main; ACCEPTABLE |
| C: rename branch to another phase's branch | rename local branch to claude/m2-p9-exit, --phase m2-p9 | exit 0 GREEN against permissive m2-p9 | trust anchor is branch identity; impersonating another phase subjects you to that phase's review; ACCEPTABLE |
| D: detached HEAD | checkout sha, honest audit | exit 21 error via CHECK 2 (branch reads "HEAD") | CI concern (CR-1051), see note; NOT this round's blocker |
| E: trunk fallback arm | NO origin remote + poisoned local main, --base HEAD~1 fork | exit 0 GREEN -- fork DEFEATS check 3 | LOW finding, see below |

## Findings

### LOW (new): trunk-ancestry check degrades silently when origin/main is absent
`resolveTrunk` (scope.ts:284-303) tries `origin/main` then falls back to a
local `main`. With origin/main ABSENT and a local `main` the audited party
controls (pointed at the branch tip), the W2 merge-base fork returns GREEN
(lab3/attack3.sh: merge base HEAD~1 is an ancestor of the poisoned local
main). NOT a blocker:
- In every authoritative-audit environment the fix targets, origin/main is
  present (real repo checkout, CI with fetch-depth:0), and when it resolves
  it WINS -- local main is never consulted, so poisoning it is inert (I had
  to delete origin to reach the fallback; verified). The W2 attack is closed
  there (attack.sh W2 -> exit 21).
- The work history already flags the fallback partially ("what the
  derivation did NOT cover", m2-p4.md:838-844), but only for the
  neither-ref-present case, not for origin-absent + poisoned-local-main.
Recommendation for M2-P9 (cheap, non-blocking): record WHICH trunk ref
check 3 resolved against in the result detail/evidence, so an environment
that silently fell back to local main is visible in the bundle; and the CI
wiring must guarantee origin/main is present (which CR-1051 needs anyway).

### INFO / CI note for M2-P9 (CR-1051, not this round's blocker)
Check 2 makes `scope` `error` under a detached-HEAD checkout (the default
`pull_request` checkout shape), because `git rev-parse --abbrev-ref HEAD`
reports `HEAD`, which never equals declaration.branch (attack D, exit 21).
This is `error`, not a silent pass, which is the M2-C-3-correct behavior when
the verdict-establishing property cannot be evaluated. M2-P9/CR-1051 must
wire CI to check out the real branch non-detached AND pass `--phase` and
fetch-depth:0, or `scope` cannot reach a verdict in CI.

### Carried-forward pre-existing LOWs (outside this round's contract)
CR-1049 (dirty working tree invisible in the record) and CR-1050 (duplicate
value flags last-win) from the original hazard review are unchanged; the
arbitration did not require them this round. Non-blocking; note for a future
pass.

## Mutation test (one cross-check, sha256 restore)

Neutered CHECK 3 (`if (!ancestorResult.isAncestor)` -> `if (false && ...)`)
in the wt's scope.ts. Ran the W2 test
(`--test-name-pattern "merge base forked onto the branch"`): the fork now
returns exit 0 (green, "1 changed path(s) audited"), and the test FAILS
(`notStrictEqual` actual 0 expected 0; node-test-exit 1). Restored; sha256
verified identical to pre-mutation (6b5af79718a36679...). The W2 test is a
genuine red witness against the dangerous state, not a tautology.

## M2-P1 integration (real bundle, wtb/e2e.sh)

- `tiphys gates run --manifest gates.manifest.json --only scope ...` on the
  real branch: emits a well-formed GateResult ingested into summary.json
  with all M2-P1 fields (id, status, units 7, unitLabel, vacuous, applicable
  true, detail, record, stdout, stderr). Records validate clean against
  src/gates/schemas/gate-result.schema.json (green + new check-4 error path
  both schema-valid, lab5/validate.sh).
- Missing param via the runner: --base / --head / --phase each absent ->
  bundle exit 21, scope status `error`, applicable false (M2-C-3 held);
  e.g. --base absent detail "gate scope requires --base, which was not
  supplied". requiredParameters (run.ts:367-377) = {base,head,phase}.

## Phase-suite gate numbers

npm ci exit 0; npm run build exit 0; clean `git status` after build (floor
toolchain v26.6.0 / npm 11.18.0).
test/scope-gate.test.ts:
- floor toolchain (v26.6.0): 16 tests, 16 pass, 0 fail, 0 skipped, exit 0.
- default toolchain (v22.22.2): 16 tests, 16 pass, 0 fail, 0 skipped, exit 0.
