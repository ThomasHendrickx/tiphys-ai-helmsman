# Final review: M1-P3 (session lock and worktree pool)

- Date: 2026-08-04
- Branch: claude/m1-p3-lock-and-pool
- Head reviewed: 7f56a77 ("M1-P3: remove the concurrency rollback machinery rather than fix it again")
- Merge base with origin/main: 2431813
- Round 5 delta reviewed: c06464c..7f56a77 (net -293/+188 over 4 files)
- Reviewer scope: single review pass before the merge decision, time-boxed by
  orchestrator direction. Six questions, in the priority order given.

## Method and isolation

All execution happened in a private clone. Nothing was written to
/home/user/tiphys-ai-helmsman except this file (uncommitted, per instruction).

    CLONE=/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/final-review-priv
    git clone --no-hardlinks -q /home/user/tiphys-ai-helmsman "$CLONE"
    git -C "$CLONE" checkout -q 7f56a77
    cd "$CLONE" && npm ci

Environment: Node v22.22.2 (declared floor >=26; EBADENGINE warnings observed
and treated as expected, never a finding), git 2.43, gh absent. Scratch fleets
and scratch git repositories were created under the session scratchpad only.
Every source edit made for a red-witness probe was taken from a copy and
restored, with `git diff --stat` confirming an empty diff afterward.

## VERDICT

**APPROVE.** No acceptance criterion was lost to the deletion. All 17 criteria
are met or (criterion 13's final clause) explicitly and correctly deferred by
the plan's own cross-reference to M1-P4. The gates are green. Three findings
stand, none of them a lost criterion and none of them destructive; see the
merge recommendation for the conditions attached.

Counts: **16 met, 0 not-met, 0 no-longer-covered, 1 met-in-part by plan design**
(criterion 13, whose last clause is the plan's named M1-P4 obligation).

---

## Question 1: did the deletion take an acceptance criterion with it?

This was the central question. Answer: no.

Method: every criterion was walked against the code at 7f56a77. Criteria 1 to 5,
9, 10 and 14 to 16 were re-executed directly through the CLI or through targeted
`node --test` runs. Criteria 6, 7, 8, 11, 12, 13 and 17 were verified through the
registered tests in a full suite run plus, for the four race criteria, five
targeted repeats each. Criterion 15 and the destroy criteria were executed
repeatedly as instructed.

| # | Verdict | Evidence |
|---|---|---|
| 1 | MET | `lock acquire` exit 0; lease parses; holderId `e3c1fa43-...` non-empty; expiresAt 2026-08-04T21:11:11.440Z, in the future; `grep -ci pid` over the file = 0; no key matching /pid/i. Also test `lock-acquire-creates-lease`. |
| 2 | MET | Second `lock acquire` while unexpired: exit 1, stderr `lock held by e3c1fa43-...`; `cmp` before/after byte-identical. |
| 3 | MET | Five concurrent `lock acquire` on a free lock: exit codes `1x 0, 4x 1`; file holderId `35fd04c8-...` equals the winner's stdout. Executed live, plus registered test. |
| 4 | MET | renew by holder: exit 0, expiresAt 21:11:11.829Z -> 21:11:30.726Z (strict increase). renew on expired lease with matching holder: exit 1, "an expired lease cannot be renewed". renew with wrong holder: exit 1, file byte-identical (`cmp` clean). |
| 5 | MET | 1s lease waited past expiry: `lock status` exit 0, stdout `expired holder 80cd1924-... acquired ... expires ...`; `lock acquire` exit 1 reporting expired; `lock acquire --take-over` exit 0 with new holderId `97187a8b-...` and fresh future expiry. |
| 6 | MET | Test `a renew and a takeover staged against the same lease serialize to exactly one winner`: 5/5 green in targeted repeats. Staged interleave through the TIPHYS_LOCK_TEST_HOLD barrier, not a sleep. |
| 7 | MET | Test `two concurrent takeovers on an expired lease yield exactly one winner`: 5/5 green. |
| 8 | MET | Both auditable outcomes have their own test (`a release racing a takeover loses...`, `a takeover racing a release loses...`): 5/5 green each. |
| 9 | MET | After takeover, `lock renew --holder <loser>` exit 1 and `lock release --holder <loser>` exit 1; winner lease `cmp` byte-identical. |
| 10 | MET | `grep -cniE 'process\.kill\|/proc\|\bpid\b\|signal-0' src/lock.ts` = 0, grep exit 1. A repo-wide grep over `src/` for pid/signal/proc/liveness also returns nothing. Structural test `lock-no-process-probing` also enforces it every run. |
| 11 | MET | Tests `pool create bases on the fetched remote head when the local default branch is behind` and `... is ahead`, both asserting emitted base == remote head, worktree HEAD == that sha, and `git status --porcelain` empty. Green in the full run. |
| 12 | MET | Tests `pool create resolves the base from a clone at a detached HEAD` and `pool create resolves the remote default branch when origin/HEAD is unset`. Green. |
| 13 | MET (pool half); final clause is the plan's own M1-P4 obligation | Tests `pool create with an unreachable remote fails and creates nothing` (exit nonzero, no worktree, no record, `git worktree list --porcelain` unchanged) and `pool create --offline uses the last fetched remote-tracking sha and records offline true` (offline: true, base == last fetched sha while upstream had advanced unseen). The clause "a spawn over that offline-created worktree writes meta.json with baseOffline true" names M1-P4 in the criterion text itself; spawn does not exist in this phase. Work history deviation 5 declares this. Correct, not a gap. |
| 14 | MET | Executed live: `pool create --task t-part` on a used id -> exit 1, stderr `task id already used: t-part`. Plus registered test. |
| 15 | MET | Test `two concurrent pool creates for distinct task ids both succeed`, executed 10 times in isolation: **10 green, 0 red**. Both exit 0 and `git worktree list --porcelain` contains both worktree paths. The test still stages a genuinely behind tracking ref, so a real ref transaction is opened. |
| 16 | MET | Tests `pool destroy refuses a dirty worktree and --discard removes it` and `pool destroy removes a clean worktree without flags`, run 5 times as a targeted group with all `pool destroy` tests: **5 green, 0 red**. Assertions cover all three halves: refusal leaves the directory, `--discard` removes the directory AND the registration (`git worktree list --porcelain` no longer contains the path), and a clean worktree destroys without flags. |
| 17 | MET | `rm -rf dist && npm test`: exit 0, `# tests 76`, `# pass 74`, `# fail 0`, `# cancelled 0`, `# skipped 2` (the standing P2 floor-gated doctor pair, each with its recorded SKIP reason), `# todo 0`, duration 63434 ms. Registry: 77 mappings, every one resolves by name to a test title present in that run. Nothing previously registered was dropped other than the two entries for the two deleted tests. |

### The two deleted registry entries

`pool-create-six-way-concurrent` and `pool-create-offline-no-false-provenance`
were removed with their tests. Neither is named by any criterion:

- Six-way concurrent create is strictly wider than criterion 15's two-way case,
  which survives and was executed 10/10 green.
- Offline false provenance under concurrency is wider than criterion 13, whose
  literal requirement (offline exit 0, last fetched sha, `offline: true`) is
  still covered by the sequential offline test.

So the deletion removed coverage that was *above* the contract, not coverage
*of* the contract. That is the correct cut.

One thing the deletion did quietly take with it is covered under finding F-3
below: it was the only thing exercising the worktree-add retry path.

---

## Question 2: is the failure path honest now?

Partly. It removes nothing, it exits nonzero, and it names the real leftovers
accurately. But the remedy command it prints does not work in one real leftover
shape, and that shape is reachable in M1 without any parallelism.

### What is right

Three distinct forced create failures were executed against a scratch fleet.

1. **Genuine failure before any git mutation.** Worktree destination staged as a
   dangling symlink (`existsSync` returns false for it, so the up-front duplicate
   gate passes and `git worktree add` then fails for real).

       tiphys pool: git worktree add failed: Preparing worktree (new branch 'task/t-fail')
       fatal: '.../worktrees/t-fail' already exists; nothing was removed, left behind:
       pool record .../t-fail.pool.json, branch task/t-fail; clear it with
       "tiphys pool destroy --task t-fail --discard --delete-branch-force" run in the fleet home
       CREATE_EXIT=1

   Verified afterwards: record present, branch `task/t-fail` present,
   `git worktree list --porcelain` unchanged (nothing was deleted). The printed
   command was then run verbatim: exit 0, `destroyed t-fail (deleted branch
   task/t-fail was 31ce50d...)`, record gone, branch gone. **Remedy works.**

2. **Failure after a complete add.** Stub git delegating to the real git and then
   exiting 1. Message named record + worktree directory + branch, all three of
   which really existed and were really registered. Remedy run verbatim: exit 0,
   all three cleared, `git worktree list` back to just the project. **Remedy works.**

3. **Retry-of-add collision** (see F-3): stub git that creates the branch, emits
   a real captured contention shape and fails; the retry hits the real git and
   fails with `a branch named 'task/t-addretry' already exists`. Message honest,
   remedy run verbatim: exit 0. **Remedy works.**

### What is wrong: F-1

4. **Real partial add.** A 4000-file base commit, `git worktree add` SIGKILLed
   60 ms in. This is the exact state the work history itself documents
   (`.git/worktrees/<id>/locked` containing `initializing`), and it needs no
   concurrency at all: Ctrl-C, a crash, a full disk or an OOM kill during a
   large checkout produces it in a single-threaded M1.

       tiphys pool: git worktree add failed: ... fatal: add interrupted; nothing was removed,
       left behind: pool record .../t-part.pool.json, worktree directory .../t-part,
       branch task/t-part; clear it with "tiphys pool destroy --task t-part --discard
       --delete-branch-force" run in the fleet home
       CREATE_EXIT=1

   State confirmed: `.git/worktrees/t-part/locked` = `initializing`;
   `git worktree list` shows the entry as `locked`. Printed command run verbatim:

       tiphys pool: git worktree remove failed: fatal: cannot remove a locked working tree,
       lock reason: initializing
       use 'remove -f -f' to override or unlock first
       DESTROY_EXIT=1

   Nothing was cleared. Re-creating the same id is also refused
   (`task id already used: t-part`), so the operator following the kernel's own
   instruction is wedged. Escape verified by hand:
   `git -C <project> worktree unlock <path>` (exit 0), after which the same
   printed command succeeds (exit 0, branch deleted, record removed).

This is precisely the bar the question sets: a message that suggests a command
that fails is worse than no message. Recorded as F-1 below.

---

## Question 3: is anything dead or lying?

### Suite, from a removed dist

    rm -rf dist && npm run build   -> exit 0; git status --porcelain empty afterward
    rm -rf dist && npm test        -> exit 0
    # tests 76 / # pass 74 / # fail 0 / # cancelled 0 / # skipped 2 / # todo 0
    # duration_ms 63434.34

The two skips are the standing P2 floor-gated doctor exit-0 witnesses, each
carrying its SKIP reason (`local Node v22.22.2 is below the kernel floor >=26;
exit-0 witnessed on CI (Node 26)`). Zero unaccounted.

### Registry

77 mappings; 76 distinct test titles are declared in `test/*.test.ts`; all 77
values resolve to a declared title, and all 77 appear in the TAP output of the
run above (the two that appear with a `# SKIP` suffix are the floor-gated pair).
The 77-vs-76 gap is the deliberate, previously documented pair
`pool-destroy-dirty-refused` and `pool-destroy-discard-removes` mapping to the
one test that witnesses both halves of criterion 16.

**Rename probe (proving the check is not vacuous):** renaming
`two concurrent pool creates for distinct task ids both succeed` to
`... RENAMED` made the checker report exactly one unresolved mapping,
`pool-create-parallel-distinct`. Restored; `git diff --stat` empty.

### Dead code

- No reference anywhere in `src/` to `rollbackPartialAdd`,
  `isTransientWorktreeAddError`, or `rmSync`. Clean removal.
- Every import in `src/pool.ts` is still used.
- `isTransientGitLockError` and `provablyStaleLock` are both still exercised by
  tests (`only genuine git lock contention is retried`,
  `a git lock file is treated as stale only under the full fail-safe proof`).
- No test asserts removed behavior. `pool create with an unreachable remote
  fails and creates nothing` still holds because that failure occurs before the
  record reservation, not after it.
- Not dead but unguarded: the retry on `git worktree add`. See F-3.

### Lying comments

Confirmed, F-2. `src/pool.ts:240-242`, the docstring of `poolCreate`:

    /**
     * pool create (EXT-F-03 five steps; see module doc). Returns the pool
     * record on success. On any failure before completion, nothing is left
     * behind: the record reservation is rolled back and no worktree exists.
     */

This is false at this head, and it is contradicted by a comment 60 lines below
it in the same function which says "There is deliberately NO automatic cleanup
on failure." Also F-4: the module docstring at the top of the file still calls
the pool "parallel-safe through unique paths, O_EXCL record creation, and git
worktree add's own locking", which the round's own deferral item 1 now
contradicts above roughly six-way.

---

## Question 4: is the stale-decision fix real?

Yes, and it is red-witnessed against the dangerous state, not against an absent
feature.

The fix is at `src/pool.ts` in `applyDestroy`: the branch tip is re-read
immediately before `git branch -D` and the delete is abandoned when it no longer
equals the tip stage 2 approved.

**Green:** test `destroy aborts the branch delete if the branch moved after the
gate approved it`, run 5 times in isolation: **5 green, 0 red.**

**Red witness re-performed by me.** I changed the recheck's guard to a
constant-false condition (`if (false && currentTip !== facts.branchTip.sha)`),
leaving everything else intact, and re-ran the same test 5 times:

    SABOTAGED green=0 red=5
    not ok 1 - destroy aborts the branch delete if the branch moved after the gate approved it
      error: 'destroy deleted a branch that moved after the gate approved its tip'

**Measured rate: 5/5 red with the recheck disabled, 0/5 red with it.** The
failure message confirms the test fails on the dangerous state (the branch
carrying the new commit was actually deleted), not merely on a missing feature.
The window is opened for real: a stub git moves the branch immediately after the
`worktree remove` call, which is exactly the step sitting between the gate and
the delete. Source restored; `git diff --stat` empty.

I also verified the surviving contention guards are real. With the fetch's retry
reduced to a single attempt, both stub-git witnesses go **0 green, 5 red**:
`pool create retries a contended fetch instead of refusing` and `pool create
retries a fetch broken by a concurrent worktree add`. These are deterministic,
not probabilistic.

---

## Question 5: is the deferred list concrete enough to act on?

The four deferred items are in the work history under "Deferred to M5,
concretely, so this is a deferral and not a quiet drop".

| Item | Judgement |
|---|---|
| 1. Heavy-concurrency create hardening | **Concrete enough.** Carries the measured failure rates (4/90, 5/90, 16/120 to 32/120), names the two failing call sites (fetch, worktree add), states what M1 needs instead (criterion 15's two-way case) and what M5 must decide (supported width, and test at it). M5 planning can pick this up without re-deriving anything. |
| 2. Partial-state rollback on create failure | **Concrete enough on requirement, now incomplete on premise.** The requirement is specific (remove only what this invocation created, validate every path before deleting, cannot race a concurrent create). But its premise sentence, "M1 now leaves the record, worktree directory and branch in place and tells the operator how to clear them", is only true when the printed command works, and F-1 shows a real M1-reachable state where it does not. Fixing F-1 restores the premise. |
| 3. The unattributed "branch already exists" failure | **Concrete enough, and honestly bounded.** The full mechanism is written down step by step, the residual rate (1 in 18 full-suite runs on the previous head) is given, and the post-removal observation (0 in 10 runs) is explicitly labelled an observation over 10 runs, not a proof. This is the right register. |
| 4. The prune-versus-add hazard | **Concrete enough.** Names the mutation, the two admin-directory states it kills, the measured rate (2 kills in 2689 prunes at 80-way), what M1 no longer does (no prune on the create path) and what M1 still does (destroy still prunes, safe only because M1 never runs concurrent destroys). |

### Anything else silently dropped and not on the list

One item, and it is F-3: **the retry on `git worktree add` lost its only
coverage and nothing says so.** Verified by execution. Reducing the add's
attempts to 1 (leaving every other retry intact) and running the whole pool
suite gives `# tests 27 / # pass 27 / # fail 0` -- no test notices. The two
surviving stub-git witnesses are both on the *fetch*; the add-side retry was
only ever driven, probabilistically, by the two heavy-concurrency tests that
round 5 deleted.

The work history's "Kept" section says "both deterministic stub-git contention
witnesses stay, so the retry path keeps a red-witnessable guard". That sentence
is true of the fetch half and false of the add half. Under the red-witness rule
in CLAUDE.md, the add-side retry is now unwitnessed code in the file that
produced four consecutive rounds of defects. It should either be witnessed (a
third stub-git case is cheap and deterministic, the pattern already exists) or
be added to the deferred list as a named, deliberate gap.

Two smaller inaccuracies, recorded as F-5:

- "if the branch is already there the create refuses with its existing clear
  message". Executed: what the operator actually sees is the wrapped raw git
  error, `git worktree add failed: ... fatal: a branch named 'task/t-addretry'
  already exists; nothing was removed, left behind: ...`, not the pre-check's
  message. The outcome is still honest and the remedy still works (verified,
  exit 0), so this is wording, not behavior.
- Environment warning 11 still states "not every transient is retryable in
  place ... it needs its partial state rolled back first", which is the rule
  round 5 deliberately reversed. Warnings 6 and 9 give the suite at "about 28s"
  and "about 55s"; I measured 63.4 s.

---

## Question 6: quick sweep

**Scope.** Three-dot diff `2431813...7f56a77` touches exactly nine files:

    delivery/work-history/m1-p3.md   src/cli.ts   src/commands/lock.ts
    src/commands/pool.ts   src/lock.ts   src/pool.ts
    test/behaviors.json   test/lock.test.ts   test/pool.test.ts

The plan's files-to-touch list for M1-P3 is `src/lock.ts, src/commands/lock.ts,
src/pool.ts, src/commands/pool.ts, test/lock.test.ts, test/pool.test.ts
(create); src/cli.ts (edit)`. The two extras are `test/behaviors.json` and the
phase work history, both standing pre-authorized. **PASS**, no stray files, no
tsconfig or dependency or workflow changes, no `delivery/` writes beyond the
work history.

**Conventions.** `grep -P '[^\x00-\x7F]'` over all nine files: clean, pure ASCII,
so no em dashes. No pnpm or yarn artifacts; `package.json` scripts are npm only.
Commit messages over the range contain no AI model or tool names (grep for
claude/anthropic/gpt/copilot/opus/sonnet/co-authored: no matches). **PASS**

**C-1 (no current state from a log tail).** The lock reads the lease file; the
pool reads the pool record and live git refs. No tail reads, no append-only log
consumption. The only matches for "log tail" in the tree are comments asserting
the constraint. **PASS**

**C-2 (no pid, signal, process liveness, /proc).** Repo-wide grep over `src/`
for `process.kill|/proc/|signal|\bpid\b|SIGKILL|SIGTERM|isAlive|process.pid`:
zero matches. Liveness is lease freshness only. **PASS**

**C-3 (no auto-backgrounding).** No `detached`, no `unref()`, no `nohup`. Every
subprocess is `spawnSync` or an awaited spawn; the `lsof` probe is synchronous.
**PASS**

**Gates.** `npm ci` exit 0; `npm run build` exit 0 with a clean
`git status --porcelain` afterward; `node --test` exit 0. **PASS**

---

## Findings

### F-1 (MEDIUM): the create-failure remedy command fails on a real partial worktree add

**Claim.** When `git worktree add` is interrupted partway, git leaves
`.git/worktrees/<id>/locked` containing `initializing`. The failure message
tells the operator to run
`tiphys pool destroy --task <id> --discard --delete-branch-force`. That command
runs `git worktree remove --force`, which refuses a locked working tree. The
remedy exits 1, clears nothing, and the task id stays unusable.

**Evidence (executed).** 4000-file base commit, `git worktree add` SIGKILLed at
60 ms through a stub git; the create failed with the leftovers message naming
record + directory + branch; `.git/worktrees/t-part/locked` = `initializing`
confirmed; `git worktree list` shows `locked`. The printed command then:

    tiphys pool: git worktree remove failed: fatal: cannot remove a locked working tree,
    lock reason: initializing
    use 'remove -f -f' to override or unlock first
    DESTROY_EXIT=1

Re-create refused with `task id already used: t-part`. After
`git -C <project> worktree unlock <path>` (exit 0), the identical printed
command succeeded: exit 0, `destroyed t-part (deleted branch task/t-part was
697d5cf...)`.

This needs no concurrency. Ctrl-C, a crash, a disk-full or an OOM kill during a
large checkout reaches it in a single-threaded M1.

**Concrete fix.** In `applyDestroy`, when `options.discard` is set, use
`["worktree", "remove", "--force", "--force", facts.worktree]`. `--discard`
already means "remove anyway" per the plan's step 3 wording, and doubling the
force flag is git's own documented way to say it for a locked tree. Note this
deliberately does not weaken the default: without `--discard` nothing changes.
Alternatively, keep the single force and, on a stderr matching
`cannot remove a locked working tree`, run `git worktree unlock <path>` and
retry once. Either way, add a test that reproduces the state the way I did
(kill a real add mid-checkout, or plant the `locked` file) and demonstrate it
red against the current code: it will be red, I measured it.

### F-2 (MEDIUM): the `poolCreate` docstring describes machinery that was deleted

**Claim.** `src/pool.ts:240-242` still says "On any failure before completion,
nothing is left behind: the record reservation is rolled back and no worktree
exists." That is the pre-round-5 contract. The function now deliberately leaves
everything behind, and says so in a comment 60 lines lower.

**Evidence.** Read at 7f56a77, contradicted by the executed behavior in question
2 (record, directory and branch all survive a failed create) and by the
in-function comment "There is deliberately NO automatic cleanup on failure."

**Why it matters here specifically.** The work history's own D-2 entry records
that a false comment in this exact module is how a real defect stayed hidden
once already. This is the same shape.

**Concrete fix.** Replace those two sentences with the true contract: on failure
nothing is removed; the record, the worktree directory and the branch may all
survive; the reason line names what survived and the command that clears it.

### F-3 (MEDIUM): the worktree-add retry is now unwitnessed, and is not on the deferred list

**Claim.** Round 5 kept the retry on `git worktree add` but deleted the only
tests that ever drove it. No test now guards it. The work history states the
opposite ("the retry path keeps a red-witnessable guard"), which is true only of
the fetch half.

**Evidence (executed).** With the add's `runGitRetrying` attempts reduced to 1
and every other retry untouched, `node --test test/pool.test.ts` gives
`# tests 27 / # pass 27 / # fail 0`. Contrast: with the fetch's attempts reduced
to 1, its two witnesses go 0 green / 5 red each. Source restored, diff empty.

**Concrete fix.** Either add a third deterministic stub-git witness for the add
(the harness `stubGitFailingFirstFetch` in `test/pool.test.ts` is one small edit
away from a first-add variant, and the behavior it needs to assert is that the
create succeeds after one contended add), or, if M5 is the right place, delete
the add-side retry too and add a fifth entry to the deferred list saying so. Do
not leave retry logic with no red witness in this file.

### F-4 (LOW): the module docstring still calls the pool parallel-safe

`src/pool.ts` module doc: "parallel-safe through unique paths, O_EXCL record
creation, and git worktree add's own locking". True at two-way (criterion 15,
10/10 green), measured false above roughly six-way by this phase's own
verification. Suggest: qualify it to the width M1 actually supports and point at
the M5 deferral item 1.

### F-5 (LOW): three small work-history inaccuracies

1. "if the branch is already there the create refuses with its existing clear
   message" -- executed, and what appears is the wrapped raw git error inside
   the `git worktree add failed:` leftovers line, not the pre-check message. The
   remedy still works (exit 0 verified).
2. Environment warning 11 still asserts "it needs its partial state rolled back
   first", the rule round 5 reversed on purpose. It should carry a pointer to
   the reversal so a P4+ implementer does not re-derive the deleted design.
3. Suite wall time is given as "about 28s" (warning 6) and "about 55s"
   (warning 9); measured 63.4 s at this head. Harness timeouts in later phases
   are budgeted off this number.

---

## What I executed versus what I read

**Executed.**

- `npm ci`, `rm -rf dist && npm run build` (exit 0, clean porcelain),
  `rm -rf dist && npm test` (exit 0, 76/74/0/0/2/0, 63.4 s).
- Criteria 1, 2, 3, 4, 5, 9, 10, 14 live through the CLI in a scratch fleet.
- Criterion 15: 10 isolated runs, 10 green.
- Criterion 16 and the destroy group: 5 isolated runs, 5 green.
- Criteria 6, 7, 8: 5 isolated runs each of all four race witnesses, 20 runs,
  0 red.
- Four forced create failures, three of them producing genuinely real git
  states, each followed by running the printed remedy verbatim.
- Stale-decision red witness: recheck disabled, 5/5 red; restored, 5/5 green.
- Fetch-retry red witness: attempts=1, 5/5 red on both stub-git witnesses.
- Add-retry coverage probe: attempts=1, 27/27 pool tests still green.
- Registry resolution over the run's TAP output, plus a rename probe.
- Scope, ASCII, npm-only, commit-message and C-1/C-2/C-3 greps.

**Read only.**

- The plan's M1-P3 section and all 17 criteria; CLAUDE.md; the whole of
  `delivery/work-history/m1-p3.md`; `src/pool.ts`, `src/commands/pool.ts`,
  `src/cli.ts` in full; `test/pool.test.ts` in full; `src/lock.ts` and
  `test/lock.test.ts` by structure and test titles rather than line by line.
- The round 5 delta `c06464c..7f56a77` as a diffstat plus the behaviors.json
  diff, and the code at head rather than every intermediate revision.

## Honest failure section

Things this review did not establish, stated so nobody credits it with them.

1. **I did not re-verify the lock module line by line.** Criteria 1 to 10 were
   walked by execution and by their registered tests, and I re-witnessed the
   race criteria 20 times, but `src/lock.ts` (622 lines) was read structurally.
   Round 5 did not touch it (`git diff c06464c..7f56a77` covers 4 files, none of
   them the lock), so the risk is bounded by the earlier rounds' review, not by
   mine.
2. **I did not reproduce the deferred item 3 residual.** The "branch already
   exists" failure that appeared 1 in 18 full-suite runs on the previous head
   did not appear in my one full-suite run. One run says nothing. The work
   history's own claim (0 in 10 runs) remains an observation, not a proof, and I
   did not improve on it.
3. **Two of my four forced create failures used a stub git** to produce the
   failure exit, because a naturally-occurring late add failure is hard to
   schedule. The *states* those stubs left behind were real git states in real
   repositories, and the remedy was run against those real states. The fourth
   case (F-1) needed no fabricated exit code at all: a real `git worktree add`
   killed mid-checkout produced the locked partial tree on its own.
4. **CI on Node 26 is still the authority.** Everything above ran on Node
   v22.22.2. The two floor-gated skips remain unwitnessed locally by design.
5. **I did not audit the M1-P4 consumption surface.** Whether P4's teardown path
   is affected by F-1 (it calls destroy with `--discard`) is stated as a
   judgement, not tested: a *completed* worktree is never locked, so I expect no
   impact in normal operation, but I did not build P4 to check.
6. **Time-boxed by direction.** I did not attempt to independently re-derive the
   contention signature, re-run the heavy-concurrency scenarios that round 5
   deleted, or re-open any of the four earlier rounds' closed findings.

---

## MERGE RECOMMENDATION

**Merge, with three named conditions.** The central question is answered
cleanly: the deletion took no acceptance criterion with it, all 17 are met (with
criterion 13's last clause correctly deferred to M1-P4 by the plan's own text),
the gates are green from a removed `dist/`, the registry resolves by name and
the checker is proven non-vacuous, the scope is exactly the plan's list plus the
two standing extras, and the stale-decision fix is real and red-witnessed 5/5
against the dangerous state. Round 5 made the code smaller, and it did not make
it weaker where the contract lives. The conditions are: **(1)** fix F-1, the
printed remedy that fails on a locked partial worktree, with a test that is red
against that state -- this is a one-flag change (`--force --force` under
`--discard`), it is not a fix round, and it should land before M1-P4 dispatch
because P4's teardown drives the same destroy path; **(2)** correct the F-2
docstring, which currently promises a rollback that was deliberately deleted;
**(3)** either witness the add-side retry or move it to the deferred list (F-3),
because leaving unwitnessed retry logic in this particular file is how the last
four rounds started. F-4 and F-5 are wording and can ride along. None of these
warrants a fifth review pass: they are mechanically verifiable by the existing
suite plus one new test, and the owner can reasonably ask for them as a
pre-merge commit rather than a new round.
