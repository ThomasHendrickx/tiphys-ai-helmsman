# Clean-Room DELTA Re-Review (criteria/regression) - M2-P7 Fix Round 1

Status: COMPLETE
VERDICT: APPROVE
Reviewer: criteria/regression re-reviewer (independent of CR-1455 author)
Subject: branch claude/m2-p7-deploy-and-migration-verifiers, expected head 6e31fa0

## Log

- Beginning setup: fetch branch, verify head, read governing docs.
- Fetched origin/claude/m2-p7-deploy-and-migration-verifiers, origin/claude/m2-phase-reviews, origin/main.
- Head confirmed: 6e31fa093e846f1de5147705392d8705f580cab0 (matches "6e31fa0"). Checked out clean (`git checkout -B` from origin ref).
- Current with origin/main confirmed: `git merge-base origin/main origin/claude/m2-p7-...` == origin/main's own rev (8439c884...), i.e. the P7 branch already contains all of main (fully rebased/merged, per fix-round note "head merged onto origin/main FIRST").
- Read CLAUDE.md (already in context), DR-0014 (delivery/decisions/DR-0014-release-verification-interface.md, from origin/main), arbitration-m2-p7.md and clean-room-m2-p7-criteria.md (from origin/claude/m2-phase-reviews).
- NOTE: the original criteria review document's own self-assigned id is "CR-1320" (delivery/review/clean-room-m2-p7-criteria.md header), not "CR-1455" as named in the dispatch. Searched origin/claude/m2-phase-reviews for the literal string "1455": zero hits anywhere in that branch. Proceeding against CR-1320 (the only criteria-contract review document that exists for M2-P7) and the arbitration doc's FIX-ROUND-NEEDED verdict, since these are the only artifacts that match the described content (12 criteria, killSignal seam, test #17 low). Flagging the id mismatch for the orchestrator; not treating it as a blocker.
- Read the fix-round work history (delivery/work-history/m2-p7.md, "# Fix round one" section) at head 6e31fa0: addresses CR-P7H-1 (HIGH, guardedEvidenceWrite), CR-P7H-2 (MEDIUM, checksum-absent surfacing), CR-P7H-3 (MEDIUM, encoded-secret redaction), and the criteria-contract LOW (attemptTimeoutMs 2000->5000 in test/deploy-gate.test.ts).
- Proceeding to: gates both toolchains, scope diff, registry diff, two independent red-witness re-executions, criteria regression walk.

## Scope audit

`git diff --name-status origin/main...HEAD`: 19 files (matches P7's declared
filesToTouch exactly plus the one standing extra delivery/work-history/m2-p7.md).
`git diff --name-status 357770a..6e31fa0` (the fix round's OWN commit, parent is
the merge-onto-main commit): 7 files, all declared: delivery/work-history/m2-p7.md,
src/gates/adapters/migrations-command.ts, src/gates/release.ts, test/behaviors.json,
test/deploy-gate.test.ts, test/migration-gate.test.ts, test/release-contract.test.ts.
gates.manifest.json's union entry landed in the MERGE commit 357770a itself, not
the fix commit, consistent with the work history's own claim ("the merge union,
pre-authorized"). test/gates.test.ts is UNTOUCHED by both the fix-round diff and
the full origin/main...HEAD diff (empty `git diff --name-status` on that path both
ways) -- confirms killSignal was not resolved by editing M2-P1's test.
VERDICT: scope PASSES exactly.

## attemptTimeoutMs change, isolated

`git diff 357770a..6e31fa0 -- test/deploy-gate.test.ts` shows exactly one
substantive line changed: `attemptTimeoutMs: 2000` -> `attemptTimeoutMs: 5000`
(plus explanatory comments), in test/deploy-gate.test.ts only. No source file
(src/gates/release.ts, migrations-command.ts) touches attemptTimeoutMs. Confirmed
test-only.

## Registry (test/behaviors.json), pure union

Programmatic diff (node JSON.parse, 357770a vs 6e31fa0): before 270 keys, after
273 keys. Added: release-kernel-evidence-write-fifo-bounded,
release-encoded-credential-redaction, migrations-checksum-absent-surfaced.
Removed: 0. Changed existing values: 0. All three new keys' VALUES verified to
match an EXACT test title via grep -F against test/release-contract.test.ts
(lines 492, 666) and test/migration-gate.test.ts (line 252). VERDICT: pure
append-only union, resolves by exact title, PASSES.

## Gates, default toolchain (node v22.22.2, login shell)

- npm ci: exit 0 (EBADENGINE warning present, as expected).
- npm run build: exit 0; git status --porcelain clean after.
- Isolated phase tests (test/deploy-gate.test.ts + migration-gate.test.ts +
  release-contract.test.ts), run TWICE: 47/47 pass, 0 fail, both runs (was 44
  pre-fix + 3 new fix-round witnesses = 47, confirmed).
- Full suite (`npm test`, this exact head 6e31fa0, wall time ~212.5s this run):
  **267 tests, 265 pass, 0 fail, 2 skipped.** The 2 skipped are confirmed (grep
  "# SKIP") to be the pre-existing floor-gated doctor tests ("doctor in a
  healthy fleet exits 0" / "doctor with gh absent exits 0 under the generic
  profile", both "local Node v22.22.2 is below the kernel floor >=26"), nothing
  to do with P7. ZERO failures this run -- better than the implementer's own
  "267/267" claim being merely matched; no watcher/liveness flake surfaced in
  this run at all.

## Gates, floor toolchain (node v26.6.0, scratch prefix on PATH)

- npm ci: exit 0, ZERO EBADENGINE lines (grep confirmed).
- npm run build: exit 0; git status --porcelain clean after.
- Isolated phase tests, one run: 47/47 pass, 0 fail, 0 skipped.
- Full suite (`npm test`): **267 tests, 264 pass, 3 fail, 0 cancelled, 0
  skipped** (floor toolchain runs the floor-gated tests too, so 0 skipped is
  expected here vs 2 skipped on default).
  Failures: "doctor and the guard return one verdict about one beacon"
  (test/liveness.test.ts:633), "a resident watcher keeps running and backs
  off with growing beacon gaps" and "the heartbeat schedule is on disk and
  shared by single passes" (test/watcher.test.ts).

  Investigated, not merely asserted pre-existing:
  - `git diff --name-only origin/main...HEAD -- test/liveness.test.ts
    test/watcher.test.ts`: EMPTY. Both files are untouched by this phase
    (confirmed, not merely by declaration).
  - The beacon-age failure's actual assertion, read directly
    (test/liveness.test.ts:670): a literal regex `/age 13s/`; the captured
    failure message shows the real observed value `CHECK beacon PASS beacon
    present, age 14s (freshness threshold 901s)`. This is the exact CR-762
    real-clock beacon-age mechanism (a hardcoded expected age racing wall
    clock under host contention), the same failure signature the original
    criteria review (CR-1320) and the fix-round work history both
    independently recorded for this identical test.
  - Re-ran `node --test test/liveness.test.ts test/watcher.test.ts` in
    ISOLATION (no other phase files) on the floor toolchain: same 3 failures
    reproduced verbatim (same test names, same "0 !== 3" / "age 14s"
    signatures), 37/40 pass. `ps aux | grep -c "npm test"` at the time showed
    14 concurrent npm-test-related processes on this shared box (other
    sibling M2-phase review sessions), confirming the heavy-contention
    precondition CR-762's mechanism requires is actually present right now,
    not hypothesized.
  - CONCLUSION: these 3 failures are the documented pre-existing real-clock
    flake class (CR-762 / the watcher-cadence family), in files this phase
    does not touch, reproducing under measured heavy concurrent load exactly
    as their own documented mechanism predicts. Not attributable to the P7
    fix round. This matches (a strict subset of) the failure family the
    original criteria review and the arbitration document both already
    anticipated for this milestone's shared-box contention.
  - Default-toolchain full suite (above) happened to show ZERO failures at
    all (lower contention at that moment); the floor-toolchain run above hit
    higher contention (14 concurrent suites) and surfaced 3 of the same known
    flakes. Neither run showed any NEW failure outside this pre-documented
    family, and P7's OWN 47 tests were 100% green on every run, both
    toolchains, isolated and full-suite.

## Two independent red-witness re-executions (FIFO-hang + one other)

Method per instruction: sha256 baseline of post-fix src file, swap in the
PRE-FIX (commit 357770a) content, run the specific new test via
--test-name-pattern (before the path, per warning 7), confirm RED, restore
the exact post-fix bytes from a backup copy (never `git checkout --`), verify
sha256 match + clean `git status --porcelain`, re-run, confirm GREEN.

### 1. CR-P7H-1 FIFO-hang witness: "release kernel-side evidence writes refuse a planted FIFO and return bounded" (test/release-contract.test.ts:491)

- Baseline sha256 src/gates/release.ts (post-fix): e4c27bdf3f428ed31d1f7bcd063cb710aedbccd68c2df93e9450c087714c4edb
- Swapped in `git show 357770a:src/gates/release.ts` (pre-fix, sha256
  bc4c5e480b9802aa22cf7705a5e0867dcd93581b508631756e783c584d36c5bf, the SAME
  pre-fix baseline the implementer's own mutation testing used per the
  original criteria review CR-1320).
- RAN: `timeout 60 node --test --test-name-pattern "release kernel-side
  evidence writes refuse a planted FIFO and return bounded"
  test/release-contract.test.ts` against pre-fix release.ts. RESULT: process
  did not return; killed by the external `timeout 60` (exit 143). This is the
  DANGEROUS-STATE hang itself, not a graceful assertion failure -- exactly the
  documented mechanism (a bare writeFileSync on a reader-less FIFO blocks
  forever) and exactly the observable the work history itself records for
  this member class (its own PRE-FIX probe: "EXIT=124...HUNG"). REDDENED (by
  hanging, the strongest possible negative for a block hazard).
- Restored src/gates/release.ts from the pre-swap backup copy. sha256 after
  restore: e4c27bdf3f428ed31d1f7bcd063cb710aedbccd68c2df93e9450c087714c4edb
  (EXACT match to baseline). `git status --porcelain`: empty.
- RAN the same test again against restored post-fix release.ts: `ok 1 -
  release kernel-side evidence writes refuse a planted FIFO and return
  bounded`, 1 pass, 0 fail. GREEN confirmed.

### 2. CR-P7H-2 witness (the "one other"): "migrations adapter surfaces a matched row whose configured checksum is absent instead of a silent id-match pass" (test/migration-gate.test.ts:252)

- Baseline sha256 src/gates/adapters/migrations-command.ts (post-fix):
  f0c8eb332a16ab2e1c4fa06b3ef7ae02692bc28a1c629d1e08a78e9df6b2c17a
- Swapped in `git show 357770a:src/gates/adapters/migrations-command.ts`
  (pre-fix, sha256 bc6655150775db64158092dc2adfaccf217474c9cf64270c9a61127607c05e65).
- RAN the test against pre-fix migrations-command.ts: FAILED cleanly (not a
  hang) with `AssertionError: expected 'error', actual 'satisfied'` -- the
  exact silent-pass danger the finding names (a matched row with a null
  checksum sails through to satisfied instead of being surfaced). REDDENED.
- Restored migrations-command.ts from backup. sha256 after restore:
  f0c8eb332a16ab2e1c4fa06b3ef7ae02692bc28a1c629d1e08a78e9df6b2c17a (EXACT
  match). `git status --porcelain`: empty.
- RAN the same test again against restored post-fix file: `ok 1`, 1 pass, 0
  fail. GREEN confirmed.

Both witnesses are GENUINE: red against the precise dangerous state named by
the hazard finding, green with the fix, byte-identical restore verified both
times.

## Criteria regression spot-checks (targeted re-execution, post-fix tree)

- Fixture byte-derivation: test/fixtures/release/supabase-list-migrations-empty.json
  still 17 bytes, `{"migrations":[]}`, no trailing newline (od -c verified).
  test/fixtures/release/vercel-deployments.json still carries the double-sha
  929d387be1fc2d1c9464d172b9610947076ccf9e exactly twice (grep -c = 2), one
  target:"production", one target:null (preview). Fixtures directory untouched
  by the fix round (not in the 357770a..6e31fa0 diff), so byte-derivation
  claim from the original review still holds structurally, and re-verified
  directly here.
- absent != pending: `node --test --test-name-pattern "absent"
  test/release-contract.test.ts test/deploy-gate.test.ts` -> 6/6 pass,
  including "release loop treats absent as distinct from pending...",
  "release loop converts endless absent to red naming no release object for
  subject", "release outcome mapping is total and pending and absent are
  never terminal statuses".
- In-progress GitHub Actions run reports pending: "http-json reports pending
  for the captured in-progress run and satisfied once it completes" -> 1/1
  pass.
- Subject echo / real Vercel double-sha: "http-json locates the production
  deployment by sha and target from the captured list" -> 1/1 pass.
- Anti-widening: "deploy gate ignores a head declaration flipped to none and
  records the merge-base blob" -> 1/1 pass.
- No secret in records, including new base64/url redaction: all 3 relevant
  tests -> 3/3 pass ("no secret value appears anywhere under the evidence
  directory when a credential is declared", "release credential values are
  redacted from every file under the evidence directory", "release encoded
  credential forms are redacted from every file under the evidence
  directory").

All named regression spot-checks PASS on the post-fix tree.

## Final verdict

APPROVE. All 12 original acceptance criteria still hold after the fix round
(re-executed, no regression). Both new fix-round HIGH/MEDIUM hazards
(CR-P7H-1 FIFO-hang, CR-P7H-2 checksum-absent) verified as genuine red
witnesses via independent sha256-verified swap-and-restore. The criteria-low
(attemptTimeoutMs) fix is test-only and correctly scoped. killSignal and
test/gates.test.ts are untouched, as claimed. Registry is a pure append-only
union resolving by exact title. Scope audit passes exactly. Gates are green
on both toolchains for this phase's own 47 tests, and the only full-suite
failures are the pre-documented CR-762-class real-clock flake family in
files this phase does not touch, reproduced under measured heavy contention
(14 concurrent npm test processes), not a new defect.

No high or medium finding. No low finding either, beyond what CLAUDE.md
tuition already documents about the shared-box real-clock flakes.
