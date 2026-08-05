# Clean-room review of PR #9 (M1-P6) FIX ROUND 1, HAZARD contract

- phase: M1-P6, toy sandbox project and exit-test harness
- branch: `claude/m1-p6-toy-sandbox-exit`
- head reviewed: `8954b058af96af4e8e913416abcc68516f556a9b`
- previous reviewed head: `79604ecd36cea50e0d4e8fcb0f7b574887eeb9d2`
- contract: hazard (T-007). A criteria reviewer ran concurrently; this
  report walks criteria only where a regression check needed it.
- verdict: **FIX-ROUND-NEEDED**
- findings: 8 total, 0 high, **1 medium (CR-640)**, 7 low (CR-641 to
  CR-647)
- reviewer isolation (T-004): all work in the detached worktree
  `/tmp/claude-0/.../scratchpad/cr-p6b-hazard` at `8954b05`, plus scratch
  dirs under `.../scratchpad/hz2/`. Nothing in
  `/home/user/tiphys-ai-helmsman` was written (the three review documents
  from the previous round were read there, read-only). No sibling
  scratchpad worktree was touched.
- **Nothing was written to
  `ThomasHendrickx/tiphys-ai-helmsman-sandbox`.** Every harness run used
  a `file://` remote. One read-only `git ls-remote` at the end of this
  review returned `27c882f521694e8ba72969a4257aaa31e1d58adb` for both
  `HEAD` and `refs/heads/main`, identical to the value the previous
  hazard review recorded at the start and end of its own pass.

## Method

Node 26 toolchain first on PATH throughout, except where a Node 22 result
is explicitly reported.

```
node v26.6.0 / npm 11.18.0
npm ci          exit 0, no EBADENGINE line
npm run build   exit 0
git status --porcelain after build: clean
npm test        exit 0: 155 tests, 155 pass, 0 fail, 0 skipped, 97.98s
                (wall 1m38.2s)
```

```
node v22.22.2 (container default)
npm ci          exit 0 (EBADENGINE expected)
npm run build   exit 0
git status --porcelain after build: clean
npm test        exit 0: 155 tests, 153 pass, 0 fail, 2 skipped
                (both skips the pre-existing M1-P2 floor gates, each
                 carrying its reason in the TAP line)
```

Both toolchains match the reported numbers exactly.

Twelve harness runs were executed in this review (2 real local-mode runs,
1 real local-mode run under a `src/` mutation, 1 full-mode stage A plus 1
stage C with a reviewer-built `gh` stand-in, and 7 fast runs against a
scratch root whose A1 kernel gates are stubbed for speed), plus one
Node 22 suite run, one Node 26 suite run, three single-test runs under
six separate mutations, and one standalone execution of the shipped
`validate_bundle` program against four hand-built bundles.

Every mutation was reverted. `git status --porcelain` is clean at the end
of this review, and `ps` shows no surviving `tiphys watch` and no orphan
watchdog.

Diffs read in full: `git diff 79604ec..HEAD` (5 files, 573 insertions)
and `git diff origin/main...HEAD` (12 files).

---

## STARTING QUESTION, answered first

**Is the harness still unable to pass while the milestone is broken, and
what did the fixes break?**

**Yes, it is still unable, and the fix round made it strictly harder to
fool.** Established by construction, not by reading:

1. **The falsification path, re-derived.**
   `TIPHYS_EXIT_TEST_SKIP_STAGE_B=1 scripts/m1-exit-test.sh --mode local`
   on Node v26.6.0: **exit 1**, 43 records, failing with
   `m1-exit-test: FAILED: step C2 (tiphys teardown after the squash
   merge): expected exit zero, got 1`. `043-C2.json` carries
   `"exitCode": 1, "outcome": "fail"`. Reproduces the work history
   exactly.

2. **The phantom wake that beat the previous harness now dies at A5.**
   I patched `src/watcher.ts:runResident` so the resident watcher writes
   its beacon and then returns the wake line unconditionally at startup,
   with no turn-end in existence and before any task is spawned (the
   predecessor's best green-when-broken attempt). Against **this** head,
   with A1's kernel gates stubbed out so the mutation could reach the
   watcher stages at all:

   ```
   m1-exit-test: FAILED: step A5 (the watcher has printed nothing before
     the task exists): expected watch.out empty at the end of A5,
     observed 24 bytes in watch.out
   exit 1
   ```

   At `79604ec` that same mutation ran to C3 and exited 0. CR-603's fix
   is real.

3. **The one variant that still gets through, and where its assurance
   lives.** A blind watcher that never scans at all and emits the wake
   line after a 25 second delay evades the A5 empty check (which is
   evaluated about one second after the beacon appears). With A1's kernel
   gates stubbed, that mutation produced **exit 0 with a validated
   53-record bundle**, A5 recording `0 bytes in watch.out` (pass) and A8
   recording the expected wake line (pass). **Control: with A1 intact,
   the real harness dies at A1**, `m1-exit-test: FAILED: step A1 (kernel
   npm test): expected exit zero, got 1`. So the shipped harness cannot
   go green on that break either; the assurance lives in the unit suite
   A1 runs. Recorded as CR-647 rather than glossed.

4. **Both step-scoring paths are load-bearing, and W7/W7b are honest.**
   Sabotaging `run_step` alone (every step forced to `pass`, its `die`
   unreachable) leaves the red path exiting **1** at C2's
   `the worktree is removed` assertion. Sabotaging `assert_step` alone
   leaves the red path exiting **1** at C2's teardown `run_step`.
   Sabotaging **both** is the minimum that produces a green red-path run
   (**exit 0**). The implementer's W7-did-not-fire write-up is accurate,
   and the two failure paths really are independent.

5. **The CI falsifiability step's two arms both fire, verified against
   real bundles.** Its exit-code arm fires on the W7b always-green
   harness. Its C2-record arm, run verbatim against the W7b bundle,
   printed `no C2 record showing a nonzero teardown exit with outcome
   fail` and exited **1**; against the honest red bundle it printed
   `falsifiability guard witnessed at C2: exitCode 1` and exited 0;
   against the green-path bundle it exited 1. The step is not
   decorative.

**What the fixes broke.** Four things, all small and all constructed
below: an undiagnosed abort introduced by CR-602's `cp` (CR-641), an
orphaned watchdog the new trap does not cover (CR-642), a
mode-unconditional validator exemption that gives back part of CR-607
(CR-643), and a regression guard that does not notice three real defangs
of the thing it guards (CR-640, the one medium).

---

## Findings

### CR-640 (medium): the workflow-wiring test notices deletion but not defanging, and the work history says it notices both

**Claim.** `exit-test-falsifiability-guard-wired` asserts four text
patterns in `.github/workflows/gates.yml`. Three edits that leave those
patterns intact turn the CI falsifiability step into a no-op while the
test stays green. The work history and the test's own comment both state
otherwise.

**Why it is dangerous.** CR-605 was medium precisely because the
falsifiability property had no durable automated guard. The substitute
accepted for it is "the CI step runs the red path, and a fast test makes
sure nobody removes the CI step". If the second half only catches
deletion, then a single-character edit converts CI back to
always-green-passes with nothing red anywhere, which is the exact failure
mode CR-605 exists to prevent. The claims are also false as written:

- `delivery/work-history/m1-p6.md`: "**c.
  `exit-test-falsifiability-guard-wired`** (registered, fast): the
  workflow still contains the step, **still fails the job when the
  harness exits 0**, and still checks the C2 record."
- `test/exit-test-local.test.ts:272-275`: "if the workflow step is
  deleted **or defanged**, nothing else in the repository would notice".

**Evidence, constructed.** Each edit applied to
`.github/workflows/gates.yml`, then
`node --test --test-name-pattern "the gates workflow runs the harness
falsifiability guard and fails when it exits 0"
test/exit-test-local.test.ts` (pattern before the path), then reverted.

| # | Edit | test exit | verdict |
|---|---|---|---|
| baseline | none | 0 | green, as shipped |
| D3 | the whole step deleted | **1** | CAUGHT |
| D1 | `exit 1` changed to `exit 0` in the guard-broken branch (`gates.yml:47`) | **0** | **NOT CAUGHT** |
| D2 | `continue-on-error: true` added to the step | **0** | **NOT CAUGHT** |
| D5 | `process.exit(1)` removed from the C2-record arm (`gates.yml:64`) | **0** | **NOT CAUGHT** |
| D6 | `if: false` on the whole `test` job | **0** | not caught by the test, but the `gates` fan-in job turns a skipped `test` red, so this one is defended elsewhere |

D1 is the sharp one: with it, an always-green harness makes the step
print `FALSIFIABILITY GUARD BROKEN` to stderr and then exit 0, the job
goes green, and the registered guard on the guard stays green too.

`git status --porcelain` clean after all five edits were reverted.

**Fix.** Three more assertions in the same test, all against text that
already exists:

```js
assert.match(workflow, /FALSIFIABILITY GUARD BROKEN[\s\S]{0,200}?\n\s*exit 1\n/);
assert.match(workflow, /no C2 record showing a nonzero teardown exit[\s\S]{0,200}?process\.exit\(1\)/);
assert.doesNotMatch(workflow, /continue-on-error/);
```

I am recording this as medium because it is the durability half of a
medium finding and the claim about it is false, not because the shipped
CI step is broken (it is not; see starting question item 5). The fix is
three lines in an existing test with no harness change, so the
orchestrator may reasonably judge it a same-round correction rather than
a new dual-review round; that call is DR-0012 clause 6 territory, not
mine.

---

### CR-641 (low): CR-602's `cp` turned a recorded C1 assertion failure into an undiagnosed abort

**Claim.** `scripts/m1-exit-test.sh:775` now copies the cloned
`README.md` into the bundle before greping it, with no guard. Under
`set -euo pipefail` a sandbox default branch that carries no `README.md`
aborts the harness with a bare `cp` error, no `m1-exit-test: FAILED:`
line, no `evidence in ...` pointer, and no C1 assertion record. Before
this fix round the `grep -q` simply missed and the else branch wrote a
proper `outcome: fail` record and died with a diagnostic.

**Why it is dangerous.** This is on the "the change did not land" path,
which is the path criterion 5 is about. The harness still fails closed
(exit 1), so it is not a false green, but the certification harness loses
its own diagnostic exactly where a reader most needs it, and the bundle
loses the record that would say why.

**Evidence, constructed.** A probe harness whose local stage B also
removes `README.md` from the sandbox default branch and pushes, using the
harness identity so the B1 identity assertion still passes:

```
m1-exit-test: C1 ok (clone the sandbox default branch to inspect the merge)
cp: cannot stat '/tmp/tiphys-m1-exit-oRPebh/merged-check/README.md': No such file or directory
harness exit: 1
"m1-exit-test: FAILED" lines in the whole run output: 0
C1 records written: 045-C1.json (skipped-full-only), 046-C1.json (the clone)
  -> no C1 assertion record at all
```

**Fix.** One line:

```sh
if [ ! -f "${check}/README.md" ]; then
  assert_step C1 "the payload's change is on the sandbox default branch" \
    "README.md present at ${sandbox_default} head ${head_sha}" \
    "no README.md at ${sandbox_default} head ${head_sha}" fail
fi
cp "${check}/README.md" "${evidence}/output/c1-sandbox-default-README.md"
```

---

### CR-642 (low): the new EXIT trap covers the watcher but not the watchdog, which is orphaned and later kills a reaped pid

**Claim.** The trap installed at `scripts/m1-exit-test.sh:529` kills
`watch_pid` only. The watchdog subshell spawned at `:654`
(`( sleep 30; kill "${watch_pid}" ... ) &`) is reaped by an explicit
`kill "${watchdog_pid}"` at `:658`, after the `wait`. A harness exit
between those two lines leaves the watchdog running, and 30 seconds later
it sends a signal to a pid the EXIT trap has already killed and `wait`
has already reaped.

**Why it is dangerous.** CR-601's fix is recorded into the evidence
bundle as "an EXIT trap kills it on every harness exit path"
(`scripts/m1-exit-test.sh:531`, note text of record `024-A5.json`). That
is true of the watcher and not of the watchdog. A delayed `kill` against
a pid whose owner is already reaped is exactly the pid-as-identity shape
constraint C-2 is about; the plan sanctions the harness owning its own
children, and this is a child it stops owning. The realistic trigger is
not the injected `die` I used but a SIGTERM or a Ctrl-C arriving while
the harness is blocked in `wait "${watch_pid}"`, which is a window of up
to 180 seconds in a healthy run.

**Evidence, constructed.** One injected `die` immediately after
`watchdog_pid=$!`:

```
harness exit 1
3s later:  surviving "tiphys watch": NONE   (the trap worked)
           surviving watchdog:  pid 2654 "sleep 30", ppid 2653
16s later: 2653  ppid 1  bash ./scripts/m1-exit-test.sh --mode local .../ev-p-wd
           (the subshell, reparented to init; the harness itself is gone)
```

**Fix.** One line, at `:529`:

```sh
trap 'kill "${watch_pid:-}" "${watchdog_pid:-}" 2>/dev/null || true' EXIT
```

`watchdog_pid` is unset until `:655`, and `${watchdog_pid:-}` under the
existing `2>/dev/null || true` handles that.

---

### CR-643 (low): `validate_bundle`'s B1 exemption is unconditional on mode, so it gives back CR-607's coverage in local mode

**Claim.** `scripts/m1-exit-test.sh:865` reads
`else if (step !== "B1" && !withOutcome.has(step))`. The comment above it
justifies the exemption for FULL mode only ("in full mode its only
records are the pending-owner-action note and the approval note"), but
the condition does not test the mode. In local mode B1 is a real executed
substitution with five `run_step` calls and a commit-identity assertion,
so exempting it there is exactly the "records that assert nothing satisfy
step coverage" hole CR-607 asked to close.

**Evidence, constructed** with the shipped validator program extracted
verbatim from the script and run standalone against copies of my baseline
local bundle:

```
control, unmodified                     problems: []                    exit 0
every B1 record's outcome deleted       problems: []                    exit 0   <- hole
every C2 record's outcome deleted       "step C2 has records but none
                                         carrying an outcome"           exit 1   <- rule works
```

**Fix.** `else if ((mode !== "full" || step !== "B1") && !withOutcome.has(step))`.

---

### CR-644 (low): CR-600's instance is closed; the mechanism that produced it is not

**Claim.** `--stage c` still restores `record_seq` from `session.json`
(`scripts/m1-exit-test.sh:995`) rather than deriving it from what is on
disk. The fix closes the one live instance by writing the session again
after `stage_b_full_pending`, and the new validator rule makes the
`pending-owner-action` record a canary because it happens to be the last
record stage A writes: any restored sequence that is too low overwrites
it, and the validator then fires. That is a real property, but it is
incidental to record ordering rather than structural, and it would be
silently lost the day another record is appended after the handoff note.

**Why it matters.** The M1-P5 pattern this project has already paid four
rounds for is a fix that closes one instance and leaves the mechanism
intact. This is that shape, mitigated by luck of ordering.

**Evidence.** Positive: the fix works, verified twice below (W5). The
mechanism claim is from reading `:995` and `:1006`, and from the
observation that no other record is written between the session write and
process exit in full mode stage A. **Scope of that negative: full mode's
two-invocation flow and local mode's single invocation at `8954b05`. I
did not construct an adversarial hand-edited `session.json`.**

**Fix.** At the top of the `--stage c` block, replace
`record_seq=$(json_field "${session_file}" recordSeq)` with a derivation
from the bundle, for example
`record_seq=$(ls "${evidence}/records" | sed 's/-.*//' | sort -n | tail -1 | sed 's/^0*//')`,
and keep the session value only as a cross-check.

---

### CR-645 (low): CR-608's decline is sound, but "a plan question, not a harness question" is overstated

**Judgment asked for.** The implementer declined to renew the lease at
the top of `stage_c` because `lock renew` on an expired lease is refused,
so renewing would `die` exactly when owner approval exceeded 15 minutes,
converting a wait section 4 B1 calls unbounded into a failed run.

**I verified the premise and I agree with the decline.** Section 4 B1
reads, verbatim: "Stage B has no timing requirement; the lease renewal
from A3 covers the wait (PR-203)." `src/lock.ts:490-523` refuses a renew
on an expired lease with `renew refused: lease expired ...; an expired
lease cannot be renewed, re-acquire or take over instead`. A hard renew
at stage C would therefore fail a certification run for a slow owner. Not
taking a lock-semantics change in a fix round for a low finding is the
right call, and T-003 is the right citation.

**Where the write-up overstates.** The harness CAN be made safe without
touching lock semantics, in two ways the write-up does not consider:

1. `lock acquire --duration <seconds>` and `lock renew --holder <id>
   --duration <seconds>` both exist
   (`src/commands/lock.ts:24-25`, confirmed against
   `node dist/bin/tiphys.js lock` usage output). The harness's own header
   says "the harness passes no --duration". In full mode it could renew
   before the handoff with a duration sized to the expected wait. No lock
   semantics change, no plan change.
2. An OBSERVATIONAL renew at the top of `stage_c`: attempt it, record
   pass or fail as evidence, never `die`. That closes the evidence gap
   ("was the lease still ours across stage B?") without failing the run,
   which is precisely the property the decline is protecting.

**Fix.** Either of the above, or, if neither is taken, amend the tracked
item so the orchestrator's plan question is stated with the fact that a
harness-only remedy exists.

---

### CR-646 (low): a number in the CR-605 argument no longer reproduces

**Claim.** The work history's recursion argument says the captured output
of `003-A1.out` "contains the titles of tests defined in
`test/exit-test-local.test.ts` and reports `tests 153`". On the shipped
head it reports `tests 155`.

**Evidence, re-executed rather than read.** From my own baseline bundle
at `8954b05`:

```
001-A1.json  label "kernel npm ci"   cwd <repo root>  command: npm ci
003-A1.json  label "kernel npm test" cwd <repo root>  command: npm test
003-A1.out:  "tests 155"
003-A1.out:  3 of this phase's own test titles present, including
             "a failed harness step is fatal to the run and is recorded as failed"
             and "the gates workflow runs the harness falsifiability guard ..."
sentinel probe: touch node_modules/HZ2-SENTINEL; npm ci (exit 0);
             sentinel GONE -> npm ci at the repo root removes and
             reinstalls node_modules
```

**Both halves of the "not implementable" argument are TRUE.** A1 runs the
whole suite at the live repository root, so a suite test invoking the
harness re-enters itself, and A1's `npm ci` wipes `node_modules` under
files running in parallel beside it. `153` was correct against the
pre-fix bundle the measurement was taken from and is stale for the
shipped state; the substance is unaffected.

**Fix.** Update the number, or say which bundle it was measured against.

---

### CR-647 (low): A5's new empty-`watch.out` assertion closes the startup phantom, not the phantom

**Claim.** The new assertion at `scripts/m1-exit-test.sh:552-556` is
evaluated once, up to one second after the beacon file appears. It
catches a watcher that emits the wake line at startup. It does not catch
a watcher that can never detect a turn-end but emits the line on a delay.

**Why it is worth recording.** The work history is honest about this
("closes the end-to-end half of that hole"), and the implementer is
right. But the A5 record now reads `the watcher has printed nothing
before the task exists / 0 bytes in watch.out / pass`, which a later
reader can easily over-read as "the wake was caused by the task". It was
not; causation is still guarded by A1's unit suite, not by the
end-to-end witness.

**Evidence, constructed** (full detail under starting question item 3).
Blind delayed emit, A1 stubbed: **exit 0**, 53-record bundle, `A5 0 bytes
in watch.out pass`, `A8 signal m1-exit turn-end pass`. Same mutation, A1
intact: **exit 1 at A1 (kernel npm test)**.

**Fix.** No harness change needed. Either state the coupling in the A5
record's own text (as the header already does for A1), or, if the
end-to-end witness is wanted, compare `watch.out`'s mtime against the
spawn record's timestamp at A8.

---

## Disposition of CR-600 to CR-609

| Finding | Sev | Implementer says | My verdict, by construction |
|---|---|---|---|
| CR-600 sequence + validator | med | FIXED, both halves | **RESOLVED.** Full-mode walk with a `gh` stand-in: stage A exit 0, `recordSeq 36`, highest record `036-B1.json`; after `--stage c` (exit 0) `036-B1.json` is byte-identical and still `pending-owner-action`; 47 records; `problems: []`. W5 re-derived: with the second `write_session` removed, `recordSeq 35`, `036-B1` overwritten by the approval note, 0 pending records, validator prints `full mode bundle has no B1 pending-owner-action record: the stage A owner handoff evidence is missing` and the harness exits 1 at C3. Residual mechanism: CR-644. |
| CR-601 watcher leak | med | FIXED | **RESOLVED for the watcher.** Enumerated exit paths myself and constructed each: injected `die` (exit 1, 0 survivors), `set -e` abort (0), failing `assert_step` (0), failing `run_step` (0), SIGTERM to the harness pid (0), SIGHUP (0), SIGINT to the process group, the real Ctrl-C (0), normal exit (0). Control with the trap line deleted: the same `die` probe leaves `pid 11626 node .../tiphys.js watch` alive 4s after the harness exited. SIGINT to the harness pid alone does not terminate the harness at all under bash while a foreground child is running, so nothing is orphaned there either. SIGKILL is untrappable and leaks; unavoidable, not a finding. Residual: CR-642 (watchdog). |
| CR-602 unfalsifiable `observed` | med | FIXED | **RESOLVED.** All three now measured: A1 `110 bytes at <path>`, A2 `0 FAIL lines out of 8 CHECK lines`, C1 `exit-test m1-exit landed a trivial change on branch task/m1-exit (copied to output/c1-sandbox-default-README.md)`. `output/c1-sandbox-default-README.md` is present in the bundle and its last line is the matched line, so C1 is now re-derivable from the evidence. The work history's own sweep number reproduces: exactly 6 records still have `observed === expected` and all six derive it from a real measurement. New robustness regression: CR-641. |
| CR-605 no regression witness | med | FIXED, three guards | **PARTIALLY RESOLVED.** The "not implementable" argument is true (CR-646, both halves re-executed). The CI step is real and both arms fire against real bundles. `exit-test-step-failure-is-fatal` is red against both dangerous states (W1, W2 re-derived). The wiring guard is defeatable: **CR-640**. |
| CR-603 wake not caused by task | low | FIXED | **RESOLVED for the startup phantom** (constructed, exit 1 at A5, where `79604ec` went green to C3). Residual: CR-647. |
| CR-604 zero-test sandbox | low | FIXED | **RESOLVED.** A1 now runs the seeded suite with the reporter pinned and asserts the parsed count: record `010-A1.json`, `expected "at least 1 passing, 0 failing"`, `observed "2 passing, 0 failing (pinned tap reporter)"`, `pass`. |
| CR-606 record undercount | low | FIXED | **RESOLVED.** `recordsInBundle` equals `ls records \| wc -l` in every bundle I produced: local 53/53, full 47/47, local-with-gh 52/52. |
| CR-607 coverage by empty records | low | FIXED | **RESOLVED except the exemption's breadth: CR-643.** The rule works (constructed against a C2-stripped bundle: exit 1). `024-A5.json` kind is now `started`, not `executed`. |
| CR-608 lease bound | low | PARTIAL, semantic half declined | **Decline accepted.** Premise verified in `src/lock.ts:490-523` and section 4 B1 quoted verbatim. Overstatement recorded as CR-645. |
| CR-609 stale header | low | FIXED | **RESOLVED.** `test/exit-test-local.test.ts:17-48` no longer claims P4 and P5 are unmerged, and states what covers what. |

---

## Regressions hunted and NOT found

Stated with scope, because a negative without its scope is not evidence.

1. **Can the new EXIT trap fire at the wrong time?** No path found. It is
   installed after `watch_pid=$!` and cleared immediately after the
   `wait` reaps the child (`:660`), it is the only EXIT trap in
   `scripts/m1-exit-test.sh` (`grep -n "trap "`, two hits, both this
   one), and `scripts/seed-sandbox.sh:106`'s own EXIT trap runs in a
   separate process. `run_step` executes its command in a `( ... )`
   subshell, which resets traps, so no step's exit can fire it.
   **Scope: the three shell scripts at `8954b05`.**
2. **Can the new validator rules reject an HONEST bundle?** No. Three
   honest bundles validated `problems: []`: local mode (53 records),
   full mode with a `gh` stand-in (47 records), and **local mode with
   `gh` PRESENT on PATH** (52 records), the branch at `:480-484` that
   neither the implementer nor the previous reviewer had exercised
   against the new rules. **Scope: those three bundles plus the
   falsification path, which never reaches C3.**
3. **Does `write_session` see the right variables when called from main
   scope?** Yes, constructed: full-mode stage A produced a complete
   `session.json` with all thirteen fields populated and `recordSeq 36`,
   from the call at `:1006` outside any function. None of the variables
   it reads is declared `local`, so `set -u` does not fire.
4. **Does the pinned reporter leak?** No. `NODE_OPTIONS` appears in
   `scripts/m1-exit-test.sh` only inside the `env` prefix of one
   `run_step` command array (`:434`), and in `test/exit-test-local.test.ts`
   only inside a per-call env object. **Scope: `grep -rn "NODE_OPTIONS"`
   over the whole checkout excluding `delivery/`, `node_modules/`,
   `dist/`, `.git/` and my scratch dirs. Two hits, both scoped.**
5. **Does the new CI step make the job flaky or slow enough to time
   out?** No. It is a second full harness run; my real local-mode run
   took `1m56.9s` wall and the falsification run reaches C2 slightly
   sooner. The A5 (120s) and A8 (180s) bounds are unchanged and were
   never approached in twelve runs. The step's `run: |` body executes
   under the Actions default `bash -e`, so the `node -e` arm's nonzero
   exit fails the step; the harness invocation is inside an `if`
   condition, so errexit does not pre-empt it. **Worth stating: the
   `test` leg now runs the kernel suite three times (the `npm test`
   step, the green harness's A1, the falsify harness's A1). That is the
   documented price, not a defect.**
6. **Can a failed run make the next run pass spuriously?** No new path.
   Same conclusion as the previous round; the added surface (the second
   `write_session`, the trap, the validator rules) does not touch
   evidence-directory reuse. **Scope: local mode's two gh branches and
   full mode's two-invocation flow; I did not test a hand-crafted
   adversarial evidence directory.**
7. **Does the new `exit-test-step-failure-is-fatal` test reach the real
   repository?** No. It copies the harness into a scratch fake root, so
   `repo_root` is the fake root and A1's `npm ci` fails there in about a
   second with no network. Confirmed by its runtime in six invocations
   and by the harness's `script_dir/..` derivation at `:104-105`.

---

## Red witnesses, re-derived rather than re-read

All on Node v26.6.0. `--test-name-pattern` precedes the positional path
in every single-test run.

| # | Dangerous state I constructed | Observed |
|---|---|---|
| W1 | `run_step`'s outcome `case` deleted, so every step scores `pass` | `exit-test-step-failure-is-fatal` **red**, `AssertionError ... did not match /FAILED: step A1 \(kernel npm ci\)/` |
| W2 | `die` on a failed step replaced by `true` | same test **red**, same assertion |
| W3 | the CI falsifiability step deleted from `gates.yml` | `exit-test-falsifiability-guard-wired` **red** (exit 1) |
| W4 | the step defanged: `exit 1` to `exit 0`; `continue-on-error: true`; `process.exit(1)` dropped | same test **GREEN in all three cases**, exit 0. This is CR-640 |
| W5 | the second `write_session` call removed (CR-600's sequence half reverted) | full-mode walk: `recordSeq 35`, `036-B1.json` overwritten, 0 `pending-owner-action` records, validator problem printed, harness **exit 1 at C3** |
| W6 | the EXIT trap line deleted, one injected `die` between A5 and A8 | leaked watcher `pid 11626` alive 4s after `exit 1`; with the trap, 0 survivors on all four non-signal exit paths and all three signal paths |
| W7 | `run_step` sabotaged alone, falsification path | harness **exit 1** at C2 `the worktree is removed`. The witness did not fire, exactly as the implementer reported |
| W7b | `run_step` AND `assert_step` both sabotaged, falsification path | harness **exit 0**; the CI step's C2 arm independently exits 1 with `no C2 record showing a nonzero teardown exit with outcome fail` |
| W7c (mine) | `assert_step` sabotaged ALONE, falsification path | harness **exit 1** at C2 teardown `run_step`. Confirms W7b's double sabotage is the minimum, not an artifact |
| W8 (mine) | `runResident` emits the wake line unconditionally at startup | harness **exit 1 at A5**, `observed 24 bytes in watch.out`. Green to C3 at `79604ec` |
| W9 (mine) | `runResident` never scans and emits the wake line after 25s | A1 stubbed: **exit 0**, validated 53-record bundle. A1 intact: **exit 1 at A1 (kernel npm test)** |
| W10 (mine) | sandbox default branch with no `README.md` | undiagnosed abort, `cp: cannot stat ...`, 0 `FAILED:` lines, no C1 assertion record (CR-641) |
| W11 (mine) | `die` between the watchdog spawn and the `wait` | watcher killed, watchdog subshell orphaned to init and still alive 16s later (CR-642) |
| W12 (mine) | every B1 record's `outcome` deleted, local bundle | shipped validator `problems: []`, exit 0. Control on C2: exit 1 (CR-643) |

All mutations reverted; tracked tree clean.

---

## False-claim sweep (T-006)

Every factual claim I sampled from the fix-round section was re-executed,
not read.

| Claim | How checked | Result |
|---|---|---|
| Node 26: 155 tests, 155 pass, 0 fail, 0 skipped, exit 0 | ran it | confirmed exactly |
| Node 22: 155 tests, 153 pass, 0 fail, 2 documented floor skips, exit 0 | ran it | confirmed exactly, both skip reasons in the TAP line |
| clean `git status` after build, both toolchains | ran both | confirmed |
| 161 behavior mappings, 0 unresolved | independent script over my own two runs' titles | confirmed: 161 mappings, 155 distinct mapped titles, 155 observed titles, 0 unresolved, 0 unmapped |
| green path exit 0, 53-record bundle, `problems: []` | ran it | confirmed exactly |
| falsification exit 1 at C2, `043-C2.json` exitCode 1 outcome fail | ran it | confirmed exactly, 43 records |
| full-mode walk: stage A exit 0, stage C exit 0, 47-record bundle, pending record intact | ran it with my own `gh` stand-in and a `file://` remote | confirmed exactly, `recordSeq 36`, `problems: []` |
| W5 numbers (recordSeq 35, record overwritten, validator fires) | re-derived independently | confirmed exactly |
| W6 (paired trap witness) | re-derived, and extended to 7 exit paths | confirmed, and strengthened |
| W7 did not fire; W7b needed both sabotages | re-derived, plus the assert-only control | confirmed; W7c shows the minimum claim is right |
| CR-602 table values (110 bytes; 0 of 8 CHECK lines; the C1 line) | read from my own bundle | confirmed exactly |
| "6 records where observed still equals expected, all measured" | counted on my own bundle | confirmed: exactly 6, and the six are the identity assertions, the ls-remote comparison, the wake line, and the meta status |
| `recordsInBundle` 53 equals `ls records \| wc -l` 53 | ran it, three bundles | confirmed 53/53, 47/47, 52/52 |
| CR-605 claim 1: A1 recurses into this suite | read `001/003-A1.json` cwd and grepped `003-A1.out` | confirmed; **cited count `153` is stale, it is `155`** (CR-646) |
| CR-605 claim 2: A1's `npm ci` wipes `node_modules` | sentinel file probe | confirmed, sentinel gone |
| CR-608: `lock renew` on an expired lease is refused | read `src/lock.ts:490-523` | confirmed; and `--duration` exists, which the write-up does not mention (CR-645) |
| "the workflow-wiring test notices deletion or defanging" | constructed five edits | **FALSE for defanging** (CR-640) |
| "No writes to the real sandbox repository in this round" | read-only `ls-remote` at the end of my pass | consistent: `27c882f...`, unchanged from the previous review's recorded value |

One claim I want to flag as accurate but easy to over-read, same as last
round: "What this fix round did NOT do, item 3: any observation of the
`gates` check on the PR, including the new falsifiability step". That
hedge is correct and important. Neither reviewer has seen the new CI step
run on a GitHub runner. The orchestrator must observe it before merge.

---

## Scope audit

`git diff --name-only origin/main...HEAD`:

```
.github/workflows/gates.yml      declared
delivery/work-history/m1-p6.md   standing extra
sandbox/README.md                declared (sandbox/)
sandbox/package-lock.json        declared
sandbox/package.json             declared
sandbox/src/greet.js             declared
sandbox/test/greet.test.js       declared
scripts/m1-exit-test.sh          declared
scripts/seed-sandbox.sh          declared
scripts/stub-payload.sh          declared
test/behaviors.json              standing extra
test/exit-test-local.test.ts     declared
```

This round (`git diff --name-only 79604ec..HEAD`) touched five of those:
`.github/workflows/gates.yml`, `delivery/work-history/m1-p6.md`,
`scripts/m1-exit-test.sh`, `test/behaviors.json`,
`test/exit-test-local.test.ts`.

**Scope audit passes.** No `src/`, no `bin/`, no `delivery/` file other
than the work history.

---

## Registry

- 161 mappings in `test/behaviors.json`, 2 added by this round
  (`exit-test-step-failure-is-fatal`,
  `exit-test-falsifiability-guard-wired`), none removed or modified; the
  diff is append-only.
- Resolved **by name** against titles harvested from my own Node 26 and
  Node 22 runs: **161 mappings, 155 distinct mapped titles, 155 observed
  titles, 0 unresolved, 0 observed titles without a mapping.**
- The two new names map to the two new tests, both present and passing.

---

## Conventions

- **Pure ASCII**: `grep -P '[^\x00-\x7F]'` over every file in
  `git diff --name-only origin/main...HEAD`: no matches. No em dashes in
  the same scope.
- **English only**: confirmed by reading.
- **npm only**: `grep -rn "pnpm\|yarn"` over `sandbox/`, `scripts/`,
  `test/exit-test-local.test.ts` and `.github/`: no matches.
- **No AI or model names** in `git log origin/main..HEAD`: commit
  `8954b05`'s subject and full body read; clean. The pre-existing
  `8c630df` occurrence was arbitrated non-blocking last round and is
  unchanged.
- **`bash -n`** exit 0 on all three scripts. `git ls-files -s scripts/`
  shows mode `100755` on all three.
- **C-1**: nothing reads current state from a log tail. **C-2**: the only
  pid use is the harness managing its own children (`:520, 529, 537,
  650, 654, 658`); CR-642 is that it stops managing one of them.
  **C-3**: the kernel never backgrounds anything; the harness does.

---

## Probes run, including the empty-handed ones

Negative results carry their scope.

1. **Falsification path, re-derived.** Executed. Exit 1 at C2, 43
   records. Positive.
2. **CI falsifiability step, both arms, against three real bundles.**
   Executed verbatim. Fires correctly on all three. Positive.
3. **Full-mode stage A and stage C with a reviewer-built `gh` stand-in
   and a `file://` remote.** Executed, both exit 0, 47 records,
   `pending-owner-action` intact. CR-600 half 1 confirmed.
4. **W5: the sequence fix reverted, full mode re-walked.** Executed.
   CR-600 half 2 confirmed.
5. **Exit-path enumeration for the trap.** Seven paths constructed (die,
   `set -e`, failed assertion, failed step, SIGTERM, SIGHUP, SIGINT to
   the process group), plus the no-trap control and the SIGINT-to-pid
   case. **Empty-handed for a leaked watcher on all seven.** Found
   CR-642 on the watchdog. **Scope: local mode on the fast root; I did
   not test the full-mode stage A exit paths separately, but the trap and
   the wait are in `stage_a`, which is shared.**
6. **SIGKILL.** Not constructed. Untrappable by definition; stated rather
   than measured.
7. **Phantom wake, startup variant.** Constructed. Now caught at A5.
8. **Phantom wake, blind delayed variant.** Constructed. Not caught end
   to end; caught by A1. CR-647.
9. **Validator false-positive sweep.** Three honest bundles including the
   previously unexercised gh-present local branch. **Empty-handed for a
   false rejection.** Scope stated above.
10. **Validator false-negative sweep.** Constructed by stripping outcomes
    per step from a real bundle. Found CR-643 (B1). **Negative for every
    other step**: stripping C2's outcomes is caught. Scope: the shipped
    validator program run standalone against my 53-record local bundle.
11. **Workflow defang matrix.** Five edits constructed. Found CR-640.
    **Scope: `.github/workflows/gates.yml` at `8954b05` and the one
    registered test that reads it. I did not check the workflow against a
    GitHub Actions schema validator, and no reviewer has seen the new
    step run on a runner.**
12. **CR-605 "not implementable" argument.** Both halves re-executed
    (recursion from the bundle, `node_modules` wipe by sentinel).
    Confirmed. Found the stale count, CR-646.
13. **W1, W2, W7, W7b re-derived plus W7c.** All reproduce. Positive.
14. **CR-602 `cp` robustness.** Constructed. Found CR-641.
15. **`observed === expected` sweep of the post-fix bundle.** 6 records,
    all measured. **Empty-handed for a new literal.** Scope: all 53
    records of my baseline bundle.
16. **`write_session` scoping under `set -u` from main scope.**
    Constructed via the real full-mode run. **Empty-handed.**
17. **Reporter-pin leakage.** `grep -rn "NODE_OPTIONS"` and
    `"test-reporter"` over the whole checkout excluding `delivery/`,
    `node_modules/`, `dist/`, `.git/` and scratch. **Negative.**
18. **Real sandbox repository.** One read-only `ls-remote`.
    `27c882f521694e8ba72969a4257aaa31e1d58adb`, unchanged. **I pushed
    nothing.**
19. **Destructive-path re-scan of the round's diff.** The only new
    filesystem writes are the `cp` at `:775` (into the evidence dir) and
    the evidence records. No new `rm -rf`, no force, no reset. **Negative
    for anything reaching outside a scratch area. Scope: `git diff
    79604ec..HEAD` only; the previous round's full destructive audit
    stands.**
20. **Criteria re-walk.** Not done; that is the concurrent reviewer's
    contract. I spot-checked criteria 1, 2, 5 and 6 where they intersect
    a hazard, and all four reproduce.

---

## Honest failure

Things I did not do, or could not do, stated so silence is not mistaken
for coverage.

1. **I did not use a real `gh`.** It is absent from this container. My
   full-mode walk used a 25-line stand-in answering `--version`,
   `pr create`, `pr view --json` and `pr merge`. It proves the harness's
   full-mode control flow, the `--stage c` resume, the approval capture,
   the CR-600 fix and full-mode bundle validation. It proves nothing
   about real `gh` output shapes: `stub-payload.sh:114-119` still assumes
   `gh pr create` prints a bare URL, and `scripts/m1-exit-test.sh:610,
   762` still assume `OPEN` and `MERGED` appear in `gh pr view --json`
   output. Unchanged from last round, and CI has `gh` but never runs full
   mode.
2. **I did not observe the `gates` check on the PR**, including the new
   falsifiability step. That is the orchestrator's observation, and it is
   now load-bearing: the step has never executed on a runner.
3. **I did not wait out a real lease expiry.** CR-645 is reasoned from
   `src/lock.ts` and the CLI usage string, not constructed.
4. **The phantom-wake probes and the trap probes required stubbing A1's
   kernel gates.** That is a deliberate isolation and I report the
   control result for the one that matters (W9, A1 intact, exit 1). It
   means CR-647 is a statement about where assurance lives, not a
   green-when-broken defect of the shipped harness.
5. **I did not audit `src/` for new defects.** My scope was the round's
   diff plus whatever the harness drives. The one `src/` mutation I made
   was a probe, reverted, and the tracked tree is clean.
6. **I did not construct an adversarial hand-edited `session.json`** for
   CR-644, so the "no other record is clobberable" half is reasoned from
   the code, not built.
7. **CR-640's severity is a judgment call at the medium/low boundary.**
   The shipped CI step works; what is defeatable is its regression guard,
   and the fix is three lines. I have said so explicitly rather than
   hiding the uncertainty inside a severity label.
8. **Timing.** My real local-mode run was `1m56.9s`; the suite was
   `1m38.2s` on Node 26 and about `1m51s` on Node 22. Neither the 120s
   beacon bound nor the 180s wake bound was approached in twelve harness
   runs, but I did not load the machine to find where they would be.

---

## Bottom line

The fix round did what it was asked to do. CR-600's two halves are closed
and I broke them again to prove the guards fire. CR-601's trap holds on
every exit path I could enumerate and construct. CR-602's three records
now carry measured values and C1 is re-derivable from the bundle.
CR-603's fix kills the phantom wake that beat the previous harness.
CR-604, CR-606, CR-607 and CR-609 are done. CR-608's decline is correct
reasoning against an explicit plan clause.

**The harness still cannot pass while the milestone is broken**, and it
is harder to fool than it was at `79604ec`.

What blocks merge is one medium, and it is in the fix for the finding
that was about durability: the guard that is supposed to stop anyone
quietly removing the falsifiability step catches deletion and misses
three real defangs, one of which is a single character. The work history
and the test's own comment both claim otherwise. Three assertions close
it. Everything else I found is low and script-local; none of it touches
`src/`.
