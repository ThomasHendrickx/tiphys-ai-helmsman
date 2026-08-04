# Clean-room review: M1-P3 (session lock and worktree pool), PR 3

- Date: 2026-08-04
- PR: 3, branch claude/m1-p3-lock-and-pool into main
- Head SHA reviewed: 9aa650b38a92506cf0364102e2652e6e6469ce14 (base origin/main 24318132463b04020702265b4dbaa9e07c24ed56)
- Reviewer: clean-room (no visibility into the implementation session; contract is the plan's M1-P3 section, revision 7, plus EXT-F-01 of delivery/review/plan-review-r4-external.md, DR-0007, and the cited firstmate scout sections)
- Method: full read of the diff (git diff origin/main...origin/claude/m1-p3-lock-and-pool, 9 files, +2284/-1); line-by-line audit of src/lock.ts against the verbatim EXT-F-01 mutation contract; execution in a detached scratch worktree on Node v22.22.2 (floor is 26; local runs are advisory, CI on 26 is the authority): full suite, behavior-registry name check, build plus porcelain check, manual re-execution of criteria 3, 4 (expired half), 5, 6 (hold-point interleave), 11 (behind and ahead), 13 (both directions), 16 (dirty, --discard, clean ladder), a stuck-claim crash-window witness, a doctor compatibility check against P3 leases including the corrupt-expiry FAIL, a real-lsof semantics probe, and a deliberate broken-CAS sabotage re-performed and reverted; 12 repeated runs of the six race witnesses.

## Verdict

APPROVE.

All 17 acceptance criteria are met (criterion 13's final clause by the plan's own P4 cross-reference, see deviation 5). The one shared mutation primitive implements the EXT-F-01 contract faithfully: no mutation path bypasses the claim-file serialization, the byte-compare CAS cannot be defeated by semantically-equal content (every write carries a fresh random token, so no two mutations can produce identical bytes), refusals never touch the file, and crash windows fail loudly without a steal protocol. The race tests assert the strong postcondition (exactly one winner, loser diagnostic, winner lease byte-identical including its token) and demonstrably detect a broken CAS. Zero flakes in 12 repeated race runs. Constraints C-1, C-2, C-3 hold across the whole diff. Findings are four lows, none blocking; all can land in a later phase or a follow-up commit at the implementer's discretion.

## Execution evidence summary

- npm ci, npm test in the scratch worktree: 56 tests, 54 pass, 0 fail, 2 skipped (the standing P2 floor-gated doctor witnesses with recorded reasons), zero unaccounted. npm run build exit 0, git status --porcelain empty after build.
- Behavior registry: all 57 mappings in test/behaviors.json resolve by name against the run's test titles; every P1 and P2 mapping intact; the P3 additions are a pure append (diff shows only a trailing comma added to the previous last entry).
- Criterion 3 re-executed by hand: five concurrent lock acquire processes against a free lock produced exactly 1 exit 0 and 4 exit 1, each loser's stderr containing "lock held", and the lock file held the winner's holderId.
- Criterion 4 (expired half) re-executed: 1s lease waited out; renew with the matching holder exited 1 with "expired" and the file was byte-identical (cmp).
- Criterion 6 race witness re-performed through TIPHYS_LOCK_TEST_HOLD with two real CLI processes: the renew observed the unexpired lease and held at the barrier; the takeover won after expiry (exit 0); the resumed renew exited 1 with "lost: the lease changed after this mutation observed it"; the winner lease was byte-identical afterward, token included.
- Criterion 11 re-executed: with the clone's local main behind, and separately ahead of, the remote, pool create exited 0, emitted the remote head SHA, and the worktree HEAD equaled it with empty porcelain. The local branch was never the base.
- Criterion 13 re-executed in both directions: unreachable remote without --offline exited 1 with the refusal reason and created nothing (no worktree, no record); with --offline it exited 0 using the last fetched remote-tracking SHA (the upstream had advanced unseen, so staleness was recorded, not hidden) with offline: true in the record.
- Criterion 16 re-executed: dirty destroy exit 1 with a reason line and the directory intact; --discard exit 0 and directory gone with the registration pruned; clean destroy without flags exit 0.
- Crash window witness: with a manually planted state/orchestrator.lock.mutex, a renew failed after a bounded 5140ms wait with a message naming the claim file and the manual remedy (FM-058: stuck claims fail loudly; verified).
- Broken-CAS sabotage re-performed: replacing the primitive's byte-compare with an always-false condition turned the renew-vs-takeover and release-vs-takeover (takeover-first) witnesses red ("both operations won"); restored via git checkout; suite green again. The release-first witness stayed green because it exercises the CAS's absent-lease branch, which the sabotage left intact.
- Race suite repeated 12 times (six witnesses per run, 72 race executions): 0 flakes.
- Doctor compatibility: doctor against a P3 lease prints "CHECK lock PASS lease held by <id>, expires <ts>"; corrupting expiresAt produces "CHECK lock FAIL ... not a parseable timestamp" (the P2 fix-round behavior still holds with the two extra P3 lease fields).
- Real lsof probe: lsof -t -- <file> exits 1 with empty stdout for no holder and 0 with a pid for a holder, exactly the contract provablyStaleLock assumes.

## Criteria walk (all 17)

| # | Criterion (abbreviated) | Result | Evidence |
|---|---|---|---|
| 1 | acquire creates lease, non-empty holderId, future expiresAt, no pid field | MET | test lock-acquire-creates-lease (keys and raw both checked); manual acquire; src/lock.ts:263-272 (randomUUID holder) |
| 2 | second acquire refused, "lock held", file byte-identical | MET | test lock-acquire-refused-while-held; refusal paths in acquireLease never call the primitive (src/lock.ts:288-312) |
| 3 | five concurrent acquires, exactly one winner, file holds winner | MET | re-executed by hand (1 winner, 4 losers, file matched); test lock-acquire-concurrent-single-winner; 12/12 repeated runs |
| 4 | renew strictly increases expiry; expired renew fails even for matching holder; wrong holder fails; failing renews leave file byte-identical | MET | re-executed expired half by hand (cmp identical); tests lock-renew-extends-expiry, lock-renew-expired-refused, lock-renew-wrong-holder-refused; src/lock.ts:357-376 |
| 5 | status exits 0 reporting expired, holder, expiry; acquire still refused; --take-over succeeds | MET | manual walk (status line "expired holder <id> ... expires <ts>"); tests lock-status-expired-informs, lock-expired-acquire-refused, lock-takeover-expired-succeeds |
| 6 | renew vs takeover serializes, one winner, file holds winner's holderId with its token | MET | re-performed through the hold point (renew lost, winner lease byte-identical, token verified); test covers both applied orders (takeover-first via hold point, renew-first via the primitive's staging seam) |
| 7 | takeover vs takeover, exactly one winner | MET | test lock-takeover-vs-takeover-single-winner (real processes, single-winner postcondition, loser diagnostic); 12/12 repeated runs |
| 8 | release vs takeover, both auditable outcomes, winner lease never removed or altered | MET | tests lock-release-vs-takeover-takeover-first (winner raw byte-identical) and -release-first (loser reason "gone", no lease left) |
| 9 | losing holderId mutations refused, winner lease byte-identical | MET | test lock-losing-holder-mutation-refused (renew and release both) |
| 10 | grep src/lock.ts: no process.kill, signal-0, /proc, pid | MET | swept the whole diff myself (clean; see C-2 below); registered structural test enforces it on every run |
| 11 | create bases on fetched remote head, behind and ahead both, clean worktree | MET | re-executed both stagings by hand; tests pool-create-base-behind and -ahead; fetch uses a force refspec onto the tracking ref, rev-parse of that ref only (src/pool.ts:218-251) |
| 12 | detached HEAD and origin/HEAD unset both resolve | MET | tests pool-create-detached-head, pool-create-origin-head-unset; resolution never consults the clone's HEAD (src/pool.ts:152-182) |
| 13 | unreachable remote fails creating nothing; --offline uses last fetched SHA and records offline: true | MET (pool half) | re-executed both directions by hand; spawn/meta.json clause is the plan's named M1-P4 obligation (deviation 5); the fetch is always attempted, the flag only authorizes the fallback (src/pool.ts:222-238) |
| 14 | duplicate task id refused naming the id | MET | test pool-create-duplicate-refused; O_EXCL record write is the atomic gate behind the fast existsSync pre-check (src/pool.ts:266-275) |
| 15 | two concurrent creates for distinct ids both succeed | MET | test pool-create-parallel-distinct; 12/12 repeated runs; transient ref-lock contention retried on signature |
| 16 | dirty destroy refused; --discard removes; clean destroy removes | MET | re-executed the full ladder by hand; test pool-destroy tests |
| 17 | zero unaccounted tests; registry maps every new behavior; prior mappings intact by name | MET | 56 tests, 0 fail, 2 reasoned skips; 57/57 mappings resolved by my independent name check; pure append verified in the diff |

## The mutation primitive (src/lock.ts), audited against EXT-F-01

- (a) Bypass paths: none. The only writes to the lock path (writeFileSync with wx, renameSync, unlinkSync) live inside applyLeaseMutation, after the claim is held; acquireLease, renewLease, and releaseLease funnel every mutation through it, and every refusal (held, expired-without-takeover, unexpired-takeover, corrupt, holder mismatch) returns before the primitive is invoked, so refusals provably never mutate. The claim file is released in a finally block, so an error inside the critical section cannot leave the claim held by a live process.
- (b) Byte-exactness: sound. All kernel writes go through renderLease (fixed key order from the object literal, 2-space JSON, trailing newline); renew spreads the parsed lease so key positions are preserved. Decisive point: every mutation embeds a fresh randomUUID token in the content, so two distinct mutations can never produce byte-identical files, and byte-compare is therefore exactly equality of lease identity. Semantically-equal-but-byte-different content can only enter via manual edits, which the module docs place outside the contract.
- (c) Token read-back: verifies the winner. The confirmation read happens inside the claim, where no other module writer can interleave, and checks the parsed token against the mutation's own; the sabotage witness (byte-compare disabled) shows the tests fail loudly when a lost update slips through, so the confirmation plus the tests together would catch a broken serialization.
- (d) Crash windows: kill between claim-create and rename leaves the claim file; every later mutation waits a bounded 5s then fails loudly naming the file and the manual remedy (witnessed: 5140ms, exit 1). Kill between rename and claim-release leaves the same state plus an applied lease; lock status still reports the truth. No steal protocol exists (FM-058 honored). The system exits the state by explicit manual removal, exactly the plan's stance.
- (e) Clock discipline: all expiry comparisons are wall clock (Date.now versus Date.parse of expiresAt); no file mtime enters any lease decision. One clock per DR-0007. The mtime-based staleness check exists only in the pool's index.lock proof, where the plan puts it.
- One semantic observation, not a defect: the decision clock is captured at observe time, so a mutation decided against an unexpired lease can apply milliseconds after real-time expiry if and only if the file is unchanged (no contender). Any contender either mutates first (the decided mutation loses the byte compare) or arrives after (sees the applied lease). This is the plan's own decide-then-CAS wording, and the paused-holder witnesses confirm the contested case always serializes correctly. Exposure in the uncontested case is bounded by the claim wait and is observably equivalent to the mutation having run moments earlier.

## The hold-point seam (TIPHYS_LOCK_TEST_HOLD)

Genuinely inert when unset: maybeHoldForTest performs one env read and returns undefined, after which the commands take the identical production path (observed and nowMs stay undefined, so the library observes freshly). When set, the seam only moves the observation earlier and holds the process before the decision; the decision logic and the primitive (claim, byte-compare, apply, confirm) are the same production code, so the staged interleavings exercise the real CAS, not a test fork. The barrier wait is bounded (30s), so an accidentally-set variable degrades to a delay, never a hang, and the variable name cannot collide with anything plausible in production. The renew-first order uses the library's observed/nowMs staging options, which likewise substitute only the observation; the sabotage witness confirms the staged tests fail when the primitive is broken, which is the proof they test the real thing.

## Pool audit

- Base resolution follows EXT-F-03's five steps in order: remote resolution (origin, else the single remote, else refuse), default branch (local origin/HEAD symref, else ls-remote --symref advertisement), fetch with a force refspec onto exactly the tracking ref (a rewound remote is mirrored, not merged), base SHA from rev-parse of the tracking ref only, worktree and branch created at that exact SHA. origin/HEAD-unset is handled by resolution, not assumption (witnessed). The --offline flag never skips the fetch; it only authorizes the tracking-ref fallback after a failed fetch, and offline: false is recorded when the fetch succeeded despite the flag. With --offline, origin/HEAD unset, and the remote unreachable, create fails honestly (the default branch cannot be known); correct fail-closed behavior.
- The pool record (baseSha included) is written with O_EXCL before git worktree add, so the base SHA is recorded before branch creation, and the record doubles as the atomic duplicate gate. A failed add rolls the record back (verified: an unreachable-remote failure and a failed re-create both left zero files in worktrees/). Residue: the task branch, see CR-201.
- The index.lock fail-safe is gated on the full proof: lock exists AND mtime age > 300s AND lsof available AND exit 1 AND empty stdout; lsof missing, erroring, or listing anything refuses. The refusal ladder is unit-tested through the injectable runner (all five refusal branches plus the one provable case), and I verified the real lsof binary's semantics match the probe contract. The proof is applied only to the worktree's own index.lock after retries exhaust on a lock signature; everything else fails loudly.

## Constraint sweeps (C-1, C-2, C-3)

- C-2: I swept every added line of the diff for pid, kill, signal, /proc, ps, and lsof. src/lock.ts and src/commands/lock.ts are clean (the registered structural test enforces this on every future run). lsof appears exactly once in executable code, in the pool's index.lock staleness proof, which the plan sanctions (FM-036/FM-051); its pid-typed output is used only as "must be empty" evidence, never as identity. All other matches are comments, tests asserting the absence, and the work history describing the sweep.
- C-1: no state in the diff is derived from a log tail; the lock reads the lease file, the pool reads records and git exit codes and stdout.
- C-3: nothing auto-backgrounds; src/ uses spawnSync only (foreground); no detached: true, no unref anywhere in the diff (child_process.spawn appears only in tests, awaited to completion).

## Declared deviations, judged

1. test/behaviors.json append (not in files-to-touch): mandated by the section 3 test accounting rule and criterion 17; the standing clerical gap; pure append verified. Accepted.
2. Lease fields token and durationSeconds beyond the plan's four: necessity, not convenience. The token is the plan's own per-mutation confirmation witness made persistent, and criterion 6's assertion surface ("the token its mutation wrote") requires it in the file; durationSeconds makes the PR-203 half-life computable and gives renew a sane default. Doctor's P2 lock check tolerates the extra fields (verified live, including the corrupt-expiry FAIL). No pid-like semantics. Accepted.
3. TIPHYS_LOCK_TEST_HOLD hold point: necessity under the phase's determinism rule; verified inert when unset and verified to drive the real primitive (see the seam section). Accepted.
4. Extra registered tests beyond criteria-named behaviors: all trace to step text (pool list, index.lock fail-safe, dead-holder exclusion, unexpired-takeover refusal) or harmless coverage; registered honestly. Accepted.
5. Criterion 13's spawn/meta.json clause deferred to M1-P4: the criterion's own text names spawn as M1-P4, and P4 criterion 1 asserts baseSha and baseOffline in meta.json; the pool half (offline: true in the record) is delivered and witnessed. A correct reading of the plan, declared rather than improvised. Accepted.

## Findings

No high or medium findings.

- CR-201 (Low, pool lifecycle): pool destroy leaves the task/<id> branch in the project clone, so re-creating a destroyed task id passes the duplicate gate and then fails inside git worktree add with a raw git error ("a branch named 'task/t-behind' already exists"), not a clean refusal (reproduced; no debris is left, the record rolls back). The plan does not require branch cleanup (P4 teardown owns branch disposition), so this is not a criterion breach, but the failure surface is misleading. Fix: in poolCreate, pre-check refs/heads/task/<id> and refuse with a reason naming the branch and the destroy history; or document id reuse as unsupported. src/pool.ts:280-298.
- CR-202 (Low, lock primitive hygiene): a crash or rename failure between the staging write and renameSync strands <lock>.tx-<token> in state/ forever; unique names make it harmless to correctness and the directory is gitignored, but it accumulates. Fix: unlink the stage path on the failure path of the rename branch. src/lock.ts:228-231.
- CR-203 (Low, pool retry signature): LOCK_CONTENTION includes the generic phrase "File exists", which can match permanent non-lock git failures and buys them ~1s of pointless retries before the true error surfaces (the outcome is still a correct failure). Fix: drop "File exists" or anchor the alternatives to git's lock-file message shapes. src/pool.ts:87.
- CR-204 (Low, diagnostics): the stuck-claim timeout surfaces through acquire as "lock held (mutation claim file ... inspect and remove it manually)"; the prefix says "lock held" even when no lease exists, which could nudge an operator toward takeover instead of claim-file removal. The detail names the file and remedy, so the information is present; the prefix is the only issue. Fix: a distinct prefix for the claim-timeout reason in acquireLease's failure wrapping. src/lock.ts:172-179 and 321-323.

Observations (no action required): the decide-then-CAS decision-clock semantics noted in the primitive audit; --offline with origin/HEAD unset and the remote unreachable fails closed (correct); poolDestroy's final unlinkSync is outside any try and an exotic permission error there would exit via an unhandled throw (still nonzero).

## Honesty section (what this review could not verify)

1. Local execution was on Node v22.22.2 below the >=26 floor via type stripping; CI on Node 26 is the authority for the gates. I could not observe the PR's gates check (gh is absent in this environment); the workflow file is untouched by this PR.
2. I could not read the PR body directly; the declared deviations were audited from the in-diff work history (delivery/work-history/m1-p3.md), which matches the deviation summary supplied to me.
3. My repeated-race evidence is 12 full runs of the six race witnesses (72 race executions, 0 flakes); I did not replicate the implementer's 20x-per-witness counts.
4. The broken-CAS sabotage turned two of the three staged witnesses red; the release-first witness exercises the CAS's absent-lease branch, which my specific sabotage left intact, so its red-detection is inferred from the branch structure rather than witnessed.
5. Criteria 7, 12, 14, and 15 were witnessed through the (green, repeated) test suite rather than re-scripted by hand individually.
6. Cross-host and networked-filesystem lease semantics are untested and unclaimed (DR-0007: one filesystem, one clock; M4 residue). The O_EXCL claim protocol's guarantees on NFS-like mounts are outside what this review checked.
7. The defaultLsof path inside a real destroy-time index.lock contention was not exercised end to end (it requires a live 300s-old lock under a racing git process); the predicate's refusal ladder is unit-tested and the real binary's option and exit semantics were probed directly.
