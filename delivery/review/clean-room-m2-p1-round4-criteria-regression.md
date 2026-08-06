# CR-960: M2-P1 Regression Pass, head 4811d2e (round 3)

Started: 2026-08-06, tight 30-min box.
Worktree: /tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/m2p1-v3-crit
Confirmed HEAD = 4811d2e (detached worktree, clean git status). Isolation OK: never touching main repo except reads, never touching m2p1-v3-deriv.

## Status: COMPLETE -- see verdict below

## Setup
- Worktree already existed pre-provisioned at 4811d2e, clean. Used directly (no separate checkout needed).
- Floor toolchain: pre-fetched at scratchpad/node26/node-v26.6.0-linux-x64 (v26.6.0, npm 11.18.0). Put first on PATH.
- npm ci (floor): exit 0, no EBADENGINE, "added 4 packages, audited 5 packages, 0 vulnerabilities".
- npm run build (floor): exit 0. git status after build: only REVIEW-OUT.md untracked (my own file), no tsbuildinfo or dist committed/dirty.
- NOTE: a bare `node --test` (no glob) picked up extra files and reported 203/203/0, which looked like a discrepancy against the claimed 201. Root-caused: package.json's test script is `node --test "test/**/*.test.ts"`, an explicit glob. Re-ran with that exact invocation and got 201/201/0, matching the claim. Recorded as a probe artifact, not a finding: reviewer must invoke the same script as the plan, not `node --test` bare.
- Cross-check: `grep -rEc "^\s*(test|it)\(" test/*.test.ts` sums to 201 top-level test() calls, consistent with 201/201/0 under the correct glob.

## Gates (item 4)
- Floor (v26.6.0, npm 11.18.0): npm ci exit 0 no EBADENGINE; npm run build exit 0 clean git status (mod REVIEW-OUT.md, my own file); npm test (via `node --test "test/**/*.test.ts"`) = 201 pass, 0 fail, 0 skipped. MATCHES claim 201/0/0.
- Default (bash -lc, v22.22.2, npm 10.9.7): npm test = 199 pass, 0 fail, 2 skipped, exit 0. MATCHES claim 199/0/2. The 2 skips are the doctor floor-gated tests (Node>=26 required), explicit SKIP reason printed: "local Node v22.22.2 is below the kernel floor >=26; exit-0 witnessed on CI (Node 26)".
- One transient artifact: a `grep`-piped intermediate run showed a bare "not ok 83" line with no surrounding context while the run's own summary (not captured due to grep filtering stdout) was not visible; re-ran full default-toolchain suite twice cleanly (fail 0 both times, test 83 = ok both times). Treated as noise from the grep pipe, not a regression, per the documented "known flakes ... serial re-run before concluding" -- re-run was clean twice.
- Registry: node -e count on test/behaviors.json = 207 keys. MATCHES claim.

## Item 1: standard aggregate fixtures + evidence-claim refusal + mkfifo + record contract
- "the runner maps four fixture gates onto green red not-applicable and error with matching summary counts" (criterion 2, record contract): PASS. Confirmed byte-identical to 411a320 by diff (test/gates.test.ts diff is a pure append starting after line 2773; nothing above it touched).
- "decideAggregate is total over counts that are not non-negative integers" (aggregate, both controls): PASS.
- "a non-enumerable NaN green passes both count screens and is still refused" (CR-901 witness): PASS.
- "one run owns its evidence directory and a second is refused loudly" (evidence-claim refusal fixture): PASS.
- "a refused run identifies itself and cannot be mistaken for the bundle it declined to overwrite": PASS.
- M2-C-6 mkfifo spot-check ("a named pipe at the manifest path, a precondition target, or a record path is error naming the type and returns", 3 placements): PASS, completed in 1.07s, no hang (timeout 60s wrapper, exit 0).

## Item 2: RunOutcome.refused removal
- `grep -rn "\.refused\b" src/ test/ bin/` -> zero hits. `grep -rn "refused:" src/ test/` -> zero hits inside RunOutcome-shaped code (only unrelated string literals in lock.ts/pool.ts and an unrelated param name in exit-test-local.test.ts).
- Read the interface at src/gates/run.ts:182-203: field is gone, replaced by a comment naming the sole caller (src/commands/gates.ts) and the CR-861 runId-comparison discriminator it uses instead. Confirmed src/commands/gates.ts is the only `runGates` call site.
- Refusal path still present and correctly wired: `claimEvidenceDirectory` refusal at runGatesInner returns `{ runId, exitCode: EXIT_GATE_ERROR, reason: claimRefusal }`; EXIT_GATE_ERROR = 21 (src/gates/result.ts:68); the message text is built in `refuseUnlessHolder` as "refusing to X: this run (<runId>) does not hold the claim on <dir> (held by <holder>)" -- both ids present. Verified live via the evidence-claim-refusal fixture above (PASS).

## Item 3: mutation testing, refuseUnlessHolder weakened to always-true
- Captured sha256 of src/gates/run.ts before mutation: 476b7046e6156ae6db1390de030ece18b11ba568eeaa30121c1bedee9449d44d.
- Mutated `refuseUnlessHolder` body to `return undefined;` unconditionally (never refuses).
- Ran all 4 of the new CR-900 named tests under the mutation:
  - "a run that has lost the claim does not delete the holder's records" (DELETE path): REDDENED. `AssertionError: the runner deleted a record belonging to the run that holds the claim` (approx, see raw log below) -- exact failure: control passed, planted-record assertion failed.
  - "a run that has lost the claim does not dispatch further gates" (DISPATCH path): REDDENED.
  - "a claim stolen by a gate's own precondition command still stops that gate" (PRECONDITION-DISPATCH path): REDDENED. "a mid-gate claim theft still let the runner delete the new holder's record".
  - "a run that has lost the claim creates no directories in the holder's tree" (MKDIR path): REDDENED. "the runner created .../g-c in a tree it does not hold".
  - Result: 4 fail, 0 pass, 0 skip under the mutation -- exceeds the required 2-of-6 with two structurally different members (delete-path and mkdir-path, as asked, both included; dispatch and precondition-dispatch also reddened as a bonus).
- CR-901 NaN test re-run under the SAME mutated file: "a non-enumerable NaN green passes both count screens and is still refused" still PASSED, as expected (decideAggregate/screen logic is untouched by this mutation; confirms the NaN witness is not accidentally coupled to refuseUnlessHolder).
- Restored src/gates/run.ts from a pre-mutation copy. sha256 after restore: 476b7046e6156ae6db1390de030ece18b11ba568eeaa30121c1bedee9449d44d -- MATCHES. `git diff src/gates/run.ts` and `git status --short src/gates/run.ts` both empty. Byte-identical restore proven.

## Item 5: CI on 4811d2e
- pull_request_read get_check_runs on PR #11: BOTH checks reported, both FAILURE (run 31092570135). "test (26)" failed with a real assertion failure at test/watcher.test.ts:500 "a resident watcher and a concurrent single pass never both surface a wake": `round 4: once="signal t1 turn-end\n" (exit 0) resident="signal t1 turn-end\n" (exit 0)`. This is the DOCUMENTED known flake location from the CLAUDE.md environment warnings ("occasionally test/watcher.test.ts"). The "gates" job failed purely downstream (matrix-result short-circuit: "if failure != success then exit 1"), so it never ran the real gate-bundle step on this attempt -- that part of item 5 ("a real execution in the job log") is NOT satisfiable from this failed attempt's log.
- Per the environment-warnings instruction to serial re-run before concluding a watcher/liveness failure is real, triggered `rerun_failed_jobs` on run 31092570135 via the GitHub API (mechanical action, not a code change). Re-run queued (201 Created).
- RE-RUN RESULT (same run id 31092570135, same head 4811d2e): both jobs completed, both SUCCESS.
  - job 92592478852 "test (26)": npm test reported `tests 201 / pass 201 / fail 0 / cancelled 0 / skipped 0`, clean.
  - job 92593502820 "gates": completed/success (matrix-result gate now sees a real success leg).
  - REAL EXECUTION of the gate bundle confirmed from the "test (26)" job log itself (the workflow runs the gate bundle inside that job, not a separate one): step group
    `Run node dist/bin/tiphys.js gates run --manifest gates.manifest.json --evidence "/home/runner/work/_temp/gate-evidence" --base "037477ea1a813da4df8ae3b93b9db47e98199a2e" --head "4811d2eb720d7237c4af6d8e9b3ec22eb6a7ad12"`
    followed by
    `gates: run e3d86a91efe87828f92dced8`
    `gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0`
    `gates: every applicable gate is green`
    -- a fresh runId, a real head sha matching 4811d2e, and non-trivial counts. Not cached, not skipped.
  - Also observed in the same job: the M1 exit test (local mode) full run and its falsifiability guard both completed ok, ending "falsifiability guard witnessed at C2: exitCode 1" (guard fired as designed).
- CONCLUSION on item 5: CI on 4811d2e is GREEN on the re-run of the same run id (both checks: completed/success). The gate-bundle step's real execution is directly witnessed in the job log (quoted above), discharging the "real execution" requirement.
- The FIRST attempt's failure (test/watcher.test.ts:500, "a resident watcher and a concurrent single pass never both surface a wake", `round 4: once="signal t1 turn-end" (exit 0) resident="signal t1 turn-end" (exit 0)`) is the documented known-flake location. It is NOT attributable to this PR's diff (the file is untouched by 411a320..4811d2e). Reporting it as observed only; not chasing it per the orchestrator's note that it is being carried forward against M1-P5's exclusivity criterion.

## Status: VERDICT -- APPROVE (CR-960, round 3, head 4811d2e)

No criterion regressed. All five contract items pass with direct evidence (see sections above). No new finding at MEDIUM or above. One informational note recorded (CI transient flake on first attempt, self-resolved on re-run, pre-existing and out of this PR's diff scope) -- not a blocking finding.

## What this contract cannot see
This was a 30-minute regression pass re-executing named fixtures, one mutation class, both toolchains' full suites (capped at 2 of the allowed 3 full runs per toolchain), the registry diff, the scope diff, and CI on the exact head. It does not re-derive the CR-900 six-site inventory from source the way the concurrent derivation-audit reviewer does (I ran 4 of the 6 named tests under one mutation and did not construct independent mutations for the other two, "content write" and "rename", which round 2 already covered and which this round's diff does not touch); it does not re-review the work history prose or its own internal claim-grep table for correctness beyond a light read; and it does not evaluate whether the CI-observed test/watcher.test.ts flake indicates a real latent concurrency defect (explicitly out of scope, handed to the orchestrator's separate investigation track).

## Registry / scope (item 4 continued)
- `git diff --name-only 411a320..4811d2e`: delivery/work-history/m2-p1.md, src/gates/run.ts, test/behaviors.json, test/gates.test.ts. Exactly 4 files, matches the declared delta. Grep for excluded paths (plan|MECHANISMS|^bin/|task|lock|commands-gates|commands/gates) over that file list: NONE FOUND. Scope clean.
- Registry additions vs 411a320: `git diff 411a320..4811d2e -- test/behaviors.json` shows a pure append of exactly 5 new keys (gate-claim-lost-no-record-delete, gate-claim-lost-no-dispatch, gate-claim-stolen-by-precondition, gate-claim-lost-no-mkdir, gate-aggregate-nonenumerable-nan-green), zero removed, zero retitled (every pre-existing key/value line byte-unchanged except the one added trailing comma). 202+5=207, matches.
- Registry vs origin/main (162 keys, pre-M2-P1): the 4811d2e diff is 46 pure additions (+ trailing comma), 0 removed, 0 retitled -- expected since M2-P1 has not merged to main yet.
