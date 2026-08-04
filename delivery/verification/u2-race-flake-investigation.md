# U-2 race-witness flake investigation

- Date: 2026-08-04
- Subject: U-2, the intermittent failure of EXT-F-01 race witnesses 35 and 37 at commit b475546 (delivery/review/verification-m1-p3-fix-round.md, unrefuted candidate U-2 and honest-failure item 1)
- Method: four independent hypothesis investigations, each in its own isolated clone of the repository at b475546, followed by adversarial refutation of the two claimed root causes by two further independent agents. Every claim below is marked as established by execution or by exact code reading. Nothing here is inference presented as measurement.
- Constraint observed: no investigator modified, built or ran tests in /home/user/tiphys-ai-helmsman, and none touched the shared worktree scratchpad/wt-m1-p3.

---

## VERDICT

**The lock's compare-and-swap is sound. U-2 is not evidence of a kernel defect. The trigger of the two original failures remains UNEXPLAINED: exactly one of two possibilities holds, either the hold seam released early so the interleave was never staged, or the tree under test did not contain the byte compare.**

CORRECTION TO THIS LINE (owner review of PR #5, applied by the orchestrator). This verdict originally ended "and the honest answer is that the failing runs did not execute the shipped compare-and-swap as written". That overstated what this report itself establishes. Under possibility (a) below, the hold seam releasing early, the shipped compare-and-swap executes exactly as written and simply has nothing to race; only possibility (b) means the tree under test lacked the byte compare. The disjunction is settled, the branch of it is not, and the original wording asserted one branch as fact. The body of this section stated the disjunction correctly throughout; only this summary sentence was wrong.

In plain language, answering the four questions that were asked:

1. **Is the compare-and-swap sound? Yes, and this is now well established.** It was attacked from five independent directions and held every time: 6000 contested cross-process mutations, 4000 O_EXCL claim contests, a real process SIGSTOP-parked at each of the six points inside the critical section, 1.76 million concurrent reads across 60000 renames, and 1200 standalone replays of the two failing witnesses. Zero double winners in every configuration that did not first sabotage the source or steal a live claim file. By exact reading, an ABA return to a previously observed byte string is not constructible, because every published lease carries a fresh `randomUUID()` token (src/lock.ts:330, :335, :452), and the critical section (src/lock.ts:216-313) contains no `await`.

2. **Is this a false witness in the test seam? Structurally yes, mechanically unattributed.** The seam at src/commands/lock.ts:45-59 has a real defect: its wait loop `while (!existsSync(barrier) && Date.now() < deadline)` has two exits and only one of them means "held", and on the other exit the child proceeds silently into the mutation. Nothing in the child, the parent or the test can tell the two apart. That defect is confirmed. What is **not** established is that it fired in the wild: both of its exits were affirmatively excluded on this box (see hypothesis 2 below), and no third route to a no-hold exit was found by anyone.

3. **Is it cross-file test interference? No. Ruled out on every named vector**, by construction and by execution (see hypothesis 4 below). The observation that the failures appeared only in the full-suite mix is real, but it is not explained by any interference mechanism; it is better explained by the fact that the full-suite runs were the ones executing inside a shared worktree that other agents were editing.

4. **Is it still unexplained? Yes, for the trigger.** What is settled is the disjunction. The TAP payload forces `actual: 0`, so both held children exited 0, so both mutations won. Under pristine b475546 that is impossible for a child that actually held, because in both witnesses the takeover process has fully exited and its new bytes have already been read by the parent before the barrier is written (test/lock.test.ts:330-333 and :392-394). So exactly one of these is true:
   - (a) the hold seam released early and the child applied before the takeover, or
   - (b) the `src/lock.ts` in the tree under test at 13:13:40 to 13:14:00 did not contain the byte compare, or
   - (c) the compare-and-swap admitted two winners.

   **(c) is excluded.** Beyond the campaign evidence above, there is a structural reason these two witnesses cannot detect a CAS hole at all: once the hold holds they are strictly sequential. The takeover has exited before the barrier is written, so there is nothing for the compare-and-swap to race against. Concurrent CAS behaviour is witnessed by tests 27 and 36, not by 35 and 37.

   **Between (a) and (b) the evidence leans toward (b), a verification-harness artifact, but does not prove it.** (b) has a demonstrated deterministic reproduction and physical forensic support; (a) has a confirmed mechanism but both of its triggers were excluded by execution. Neither reaches the bar of a proven root cause, and this report does not award one.

**The one thing that is fully settled and that the merge decision depends on: U-2 is impeached as evidence against the lock primitive. It should not be recorded as "the CAS may admit two winners", and it should not be recorded as closed either.**

---

## Reproduction status

**Total attempts in the exact failing configuration** (plain `npm test`, whole suite, files in parallel, no `--test-name-pattern`, isolated clone at b475546, pristine or tracing-only-instrumented source):

| Investigator | Full-suite runs | U-2 signature (tests 35 or 37) |
| --- | --- | --- |
| Hypothesis 1 (brute-force reproduce) | 93 | 0 |
| Hypothesis 2 (hold point) | 15 | 0 |
| Hypothesis 3 (adversarial CAS attack) | 20 | 0 |
| Hypothesis 4 (cross-file interference) | 29 | 0 |
| Refutation pass 1 | 13 | 0 |
| Refutation pass 2 | 10 | 0 |
| **Total** | **180** | **0** |

Conditions varied deliberately across those runs: solo on an unloaded box, two, three and four concurrent full suites, six CPU hogs, `dist/` present and absent, four copies of lock.test.ts inside one suite, and append-only tracing of every hold-point wait and every CAS read.

Plus, in supporting configurations: 1200 standalone replays of witnesses 35 and 37 against unmodified binaries, 149 targeted runs of the three barrier witnesses with `node --test test/pool.test.ts` looping in a concurrent process (a configuration the original pass never tried), 3000 direct hold-point-plus-CAS probes shaped like witness 37, and roughly 660 instrumented hold events traced.

**Statistical bearing.** By the rule of three, 0 events in 180 runs puts the 95 percent upper bound on the per-run U-2 failure rate on a pristine tree at 1.7 percent. The original campaign observed 2 in 11, or 18 percent. At that rate, P(0 in 180) is about 2e-16. Whatever produced the original failures was not a property of the pristine tree at the rate observed.

**Runnable reproductions that exist.** None reproduces the natural flake. Three reproduce the *symptom* by injecting a mechanism, and they are useful precisely because they let a future occurrence be discriminated:

- `cd .../scratchpad/u2-sab && npm test` reproduces the run3 output shape deterministically (6 of 6, and independently re-verified 4 of 4). That clone is pristine b475546 with exactly one edit: the `} else if (current.raw !== observed.raw) { ... }` branch deleted from src/lock.ts:244-249.
- `.../scratchpad/u2-flip.sh 5` reproduces it transiently (3 of 5) with a working tree that is byte-clean and `git status --porcelain` empty both before and after, by swapping src/lock.ts between pristine and CAS-disabled on a duty cycle while `npm test` runs.
- `cd .../scratchpad/u2-hold-point && node --test test/zzexp-unheld.test.ts` reproduces both error strings by pre-creating the barrier so the child never holds, against unmodified sources.

The most valuable artifact produced is not a reproduction but a discriminator: `.../scratchpad/u2-cas-hole/probe/witness.mjs` replays both witnesses and, on a double win, records **which order the two mutations applied in**. That single measurement separates (a) from (b) from (c), and it is exactly the measurement the shipped tests throw away, because they abort at test/lock.test.ts:335 and :396 before reaching the file-state assertions at :337 and :398.

---

## Hypothesis 1: the failing run did not execute pristine source (verification-harness artifact)

**Tested.** Brute-force the exact failing configuration many times and only narrow after a failure; then, once the natural flake refused to appear, work backwards from the output shape and from filesystem forensics on the shared scratchpad.

**Found.**

Established by execution:

- 93 full-suite runs at b475546 produced zero U-2 failures.
- Deleting only the CAS byte-compare branch from a pristine clone and running plain `npm test` reproduces the run3 output shape: `# tests 64 / # pass 60 / # fail 2 / # skipped 2`, `not ok 35` with error `both operations won`, `not ok 37` with error `expired former holder removed the new lease`, tests 36 and 38 green. 6 of 6 runs by the original investigator, 4 of 4 on independent re-verification. One repeat produced 59/64 with tests 35, 36 and 37 red, matching the count of the second original failing run.
- Test 38 stays green under this sabotage because the release removes the file, so the surviving `!current.present` branch still refuses. That is why the sabotage produces the observed two-failure pattern rather than a three-failure one.

Established by direct verification during this consolidation (I re-ran the `stat` and `sha256sum` myself):

- `scratchpad/lock.ts.orig` (18428 bytes, mtime 13:06:32.266) and `scratchpad/cmdlock.ts.orig` (7119 bytes, mtime 13:06:32.269) are byte-identical (sha256 `0249a8aa...` and `51bca699...`) to pristine b475546 `src/lock.ts` and `src/commands/lock.ts`. A backup of exactly the two files that decide witnesses 35 and 37, taken 3 milliseconds apart.
- `scratchpad/instr/`, an mtime-preserving copy of the shared worktree taken at 13:17:30, carries `src/` with directory mtime 13:06:35.753, that is an entry create or rename inside `src/` 3.48 seconds after those backups were written.
- That same copy carries `src/lock.ts` with mtime 13:14:23.233 and pristine content. `run3.txt` has mtime 13:14:41.409 and reports `# duration_ms 61054`, so the failing run spanned roughly 13:13:40.4 to 13:14:41.4. **The worktree's src/lock.ts was therefore rewritten in place with pristine content 42.8 seconds into the failing run**, after both failing witnesses had completed and while the run was still executing its later tests, all of which passed.
- The enabling practice is recorded in the verification report itself: "every lens experiment was taken from a byte copy and restored from it", and lens 2 "re-performed the broken-CAS sabotage against the final code to confirm the race witnesses still go red". A broken-CAS sabotage demonstrably was performed during that round.

**What was refuted, and this matters.** The claim was submitted as a proven root cause and did not survive as one:

- The "exact fingerprint" argument is vacuous. Both witnesses assert `assert.notEqual(childStatus, 0, msg)`, so `code: ERR_ASSERTION`, `name: AssertionError`, `operator: notStrictEqual`, `expected: 0` and `actual: 0` are forced by the assertion *form* for any cause whatsoever that makes the held child exit 0, and the `error:` string is the hard-coded message argument. The only fields in the compared block capable of discriminating are `duration_ms`, `location` and `stack`, and those **differ** between run3 and the sabotage run (run3 test 35 is `duration_ms: 5710.637163`, the sabotage run is `7040.028193`). "The diff is empty" is true only after removing every discriminating field.
- The refuter demonstrated this by construction: a clone whose src/lock.ts is byte-identical to pristine (same sha256 as lock.ts.orig, CAS fully intact) with only an intermittent hold in src/commands/lock.ts produced `60/64`, `not ok 35` at the same TAP output line 211, `not ok 37`, tests 36 and 38 green, with an assertion payload identical to run3 for both witnesses.
- The 59/64 corroboration is unsupported. The verification report records only the count for that run (delivery/review/verification-m1-p3-fix-round.md), never which tests failed.
- The forensics fit an innocent alternative equally well. Finding U-1, from the same lens 1 that ran the 11 full suites, documents deleting the `if (result.claimTimeout === true)` block from `renewLease` only (src/lock.ts:460-465) and observing the degraded operator output, which comes from src/commands/lock.ts. That experiment spans precisely the two backed-up files. Applied to a pristine clone and run three times, it produces 62/64 with **zero** failures. So the 13:06 backup pair and the 13:14:23 restore are at least as well explained by an experiment independently measured to leave the suite green.
- The mtime dating is internally weak: the story needs the 13:14:23 restore to have been an in-place write (it left the `src/` directory mtime unchanged), and in-place writes leave no directory trace, so nothing bounds the modification time from below. A sabotage live from 13:06:35 to 13:14:23 spans 7 minutes 48 seconds, about seven 61-second suites, which sits awkwardly against "2 of 11 runs failed".

**Status: strong circumstantial support, not proof.** What the forensics establish is that *something* was modified in `wt-m1-p3/src/` at 13:06:35.75 and that `wt-m1-p3/src/lock.ts` was rewritten with pristine content 42.8 seconds into the failing run. What they do not establish is *what* was modified. The concurrent-mutation family of explanations is the only one that also explains the 0-in-180 result and the full-suite-only observation, and it is the leading candidate. It is not proven, and it must not be recorded as proven.

---

## Hypothesis 2: the hold point is a false witness

**Tested.** Whether `TIPHYS_LOCK_TEST_HOLD` (src/commands/lock.ts:45-59) can let a child proceed to the compare-and-swap without ever having held at the barrier.

**Found, and confirmed independently.**

The structural deduction is correct and was re-derived from scratch by the refuting agent. For witness 37 (test/lock.test.ts:379-399): the TAP records `operator: notStrictEqual`, `actual: 0`, so the release child exited 0; src/commands/lock.ts's release path returns 0 only when `releaseLease` reports ok, which requires `applyLeaseMutation` to win, which requires `current.raw === observed.raw` (src/lock.ts:243-249) against the pre-takeover bytes. The parent's takeover is `spawnSync` and had fully exited before `writeFileSync(barrier, "")` at :394, and it exits 0 only after its own token confirmation read. So the bytes had already changed. The O_EXCL claim (src/lock.ts:187, held across read, compare, write and confirm with no `await` inside) forbids the only alternative interleave. Witness 35 is the same argument at :335. **Under pristine source, the child cannot have held.**

The seam defect is real and confirmed by exact reading:

```
const deadline = Date.now() + 30_000;
while (!existsSync(barrier) && Date.now() < deadline) {
  await sleep(10);
}
return { observed, nowMs };
```

Two exits, one meaning. On the deadline exit the child returns the same shape and walks into the mutation carrying a stale observation and a stale frozen decision clock, and tells nobody. The parent's only readiness signal, `<barrier>.observed`, is written at src/commands/lock.ts:54 **before** the wait, so the parent cannot distinguish "child is parked" from "child already applied".

A correction to the original verification pass's reasoning was also established by execution, twice, independently: node:test measures `duration_ms` with `hrtime()` (CLOCK_MONOTONIC; confirmed both by extracting `this.startTime = hrtime();` from the node binary and by measuring a +31s realtime step yielding a reported `duration_ms` of 996.9). The seam's bound uses `Date.now()` (CLOCK_REALTIME). **So "both failed fast, so the 30 second bound was never reached" is a non-sequitur.** That inference should be struck from U-2.

**What was refuted: the trigger.** The claimed root cause did not survive as a cause, and both named exits were excluded:

- **First-evaluation exit: impossible by construction.** The barrier lives in a `mkdtempSync` directory (test/lock.test.ts:124-132), which the kernel has just created and which is therefore empty; the only writer of the barrier path is the parent, after the takeover has exited. The reproduction that forces this exit creates the file by hand before the spawn. That is a forcing, not a reproduction.
- **Deadline exit: no source found, and the offered reproduction is not a model of it.** The clock-step preload was injected into the held child only. CLOCK_REALTIME is a kernel clock; no realtime anomaly can be visible to a child and invisible to the parent on the same box, and that asymmetry is load-bearing for the result. Modelled faithfully (the step applied to every process of the run), a single forward step fails witness 35 across a roughly 5 second window of step instants but leaves witness 37 **passing** at every instant tested, because the step is permanent and witness 37's deadline is computed after it. Producing run3's pair would require two independent forward realtime steps in one 61 second run, of at least 24.3 and 28.2 seconds, landing in a 5 second and a 0.9 second window, and roughly half the instants in the second window instead produce `file .../release-barrier.observed never appeared`, which run3 does not show.
- **A continuously fast realtime clock is excluded structurally and by execution.** The parent's realtime-driven waits scale with the same clock, so at any rate k the parent's `waitPastExpiry` completes at 5s/k while the child's deadline sits at 30s/k: the barrier always wins. Run at k=8 machine-wide, all three barrier witnesses passed.
- **No clock anomaly exists on this box.** A 200 Hz `Date.now` versus `performance.now` monitor logged zero divergences above 250 ms over 20.0 minutes (max skew 1.8 ms); a second 10 Hz monitor logged zero above 500 ms over 50 minutes; roughly 660 traced hold events across three investigators show `preExisted` true zero times, `deadlineBlown` true zero times, and a maximum wall-versus-monotonic skew of 51 ms. The guest has no chrony, ntpd or systemd-timesyncd, no `/dev/ptp*`, and `clocksource=tsc`, so CLOCK_REALTIME and CLOCK_MONOTONIC derive from the same counter.
- **It does not explain the critical observation.** src/commands/lock.ts:56 evaluates `existsSync(barrier)` first, so a child starved by the parallel pool.test.ts process, waking after the barrier exists, always takes the held branch. Load can delay the exit; it cannot un-hold it.

**Status: mechanism confirmed, trigger excluded on both known routes.** Either an external machine-wide realtime step really did occur twice in that one run and was never observed in about 70 minutes of monitoring, or there is a third route to a no-hold exit that nobody has found. Both authors of this angle state plainly that they did not reproduce the natural flake.

---

## Hypothesis 3: adversarial attack on the compare-and-swap, assuming it is holed

**Tested.** Assume the CAS genuinely admits two winners and try to prove it, by SIGSTOP-parking real processes at every point inside the critical section and by high-concurrency cross-process mutation torture. This is the cross-process case that "one orchestrator per fleet" actually depends on; a prior lens had covered only the in-process case.

**Found: the CAS holds, in every unaided configuration.** All by execution:

- O_EXCL claim exclusivity: 8 racers by 4000 contests, exactly 4000 create successes, 0 contests with more than one winner. `/tmp` is local ext4 on `/dev/vda`, so O_EXCL and rename carry normal POSIX guarantees.
- Cross-process mutation torture: 6000 contested mutations across three configurations (2000 staged so that every worker is handed byte-identical observed state and the CAS is the only possible decider, 2000 live mixed, 2000 live takeover-only), with 1990 to 1992 of 2000 workers entering within 25 ms of the barrier. Exactly one winner in all 600 rounds, 0 zero-winner rounds, 0 leftover claim or stage files, and in staged mode the surviving file always held exactly the winner's token.
- Parking a real process at each of six points inside the critical section (claim created; after the stage sweep; after the byte compare and before the apply; after the stage write and before the rename; after the apply and before the confirm; after the win and before the claim release), each against a full competing mutation, **with the claim intact**: at every reachable point the competing mutation lost cleanly, either via the CR-204 claim timeout or a legitimate refusal. Zero double wins.
- Filesystem ordering: 60000 renames observed by two concurrent readers doing 1.76 million reads, with 0 version regressions, 0 unparseable reads, 0 empty reads on the rename path.
- 1200 standalone replays of witnesses 35 and 37 against the unmodified binaries: 0 double wins, 0 hold escapes.

By exact code reading: the critical section (src/lock.ts:216-313) contains zero `await`; the claim-wait timeout `return` (src/lock.ts:205-211) is lexically before the `try`, so a timed-out mutation never unlinks a claim it does not own and never enters the critical section, that is it fails closed; and every published lease carries a fresh `randomUUID()` token (src/lock.ts:330, :335, :452), so no two distinct lease states can compare byte-equal and ABA is not constructible.

**Also found: a genuine, separate CAS double win, reachable only through the product's own documented operator remedy.** Reproduced 10 times in 144 trials against completely unmodified `src/lock.ts` and `bin/tiphys.ts`. Mechanism, by exact reading: between the byte compare succeeding (src/lock.ts:244-249) and the apply, nothing re-reads the file, and the token confirmation at :298-305 asserts only "my bytes are in the file", which is a last-writer-wins check, not a compare-and-swap. It catches an intruder who applies **after** the victim, never one who applied **before** and lost the race to write last. So the O_EXCL claim file is the sole serializer, with no second line of defence, and it is advisory: no handle is held and there is no ownership check on the unlink at :309. The trigger is reachable because src/commands/lock.ts:78-85 tells the operator "stale claim file `<path>`; if no mutation is in flight it was left by a crashed one, inspect and remove it manually", while the claim-wait bound is only 5000 ms and a stalled mutation can hold the claim indefinitely.

This is **not** the U-2 mechanism: nothing in the suite removes another process's in-flight claim (all four `rmSync(claimPath)` sites in test/lock.test.ts remove claims the test itself planted, in its own `mkdtemp` fleet, with no mutation in flight; `<lock>.mutex` is referenced only in src/lock.ts and those four sites). It should be filed as its own finding.

A secondary defect on the same path: parked at P4 with the claim stolen, the intruder's unconditional stage sweep (src/lock.ts:226) deletes the parked mutation's stage file, and `renameSync` at :287 then throws a raw Node `ENOENT` stack out of the CLI uncaught, rather than a tiphys diagnostic.

**Also established: the U-2 symptom is producible with a perfectly sound CAS.** Positive control 1 (pre-create the barrier so the held child never waits, real unmodified binaries): 8 of 8 double wins reproducing both failures with the exact error strings, the CAS never contested. Positive control 2 (byte compare and token check deleted in the child only): 6 of 6 double wins with the **opposite** signature, that is the final lease is the held mutation's rather than the takeover's. The two mechanisms are cleanly distinguishable by apply order, and only the second is a CAS hole.

---

## Hypothesis 4: cross-file interference in the full-suite mix

**Tested.** Whether test/lock.test.ts and test/pool.test.ts collide when `node --test` runs them as parallel processes: shared temp paths, environment leakage, cwd, file-descriptor or port exhaustion, or starvation breaking a barrier assumption.

**Found: ruled out on every named vector.**

By construction and exact reading:

- **Colliding temp paths.** Every `mkdtemp` site in the suite uses a distinct prefix (`tiphys-p2-doctor-`, `tiphys-p2-bin-`, `tiphys-p2-init-`, `tiphys-p3-pool-`, `tiphys-p3-lock-`), and `mkdtempSync` is unique by construction. Every fleet, barrier and lock path is a descendant of one of these.
- **Environment leakage.** `grep -rn "process\.env" test/ src/ bin/` shows zero assignments to `process.env` anywhere; every use is a read or a per-spawn `{...process.env, X}` object. `TIPHYS_LOCK_TEST_HOLD` is set at exactly three sites (test/lock.test.ts:321, :388, :410), all per-spawn, and is never present in the test process's own environment, so the racing `runCli` invocations cannot hold.
- **cwd.** No `process.chdir` anywhere in src/, bin/ or test/. cwd is read only by CLI children, always spawned with an explicit cwd.
- **Cross-file writes.** Every filesystem write in src/ lands inside a fleet home except `<barrier>.observed`.
- **Ports and file descriptors.** No sockets or network anywhere in the suite; `ulimit -n` is 20000.
- **OOM or spawn failure.** A signal-killed child gives `close` code `null`, and `assert.notEqual(null, 0)` passes; a spawn failure rejects the promise and produces a different failure shape. Only exit code exactly 0 produces these two messages.
- **Filesystem exotica.** `/tmp` is local ext4 on `/dev/vda`, no overlay, 9p or virtiofs.
- **Intra-file overlap.** Measured directly: `node --test` runs top-level tests within a file strictly sequentially.

By execution:

- 149 runs of the three barrier witnesses with `node --test test/pool.test.ts` looping continuously in a concurrent process, which is precisely the cross-file configuration the original pass never combined: 0 failures.
- 3000 direct probes of the hold point plus CAS shaped like witness 37: 0 hold failures, 0 double wins.
- Starvation reaching the 30 second bound is excluded for the original run: across 537 instrumented hold events the maximum observed wait was 5349 ms (the renew window; the release and takeover windows ran 152 to 300 ms), that is about 5.6x headroom on the widest window and about 100x on the two short ones, all measured under three concurrent campaigns. A genuine 30 second stall would advance the monotonic clock too, so `duration_ms` would have shown it.

**One negative result worth recording so it is not over-read:** absolute test durations are not a discriminator across machines. Across 21 measured passing full-suite runs on the investigating box, test 35 ran 6529 to 8064 ms and test 37 ran 1827 to 2876 ms, while run3's **passing** test 38 (1775 ms) is also below that box's minimum. The original machine was simply faster. No within-run duration ratio was found that separates a hold-skipped timeline from a normal one.

---

## New defects found while investigating (all on pristine b475546)

These are not U-2, and they are stated separately because they were established by execution and independently corroborated.

### D-1: the initial-acquire publish is not atomic, so a healthy lock can be reported corrupt

**Severity: medium. Found independently by three of the four investigators. Observed naturally twice in the 180 full-suite runs.**

`src/lock.ts:263` publishes a newly acquired lease with `writeFileSync(lockPath, next, { flag: "wx" })`. Node implements that as `openSync(path, 'wx')` followed by a separate `writeSync`, so the file **name** becomes visible at length 0 before the lease bytes land. I verified the mechanism directly during this consolidation: after `openSync(p, "wx")`, `statSync(p).size` is 0 and `readFileSync(p, "utf8")` is `""`; only after the `writeSync` does the size become non-zero.

`observeLease` (src/lock.ts:125-136) and `leaseStatus` read **outside** the claim, and every acquire, renew, release and status performs one. A reader landing in that window gets `parseLease("") === undefined` and the caller emits `lease file <path> is corrupt; inspect it manually` (src/lock.ts:357, :425, :493) or `corrupt` from `lock status` (:530).

Measured: one writer racing one reader on that exact call for 8 seconds produced 518891 empty and 275556 partial observations; a more realistic measurement with the real library on both sides gave 2094 corrupt observations in 4000 acquire/release cycles, with the zero-byte window estimated at about 11 microseconds per acquire.

Observed naturally, twice, in the full-suite campaign: `not ok 27 - five concurrent lock acquires yield exactly one winner`, error `loser without a diagnostic`, with stderr `tiphys lock: lease file .../orchestrator.lock is corrupt; inspect it manually`. **That is acceptance criterion 3's own witness turning red on pristine code**, and it is the criterion's every-loser-gets-a-diagnostic promise failing.

This is fail-closed: all three lease operations refuse when `observed.lease === undefined`, so no mutation can act on a torn read and there is no double-winner risk. It is a false-alarm and observability defect. Note the asymmetry the module never justifies: renew and takeover publish atomically through stage-write-then-rename (src/lock.ts:284-287) and are immune; only the PR-006 absent-lock create is exposed.

**Fix:** publish the initial lease the same way, staging and then renaming or linking into place, keeping the O_EXCL create purely as the existence test so PR-006's exclusion property is preserved while the content never appears half-published. Add a regression witness that races `observeLease` against the absent-lock acquire; test 27 as written catches it about 1 time in 90.

### D-2: the claim file is the sole serializer, and the CLI tells operators to delete it

**Severity: medium. Reproduced 10 times in 144 trials against unmodified sources.** Full mechanism under hypothesis 3 above. Two things are true together and neither is written down: the O_EXCL claim is the only thing serializing mutations, and src/commands/lock.ts:78-85 actively instructs operators to remove it. The module comment at src/lock.ts:42-46 claims the token confirmation is a second safety net; it is not.

**Fix:** re-read and re-compare immediately before the apply, so that a lost claim degrades to a clean loss rather than a double win; and correct both the remedy text and the module comment to state plainly what removing a live claim can do. Preferably both. Same finding, secondary: make the `renameSync` at src/lock.ts:287 emit a tiphys diagnostic rather than a raw ENOENT stack when its stage has been swept.

### D-3: the test hold seam is silent about not holding

**Severity: medium (test integrity).** Detailed under hypothesis 2. Regardless of what caused U-2, a green run of witnesses 6 and 8 currently cannot be distinguished from a run that never staged the interleave at all.

### D-4: environment artifact, not a product defect

One full-suite failure was traced to this box's signed-commit configuration: `commit.gpgsign=true` with `gpg.ssh.program=/tmp/code-sign`, which calls an MCP server on 127.0.0.1. Under I/O load the signer timed out and `git commit` exited 128 inside `tiphys init` (`context deadline exceeded ... fatal: failed to write commit object`). Worth recording so the next investigator does not chase it.

Two further failures re-performed the already-reported finding V-2 (`not ok 55 - two concurrent pool creates for distinct task ids both succeed`) independently.

---

## Consequences for merging

**M1-P3 can merge, with two specific guards landing in the fix round that is already in flight. It should not merge as-is, and there is no basis for blocking it.**

Why it can merge: the thing U-2 threatened, the correctness of the compare-and-swap that implements "one orchestrator per fleet", is the single most heavily tested proposition in this investigation and it held under every attack. 180 full-suite runs, 6000 contested cross-process mutations, 4000 O_EXCL contests, forced parking at all six points inside the critical section, and 1.76 million concurrent reads produced zero unaided double winners. The mutation contract adopted from EXT-F-01 is implemented soundly: one primitive, decided inside an O_EXCL claim, byte-compared against the observation, confirmed by a fresh per-mutation token, with no `await` in the critical section and no constructible ABA.

Why not as-is:

- **Guard 1 (required): fix D-1, the non-atomic initial-acquire publish.** This is a real defect on pristine code that intermittently turns acceptance criterion 3's own witness red, and that lets `lock status` and `doctor` report a healthy fleet as corrupt. M1-P4 is about to build holdership checks on `observeLease`, so this should not be carried forward. The fix is small and the correct shape already exists in the same file.
- **Guard 2 (required): fix D-3, make the hold seam loud.** Roughly ten lines. Without it, criteria 6 and 8 are backed by witnesses that can silently degrade into no-op tests, so their evidentiary weight is conditional. This was the original verification pass's own suggestion; this investigation confirms it is the right one and supplies the reason. It must **not** be recorded as "the fix for U-2", because U-2's cause is not established.
- **Guard 3 (recommended, cheap, high value): capture the discriminator.** In test/lock.test.ts, move the file-state assertions ahead of the exit-code assertions, checking line 337 before 335 and 398 before 396. The apply order is the entire answer to U-2 and the test currently throws it away. Also add witness 35's "environment too slow" guard (test/lock.test.ts:324-327) to witnesses 37 and 38, which have none and are therefore strictly weaker.
- **Filed separately, not merge-blocking: D-2**, the claim-steal double win. It is real and reproduced against unmodified sources, but it requires an operator action outside the normal flow, and the shipped tests do not reach it.

**How U-2 should be recorded.** Not as "the CAS may admit two winners", which is now positively excluded for these two witnesses. Not as "closed, harness artifact", which the fingerprint and forensic evidence do not support at the strength claimed. The accurate wording is: *the two failing runs did not execute the shipped compare-and-swap as written; the compare-and-swap itself is sound; the trigger is unattributed, with a concurrent source modification in the shared verification worktree the leading unproven candidate.*

**One process change is a condition of trusting the next verification round.** The round's stated discipline, "every lens experiment was taken from a byte copy and restored from it", is unsafe when several lenses share one worktree: a sabotage window in one lens becomes a phantom high-severity concurrency finding in another, on a tree that is byte-clean by the time anyone looks. Whether or not that is what happened here, it is a live hazard and it cost this investigation and the previous one several hours. Require every lens that mutates sources to work in its own copy, and require full-suite verification runs to record the mtime and hash of `src/**/*.ts` at run start and at run end.

---

## Structural fix regardless of cause

Whatever produced the original failures, these four changes convert this class of failure from silent and unattributable into loud and self-describing. They are worth making even if U-2 is never explained.

**1. The hold seam must fail when it did not hold.** In `maybeHoldForTest` (src/commands/lock.ts:45-59), close both exits:

```
if (existsSync(barrier)) {
  throw new Error(`lock test hold point: barrier ${barrier} already existed before the hold; this interleave was never staged and the run is not evidence`);
}
// observe, freeze clock, write <barrier>.observed, wait loop unchanged
if (!existsSync(barrier)) {
  throw new Error(`lock test hold point: barrier ${barrier} never appeared within 30000ms; this interleave was never staged and the run is not evidence`);
}
```

Verified by execution: this converts both forced false witnesses into loud, self-describing failures. Additionally, bound the wait on `process.hrtime.bigint()` rather than `Date.now()`, and record **why** the wait ended, because the current mix of a realtime bound with monotonic test durations is exactly what made "it failed fast" look like proof the bound was not reached.

**2. The witnesses must assert that the hold held, and must record apply order.** Have the child write `<barrier>.released` only after it observes the barrier, and have each witness assert that file exists before scoring the compare-and-swap. Then move the file-state assertions ahead of the exit-code assertions so a double win records which mutation applied first. That one measurement separates "the seam escaped" from "the CAS is holed" from "the source was not what we think", in one line, in the failing run itself. Also print the child's stderr on failure, so a child that threw is not silent.

**3. Verification runs must pin the source they ran against.** Record the sha256 and mtime of every file under `src/` at run start and at run end, in the run's own output. A run whose hashes changed mid-flight is not evidence and should say so. Any lens that mutates sources works in its own copy, never in a shared worktree.

**4. Publish the initial lease atomically (D-1) and re-compare before applying (D-2).** Both remove a class of failure rather than making it louder. The first stops a healthy lock from being reported corrupt and stops an acceptance witness from flaking; the second means a lost claim degrades to a clean loss rather than two live holders.

---

## Honest failure section: what remains unestablished

1. **The trigger of the original 2-of-11 failures is not established.** 180 full-suite runs in the exact failing configuration produced zero occurrences. Two mechanisms can produce the observed output shape, and neither was shown to have fired.

2. **Nobody could read what `wt-m1-p3/src/lock.ts` and `wt-m1-p3/src/commands/lock.ts` contained between 13:13:40 and 13:14:00 on 2026-08-04.** That worktree was correctly off-limits, being actively edited. The mtime-preserving copy establishes only that `src/lock.ts` was rewritten in place with pristine content at 13:14:23.233, that is 42.8 seconds into the failing run, and that `src/` had an entry created or renamed at 13:06:35.753. If that agent's reflog, editor history or shell history can show what those two files contained at 13:14, it would either close U-2 outright or promote the mystery. That is the single highest-value remaining check and it is cheap.

3. **Whether the 13:06 backup pair belongs to lens 1's U-1 experiment (measured to leave the suite green) or to lens 2's broken-CAS sabotage (which reproduces the output shape) is undetermined.** Both experiments are documented in the same round and both span exactly those two files.

4. **No viable trigger exists for the hold seam's silent no-hold exit on this box.** The first-evaluation exit is impossible by `mkdtempSync` construction. The deadline exit requires a machine-wide forward step of CLOCK_REALTIME, and none was observed in about 70 minutes of monitoring by two independent monitors at 10 Hz and 200 Hz, on a guest with no time daemon, no `/dev/ptp*`, and `clocksource=tsc`; producing run3's exact pair would require two such steps in one 61 second run, in windows of about 5 s and about 0.9 s, and would leave a distinctive `.observed never appeared` failure that run3 does not show. If neither exit fired, there is a third route nobody has found.

5. **The "full-suite only" observation has no mechanical explanation.** Cross-file interference is ruled out on every named vector, and the seam's `existsSync`-first evaluation means load can delay a hold but cannot un-hold it. The only explanation consistent with it is environmental rather than mechanical: the full-suite runs were the ones executing inside the shared worktree.

6. **All execution was on Node v22.22.2 via native type stripping, below the project's declared floor of 26**, on one box, one filesystem (local ext4 on `/dev/vda`), one clock. CI on Node 26 remains the authority for the gates. Cross-host and networked-filesystem lease semantics remain untested and unclaimed, per DR-0007 and the M4 residue.

7. **D-1's measured rate is environment-specific.** The roughly 11 microsecond window and the roughly 1-in-90 natural occurrence rate are properties of this box's I/O timing, not stable numbers. The mechanism, verified directly, is exact and machine-independent.

8. **D-2's real-world reachability was not measured.** It requires an operator to delete a live claim file. That the CLI instructs the deletion is established; how often an operator would misjudge "in flight" is not.

---

## Artifacts

Left in place under `/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad`, because several hold runnable reproductions or the discriminator:

- `u2-sab` deterministic reproduction of the run3 output shape (CAS byte-compare removed); `u2-flip` plus `u2-flip.sh` transient reproduction with a byte-clean tree; `u2-nohold` the refuted deterministic-hold-failure variant; `u2-repro-brute` pristine baseline; `u2-instr` traced; `u2-runs` all 93 run outputs, summaries and probe logs; harness scripts `u2-runner.sh`, `u2-runner-instr.sh`, `holdprobe.sh`, `tornprobe.sh`, `tornrace.mjs`, `clockwatch.mjs`.
- `u2-cas-hole` including `probe/repro-cas-hole.mjs` (the D-2 reproduction against unmodified sources), `probe/make-parked.mjs` and `probe/park-drive.mjs` (the six-point parking rig), `probe/witness.mjs` (**the discriminator**), `probe/torture.ts`, `probe/oexcl.mjs`, `probe/coherence.mjs`, `probe/emptywindow.mjs`.
- `u2-hold-point` with `test/zzexp-unheld.test.ts` and `test/zzexp-clockstep.test.ts`; `hpfw-clockstep.mjs`; `hpfw-loud` (the proposed loud seam, verified); `hpfw-instr`; `hpfw-runs`; `hpfw-window.mjs` (the D-1 harness); `hpfw-clockmon.mjs`.
- `u2-test-isolation`, `u2x/walljump.cjs`, `u2-collide`, `u2-noholdproof`, `u2x/{runs,x2,holdprobe.mjs,clockmon.mjs}`.
- `run3.txt`, `lock.ts.orig`, `cmdlock.ts.orig`, `instr/` (the mtime-preserving copy of the shared worktree), which are the forensic evidence and should be preserved until item 2 of the honest-failure section is settled or abandoned.

All background loops and monitors are stopped. `/home/user/tiphys-ai-helmsman` was never modified, built or tested by any investigator, and `scratchpad/wt-m1-p3` was never touched.
