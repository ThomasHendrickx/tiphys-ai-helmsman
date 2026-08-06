# CR-920: PR #11 fix round 2 review (criteria-contract lane)

Branch claude/m2-p1-gate-contract-and-runner, head 411a320
Previous reviewed head 3c7970b (all criteria MET, amended plan)
Start: 2026-08-06, time-boxed ~40 min

STATUS: IN PROGRESS

## Setup
- worktree at 411a320, detached, clean, isolated per T-004.
- Floor toolchain fetched: node v26.6.0 / npm 11.18.0 (not cached, downloaded fresh from nodejs.org).
- Default toolchain: node v22.22.2 (via /opt/node22, login shell resolution).
- npm ci: exit 0. npm run build: exit 0, git status clean after (only REVIEW-OUT.md untracked).

## Gate run 1 (floor, dist present, npm test script)
node v26.6.0, `npm test` (scoped to test/**/*.test.ts) -> tests 196, pass 196, fail 0, skip 0.
Matches work-history claim (line 1632) exactly.

NOTE (self-correction, logged for transparency): an earlier bare `node --test`
(no path arg) run from repo root returned 198 pass, 0 fail, 0 skip -- a false
alarm. Root cause: bare `node --test` recursively globs from cwd and also
picked up `sandbox/test/greet.test.js` (2 tests, pre-existing since M1-P6,
7e1b5f1, unrelated to this phase). package.json's "test" script explicitly
scopes to `"test/**/*.test.ts"`, which excludes sandbox/. Re-ran with the
actual npm test script/glob and got exactly 196/0/0, matching the claim.
Per-file counts sum to 196 (2+14+10+35+7+17+26+5+29+15+13+23), confirming.

## Gate numbers -- all three reproduced independently, exact match
| Toolchain | State | Claimed | Reproduced |
|---|---|---|---|
| floor v26.6.0 | dist present | 196/0/0 | 196/0/0 MATCH |
| floor v26.6.0 | dist removed | 191/0/5 | 191/0/5 MATCH |
| default v22.22.2 (bash -lc) | dist present | 194/0/2 | 194/0/2 MATCH |

npm ci and npm run build both exit 0 on floor; git status clean after build
(only REVIEW-OUT.md, our own artifact, untracked).

## Claim grep -- byte-identical, verified
Ran: git show 9d0ad8b:delivery/work-history/m2-p1.md | grep -nEi '...' -> 33 lines.
Compared against the pasted block (delivery/work-history/m2-p1.md lines
1732-1764) after applying the stated 125-column truncation: diff is empty.
BYTE-IDENTICAL, 33/33, as claimed. Disposition table accounts for all 33
(16 self-reference lines inside the file's own transcripts, 17 substantive
hits each individually dispositioned: 11 carried from round 1 unchanged + 6
new this round). Spot-checked 3 of the 6 new dispositions (1482, 1500/1515,
1567) against the cited evidence in the file; each names a concrete artifact
(a test id, a derivation, or a git cat-file/od byte dump), not a bare assertion.

## Scope audit
git diff --name-only 3c7970b..411a320:
  delivery/work-history/m2-p1.md
  src/commands/gates.ts
  src/gates/run.ts
  test/behaviors.json
  test/gates.test.ts
All within envelope (src/gates + src/commands/gates.ts + their test, work
history, registry). No plan, MECHANISMS.md, bin, task, or lock file touched.

## Mutation table (all restores confirmed byte-identical via diff against
## a pre-mutation copy; suite green 196/0/0 after each restore; final
## restore re-verified with a full rebuild + test run)

| # | Mechanism | Mutation | Named test(s) | Result |
|---|---|---|---|---|
| 1 | holdership-verifying release (CR-860) | `releaseEvidenceDirectory`: removed the `if (holder !== runId) return false;` guard, unlinking unconditionally | "a run releases only the claim it holds, and writes nothing after releasing" | REDDENS. 195 pass, 1 fail (exactly this test). Failure: `runModule.releaseEvidenceDirectory(foreign, "not-mine")` returned true instead of false. |
| 2 | writeInsideClaim (CR-860, the other half) | `writeSummaryAtomically`: staged write bypasses `writeInsideClaim`, calls `guardedWrite` directly (no holdership check) | same test, member (c) (claim lost mid-run / thief scenario) | REDDENS. 195 pass, 1 fail (same test, different assertion): expected stderr to match /does not hold the claim/, got "gates: 1 gate(s) reported error: g-thief" -- the summary was written into a directory the run no longer held. |
| 3 | runId stdout line (CR-861) | `cmdRun`: commented out `process.stdout.write(gates: run ...)` | "a refused run identifies itself and cannot be mistaken for the bundle it declined to overwrite" AND "a run releases only the claim it holds..." AND "the compiled entry resolves its schema documents and behaves identically to the source entry" | REDDENS, 3 structurally different call sites (a fresh run, a refused run, and the dist-vs-source parity fixture). 193 pass, 3 fail. |
| 4 | decideAggregate totality (CR-862) | `decideAggregate`: replaced the `badCounts` computation with `const badCounts: string[] = []` (screens disabled) | "decideAggregate is total over counts that are not non-negative integers" | REDDENS. 195 pass, 1 fail (only this test): NaN/negative/undefined/missing/fractional/Infinity green all exited 0 with "every applicable gate is green" instead of failing closed. |

All four mutations were scoped to exactly the mechanism named, isolated to one
call site or one guard each, and each reddened only the test(s) whose
disposition table cites that mechanism (no collateral failures beyond the
stdout-line class, which legitimately spans three tests as CLAUDE.md's
"one witness is not a class" rule requires -- two structurally different
consumers of the stdout line plus the dist/source parity fixture).

## CI on 411a320
PR #11 head confirmed 411a320c129caefbe3526503965a8dd454615a8b via pull_request_read.
Both checks completed, conclusion success:
  - "gates" (fan-in): success. Its own log is only "all matrix legs succeeded"
    (a gate over the matrix, not the gate bundle itself).
  - "test (26)": success. Retrieved the raw job log and confirmed the actual
    gate-bundle step executed (not skipped): at 09:12:06 the job ran
    `node dist/bin/tiphys.js gates run --manifest gates.manifest.json
    --evidence <path> --base 037477ea1a813da4df8ae3b93b9db47e98199a2e --head
    411a320c...`, base being main's actual merge-base sha and head the PR
    head, and it printed to stdout:
      gates: run 80b46d4f9b60dad770830172
      gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
      gates: every applicable gate is green
    This is CR-861's stdout runId line, live in CI, and confirms the step is
    a real execution against real base/head shas, not a stub.

## Record contract vs the new stdout line (criterion 2 check)
Plan criterion 2 (kernel-plan-m2.md, M2-P1 acceptance criteria) pins the
EVIDENCE and summary.json contract only: exactly four records with the
mapped statuses, and summary.json's declared/applicable/green/red/
not-applicable/error/vacuous counts. It does not pin any stdout text or
format anywhere in M2-P1's 16 acceptance criteria. The new `gates: run <id>`
line (CR-861) is additional stdout, printed before the existing
`gates: declared ...` line already present at 3c7970b. It does not alter
summary.json or the evidence records at all (confirmed by reading run.ts:
the line is emitted only in src/commands/gates.ts's cmdRun, entirely
downstream of and separate from summary construction). CONCLUSION: not a
deviation from any pinned criterion; no declaration is needed.

## Aggregate fixtures (delta-exposed criteria re-run)
Re-ran the full suite (which includes the fixture-manifest tests for
criteria 2-10) three times total across this round (dist-present floor,
dist-removed floor, default toolchain) plus four mutation rounds and one
final restore-confirmation run: all green at 196/0/0 (dist present) on both
toolchains, matching the claimed numbers exactly. The evidence-claim refusal
fixture ("a refused run identifies itself...") and the CR-860 aggregate
fixture ("a run releases only the claim it holds...") both re-verified green
in isolation via --test-name-pattern, and both reddened correctly under
their respective targeted mutations (see mutation table).

## What this contract cannot see (one paragraph)
This pass verifies that the delta's five stated fixes (CR-860 release
holdership, CR-860 write holdership, CR-861 stdout attribution, CR-862
totality, CR-864/865 record corrections) are each backed by a test that
reddens under a scoped mutation of the exact mechanism named, that the
gate numbers and registry are honestly reported, that the claim-grep is
byte-identical and its dispositions cite real artifacts, and that CI ran a
real gate-bundle invocation. It does NOT re-derive whether CR-860/861/862
were the ONLY instances of their mechanisms in this file (that derivation
duty belongs to the fix round's own work history, and I spot-checked
rather than re-ran its enumeration commands); it does not evaluate the
hazard class per M2-D-18 (a concurrent hazard reviewer's job, T-007); and
it does not test true concurrent contention between two real OS processes
racing on the same evidence directory (the codebase's own fixtures use a
deterministic staged-claim-file substitute for the race, as their own
comments state, and I did not attempt a real two-process race under load
in this time-box).

## VERDICT: APPROVE

All five re-executed criteria-contract items hold at 411a320: gate numbers
exact match (196/0/0 floor dist-present, 191/0/5 floor dist-removed,
194/0/2 default), registry 202/0 unresolved/3 added with no removals or
retitles against both 3c7970b and origin/main, scope diff clean (5 files,
all in envelope), claim-grep byte-identical 33/33 with a real disposition
for every hit, all four required mutations reddened the exact named
mechanism and restored byte-identical with the suite returning to
196/0/0, the new stdout runId line does not violate any pinned criterion,
and CI on 411a320 is green on both checks with the gate-bundle step
verified as a real execution (real base/head shas, real stdout).

No new findings raised in this round.
