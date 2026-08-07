# Clean-room DELTA re-review (HAZARD lens): M2-P7 fix round one

- Subject: branch claude/m2-p7-deploy-and-migration-verifiers @ 6e31fa0
- Reviewer role: hazard delta re-reviewer; verify CR-1440 findings closed AT MECHANISM
- Merge-base with origin/main: 8439c884 (main IS an ancestor of HEAD; branch current)
- Toolchains: default node v22.22.2 (/opt/node22), floor node v26.6.0 (scratch prefix)

## VERDICT: APPROVE

All three CR-1440 findings (CR-P7H-1 HIGH, CR-P7H-2 MEDIUM, CR-P7H-3 MEDIUM) are
closed at the MECHANISM, each independently re-attacked and confirmed on the
shipped code at 6e31fa0. killSignal numeric 9 intact and load-bearing. M2-P1
integration intact. Scope clean. No new finding attributable to the round.

## Mechanical gates (this head, 6e31fa0)
- npm ci: exit 0 (default toolchain, expected EBADENGINE).
- npm run build: exit 0; git status --porcelain clean after build.
- Phase suite (deploy-gate + migration-gate + release-contract):
  - default node v22.22.2: tests 47, pass 47, fail 0, skipped 0. exit 0.
  - floor node v26.6.0: tests 47, pass 47, fail 0, skipped 0. exit 0.
- Real runner `tiphys gates run --manifest gates.manifest.json`:
  declared 4, applicable 2, not-applicable 2 (deploy+migrations), green 2,
  red 0, error 0, vacuous 0, exit 0.

---

## CR-P7H-1 (HIGH) -- CLOSED at the mechanism

### Write-site enumeration (done independently, not read from the work history)

Grep of writeFileSync|openSync|appendFileSync|renameSync|writeFile|createWriteStream|
mkdirSync|cpSync|copyFileSync|writeSync|truncate over the 5 P7 sources. The ONLY
write primitive present is writeFileSync (rmSync is a removal, does not block on a FIFO):

| # | Site | Path | Guard status |
|---|------|------|--------------|
| 1 | release.ts:435 | `path` (arg) | This IS the single guarded writer `guardedEvidenceWrite`: calls `refuseOpenForWrite(path)` at :431 before the write |
| 2 | release.ts:960 | `resultPath` (GateResult) | Guarded: `refuseOpenForWrite(resultPath)` at :954, in `emit()` |
| 3 | http-json.ts:159 | `request.recordPath` | Guarded: `refuseOpenForWrite` at :141 in `writeResponse` (adapter-side, unchanged, was already guarded) |
| 4 | migrations-command.ts:125 | `request.recordPath` | Guarded: `refuseOpenForWrite` at :107 in `writeResponse` (adapter-side, unchanged) |

Every kernel-side write INTO the evidence directory routes through `guardedEvidenceWrite`.
Its call sites, all now guarded (previously bare at stdout/stderr/attempt):
- :499 request path
- :543 stdout
- :550 stderr
- :572 attempt record (via writeAttempt/recordAndReturn, so error paths too)
- :628 response-body rewrite

`refuseOpenForWrite` (src/task.ts:158) delegates to `classifyEntry` (lstat->stat),
refusing any irregular (FIFO/socket/device/dir) or unexaminable entry by name and
observed type; absent and regular are allowed (creating a new file is the point).

deploy.ts and migrations.ts hold no write primitive (thin entry points). Matches
the implementer's published derivation exactly.

### Scope the enumeration did NOT cover (verified reviewer item-3 first)
- Other-phase writers (run.ts M2-P1, coverage.ts M2-P6) are outside P7 files-to-touch
  and not this round's. The work history states this and describes run.ts's own guarded
  writer + wx create-exclusive claim + atomic rename. Not P7 defects.
- TOCTOU (regular at probe, swapped to FIFO before open): inherent to the classify-then-
  open pattern used across the whole kernel. NOT attacker-reachable here because every
  kernel-side evidence write happens AFTER the adapter child has exited (spawnSync is
  synchronous, C-3 foreground), so no adversary process is live to perform the swap.
  Confirmed: the response-rewrite path is additionally protected by the rmSync-force
  clear (wipes any planted FIFO) AND the prior read-refuse.

### FIFO-at-each-path attack table (constructed live against 6e31fa0)

Hostile adapter returns valid `pending` on attempt 1, plants a REAL mkfifo at
attempt-2's target path; run under external `timeout --signal=KILL 25`.
124/137 == HUNG; exit 0 + verdict error == BOUNDED.

| Path attacked | Result | Verdict | Reason |
|---|---|---|---|
| request (deploy-request-2.json) | BOUNDED (exit 0) | error | "...deploy-request-2.json is a named pipe, not a regular file, so it was not opened" |
| stdout (deploy-attempt-2-stdout.txt) | BOUNDED | error | "...-stdout.txt is a named pipe, not a regular file..." |
| stderr (deploy-attempt-2-stderr.txt) | BOUNDED | error | "...-stderr.txt is a named pipe, not a regular file..." |
| attempt record (deploy-attempt-2.json) | BOUNDED | error | "...deploy-attempt-2.json is a named pipe, not a regular file..." |
| response (deploy-response-2.json) | BOUNDED | error | FIFO wiped by rmSync-force clear; adapter re-plant blocks the ADAPTER, killed by numeric-9 timeout; kernel returns |

### Red witness for the harness (control)
Temporarily removed the `refuseOpenForWrite` guard from `guardedEvidenceWrite`
(in-tree Edit, reverted via Edit, git status --porcelain clean after) and re-ran
the stdout attack: PROBE_EXIT=137 (killed at 20s vs 4s deadline == HUNG). This
proves my harness genuinely detects a hang, so the five BOUNDED results above are
meaningful and the guard is load-bearing. Working tree restored bit-for-bit.

Permanent guard shipped: test/release-contract.test.ts:491 "release kernel-side
evidence writes refuse a planted FIFO and return bounded" -- real mkfifo, TWO
structurally different members (stdout + attempt-record), 15s test timeout so a
regression reports as a failure not a hang. Behavior registered and resolves:
release-kernel-evidence-write-fifo-bounded.

---

## CR-P7H-2 (MEDIUM) -- CLOSED at the mechanism

Mechanism: when `checksumPointer` is configured, a matched applied row whose
checksum is null/absent/empty/non-string is now marked `checksumAbsent`
(migrations-command.ts:296-306) and, ahead of the missing/pending check, returns
`error` naming the ids (`:354-377`) with `observation.raw` disclosing
`checksumCompared` vs `checksumAbsent`. The satisfied path also records
`checksumCompared` so a green is auditable (:401-404).

Attack (constructed live), 2 structurally different members + control:
- D1 checksum=null, repo content differs: outcome=**error**;
  raw={"repository":["001"],"applied":["001"],"checksumCompared":[],"checksumAbsent":["001"]};
  detail "checksum requested but absent for: 001". (was silently `satisfied` pre-fix)
- D2 checksum KEY ABSENT, repo content differs: outcome=**error**, identical disclosure.
- D0 control checksum matches: outcome=satisfied; raw discloses checksumCompared=["001"].

Both structurally different members redden; disclosure present; green auditable.
Permanent guard: migration-gate.test.ts:252, behavior migrations-checksum-absent-surfaced.

---

## CR-P7H-3 (MEDIUM) -- CLOSED at the mechanism, residue is DISCLOSED-only

Mechanism: `secretForms` (release.ts:386) enumerates the value + its single-step
base64 + its encodeURIComponent form; `redactSecrets` (:397) splits on each, so
all three are removed ANYWHERE in the text. Applied at every evidence write
(stdout :543, stderr :550, attempt/response through the same redaction+guard).

Attack (secret with special chars so percent form is genuinely distinct):
secretForms returned three DISTINCT forms; redaction result:
- raw_present=false, base64_present=false, percent_present=false  (all covered)

Disclosed-residue probe (composite encodings the fix does NOT claim to cover):
- composite base64("user:"+token)_present=TRUE
- hex_present=TRUE
- double-base64_present=TRUE

These survive, and that is CORRECT: release.ts:376-384 and work-history CR-P7H-3
section (lines 943-952) explicitly scope the guarantee to "the value and its own
single-step base64 and percent encodings" and disclose that composite/hex/double
forms fold in bytes the kernel does not hold and are a third-party adapter's
responsibility. So it is DISCLOSED residue, not a leak the fix claims to cover;
no overclaim. (Criteria-walk line 511-520 still uses the phrase "no secret value
appears anywhere" but the same document's dedicated CR-P7H-3 section discloses the
precise scope, satisfying "never soften a work history" -- observation, not a finding.)

Permanent guard: release-contract.test.ts:666, behavior release-encoded-credential-redaction.

---

## killSignal / C-2

release.ts:534 still uses `killSignal: 9` (numeric SIGKILL) inside spawnSync's
per-attempt bound. Attack B (SIGTERM-trapping, never-exiting adapter): terminated
at the 2000ms per-attempt timeout, verdict error ("adapter overran the per-attempt
timeout ... and was terminated; the kernel returns"), PROBE_EXIT=0 (kernel RETURNED).
Numeric-9 is load-bearing and intact. Per the arbitration this is decided (stays);
the M2-P1 witness carve-out is a separate follow-up (task 31), not P7's.

## M2-P1 integration
Real runner emits schema-shaped GateResults for both entries via the delivered
makeGateResult/renderGateResult. deploy and migrations both status=not-applicable
with the STRUCTURAL precondition reason in BOTH detail and precondition.id
(D-p7-4), units 0. declared 4 / applicable 2 / not-applicable 2 / error 0 /
vacuous 0, exit 0. Intact.

## Scope audit
Changed files vs merge-base (git diff --stat): src/gates/{release,deploy,migrations}.ts,
src/gates/adapters/{http-json,migrations-command}.ts, two schemas, three test files,
fixtures/release/*, gates.manifest.json (union registry), test/behaviors.json (union
registry, standing extra), delivery/work-history/m2-p7.md (standing extra). All within
P7 files-to-touch + standing pre-authorized extras + the two append-only registries.
Working tree clean after all probing (git status --porcelain empty).

## New observation (LOW): a pre-existing P7 test flakes under full-suite CPU load

deploy-gate.test.ts:684 "a fabricated declaration in a scratch copy makes both
entries applicable and red" FAILED in the full parallel `npm test` run on the
default toolchain (migrations.status 'error' !== 'red', at :775), while it PASSES
in isolation (47/47 both toolchains, and a targeted re-run passed).

- NOT a kernel defect and NOT a hazard finding: the kernel behaved CORRECTLY. Under
  load the migrations adapter (which itself nests a second node spawn for
  appliedCommand) overran its attemptTimeoutMs=3000, was bounded and killed by the
  numeric-9 SIGKILL, and returned `error` -- exactly the guarantee. The test expects
  the deadline `red` (missing 002), so load flips red->error.
- Reproduced DETERMINISTICALLY (attacks/load-repro.mjs): under 8 busy CPU workers on
  4 cores, attempt 1 outcome=error terminatedByTimeout=true signal=SIGKILL, reason
  "adapter overran the per-attempt timeout of 3000 ms and was terminated".
- PRE-EXISTING, not attributable to this round: the failing test's clock
  (intervalMs 40, deadlineMs 250, attemptTimeoutMs 3000) is BYTE-IDENTICAL at
  fc7914e (pre-fix) and 6e31fa0. The round raised only the ONE instance the criteria
  review named (deploy end-to-end test, attemptTimeoutMs 2000->5000).
- SAME CLASS the criteria review/arbitration already recorded (CR-762 subprocess-spawn
  timing flake). The arbitration asked to fix test #17; sibling tests at
  attemptTimeoutMs 3000 / deadlineMs 250 were left at the old budget.

Impact: DR-0012 requires "CI green on that exact head" for the delegated clean merge.
A test that reds under parallel load can intermittently red CI, so this is worth
resolving before relying on CI-green, even though it is a test-robustness LOW and not
a kernel/hazard defect. Recommendation: raise the subprocess-spawn adapter tests to
the implementer's own 5000ms attemptTimeoutMs convention (and consider the 250ms
deadline), the same one-line-per-site change already applied to test #17. This does
NOT change my hazard verdict on the three CR-1440 findings.

## Full suite (both toolchains)
- Phase 3 files in isolation: 47/47 both toolchains (default v22.22.2, floor v26.6.0).
- Full `npm test` default toolchain (~265 top-level tests, 4 cores saturated): 5
  failures, all load-induced real-clock/spawn flakes, none a kernel defect:
  1. deploy-gate.test.ts:684 (P7 file) -- the load flake characterized above (LOW).
  2. liveness.test.ts:633 -- untouched file, watcher/liveness real-clock (brief-permitted).
  3. watcher.test.ts:269 -- untouched, "resident watcher backs off" real-clock.
  4. watcher.test.ts:419 -- untouched, "heartbeat schedule on disk" real-clock.
  5. watcher.test.ts:500 -- untouched, "concurrent single pass wake" real-clock.
  Failures 2-5 are exactly the brief's permitted "known watcher/liveness flakes in
  untouched files". Failure 1 is the pre-existing P7 test-timing LOW (not a kernel or
  hazard defect; kernel bounded the overrun correctly). CI on a real Node-26 runner is
  the authority; the phase 3 files pass cleanly in isolation on both toolchains.

## Sibling tight-timeout sites (for the LOW recommendation)
P7 tests still at the pre-convention budget that spawn subprocess adapters:
deploy-gate.test.ts:529/566 (attemptTimeoutMs 3000), :714/726 (3000, the failing test,
double-nested spawn), migration-gate.test.ts explicit-clock cases, release-contract
:539/579 (3000). The fix raised only deploy-gate:820 (2000->5000) and the clock()
helper defaults (5000). Raising these to the 5000ms convention is the same one-line
change and would close the CI-flake risk.

## Progress log
- [x] fetch + checkout exactly 6e31fa0, verified current with origin/main
- [x] read CLAUDE.md + MECHANISMS.md
- [x] read arbitration-m2-p7.md + clean-room-m2-p7-hazard.md
- [x] CR-P7H-1 write-site enumeration (independent)
- [x] CR-P7H-1 FIFO attack at all 5 kernel-side write paths + harness red-witness control
- [x] CR-P7H-2 null + absent checksum -> error + observation.raw disclosure + green control
- [x] CR-P7H-3 base64/percent redacted; composite/hex/double residue disclosed-only
- [x] killSignal numeric 9 + hung-adapter kill returns (attack B)
- [x] M2-P1 integration intact (real runner)
- [x] scope audit clean
- [x] phase-suite gate numbers both toolchains (47/47, 47/47)
