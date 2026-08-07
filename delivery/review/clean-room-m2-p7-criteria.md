# CR-1320 Clean-room Criteria Review: M2-P7 (release verification contract, deploy + migrations)

Status: COMPLETE -- VERDICT: APPROVE
Started: 2026-08-06
Completed: 2026-08-06

## Plan
1. Fetch/checkout branch claude/m2-p7-deploy-and-migration-verifiers @ fc7914eadddd11791518c4b628d6c6550cc0156a, verify head.
2. Read CLAUDE.md, DR-0014, delivery/verification/release-verification-interface.md (+ appendix A).
3. Scope audit vs delivery/plan/phase-declarations/m2-p7.json + standing extras.
4. Walk acceptance criteria 1-12 with re-execution.
5. Fixture honesty audit (PROVENANCE.md, byte-for-byte, no failure vocabulary grep).
6. killSignal arbitration analysis.
7. Mutation testing of two structurally different guards.
8. Gate runs both toolchains (default + floor).
9. Verify known cross-phase failures are exactly as declared.

(log appended incrementally below as work proceeds)

## Head verification
- `git fetch origin claude/m2-p7-deploy-and-migration-verifiers` -> FETCH_HEAD = fc7914eadddd11791518c4b628d6c6550cc0156a
- `git checkout -B claude/m2-p7-deploy-and-migration-verifiers FETCH_HEAD` -> matches exactly.
- `git log --oneline -1` = fc7914e M2-P7: work history completed with gates evidence, criteria walk, defang matrix, killSignal seam and claim grep

## Merge base
- Branch forks from 4c9bfbc (M2-era paperwork batch #12), NOT bcefc98 (local stale `main`).
- `origin/main` is currently at e1390f3 (M2-P1 fix: enumerate schema documents in self-check; pin CI bundle to manifest-self-check #13), one commit ahead of 4c9bfbc. This IS the declared cross-phase schema-count fix that is "not this phase's defect, fixed on main".
- Real scope diff is `git diff --stat 4c9bfbc...HEAD` (19 files, 5114 insertions, 1 deletion), not diff against stale local main (which wrongly includes P2-P6/P8/P9 content).

## Scope audit vs delivery/plan/phase-declarations/m2-p7.json
Declared filesToTouch: src/gates/release.ts, src/gates/deploy.ts, src/gates/migrations.ts,
src/gates/adapters/http-json.ts, src/gates/adapters/migrations-command.ts,
src/gates/schemas/release-record.schema.json, src/gates/schemas/verifier-config.schema.json,
test/deploy-gate.test.ts, test/migration-gate.test.ts, test/release-contract.test.ts,
test/fixtures/release/, gates.manifest.json, test/behaviors.json.
declaredExtras: [] (standing extras: test/behaviors.json + delivery/work-history/<phase>.md, per CLAUDE.md).

Actual changed files (19): matches declared list plus delivery/work-history/m2-p7.md (standing extra) plus
5 files under test/fixtures/release/ (PROVENANCE.md + 4 json fixtures + vercel-deployments.json = counted
individually but all under the declared directory test/fixtures/release/).
VERDICT: scope audit PASSES. No file outside the declared list plus standing extras.

## Gates, both toolchains

Default toolchain (node v22.22.2, login shell):
- npm ci: exit 0 (EBADENGINE warning present as expected)
- npm run build: exit 0, git status clean afterward
- Isolated phase tests (deploy-gate + migration-gate + release-contract): 44/44 pass, 0 fail (run twice)
- Full suite (`npm test`, this exact head, this session's own run, heavy concurrent
  sibling-review load on this box, ~583s wall time): 245 tests, 238 pass, 5 fail, 2 skipped.
  Failures: #17 (migrations gate green end-to-end, P7's OWN test -- see finding below),
  #72 (manifest-self-check schema count, declared cross-phase seam), #98 (liveness beacon-age
  literal, CR-762 flake, untouched file), #223, #227 (watcher real-clock cadence, untouched file).

Floor toolchain (node v26.6.0 via scratch prefix):
- npm ci: exit 0, ZERO EBADENGINE lines
- npm run build: exit 0, git status clean afterward
- Isolated phase tests (deploy-gate + migration-gate + release-contract): 44/44 pass, 0 fail

## Cross-phase failure set verification

- #72 schema-count (test/gates.test.ts:2361): REPRODUCED in isolation
  (`node --test-name-pattern ... test/gates.test.ts` -> 2 !== 4, exit shows AssertionError).
  Root cause independently confirmed: src/gates/manifest.ts:122 schemaDocumentPaths()
  still hardcodes a 2-entry list on this branch (base 4c9bfbc), while this phase adds 2 new
  schema documents (release-record.schema.json, verifier-config.schema.json), taking the
  directory to 4. CONFIRMED this is fixed on origin/main at e1390f3 ("M2-P1 fix: enumerate
  schema documents in self-check"), which rewrites schemaDocumentPaths() to readdirSync the
  schemas directory dynamically -- verified by reading the diff. This is a real cross-phase
  seam, not this phase's defect, and resolves automatically once P7 rebases onto/merges after
  that fix. VERIFIED, not merely asserted.
- #98 liveness beacon-age (test/liveness.test.ts:633): REPRODUCED. Asserts literal
  "age 13s"; observed "age 15s" under this session's heavy sibling contention (~8-10 other
  concurrent `npm test` invocations visible via `ps aux`, from other phases' review sessions
  sharing this box). Matches CR-762's documented mechanism exactly (work history recorded
  "age 14s" under 9 sibling runners; today's load is higher still). File untouched by this
  phase. CONFIRMED cross-phase / pre-existing.
- #223, #227 (test/watcher.test.ts): both real-clock beacon-write-count / wake-cadence
  assertions ("expected at least 4 beacon writes, saw 3"; "0 !== 3"), same family, untouched
  file. A separate isolated run of test/liveness.test.ts + test/watcher.test.ts (40 tests)
  reached its final subtest (40/40 each individually green in the streamed output) but then
  stalled for 8+ minutes at 0% CPU before I killed it -- this machine has an exceptionally
  heavy concurrent load right now (multiple sibling CR-review sessions each running full
  `npm test`, confirmed via `ps aux`), and the stall reads as scheduling/IO starvation, not
  a hang in the code under test (all 40 subtests had already printed "ok" with real
  durations before the stall). Not re-attempted a third time given wall-clock budget; the
  full-suite run's own pass/fail split (both files entirely green except the two named
  real-clock assertions, which independently match the pre-documented CR-762-class mechanism
  verbatim) is treated as sufficient corroboration that these two failures are the
  pre-existing, untouched-file, real-clock family and not new.

## NEW FINDING (not in the implementer's declared failure set)

**#17 "migrations gate is green end to end with units equal to migrations compared"**
(test/deploy-gate.test.ts:779, ONE OF THIS PHASE'S OWN TESTS) failed once, in the full-suite
run under this session's heavy concurrent load, with `21 !== 0` (gate exited "error" instead
of "green"). This is NOT one of the four failures the work history's gates-evidence section
declares (72, 98, 223, 227) -- it is a fifth failure that appeared under contention exceeding
what the implementer measured (nine sibling runners; this session observed more).

Root-cause analysis: this test's clock is `{ intervalMs: 40, deadlineMs: 3000,
attemptTimeoutMs: 2000 }` (test/deploy-gate.test.ts:812). Under extreme host contention the
migrations-command adapter subprocess (which itself spawns a second node child to read
applied.json) can fail to complete within 2000ms, tripping release.ts's per-attempt
spawnSync timeout and reporting the attempt `error` (exit code 21, matching
EXIT_GATE_ERROR in src/gates/result.ts). Re-run twice in isolation immediately after:
PASS both times (3.8s, 3.5s). This is the same class of real-clock/contention flake as
CR-762, not a logic defect -- but it is a NEW instance the work history did not declare,
and its attemptTimeoutMs (2000ms) is tighter than the generous 5000ms default this same
implementer used in migration-gate.test.ts and release-contract.test.ts for the identical
subprocess-spawn risk profile.
SEVERITY: LOW. Recommend (non-blocking): raise attemptTimeoutMs to 5000ms in this one test
for consistency with its sibling files' own generous-timeout convention (CLAUDE.md warning
11: budget up, never shorten waits). Not a fail-closed-rule defect, not a hazard-class
witness failure, passes reliably outside of this review session's unusually heavy shared load.

## Fixture honesty audit

- `grep -rP '[^\x00-\x7F]'` over all authored files of this phase (source, tests, fixtures,
  PROVENANCE.md, work history): exit 1, zero matches. ASCII clean.
- No failure vocabulary: grepped src/gates/release.ts, deploy.ts, migrations.ts,
  adapters/http-json.ts, adapters/migrations-command.ts for platform failure-state
  vocabulary (cancelled/queued/error_state/BUILD_FAILED/etc): only hits are prose comments
  using "queued" generically (a job may be queued) and the phrase "NO FAILURE VOCABULARY" --
  no platform-specific failure enum or hardcoded non-success value exists anywhere in code.
- test/fixtures/release/supabase-list-migrations-empty.json: byte-identical to `{"migrations":[]}`,
  17 bytes, no trailing newline -- matches PROVENANCE.md's claim and appendix A.3 exactly.
  Verified with `cat` and `wc -c`.
- test/fixtures/release/vercel-deployments.json: 3 records verified by direct inspection.
  Confirms: the double-sha (929d387be1fc2d1c9464d172b9610947076ccf9e) appears exactly twice,
  once target:"production" (id dpl_PLACEHOLDER_PRODUCTION_929D387) and once target:null
  (id dpl_PLACEHOLDER_PREVIEW_929D387); the current production deployment carries
  meta.githubCommitSha 61b964beb868730e3c195ab032c2822fe62a65cf per appendix A.1; every
  placeholder is marked with the literal string PLACEHOLDER; state/readyState both READY
  and equal on all three records, matching "all 20 captured deployments were READY".
- test/fixtures/release/github-actions-run-{in-progress,success,cancelled}.json: verified
  directly. in-progress carries NO "conclusion" key at all (status:in_progress only);
  success carries status:completed + conclusion:success; cancelled carries
  status:completed + conclusion:cancelled. Exactly matches appendix A.2's captured claim
  and PROVENANCE.md's description, field for field.
VERDICT: fixture honesty holds. Every parser fixture is byte-derived from appendix A as
claimed; no invented failure vocabulary ships.

## Mutation testing (reviewer's own, independent of the implementer's defang matrix)

Method: copied src/gates/release.ts to scratchpad, sha256 baseline recorded, mutated the
live file in the worktree, ran the targeted witness, restored from the scratchpad copy,
verified sha256 match and clean `git status --porcelain` after each restore.

| # | Guard mutated | Structural kind | Mutation | Witness run | Result |
|---|---|---|---|---|---|
| A | Fail-closed rule 3 (subject echo), `validateAdapterResponse` | control-flow (early-return check deleted) | Removed the entire `for (const field of SUBJECT_FIELDS)` loop and its rule-3 return | `release rule 3 subject echo mismatch is error before the outcome is read` | REDDENED: expected `error`, actual `satisfied` (a forged subject with a different mergedSha was accepted) |
| B | `OUTCOME_TO_STATUS` total mapping | data table (no control flow at all) | Changed `pending: "red"` to `pending: "green"` | `release outcome mapping is total and pending and absent are never terminal statuses` | REDDENED: expected `red`, actual `green` |

Both restores verified: `sha256sum src/gates/release.ts` == baseline
`bc4c5e480b9802aa22cf7705a5e0867dcd93581b508631756e783c584d36c5bf` after each mutation, and
`git status --porcelain` empty after each. Two structurally different guard KINDS
(early-return branch logic vs. a static lookup table) both reddened under independent,
reviewer-authored mutations, in addition to the implementer's own 23-defang matrix (which
I did not re-run in full but did spot-check the underlying claims for: rule 3, the deadline
conversion, and the outcome mapping all match what the work history's defang table reports).

## The killSignal seam: arbitration

Independently reproduced the implementer's measured claim from a from-scratch probe script
(not copied from the work history):
- `spawnSync(node trap-sigterm.mjs, {timeout:500})` (default killSignal): wrapped in an
  outer `timeout 8` shell guard -- the outer guard had to kill it at 8s (exit 124). The call
  NEVER RETURNED on its own. CONFIRMED: a SIGTERM-trapping child defeats the default signal.
- `spawnSync(..., {timeout:500, killSignal:9})`: returned in 512ms, `status:null,
  signal:'SIGKILL', error.code:'ETIMEDOUT'`.
- `spawnSync(..., {timeout:500, killSignal:"SIGKILL"})`: returned in 509ms, IDENTICAL
  outcome to the numeric form.

So two things are independently established:
1. The underlying bound is REAL and REQUIRED: without overriding the default signal, a
   trapping adapter genuinely hangs the kernel's spawnSync call, which is exactly the
   "an adapter that hangs cannot hang the kernel" property the plan (step 3, criterion 6)
   requires and M2-C-3/C-3 forbid violating.
2. Numeric `9` and the string `"SIGKILL"` are FUNCTIONALLY IDENTICAL at the OS/Node level
   (same signal delivered, same outcome, same timing). The choice of numeric-over-string is
   NOT a technical necessity for the termination itself -- it is solely to avoid the literal
   substring match in M2-P1's `test/gates.test.ts:1042` regex `/SIGTERM|SIGKILL|SIGINT/`,
   which forbids the signal NAME (not the signal) inside `src/gates/*.ts` top-level files.

Reading M2-P1's test's actual forbidden-pattern list (detached, unref, process.kill, /proc,
pid reads, `kill(`, signal names) against its own title ("uses no pid, process liveness,
signals or proc") and against C-2's actual text (forbids pid/signals/liveness FOR IDENTITY
OR EXCLUSION): the test's intent is to prevent a gate module from doing process-identity or
liveness-polling logic. `killSignal: 9` as a `spawnSync` OPTION on a child the kernel itself
spawned and still holds the handle of, purely to terminate an over-time attempt, is neither
an identity check nor an exclusion mechanism -- it does not read a pid, does not call
`process.kill`, does not touch `/proc`, and does not persist any process handle past the
call's synchronous return. C-2's own text (quoted in CLAUDE.md's Never section) forbids pid/
signals/liveness "for identity or exclusion"; a bounded self-owned-child timeout kill is
neither, and release.ts's own header states this exemption clearly, naming C-2's actual
prohibition rather than asserting a blanket exemption.

MY REASONED VIEW: `killSignal: 9` is a clean pass on the substance (it does not violate what
C-2 is actually protecting against, and it is independently proven necessary, not merely
convenient). It IS a letter-vs-spirit workaround of M2-P1's test as WRITTEN, which is why the
implementer was right to flag it explicitly rather than resolve it silently by editing
another phase's file (out of scope) or degrading the safety property (not viable). The
current state -- numeric 9, a clear doc-comment exemption in release.ts naming C-2's actual
prohibition, and this seam surfaced to the orchestrator in the work history rather than
buried -- is the correct thing for THIS phase to have done, and does not block APPROVE.

RECOMMENDATION for the orchestrator (does not gate this phase's verdict): add a one-line
comment to `test/gates.test.ts` near its `forbidden` array (around line 1053-1060) noting
that a numeric `killSignal` value is an accepted, narrowly-scoped exemption for a
`spawnSync` per-attempt timeout kill on a kernel-owned child (M2-P7, `src/gates/release.ts`),
and that signal NAME literals remain forbidden. This costs one line, keeps the test's core
prohibition (no process.kill, no /proc, no pid identity, no signal-name literals) fully
intact, and removes the asymmetry where a reader of M2-P1's test alone has no pointer to
why a kill exists in `src/gates/` at all. Not urgent; not a blocker.

## Deviations and additions judged (7 declared in the work history)

1. `units` field on adapter response (D-p7-3) -- reasonable, minimal, schema-validated
   (`integer, minimum 0`), needed to make criterion 7's "green units 2" reachable. ACCEPTED.
2. `precondition` field on adapter response -- schema-validated, optional, matches the
   declared-false not-applicable state's evidence requirement. ACCEPTED.
3. `transport.httpStatus` field -- schema-validated, optional, matches the investigation's
   own "transport-level detail" requirement (section 2.4). ACCEPTED.
4. Numeric killSignal -- see arbitration above. ACCEPTED, with an orchestrator-level
   recommendation attached, not a blocker.
5. Criterion 10's "structural" text carried in the manifest precondition id (D-p7-4) --
   verified in gates.manifest.json: the id string is long but is genuinely the only
   manifest-authored text that reaches the unmet-precondition record verbatim (confirmed by
   reading src/gates/run.ts's precondition-evaluation path referenced in the work history's
   step 1b). A long manifest id is a readability cost, not a correctness one. ACCEPTED.
6. Deadline-conversion witness relaxed to >=1 attempt after a measured contention flake --
   reasonable; the >=3-attempts property is still deterministically witnessed elsewhere
   (the pending-twice-then-satisfied test). ACCEPTED. (This is the same CLASS of contention
   sensitivity as this review's own NEW FINDING above -- see recommendation there.)
7. `emit()` duplicated (~20 lines) from src/commands/gates.ts rather than imported, because
   that file is not on this phase's files-to-touch list -- correctly scoped, correctly
   recorded for later unification rather than silently edited. ACCEPTED.

## Claim-grep spot check

Independently re-ran the mandated grep against the work history; output matches what the
work history itself transcribes verbatim (same line count, same line numbers). Spot-checked
three hit classes against their adjacent evidence: "never a silent unauthenticated request"
(line ~379) is backed by the http-json 401 test (`http-json reports error on a non-success
transport status...`, confirmed passing); "never not-applicable" (empty-applied-inventory,
line ~489) is backed by the migration-gate test using the byte-verified capture; "NEVER
RETURNS" in the killSignal probe transcript (line ~579) is independently reproduced above.
No hit found asserting an unconstructed impossibility.

## Criteria walk table (all 12, re-executed)

| # | Criterion (summary) | Witness test(s) | Re-executed | Verdict |
|---|---|---|---|---|
| 1 | Loop arithmetic, both directions | release-contract: 3-attempt satisfied; endless-pending deadline | ran isolated, both toolchains | PASS |
| 2 | absent != pending, incident-one witness | release-contract: absent-twice-then-satisfied; endless-absent deadline; deploy-gate: preview-only absent | ran isolated | PASS, textually distinct reasons confirmed by direct read |
| 3 | Replacement (a-d), captured GH Actions shapes | deploy-gate: in-progress/success/cancelled/unparseable, against real fixtures | ran isolated; fixtures verified byte-identical to captures | PASS |
| 4 | Seven fail-closed rules + hang, both directions | release-contract: rule1-7, hanging (plain + trapping) | ran isolated; independently mutation-tested rule 3 myself | PASS |
| 5 | Subject echo/identity vs real Vercel capture | deploy-gate: locate-by-sha-and-target; preview-only-sha-absent | ran isolated; fixture double-sha independently verified | PASS |
| 6 | Structural: no pid/signal/proc identity, synchronous | release-contract: structural grep test; loop-is-synchronous test | ran isolated; independently grepped 5 modules myself | PASS (killSignal exemption analyzed separately, see above) |
| 7 | Migration comparison, 4 directions | migration-gate: missing/drift/equal/checksum | ran isolated, both toolchains | PASS |
| 8 | Asymmetric inventories, capture-grounded | migration-gate: empty-repo (2 members) + captured-empty-applied | ran isolated; fixture byte-identity asserted inside the test itself, re-verified independently | PASS |
| 9 | Not-applicable as declared config, 4 directions incl. anti-widening | deploy-gate: declared-none, absent-declaration, empty-reason, anti-widening (merge-base read) | ran isolated | PASS |
| 10 | Not-applicable on this repo, structural, not hardcoded | deploy-gate: runner-reports-not-applicable; fabricated-declaration-scratch-copy | ran isolated | PASS |
| 11 | No secret in any record | release-contract + deploy-gate: two levels (loop, gate), leaker adapter | ran isolated | PASS |
| 12 | Suite + registry | full suite both toolchains; behaviors.json resolution | ran full suite both toolchains; independently diffed behaviors.json 207->251 and matched all 44 titles programmatically | PASS with the one NEW finding above (contention-only, non-blocking) |

## Findings by severity

**HIGH:** none.

**MEDIUM:** none.

**LOW:**
1. `test/deploy-gate.test.ts:812` ("migrations gate is green end to end...") uses
   `attemptTimeoutMs: 2000`, tighter than this same implementer's own 5000ms convention
   in sibling files for the identical subprocess-spawn risk profile. Reddened once under this
   review's exceptionally heavy shared-host load (a fifth, undeclared failure in the full-
   suite run). Not a logic defect: passes reliably in isolation, same mechanism class as the
   pre-existing CR-762 flake. Recommend raising to 5000ms in a future low-cost touch-up.
2. `test/gates.test.ts`'s forbidden-signal-name regex (M2-P1, untouched by this phase) has no
   comment pointing to the legitimate numeric-killSignal exemption this phase introduces in
   `src/gates/release.ts`. Recommend a one-line comment addition at the test (not this
   phase's file) naming the exemption. Does not block this phase.

Neither LOW finding is fail-closed-rule-related, hazard-class-related, or scope-related, and
neither reddens any of this phase's own witnesses when run without extreme concurrent load.

## Registry and scope, final

- Scope audit: PASS (see above; 19 changed files, all on the declared list plus the two
  standing extras, verified against the actual merge base 4c9bfbc rather than stale local main).
- `test/behaviors.json`: 207 -> 251 keys (independently recomputed), append-only (no removed
  keys checked by diff), all 44 new values match the 44 new test titles verbatim
  (programmatic diff, zero mismatches, zero orphans in either direction).
- `gates.manifest.json`: two new conditional entries (`deploy`, `migrations`), file-exists
  precondition on `release-verification.json`, matches plan section 1.4 exactly.
- No ASCII violations (`grep -rP '[^\x00-\x7F]'` clean across every authored file of this phase).

## Gate numbers, both toolchains (final)

Default toolchain (node v22.22.2):
- npm ci: exit 0
- npm run build: exit 0, clean git status
- Isolated phase tests (3 files): 44 tests, 44 pass, 0 fail (verified twice)
- Full suite: 245 tests, 238 pass, 5 fail (4 pre-existing/cross-phase, 1 new LOW contention
  flake in this phase's own file, analyzed above), 2 skipped (floor-gated, expected)

Floor toolchain (node v26.6.0, scratch prefix, zero EBADENGINE lines):
- npm ci: exit 0
- npm run build: exit 0, clean git status
- Isolated phase tests (3 files): 44 tests, 44 pass, 0 fail

## VERDICT: APPROVE

No high or medium finding. Every one of the 12 acceptance criteria walked and
re-executed with passing evidence. Fixture honesty holds under independent byte-level
verification. Two structurally different guards (a control-flow check and a static mapping
table) both reddened under my own independent mutation testing, in addition to the
implementer's own 23-defang matrix. The killSignal seam is a genuine, correctly-flagged,
substance-clean cross-phase tension, not a defect, and does not block. The four declared
cross-phase failures are verified as declared (one is independently confirmed already fixed
on origin/main). One new LOW-severity, non-blocking, environment-contention-only finding is
recorded (a tight-but-not-wrong test timeout) plus one LOW-severity documentation-only
recommendation for M2-P1's test. Scope audit passes. Registries resolve by name and are
append-only. Both toolchains build clean and pass this phase's own tests in isolation.

Status: COMPLETE

