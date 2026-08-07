# Clean-room DELTA re-review: M2-P8 fix round one (criteria/regression)

Date: 2026-08-06
Reviewer: fresh clean-room re-reviewer, no implementation-session context
Subject branch: claude/m2-p8-credential-scoping
Head reviewed: bc09a3d26516a07e28cbea82e2f4ce8a45e43783 (fetched, checked
out detached at this exact SHA in a scratch worktree, verified with
`git log -1 --oneline`; verified current with origin/main: merge-base ==
origin/main tip 8439c88)
Findings source: CR-1485 (this round's finding ledger; the fix round this
re-review verifies closes arbitration-m2-p8.md's H1/medium and O1/low,
plus criteria-review lows CR-1350-L1 and CR-1350-L2)
Method: fresh clean-room agent, no exposure to the implementation session.
Executed every criterion myself, restored and reddened the pre-fix source
via `git show` (never `git checkout --`) with sha256 verification of the
restore in both directions, ran the full suite on both toolchains twice
(once via a truncated capture, once via a full uncut log), and ran the M1
exit-test harness in local mode three times to get one clean end-to-end
witness on top of two honest reproductions of a pre-existing, out-of-scope
flake.

## VERDICT: APPROVE

No high or medium findings. All eight original acceptance criteria still
hold; the fix round's two closure claims (H1's vocabulary/behavioral
tripwire, O1's directory re-empty) are independently reproduced red
pre-fix and green post-fix; the two prior lows (CR-1350-L1, CR-1350-L2)
are closed; scope and registry are clean; both toolchains are green except
for a pre-existing, independently-reproduced, out-of-scope timing flake in
untouched files.

## Log

- Beacon created, starting work.
- Checked out bc09a3d in detached scratch worktree, verified clean, verified
  merge-base(origin/main, bc09a3d) == origin/main tip (8439c88) i.e. branch
  current with main.
- Read arbitration-m2-p8.md, clean-room-m2-p8-criteria.md,
  clean-room-m2-p8-hazard.md from claude/m2-phase-reviews.
- Diffed fix round (ef32d2a..HEAD): touches only src/exec/env.ts,
  src/gates/credentials.ts, test/credentials-gate.test.ts,
  test/behaviors.json, delivery/work-history/m2-p8.md. src/spawn.ts
  untouched by the fix commits, as required.
- Read the fix diffs in full (DANGEROUS_ENV_VOCABULARY tripwire,
  git-resolved-config behavioral probe, directory-target re-empty) and the
  work-history fix-round section.
- 3 new behaviors.json keys mechanically confirmed to resolve to exact
  test(...) titles in test/credentials-gate.test.ts.
- Starting gate runs (floor toolchain first) and red-witness re-execution.
- Floor toolchain: npm ci exit 0 (no EBADENGINE), npm run build exit 0, git
  status clean after build.
- Red-witness re-execution (chosen per instruction: GIT_ASKPASS-admitted
  member of the vocabulary-tripwire test, and the env-injected-helper
  test):
  - Pre-fix source restored via `git show ef32d2a:src/gates/credentials.ts
    > src/gates/credentials.ts` (sha256 985ae55f..., matches the ORIGINAL
    criteria review's own recorded mutation-2 restore hash for this same
    file, cross-confirming it is the same pre-fix content that was
    reviewed before).
  - `node --test --test-name-pattern="widened allowlist admitting a git or
    node" test/credentials-gate.test.ts` on pre-fix source: FAIL, actual
    'clean' expected 'resolvable' (the dangerous GREEN state, exactly as
    claimed).
  - `node --test --test-name-pattern="credential.helper injected via the
    GIT_CONFIG_COUNT family" test/credentials-gate.test.ts` on pre-fix
    source: FAIL, "git-resolved-config source must exist" (source did not
    exist pre-fix, exactly as claimed).
  - Restored fixed source via `git show HEAD:src/gates/credentials.ts >
    src/gates/credentials.ts`; sha256 5e65c0bb... (matches pre-mutation
    hash exactly); `git status --porcelain` on the file: empty (identical
    to HEAD).
  - Re-ran both tests: both PASS (2/2) on restored fixed source.
- Full floor-toolchain suite launched in background (host shared with
  other concurrent review agents in this fanout, load average ~28-38,
  confirmed via ps aux showing sibling m2-p3/m2-p4 rereview worktrees
  active); awaiting completion.
- Floor suite (full, uncut log): 233 tests, 230 pass, 3 fail, 0 skipped, 0
  cancelled. Failures: "doctor and the guard return one verdict about one
  beacon" (test/liveness.test.ts:633), "a resident watcher keeps running
  and backs off with growing beacon gaps" (test/watcher.test.ts:269), "the
  heartbeat schedule is on disk and shared by single passes"
  (test/watcher.test.ts:419). All three in files this phase's diff does
  not touch (confirmed: `git diff origin/main...HEAD --name-status`
  contains neither liveness.test.ts nor watcher.test.ts nor their src
  counterparts). `test/credentials-gate.test.ts` run in isolation on the
  same toolchain: 13 tests, 13 pass, 0 fail (10 original + 3 new
  fix-round tests).
- Default toolchain (node v22.22.2) full suite: 233 tests, 228 pass, 3
  fail, 2 skipped (the floor-gated doctor tests, per warning 1), 0
  cancelled. THE SAME THREE test titles fail (doctor-and-guard,
  resident-watcher-backoff, heartbeat-schedule), same two untouched
  files. All credential tests (ok 20, 22, 25-32) pass.
- Registry: relative to CURRENT main (8439c88), test/behaviors.json is a
  pure append: 13 new keys (10 phase + 3 fix-round), 0 removed, 0 changed
  (mechanically diffed). All 13 mechanically confirmed to resolve to an
  exact `test(...)` title somewhere under test/**/*.test.ts (233 titles
  collected, 0 missing).
- Scope audit: `git diff origin/main...HEAD --name-status` is exactly the
  phase declaration's filesToTouch (delivery/plan/phase-declarations/
  m2-p8.json) minus src/hooks.ts (verified legitimately untouched: the
  generated hook script reads only process.argv[2], no process.env) plus
  the one standing extra (delivery/work-history/m2-p8.md). PASS.
- Fix-round-specific scope: `git diff ef32d2a..HEAD --name-status` (the
  merge-to-main commit through the fix-round head) touches ONLY
  src/exec/env.ts, src/gates/credentials.ts, test/credentials-gate.test.ts,
  test/behaviors.json, delivery/work-history/m2-p8.md. src/spawn.ts is NOT
  touched by the fix round, confirmed.
- gates.manifest.json: 0 diff between ef32d2a and HEAD (the fix round did
  not touch the manifest; the two credential entries were already present
  from the original phase and came into HEAD only via the earlier merge
  commit). Precondition kind is command-exit-zero throughout; schema has
  no "env" kind, consistent with both prior reviews.
- C-2 / C-3 / ASCII probes on the fix round's touched files: zero
  process.kill/proc/signal-0/pid; zero detached/unref/daemonize; zero
  non-ASCII bytes.
- Blast radius: DANGEROUS_ENV_VOCABULARY and isDangerousEnvName have no
  consumer outside src/gates/credentials.ts and its own test file.
- CR-1350-L1 (branch behind main): CLOSED. merge-base(HEAD, origin/main)
  == origin/main tip (8439c88); branch is current with main.
- CR-1350-L2 (miscitation): CLOSED. test/exit-test-local.test.ts:1097 is
  confirmed to be an inline comment ("// Local mode must not reach for gh
  at all.") inside the test titled "the stub payload appends, commits as
  the harness identity, and pushes the task branch", matching the
  work-history's corrected citation exactly.
- Criterion 6 (not-applicable naming A-3) re-verified by DIRECT CLI
  invocation (not just via the test suite): `node src/gates/credentials.ts
  credential-token --result ... --evidence ...` with
  TIPHYS_IMPLEMENTER_TOKEN unset: exit 20, status not-applicable, detail
  names both "A-3" and "TIPHYS_IMPLEMENTER_TOKEN", never green. Met.
- Criterion 7 (fail-closed with a token present) re-verified by DIRECT CLI
  invocation with TIPHYS_IMPLEMENTER_TOKEN set to a fake value: exit 21,
  status error (never 0, never 20), detail names A-3 and states the
  refusal to assert against an invented response shape (T-003 lesson 4).
  CI-deferred honestly, not a quiet pass. Met.
- Usage-error contract: `node src/gates/credentials.ts credential-token`
  with no --result/--evidence: exit 64 (matches CLAUDE.md's warning about
  not reading a usage error as a clean result; this was a deliberate probe
  of that exact trap, not an accidental hit of it).
- Criterion 3 re-verified directly: `node --test
  --test-name-pattern="credential-scrub"
  test/credentials-gate.test.ts`: 3/3 pass (the green-staged-danger test,
  the red-unredirected test, and the manifest-registration test).

## M1 exit-test harness, criterion 5, end to end (executed personally)

Attempt 1 (evidence dir m1-exit-evidence-1): FAILED at step A1 (the
harness's own internal `npm test` gate), exit 1. Captured failure is the
IDENTICAL three-test set already isolated above (doctor-and-guard,
resident-watcher-backoff, heartbeat-schedule), same two untouched files
(test/liveness.test.ts, test/watcher.test.ts). This is the same
pre-existing host-load flake this review independently reproduced twice
already on the full suite, not a new failure mode; retrying per the
honest-failure protocol both prior reviews used.

Attempt 2 (evidence dir m1-exit-evidence-2): FAILED at step A1 again, exit
1, but this time only ONE failure ("doctor and the guard return one
verdict about one beacon", test/liveness.test.ts:633), same untouched
file, same flake signature (a beacon-age assertion racing real wall
clock: expected age 13s, observed 14s). 232/233 pass otherwise. Different
member count (1 vs 3) between attempts is itself consistent with a
real-clock timing flake rather than a deterministic regression: a
regression from this phase's diff would reproduce identically every time
since the diff touches neither file.

Attempt 3 (evidence dir m1-exit-evidence-3): **exit 0.** All stages ok:
A1 (npm ci/build/test, all clean this run), A2 (doctor), A3 (lock),
A4 (clone into fleet), A5 (watcher), A6 (spawn/stub payload), A7
(teardown-refused-while-open), A8 (watcher wake), B1 (stub squash
merge substitute), C1-C3 (post-merge teardown, lock release, bundle
validation). Evidence:
  - records/028-A6.json: `tiphys spawn` invoked through the compiled
    `dist/bin/tiphys.js`, exit code 0.
  - records/029-A6.json + output/payload-report.txt: "payload branch
    task/m1-exit", "payload commit 8b08586792ccfde469ec3b928f823365d3936e27",
    "payload pushed file:///tmp/tiphys-m1-exit-Izi3y2/toy-sandbox.git
    task/m1-exit". NO "payload pr" line.
  - session.json: `"prUrl": null`. Confirms local mode's shape (no PR
    created inside the scrubbed child) is unchanged by the fix round,
    exactly as the original criteria review found and the fix round did
    not touch scripts/stub-payload.sh, scripts/m1-exit-test.sh or
    src/spawn.ts.
  - C3 evidence bundle validated; local mode complete.

Criterion 5 (no regression, end to end): MET, personally witnessed to a
clean exit 0, not merely re-read from a transcript. Two of three personal
attempts hit the same pre-existing untouched-file flake (liveness/watcher
real-clock timing) that both prior reviews and this review's own full-suite
runs independently reproduced; the third attempt, on the same unmodified
head, completed cleanly end to end.

## Criteria regression table (plan section M2-P8, criteria 1-8)

All eight re-executed against the fix-round head; none of the eight
regressed relative to the original criteria review, and the fix round's
own changes touch only the environment-probe's tripwire and the directory
re-empty, neither of which the first six criteria's happy-path assertions
exercise differently.

| # | Criterion (paraphrased) | Status | Evidence this round |
|---|---|---|---|
| 1 | Scrubbed dump, redirected pointers, both directions; `--allow-pr-credentials` passthrough | HOLDS | src/spawn.ts unchanged by fix round (confirmed by diff); "spawn scrubs the payload child environment..." and "spawn --allow-pr-credentials passes the parent environment through unchanged" both pass on both toolchains |
| 2 | Allowlist not denylist, both directions | HOLDS | `DEFAULT_CHILD_ENV_ALLOWLIST` unchanged in shape (comment only edited); exact-name match, no prefix rule; suite green |
| 3 | Capability check, own staged dangerous state, units = sources probed | HOLDS, units now 7 not 6 | `CREDENTIAL_SOURCES` grew from 6 to 7 (new `git-resolved-config` source); "credential-scrub is green with units equal to sources probed..." re-executed directly, passes; the criterion's own text ("units equal to the sources probed") is satisfied by construction regardless of the count, and the test asserts `units === CREDENTIAL_SOURCES.length` (data-derived, not hard-coded), so growing the source list is not a threat to the criterion, it is the criterion holding correctly under a legitimate hazard-fix addition |
| 4 | Turn-end hook child witnessed separately | HOLDS | src/spawn.ts's two spawnSync call sites unchanged; "the turn-end hook child receives the same scrubbed environment as the payload" passes |
| 5 | No regression, M1 exit-test local mode end to end | HOLDS | personally re-run to exit 0 (attempt 3), see above; scripts/m1-exit-test.sh and scripts/stub-payload.sh are byte-unchanged by the fix round |
| 6 | `credential-token` not-applicable naming A-3 when absent | HOLDS | direct CLI re-execution this round: exit 20, detail names A-3 and TIPHYS_IMPLEMENTER_TOKEN |
| 7 | `credential-token` fail-closed / CI-deferred honestly with a token present | HOLDS | direct CLI re-execution this round: exit 21 (error), never 0/20, detail names A-3 and the T-003 lesson 4 refusal |
| 8 | `node --test` exits 0, 0 unaccounted, registry criterion holds | HOLDS (modulo the named pre-existing flake) | floor: 233/230/3 fail (pre-existing, untouched files) twice; default: 233/228/3 fail + 2 floor-gated skips, same 3 titles; registry: 13/13 new keys (10 phase + 3 fix-round) resolve exactly, 0 removed, 0 changed |

## The two red-witness re-executions (as instructed: GIT_ASKPASS-admitted, env-injected-helper)

Both performed by restoring the PRE-FIX `src/gates/credentials.ts` via
`git show ef32d2a:src/gates/credentials.ts > src/gates/credentials.ts`
(sha256 `985ae55f224affad81ce948813b5b1d1d99ca125a5c8640db239a2672c1c7508`,
which matches the ORIGINAL criteria review's own recorded restore hash for
mutation 2 on this same file, an independent cross-check that this really
is the pre-fix content that review examined), running the NEW fix-round
test against it, then restoring via `git show
HEAD:src/gates/credentials.ts > src/gates/credentials.ts` (sha256
`5e65c0bb17718a5eb2333217ad48d7687c51d04901da73924ba03e6573e929a6`, and
`git status --porcelain` on the file empty afterward, confirming a
byte-identical restore).

1. **GIT_ASKPASS-admitted** (test: "a widened allowlist admitting a git or
   node credential/exec variable still reddens the environment probe via
   the walked vocabulary tripwire", filtered to the GIT_ASKPASS member via
   `--test-name-pattern`):
   - Pre-fix: FAIL. `AssertionError: actual 'clean', expected 'resolvable'`
     -- the dangerous GREEN state the hazard finding described, reproduced
     directly.
   - Post-fix (restored): PASS.
2. **env-injected-helper** (test: "a credential.helper injected via the
   GIT_CONFIG_COUNT family is caught by the no-scope git resolution probe
   even when the scoped probes miss it and the names are permitted"):
   - Pre-fix: FAIL. `AssertionError: git-resolved-config source must exist`
     (actual false, expected true) -- the source did not exist pre-fix,
     exactly matching the hazard finding's claim that the scoped
     `--global`/`--system` probes structurally cannot see an
     env-injected `credential.helper`.
   - Post-fix (restored): PASS, and the probe's detail carries git's real
     captured output (`PR_CAPABLE_TOKEN`), not a hand-written string.

Both witnesses are genuine: red against the dangerous pre-fix state
(demonstrated, not asserted), green with the fix, and the restore in both
directions is sha256-verified rather than assumed.

## The M1 exit test result (summary)

Personally run three times in local mode on the floor toolchain. Attempts
1 and 2 failed at the harness's own internal `npm test` gate (step A1) on
the identical pre-existing liveness/watcher timing flake independently
reproduced on the full suite runs above (files this phase's diff does not
touch). Attempt 3 completed to **exit 0** with every stage ok, including
A6 (spawn/stub payload under the scrub) captured with `prUrl: null` and no
"payload pr" line in local mode, confirming R-008's shape is unchanged by
the fix round.

## Registry and scope

- `git diff origin/main...HEAD --name-status`: exactly the phase
  declaration's `filesToTouch` minus `src/hooks.ts` (legitimately
  untouched: the generated hook script reads only `process.argv[2]`, no
  `process.env`) plus the one standing extra
  (`delivery/work-history/m2-p8.md`). **Scope audit: PASS.**
- `git diff ef32d2a..HEAD --name-status` (the fix round specifically):
  `src/exec/env.ts`, `src/gates/credentials.ts`,
  `test/credentials-gate.test.ts`, `test/behaviors.json`,
  `delivery/work-history/m2-p8.md`. **`src/spawn.ts` is NOT touched**, as
  the fix-round contract required.
- `gates.manifest.json`: 0 diff between `ef32d2a` and `HEAD`; the fix round
  did not touch the manifest.
- `test/behaviors.json` relative to current `main` (8439c88): pure append,
  13 new keys (10 original phase + 3 fix-round), 0 removed, 0 changed
  (mechanically diffed via a JSON key-set comparison). All 13 mechanically
  confirmed to resolve to an exact `test(...)` title somewhere under
  `test/**/*.test.ts` (233 titles collected via regex scan, 0 missing).

## Gate numbers per toolchain

**Floor toolchain (node v26.6.0, npm 11.18.0, first on PATH):**
- `npm ci`: exit 0, no EBADENGINE line.
- `npm run build`: exit 0; `git status --porcelain` empty after.
- Full suite (uncut log): **233 tests, 230 pass, 3 fail, 0 skipped, 0
  cancelled.** Failures: "doctor and the guard return one verdict about
  one beacon" (test/liveness.test.ts:633), "a resident watcher keeps
  running and backs off with growing beacon gaps" (test/watcher.test.ts:269),
  "the heartbeat schedule is on disk and shared by single passes"
  (test/watcher.test.ts:419). Reproduced identically in an earlier
  truncated run of the same command. None of the three files touched by
  this phase's diff.
- `test/credentials-gate.test.ts` in isolation: **13 tests, 13 pass, 0
  fail** (10 original + 3 fix-round).
- M1 exit-test harness, `--mode local`: 2 honest reproductions of the
  above flake at step A1, 1 clean exit 0 (see above).

**Default toolchain (node v22.22.2, the container default):**
- `npm ci`: exit 0, EBADENGINE warning present as expected (floor is
  `>=26`).
- `npm run build`: exit 0; `git status --porcelain` empty after.
- Full suite: **233 tests, 228 pass, 3 fail, 2 skipped, 0 cancelled.** The
  2 skips are the floor-gated doctor tests ("doctor in a healthy fleet
  exits 0", "doctor with gh absent exits 0 under the generic profile"),
  each carrying an explicit SKIP reason naming the floor. The 3 failures
  are the SAME three test titles as the floor toolchain, same two
  untouched files.
- Credential tests (`ok 20, 22, 25-32` in the TAP log): all pass.

The implementer's own claimed 233/233/0 clean run is plausible but not
reproduced by this review; both of this review's independent full-suite
runs on both toolchains hit the SAME 3 pre-existing failures in the SAME
two untouched files, consistent with a real-clock host-load timing flake
(this host measured load average 25-38 throughout, with sibling
clean-room re-review agents for other M2 phases running concurrently,
confirmed via `ps aux`) rather than anything this phase's diff caused.
This disposition matches both prior reviews' independent conclusions.

## Probes run (including empty-handed ones)

- `grep` for `process.kill`, `/proc`, `signal-0`, `process.pid` in the fix
  round's touched files: zero matches (C-2 compliant).
- `grep` for `detached`, `unref`, `daemonize`: zero matches (C-3
  compliant).
- `grep -rlP '[^\x00-\x7F]'` over the fix round's touched authored files:
  zero hits (ASCII-clean).
- Searched for any consumer of `DANGEROUS_ENV_VOCABULARY` or
  `isDangerousEnvName` outside `src/gates/credentials.ts` and its own test
  file: none found (no blast radius beyond the two files the fix round
  touches).
- Ran the fix-round's own binding claim grep
  (`grep -nEi 'cannot be|impossible|needs a|is covered|catches|would
  catch|recovers|anyway|always|never|no way to' delivery/work-history/
  m2-p8.md`) myself: every NEW hit the fix round introduced (lines 328,
  624) already carries the fix round's own adjacent disposition citing a
  captured command or stating a residue as an open limit, not an
  unsupported absolute. No hit found that the work history's own claim-grep
  section missed.
- Attempted the M1 exit test three times rather than stopping at the first
  failure and reporting it as a phase defect without checking whether it
  was environmental; the third attempt is a real, unforced exit 0 on the
  unmodified fix-round head.
- Did not re-derive the full "every child-launch call site" enumeration
  independently; relied on the original criteria review's confirmation
  (pool.ts, doctor.ts, init.ts, teardown.ts dispositions) since the fix
  round's diff does not touch any spawn call site and that derivation is
  therefore unaffected by this delta.

## Honest-failure section

- I could not get a clean full-suite run or a clean M1-exit-test run on
  the first attempt on this shared, heavily loaded host (2 of 3 exit-test
  attempts and both full-suite toolchain runs hit the same liveness/watcher
  timing flake at least once). I do not read this as a finding: the
  failing titles are always the same small set in two files this phase's
  diff never touches, the failure signature (a beacon-age assertion
  racing real wall clock, or a beacon-write-count assertion under
  contention) is a real-clock timing race consistent with CLAUDE.md's own
  standing warning 11 ("suite wall time grows with real-clock lease
  waits"), and a clean run was obtained on the unmodified head on the
  third attempt without any code or environment change between attempts.
- I did not attempt to force criterion 7's live-token green arm (no A-3
  token exists in this environment); I verified the fail-closed shape
  directly by CLI instead, which is exactly what the plan says is
  available before A-3 lands.

## Deviations (unchanged by this fix round, re-confirmed still apply)

The five deviations the original criteria review judged (the
`SpawnOptions.allowPrCredentials` library-boundary placement, the
ephemeral-vs-persisted scrub root asymmetry, `credential-token`'s
fail-closed `error` status, the fourth red-class member, and the
"gates as modules" non-deviation) are all outside the fix round's diff
and re-confirmed unaffected: `grep -rn "allowPrCredentials"
src/commands/` still returns nothing, and `src/spawn.ts` is byte-unchanged
by the fix commits.

## Closing note

Working tree left clean at the reviewed head (bc09a3d), `git status
--porcelain` empty. No files were modified in the reviewed worktree
beyond the two deliberate, sha256-verified mutate/restore cycles on
`src/gates/credentials.ts` used for the red-witness re-execution, both
fully reverted.

Status: COMPLETE.
