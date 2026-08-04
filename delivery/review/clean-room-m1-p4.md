# Clean-room review: M1-P4 (spawn and teardown guard), PR 6

- Date: 2026-08-04
- PR: 6, branch claude/m1-p4-spawn-and-teardown into main
- Head SHA reviewed: 6fca6db (merge base with origin/main: 54ceb6eb27c7a0fa07ae2b67d09f0dc41d9382e4, "M1-P3: lease-based session lock and worktree pool (#3)")
- Reviewer: single review gate for this phase (the owner has instructed lean operation, so this is the only review pass before the merge decision). Contract is the plan's M1-P4 section with its 14 acceptance criteria, the section 3 preamble (invocation form, constraints C-1, C-2, C-3, the test accounting rule), section 4 (M1 exit test), CLAUDE.md, and tuition T-002, T-003, T-004.
- Isolation used: a private clone at
  `/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/review-p4-priv`,
  made with `git clone --no-hardlinks -q /home/user/tiphys-ai-helmsman`, checked out at 6fca6db, `npm ci` inside it. Nothing outside that clone and my own scratch directories was written or read for mutation; no sibling worktree or clone (wt-m1-p4, wt-m1-p6, u2-*, v3-*) was touched. Sabotage witnesses were applied in that private clone only, each reverted with `git checkout -- <file>` and verified with `git diff --quiet`. Every scratch fleet used for the hand walk lived in a fresh directory of my own creation (T-004).
- Environment: Node v22.22.2 (declared floor >=26, so EBADENGINE warnings are expected and are never a finding here; CI on Node 26 is the authority), git 2.43.0, gh absent.

## Verdict

FIX-ROUND-NEEDED.

All 14 acceptance criteria are met, and I re-executed the load-bearing ones by hand through the real CLI rather than trusting the suite. The executor seam, the refusal ordering, the fetch-first landedness procedure and the two holdership checks are faithful to the plan and are guarded by tests that I demonstrated red against the dangerous state, not merely against an absent feature. Both declared judgement calls are correct, and the plan prose, not the implementation, is what needs correcting.

The reason this is not an approval is CR-301: spawn onto a task id whose `tasks/<id>/` directory already exists (the normal state after any successful teardown, and after any rollback) silently overwrites the previous incarnation's records, and its launch-failure rollback then deletes them, leaving a task directory that carries a stale `turn-end` and no `meta.json` at all. I reproduced both halves through the CLI. That is a destructive path firing outside the scope its own contract declares ("removes what the failing invocation created, and only that"), and it puts a false completion record under the C-1 state authority that M1-P5 is about to consume. The fix is small and well bounded, and I have specified the required red witness so the round cannot balloon (T-003: a fix round is not lower risk than the work it fixes).

The other three findings are lows and could ride along in the same round as message and text changes.

## What I executed versus what I read

Executed in the private clone at 6fca6db:

- `npm ci` (exit 0), `npm run build` (exit 0, `git status --porcelain` empty afterwards), `rm -rf dist && npm test` (exit 0; tests 99, pass 97, fail 0, cancelled 0, skipped 2, todo 0, duration 67825ms). The 2 skips are M1-P2's floor-gated doctor witnesses, each carrying its recorded reason ("local Node v22.22.2 is below the kernel floor >=26; exit-0 witnessed on CI (Node 26)"). Zero unaccounted.
- Behavior registry name check over that same run: 100 mappings, 99 test titles, 0 missing. Rename probe: renaming the title of `spawn-requires-exec` in `test/spawn.test.ts` and re-running `test/spawn.test.ts` made the checker report exactly `missing: 1 spawn-requires-exec`; the pristine re-run reported `missing: 0`. The checker is therefore proved sensitive, not vacuous.
- Scope audit: `git diff --name-status 54ceb6e...HEAD` returns exactly 12 paths.
- Convention sweeps over every changed file: non-ASCII scan clean (grep exit 1), em dash scan clean, commit-message scan for AI or tool names clean, pnpm/yarn scan clean.
- Five deliberate-failure witnesses re-performed from scratch, three runs each (section "Red-witness re-performance").
- A full hand walk of the 14 criteria through `node bin/tiphys.ts` in four freshly built scratch fleets, each with a real upstream repo, a real clone under `projects/`, a brief file, a fleet `warnings.md` and stub payloads. Every command, exit code and file state quoted in the walk below was observed by me in that walk, not read out of the work history.
- Four adversarial probes beyond the criteria: task-id reuse after teardown, task-id reuse followed by a launch failure, the salvage push-failure path, and the fetch-failure refusal shape.
- One exit-test satisfiability probe: `spawn ... --exec scripts/stub-payload.sh` with a relative payload path, which is the literal form section 4 step A6 uses.

Read only (not executed): the M1-P5 and M1-P6 plan sections, the M1-P3 sources this phase consumes (`src/pool.ts`, `src/lock.ts`, `src/fleet.ts`), the prior clean-room reviews, and the M1-P3 verification records.

## The 14 criteria

Every line below cites something I observed. "Walk" means I ran it through the CLI myself; "test" names the registered guard.

| # | Criterion (abbreviated) | Result | Evidence |
|---|---|---|---|
| 1 | spawn with a cwd-writing stub: exit 0, cwd under `<fleet>/worktrees/<id>`, meta parses with all documented fields, status open, baseSha equals pool create's base, baseOffline false, brief carries brief text plus the full warnings text (and exactly the brief text when no warnings file), and the completion marker exists at the moment spawn returns | MET | Walk: spawn exit 0; payload cwd `.../walk/fleet/worktrees/t1` equal to `pwd -P` of the worktree; marker present at return after a 0.3s sleep; meta held exactly the nine documented keys with `status open`, `branch task/t1`, `baseSha a383f77a...` equal to the upstream head and to the pool record, `baseOffline false`; brief.md was the brief followed verbatim by `warnings.md`; `git status --porcelain` in the worktree empty, so nothing the kernel injects lives inside it (FM-059). Tests spawn-runs-payload-in-worktree, spawn-brief-without-warnings (byte equality, not substring). src/brief.ts:51-68 |
| 2 | turn-end exists and parses as `{endedAt, exitCode}` with a parseable ISO-8601 timestamp and the exec's exit code | MET | Walk: `{"endedAt":"2026-08-04T22:25:39.552Z","exitCode":0}` for a zero payload and `{"endedAt":"...","exitCode":3}` for a payload exiting 3. Test spawn-turn-end-record asserts round-trip identity through `Date`. src/hooks.ts:38-58 |
| 3 | spawn without `--exec` exits 64, usage to stderr, creates nothing | MET | Walk: exit 64, usage line on stderr, stdout empty, and `tasks/t3`, `worktrees/t3`, `worktrees/t3.pool.json` all absent. The check is in the argument parser before the fleet is even loaded (src/commands/spawn.ts:110-113). Test spawn-requires-exec |
| 4 | duplicate live task id: exit nonzero, pre-existing `tasks/<id>/` byte-identical, no new files | MET | Walk: exit 1 with "task id already used: t1"; `md5sum` over every file in `tasks/t1/` identical before and after; `ls worktrees` unchanged. Structurally sound rather than accidentally sound: spawn writes nothing under `tasks/` until `poolCreate` has returned ok (src/spawn.ts:258-306). Test spawn-duplicate-id-preserves-task |
| 5 | launch failure after pool create: exit nonzero, the worktree and `tasks/<id>/` this invocation created are removed, and only those | MET for the criterion as written; see CR-301 for the case the criterion does not reach | Walk: exit 1 with "executor launch failed: ... ENOENT"; `worktrees/t4`, `tasks/t4`, the pool record and `refs/heads/task/t4` all gone; a neighbouring task's files byte-identical; the id re-usable afterwards. Rollback uses `poolDestroy` with `discard:false, deleteBranchForce:false`, so a non-pristine worktree survives a cleanup path instead of being destroyed by it (src/spawn.ts:274-302). Test spawn-launch-failure-rollback |
| 6 | unlanded ship branch: exit nonzero, one reason line naming the branch, worktree still present | MET | Walk: exit 1; stderr exactly one line, `branch task/t6 is not landed on origin/main; land it before tearing the task down`; `worktrees/t6` still present; meta still open. Test teardown-unlanded-refused |
| 7 | two commits squash-merged on the remote, teardown-side local default ref deliberately stale: exit 0 | MET | Walk: branch carried 2 commits (`rev-list --count` = 2 as a precondition); after squash-landing on the upstream, the clone's `refs/heads/main` and `refs/remotes/origin/main` were both still `952f572d`, while the upstream head was `1804c6e2`; teardown exited 0, worktree gone, meta closed. Only teardown's own fetch could have seen the landing. Test teardown-squash-landed asserts the same two-commit precondition and both stale refs, so a per-commit patch-id implementation cannot pass it. src/teardown.ts:109-158, 199-212 |
| 8 | dirty without `--salvage` refuses; `--salvage` with unlanded commits still refuses; after the squash land with a dirty tree, `--salvage` exits 0 and the branch tip message starts with the WIP prefix | MET, all three directions | Walk 8a: exit 1, "has uncommitted changes or untracked files". Walk 8b: exit 1, "branch task/t8 is not landed ... (--salvage rescues leavings, it never lands work)", and the refusal was a true no-op: local tip unchanged, remote tip unchanged, `leavings.txt` still untracked (`?? leavings.txt`). Walk 8c after the squash land: exit 0, remote tip message `WIP-UNREVIEWED (do not treat as reviewed): leavings salvaged by tiphys teardown for task t8`, the commit containing `leavings.txt`, meta closed, worktree gone. Test teardown-dirty-and-salvage |
| 9 | scout with a dirty scratch tree: refuses while `report.md` is absent; with a report, exit 0, worktree removed via `pool destroy --discard`, no push (`git ls-remote` unchanged) | MET | Walk: exit 1 naming the absent `report.md` path, worktree intact; after creating `report.md`, exit 0, worktree gone, meta closed, and `git ls-remote origin` byte-identical before and after (diff clean). src/teardown.ts:312-333 passes `discard:true, deleteBranchForce:false`. Test teardown-scout-report-gate |
| 10 | after a successful teardown, meta status closed and `git worktree list` no longer shows the worktree | MET | Walk (criteria 7, 8c, 9, 13 all ended this way): meta `closed`, worktree directory gone. Test teardown-closes-meta asserts the `git worktree list --porcelain` registration is gone, not merely the directory. src/teardown.ts:272-294 |
| 11 | `executor.json` parses with adapter "subprocess" and a parseable ISO-8601 launchedAt; deadline present and correct only when `--deadline` was passed | MET | Walk: without the flag, `{"adapter":"subprocess","launchedAt":"2026-08-04T22:25:39.202Z"}` with no `deadline` key; with `--deadline 300`, `Date.parse(deadline) - Date.parse(launchedAt)` measured exactly 300000. Units are a declared deviation (absolute instant, not raw seconds); the plan fixes the field name and optionality only, and the choice is recorded at src/spawn.ts:98-107. Test spawn-executor-launch-record |
| 12 | with a lease held: `TIPHYS_HOLDER_ID` unset or mismatched refuses with a reason line naming the lease and creates nothing; matching and unexpired proceeds | MET, both directions | Walk: unset gave exit 1, one line naming `state/orchestrator.lock` and the holder, with `worktrees/t12`, `tasks/t12` and the pool record all absent; a foreign id gave exit 1 naming the real holder; the id taken from `lock acquire`'s real stdout gave exit 0. The check runs before `poolCreate` (src/spawn.ts:248-251), which is what makes "creates nothing" structural. Test spawn-holdership-both-directions additionally waits out a real 1s lease for the expiry direction |
| 13 | the same both-directions holdership check for teardown | MET, both directions | Walk: unset gave exit 1 with the lease-and-holder line, worktree intact, meta open; foreign id gave exit 1; the acquired id gave exit 0 and meta closed. One shared implementation (`checkHoldership`, src/task.ts:156-193) rather than two copies of a security-relevant rule. Test teardown-holdership-both-directions |
| 14 | `node --test` exits 0 with 0 failing and zero unaccounted; every newly named behavior maps to a test present in the run and every previously registered mapping still resolves by name | MET | My own run: exit 0, 99 tests, 97 pass, 0 fail, 2 skipped with recorded reasons. My own registry check: 100 mappings, 0 missing, against 99 titles (two pool behaviors deliberately share one title, as in M1-P3). `test/behaviors.json` diff is a pure append of 20 entries; nothing existing was modified or removed. Rename probe proves the check is not vacuous |

None of the 14 is a criterion that could pass while the thing it guards is broken. I checked each for that specifically:

- Criterion 1's "spawn returns only after the exec exited" is guarded by a real 0.3s sleep and a marker file, and W1 below turns it red.
- Criterion 7's squash recognition asserts both the two-commit precondition and the staleness of both local refs as preconditions, so neither a patch-id implementation nor a stale-ref implementation can pass; W3 and W4 exercise exactly those two dangerous states.
- Criterion 8's "salvage never overrides the unlanded refusal" is guarded by tip-and-remote-unchanged assertions, not merely by the exit code, so an implementation that committed and then refused would fail; W5 confirms it.
- Criterion 9's "without any push" is a byte comparison of real `git ls-remote` output, not an assertion about a code path.
- Criterion 12's "creates nothing" checks the worktree, the task directory and the pool record; W8 turns it red.
- Criterion 4's byte-identity is a full file-content snapshot map of the task directory, not a mtime or a count.

The one gap I found is in what criterion 5 does **not** reach: it is stated for a task id that is fresh, so it never exercises the rollback against a task directory that already existed. That is CR-301.

## Ruling on the two declared judgement calls

### Judgement call 1: the salvage commit happens after the landed check (work-history key decision 17, deviation 5)

**The conflict is real, and following the criteria was correct. The plan prose is what needs correcting.**

I read both independently before reading the implementer's argument.

The prose, plan section 3, M1-P4 step 5, clause (b): "refuse if the worktree is dirty (unless --salvage: commit leavings as a commit whose message starts with 'WIP-UNREVIEWED (do not treat as reviewed):' and push the branch, then proceed) and refuse unless the task branch is landed on the fetched default branch." Read literally, the parenthetical's "then proceed" places the salvage commit inside the dirty clause and therefore before the landed clause.

Criterion 8's final clause: "after the branch is landed via the squash path of criterion 7 and the tree is dirty, teardown --salvage exits 0."

These cannot both hold. A salvage commit introduces content the default branch does not have, so after it the branch is neither an ancestor of the fetched default head nor tree-equal to it. Under the prose ordering, every `--salvage` invocation would refuse at the landed check it had just invalidated, and criterion 8's final clause would be unsatisfiable for every salvage on every input. That is not a marginal reading: it is unsatisfiable by construction.

The prose also contradicts itself, which settles which side is authoritative. The same step ends with "--salvage never overrides the unlanded refusal; it only rescues uncommitted leavings onto the branch." That sentence is implementable only if landedness is judged against the branch as it stands **before** any salvage commit. So the criteria and the prose's own concluding rule agree with each other, and only the ordering implied by the parenthetical disagrees with both. The implementer followed the two that agree and declared the deviation instead of resolving it silently. That is the right call and the right handling.

I also verified that the choice is not merely convenient. Deciding first and acting afterwards is what makes the unlanded `--salvage` refusal a true no-op, which I measured in walk 8b: local tip unchanged, remote ref unchanged, leavings still uncommitted. Under the prose ordering the same invocation would have committed and pushed before refusing, leaving pushed state behind a refusal. Sabotage W5 (salvage moved before the landed check) turns the guarding test red 3/3, and the assertion that fails is precisely the branch-tip-unchanged one.

**Exactly how the plan prose should be corrected.** Replace the clause (b) sentence in M1-P4 step 5 with an explicitly ordered form:

> (b) shape ship, checked in this order: (i) refuse if the worktree is dirty and `--salvage` was not passed; (ii) refuse unless the task branch, evaluated as it stands **before any salvage commit**, is landed on the fetched default branch; (iii) only then, if the worktree is dirty and `--salvage` was passed, commit the leavings as a commit whose message starts with "WIP-UNREVIEWED (do not treat as reviewed):" and push the branch, then proceed. `--salvage` never overrides the unlanded refusal; it only rescues uncommitted leavings onto the branch, and a refusal makes no commit and no push.

That correction is a plan-prose edit only. It changes no criterion, no behavior and no test, and it should land before M1-P5 is dispatched so that the next implementer reading step 5 does not re-derive the wrong order.

### Judgement call 2: the scout teardown path passes `--discard` and not `--delete-branch-force` (key decision 18)

**Correct, and it matches the plan's intent and its letter. I would have flagged the opposite choice as a high-severity finding.**

The plan's step 5(a) names exactly one flag: "with a report, scratch changes are discarded via pool destroy `--discard` and teardown proceeds (scout worktrees are scratch, scouts never push; PR-010)". Criterion 9 names the same one: "the worktree is removed via pool destroy `--discard` without any push". The files-to-touch note says `src/pool.ts` needs no edit because "the `--discard` flag the scout teardown path uses ships in M1-P3". Three independent places in the plan name `--discard` alone, and none of them names branch deletion. `--discard`'s defined meaning in M1-P3 is the dirty-tree override, and `--delete-branch-force`'s is a separate, explicitly distinct authority created as V-1's remedy.

Adding the branch-force flag here would have been an unrequested widening of destructive authority, and it would have reproduced the exact shape of V-1: a scout that committed findings to its scratch branch would have those commits deleted with no message and no recovery. That is the defect this project already paid for once, in this same component, with the same justification available ("scout worktrees are scratch, so nothing there matters").

I verified the behavior in the walk rather than trusting the reasoning. A scout that committed `found.md` and then filed its report is refused by the pool's own stage-2 branch gate, a true no-op: exit 1, `branch task/ts carries commits beyond its base 677fdcd7 (tip cfedbe3b); land them or pass --delete-branch-force to delete it anyway; task ts stays open`, with the branch still at `cfedbe3b`, the worktree intact and meta still open. The commits survive and the operator is told. Sabotage W9 (the scout path passing `--delete-branch-force`) turns the guarding test red 3/3 with "committed scout work was destroyed without a word".

One residue, which is CR-304 below and not an argument against the decision: that refusal names a flag `teardown` does not expose, and a committed scout therefore cannot be closed through `teardown` at all.

## Destructive and irreversible paths

I walked each destructive path against the four questions asked.

**Can a destructive path fire when a gate should have refused?**

- Teardown's ship success path is the only place `--delete-branch-force` is passed, and it is reached only after the landed judgement has returned `landed` (src/teardown.ts:350-387). Landedness is fail-closed in both git calls: an `is-ancestor` exit other than 0 or 1, an unresolvable default tree, a `merge-tree` exit other than 0 or 1, and an empty tree id all return `inconclusive`, which refuses. Conflicts (`merge-tree` exit 1) are a plain unlanded verdict, which is correct for git 2.43 and which the implementer verified in a scratch repo before writing the code.
- The mandatory fetch precedes every landedness question and a failed fetch refuses (walk: `fetch of origin/main failed ...`, exit 1, worktree intact, meta open). "I could not check" is never "it is landed". W3 confirms judging against the stale local ref is caught.
- Between the gate and the destroy there is no re-check in `teardown`, but `poolDestroy` re-reads its own facts in stage 1 and refuses in stage 2 before any IO, so a state change in that window produces a refusal rather than a destruction. Parallelism is off until M5, so the window is not reachable in M1 anyway.
- The scout path never reaches branch deletion at all.

**Can a refusal leave partial state while claiming to be a no-op?**

- Teardown's ordinary refusals (holdership, missing meta, missing pool record, fetch failure, scout without report, dirty without salvage, unlanded, inconclusive) all return before any mutating call. I confirmed the unlanded-with-salvage case empirically because it is the one where an ordering error would be invisible: local tip, remote ref and working tree were all unchanged.
- A `pool destroy` failure is never reframed. Teardown prefixes the destroy's own reason with "pool destroy did not complete:" and appends only "task <id> stays open", so a stage-3 partial failure (worktree already gone) is never described in refusal language. The registered test opens that window for real with a stub git that moves the branch immediately after the worktree removal, and asserts against the pool's real emitted message including the sha the branch is actually left at.
- One exception, CR-302: the salvage push-failure path exits nonzero **after** having made a local commit. Nothing is destroyed and the message says so explicitly, but the universal claim "a refused teardown never commits, never pushes and never removes" (work history key decision 17, and the same sentence in src/teardown.ts:50-53) is false for this path. I measured it.

**Can the launch-failure rollback destroy something it did not create?**

Yes, in the reused-task-id case. This is CR-301, the finding that drives the verdict. For a fresh id the rollback is exactly scoped and I verified that: it removes only the files it recorded, removes the task directory only if it created it, and calls `poolDestroy` with both force flags off. For a reused id it deletes the previous incarnation's `meta.json`, `brief.md`, `executor.json` and hook.

**Can teardown lose committed work?**

- Ship path: the branch is deleted with force only after being judged landed, meaning either an ancestor of the fetched default head or tree-identical to it. In both cases the branch's content is present on the default branch. After a salvage, the WIP commit has been pushed before the branch is removed, so the rescued leavings survive the delete. I verified the pushed WIP commit contained `leavings.txt` before the worktree was removed.
- The one residual case the plan itself authorizes: a branch whose commits net out to no change (for example, work later reverted) is tree-equal to the default and is therefore "landed" by definition (ii), so its unpushed commit history is deleted although the file content matches. No file content is lost. This follows directly from PR-001's landed definition, so it is a property of the plan, not a defect in the implementation; I record it so a later reader is not surprised by it.
- Scout path: verified above, commits survive.
- Spawn: nothing is ever rolled back once the payload has started, including when the payload exits nonzero. A nonzero payload is a completed task, not a failed spawn (walk: exit 0 with `exec exited 3` and a turn-end recording 3). W7 in the work history guards that; I did not re-perform it, but I confirmed the behavior directly.

## Constraints and honesty

**C-3 (nothing auto-backgrounds).** Held. The subprocess adapter uses `spawnSync` for both the payload and the hook (src/spawn.ts:157, 169); there is no `spawn`, no `detached`, no `unref`, no `nohup`, no `setsid` anywhere in the phase's sources. I confirmed the payload genuinely runs to completion before spawn returns, in the strongest available form: the walk's stub wrote its cwd, slept 0.3s, then wrote a marker, and the marker existed at the instant spawn returned; the turn-end file existed and was timestamped 0.35s after `launchedAt`. W1 (payload spawned detached and unwaited) turns the guarding test red 3/3, so this is a guarded property and not a comment.

**C-2 (no pid, signal or process liveness).** Held. A grep over all seven new or edited sources for `process.kill`, `/proc/`, `kill(`, `signal 0`, `pid`, `SIGKILL`, `SIGTERM`, `detached`, `unref(` returns nothing (exit 1). Holdership is a read of the lease file through M1-P3's `leaseStatus` compared against an environment variable the operator carries from `lock acquire`'s printed output. No second identity mechanism was invented, and nothing about the holder is derived from the running program. Both holdership tests parse the id out of `lock acquire`'s real captured stdout rather than asserting a hand-written string, which is the T-003 discipline applied correctly.

**C-1 (no current state from a log tail).** Held in the code as written: the state authority is `meta.json` status plus the turn-end exit code, and nothing reads a tail, sorts an event stream, or infers currency from ordering. But CR-301 defeats the invariant by a different route: a turn-end file from a previous incarnation of the same task id survives into the next incarnation, so the authority can report a completion that did not happen. I measured that directly.

**Work-history honesty.** I checked every quantitative claim in it against my own measurements.

- "tests 99, pass 97, fail 0, cancelled 0, skipped 2, todo 0 ... wall time 67.6s": I measured 99/97/0/0/2/0 and 67.8s. Accurate.
- "100 mappings, 0 missing, 99 test titles in the run": I measured exactly that. Accurate.
- "`git diff --name-status origin/main...HEAD` lists exactly those eleven paths plus this one": I measured 12 paths, matching. Accurate.
- "build exit 0, `git status --porcelain` empty afterwards": reproduced. Accurate.
- "Every one is deterministic at 3/3; none is probabilistic": in the five witnesses I re-performed from scratch, I measured 15 red runs out of 15 attempts, with no green run and no flake. The claim survives the sample I took. This is the third phase in a row where such a claim was made; unlike the two earlier occasions, this one held under re-performance.
- Deviations: five are declared, and all five are real, correctly characterized and argued in the open rather than buried. Deviation 1 (`--offline` on spawn, absent from the plan's flag list) is additive, defaults off, is tested in both directions, and is genuinely necessary to make the inherited baseOffline obligation witnessable at all. Deviation 2 (deadline as an absolute instant) is a units choice the plan does not fix, declared rather than assumed.
- The T-002 disposition is the most honest section in the document: it states plainly that detection is not in this phase, cites where the plan assigns it, and says "I did not improvise a detector". That is the correct handling of an obligation the plan reaches only halfway.
- The criteria-walk section states its own evidentiary limit ("the transcript itself was a session artifact and is not committed"), which is the right disclosure rather than an implied durable artifact.

**One universal claim without a falsifying measurement**, which is exactly the T-003 lesson-3 shape: "Deciding first and acting afterwards also keeps every refusal a true no-op: a refused teardown never commits, never pushes and never removes." The salvage push-failure path falsifies it, and I reached that path in under a minute by pointing the push URL at a nonexistent repository. That is CR-302. The claim should be narrowed to what was measured. Nothing else in the document overstates.

## Red-witness re-performance

Each witness below was applied by me to the shipped source in my private clone, run three times with `--test-name-pattern` preceding the positional path (environment warning 7), then reverted with `git checkout --` and verified with `git diff --quiet`. Every target test was confirmed green on pristine source first.

| ID | Sabotage applied (the dangerous state) | Test | Measured rate | Failure message observed |
|---|---|---|---|---|
| W1 | Payload launched with `spawn(..., {detached:true})`, unreferenced, and reported as completed without waiting | spawn-runs-payload-in-worktree | 3/3 red | "spawn returned before the payload had exited" |
| W3 | Landedness judged against `refs/heads/<default>` (the stale local ref) instead of the fetched tracking ref | teardown-squash-landed | 3/3 red | "a squash-landed branch was refused: ... branch task/t-squash is not landed on origin/main" |
| W5 | Salvage block moved above the landed check | teardown-dirty-and-salvage | 3/3 red | AssertionError on the branch-tip-unchanged assertion (expected `219eebc7...`), i.e. the refusal had committed |
| W8 | Holdership check moved to after `poolCreate` | spawn-holdership-both-directions | 3/3 red | "the refusal created a worktree" |
| W9 | Scout teardown path passing `deleteBranchForce: true` | teardown-scout-committed-work-preserved | 3/3 red | "committed scout work was destroyed without a word" |
| W10 | A registered test renamed | registry name check | 1/1 | "missing: 1 spawn-requires-exec"; pristine re-run "missing: 0" |

Measured rate across the re-performed set: **15 red out of 15 runs, plus the rename probe. Zero green runs, zero flakes.** Every one of these is deterministic as claimed. I did not re-perform W2, W4, W6 or W7; I read their sabotage descriptions and their guarding tests and found each plausible and each anchored to an assertion that would in fact fail, but I am not asserting a measured rate for them.

The witnesses also satisfy the strengthened red-witness rule rather than its weak form. W5, W8 and W9 are each red against a dangerous state (a refusal that mutates, a refusal that creates, a discard that destroys commits), not against an absent feature. And where a behavior consumes another program's output, the assertions use real captured output: the holdership tests parse `lock acquire`'s actual stdout, the baseOffline provenance test drives M1-P3's verbatim captured concurrent-ref-update stderr through a stub git, and the partial-failure test asserts against `pool destroy`'s real emitted message including the sha the branch is genuinely left at.

## Findings

### CR-301 (MEDIUM): spawn onto an existing task directory overwrites the previous incarnation, and the launch-failure rollback then deletes it, leaving a stale turn-end under the C-1 state authority

**Claim.** `spawnTask` computes its rollback scope as "did this invocation create the task directory" (`createdTaskDir`, src/spawn.ts:273) and then writes `brief.md`, `meta.json`, the hook and `executor.json` unconditionally. When `tasks/<id>/` already exists, those writes overwrite the previous incarnation's files, the rollback deletes them, and the pre-existing `turn-end` file, which spawn never writes and never clears, survives into the new incarnation. This defeats the phase's own stated rollback contract ("removes what the failing invocation created, and only that", PR-005) and the C-1 invariant the module documents ("a missing turn-end never means success", which is defeated from the other side by a present but stale one).

**Reachability.** `tasks/<id>/` survives every successful teardown, by design: teardown removes the worktree and closes the meta, and the task directory remains as the durable record. The pool record and the task branch are both removed, so `pool create` for the same id succeeds afterwards. The id is therefore free from the pool's point of view and occupied from the task-state point of view, and nothing checks the second. The work history itself treats id reuse as a supported outcome ("the id is re-usable afterwards", criterion 5 walk).

**Failure scenario A, rollback destroying what it did not create.** Spawn task `tr` with a payload exiting 3; teardown `tr` (exit 0, meta closed). `tasks/tr/` then holds `brief.md`, `executor.json`, `meta.json`, `turn-end`, `turn-end-hook.mjs`. Re-spawn `tr` with a nonexistent exec binary. Spawn exits 1 as designed, and `tasks/tr/` is left holding a single file: `turn-end`, from the first incarnation. The closed task's `meta.json`, `brief.md`, `executor.json` and hook are gone. The task id is now in a state `teardown` cannot handle: `tiphys teardown --task tr` refuses with "no readable task meta for task id tr". Nothing in the fleet reports that a completed task's record was destroyed.

**Failure scenario B, a false completion under the state authority.** Spawn task `tz` with a payload exiting 3; teardown `tz`. Re-spawn `tz` with a payload that reads `tasks/tz/turn-end` while it runs. The payload observes `{"endedAt":"2026-08-04T22:26:44.338Z","exitCode":3}`, the first incarnation's record, while the second incarnation's `meta.json` says `status: open`. The pair `meta.status = open` plus `turn-end.exitCode = 3` is exactly the "task open, already completed with exit 3" surface, and it is false. In M1 the window closes when the payload exits and the hook overwrites the file, but it is precisely the window M1-P5's watcher polls, and if the spawn process dies mid-payload (the T-002 incident shape, which the work history itself identifies as M1's only route to an open task with no turn-end) the false record persists indefinitely and reads as a clean completion.

**Evidence.** Both scenarios executed by me through the real CLI at 6fca6db in a fresh scratch fleet. Scenario A: `md5sum` of `tasks/tr/**` before the failed re-spawn listed `brief.md`, `executor.json`, `meta.json`, `turn-end`, `turn-end-hook.mjs`; afterwards only `turn-end` remained, with the four others reported as deleted by `diff`. Scenario B: the payload's captured copy of `turn-end` during its own run is quoted above. Code: src/spawn.ts:271-306 (rollback scope), 304-332 (unconditional writes), and the absence of any read or clear of `turnEndPath` in src/spawn.ts.

**Concrete fix.** One rule, placed before `poolCreate` so that the refusal creates nothing and destroys nothing:

> spawn refuses when `tasks/<id>/` exists and is non-empty, with a reason line naming the directory and telling the operator to choose a fresh id or move the old record aside.

This closes both scenarios at once. It removes the overwrite (nothing is written into an occupied directory), it removes the destructive rollback (the rollback only ever runs against a directory this invocation created, which it can then remove entirely), and it removes the stale turn-end (a new incarnation always starts from an empty directory). It is also the fail-closed reading of a plan that is silent on id reuse, so it is not an improvised irreversible choice: refusing preserves the prior record and leaves the operator every option.

**Required red witness for the round** (state it in the work history with a measured rate): with the new rule removed, a test that (a) spawns and tears down a task, (b) re-spawns the same id with a failing exec, and (c) asserts that the first incarnation's `meta.json` and `brief.md` are byte-identical to their pre-re-spawn snapshot must be red against that dangerous state, not merely against the absent refusal. A second assertion in the same test must show that no `turn-end` from a previous incarnation is readable at the moment a new incarnation's payload runs. Register the behavior in `test/behaviors.json`.

### CR-302 (LOW): the "every refusal is a true no-op" claim is falsified by the salvage push-failure path

**Claim.** src/teardown.ts:50-53 and work-history key decision 17 both assert without qualification that "a refused teardown never commits, never pushes and never removes anything". `salvageLeavings` commits before it pushes (src/teardown.ts:229-266), so a push failure exits nonzero with a commit already made.

**Failure scenario.** A ship task whose branch is landed and whose tree is dirty, torn down with `--salvage` against a remote that rejects or cannot be reached for the push. Teardown exits 1. The worktree HEAD has advanced to a `WIP-UNREVIEWED ...` commit. A later reader who trusts the documented invariant will assume the tree is untouched and may re-run, re-diff or reason about the branch on a false premise.

**Evidence.** Executed: with `git remote set-url --push origin <nonexistent>`, `teardown --task tp --salvage` exited 1 with "salvage committed the leavings as ... but the push of task/tp failed: ...; the commit is local only", and the worktree HEAD moved from `d577e092` to `8dad7285` with tip message `WIP-UNREVIEWED (do not treat as reviewed): leavings salvaged by tiphys teardown for task tp`. Meta remained `open`.

The behavior itself is correct and arguably the only safe one: the leavings are rescued into a durable commit and the message declares exactly what happened. Nothing is destroyed. What is wrong is only the universal claim, which is the failure mode T-003 lesson 3 named.

**Concrete fix.** Narrow the sentence in both places to what is true, for example: "every refusal that precedes the salvage step is a true no-op: it makes no commit, no push and no removal. The one nonzero exit that can leave a change behind is a salvage whose push fails, which commits the leavings locally and says so." No code change required.

### CR-303 (LOW): two refusal paths emit multi-line reasons, against step 5's "single reason line"

**Claim.** Plan step 5 ends "Every refusal is exit nonzero plus a single reason line naming the blocking condition." Two refusals interpolate raw git stderr, which is routinely multi-line: the fetch failure (src/teardown.ts:206-211) and the salvage push failure (src/teardown.ts:257-263).

**Failure scenario.** An operator or, more importantly, the M1-P6 exit-test harness parses teardown's stderr expecting one reason line and gets five. Section 4 step A7 records a teardown refusal as evidence; a harness that captures "the reason line" will capture a fragment.

**Evidence.** Executed: `teardown --task tf` against a clone whose origin URL points at a nonexistent path produced exit 1 and a 5-line stderr, the last four lines being git's own "fatal: Could not read from remote repository. / Please make sure you have the correct access rights / and the repository exists." The unlanded refusal, by contrast, is exactly one line, which criterion 6's test asserts.

**Concrete fix.** Collapse interpolated git output to a single line where it is used in a reason, for example `stderr.trim().split("\n").join("; ")` or the first `fatal:` line only, in both places. Then extend the existing teardown-fetch-failure-refused test to assert a one-line stderr, so the property is guarded rather than asserted.

### CR-304 (LOW): a scout that committed cannot be closed through teardown, and the refusal names a flag teardown does not expose

**Claim.** The scout carve-out correctly refuses when the scratch branch carries commits (see judgement call 2), but the refusal it surfaces is `pool destroy`'s, which advises "land them or pass `--delete-branch-force` to delete it anyway". `tiphys teardown` has no such flag (src/commands/teardown.ts:33-48 accepts only `--task` and `--salvage`), so the advice is not actionable through the command that printed it. The task's meta can never reach `closed` through the CLI, since the branch tip stays past its base permanently.

**Failure scenario.** A scout commits its findings to its scratch branch and files its report. The operator runs `teardown`, is told to pass a flag that does not exist on `teardown`, and is left with an open task, a live worktree and no documented route forward other than reading `src/pool.ts` and driving `tiphys pool destroy --task <id> --discard --delete-branch-force` by hand, which then leaves the meta open anyway.

**Evidence.** Executed, quoted in full in the judgement call 2 section above: exit 1, `task ts stays open`, meta `open`, worktree intact, branch still at `cfedbe3b`.

**Concrete fix.** The plan is silent on this, so do not improvise the destructive half. The cheap and safe change is message-only: have teardown append the actionable route when it is the scout path that was refused, naming what the operator should do (push or copy the commits somewhere durable, then re-run) rather than passing through advice about a flag teardown does not have. If a `teardown --force-scout-branch` style escape hatch is wanted, that is a plan question for the orchestrator, not an implementer's call, and it should be raised rather than added.

## Honest failures of this review

- I re-performed five of the ten claimed witnesses (W1, W3, W5, W8, W9) plus the rename probe. I did **not** re-perform W2 (baseOffline recomputed), W4 (ancestor only, merge-tree removed), W6 (partial destroy flattened into a refusal) or W7 (rollback on a nonzero payload exit). I read each sabotage description and each guarding test and found the pairing sound, but I am reporting no measured rate for those four, and my "15 out of 15" figure covers only what I ran.
- Everything I ran was on Node v22.22.2, below the declared floor of 26. CI on Node 26 remains the authority. I did not observe a CI run for this PR; `gh` is absent in my environment and I did not attempt to reach GitHub. The two skipped tests are M1-P2's and are witnessed only on CI, as before.
- Each witness was run three times, which is enough to falsify a claim of determinism if the true rate were low, and nowhere near enough to detect a rare flake. If any of these five is in truth 95 percent deterministic, my sample would very likely have missed it. The suite as a whole I ran once end to end, not repeatedly, so I have no flake measurement for the 99-test suite in this environment.
- My criteria walk used scratch fleets with `file://`-style local upstreams, not a real remote over the network. Criterion 7's squash path and criterion 8's salvage push were exercised against a local working clone, which is the same shape the tests use. Behavior against a real GitHub remote (authentication, protected branches, delete-branch-on-merge) is unwitnessed here and will first be exercised by the section 4 exit test.
- I probed section 4's satisfiability only at the level of the two commands this phase owns (spawn with a relative `--exec` resolving inside the worktree, and teardown's refuse-then-accept pair around a squash merge). I did not attempt any part of the exit test that depends on M1-P5 or M1-P6, which do not exist yet.
- CR-301 scenario B demonstrates a false surface that is readable during a payload's run. I did not construct the harder version of it, killing a spawn process mid-payload to show the false record persisting indefinitely, because M1 ships no way to observe that state and the watcher that would consume it is M1-P5. My claim about persistence is a reasoned consequence of the file never being cleared, not something I measured.
- I formed my own reading of the step 5 prose before reading the implementer's argument, but I read the work history in full before doing the hand walk. A reviewer who walked the criteria first might have anchored differently.

## Merge recommendation

Do not merge as it stands; run one narrow fix round and merge immediately after it, without a second full review pass. The phase's actual contract is discharged: all 14 criteria are met and I verified the load-bearing ones by hand, both declared judgement calls are correct, C-1, C-2 and C-3 hold in the code as written, the scope and conventions are clean, and the red witnesses are real at the rate claimed. What blocks the merge is CR-301, a destructive path that fires outside the scope its own contract declares and that plants a false completion record under the exact state authority M1-P5 is about to build on; the fix is a single refusal placed before `poolCreate`, plus one registered behavior with a witness red against the dangerous state, and CR-302, CR-303 and CR-304 are message and prose changes that should ride along in the same round. Two things must land alongside the code: the plan-prose correction for step 5 clause (b) given verbatim in the judgement call 1 section, before M1-P5 is dispatched, so the next implementer does not re-derive the ordering the criteria reject; and, per T-003, a delta verification of the fix round itself rather than a merge on green CI, since the round touches the same rollback path this finding is about.
