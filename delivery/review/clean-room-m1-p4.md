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

## Delta review of the fix round (head 5aa9a8e)

- Date: 2026-08-04
- Delta reviewed: 6fca6db..5aa9a8e (two commits: 772ee77 the fix, 5aa9a8e the work-history update). Merge base with origin/main unchanged at 54ceb6eb27c7a0fa07ae2b67d09f0dc41d9382e4.
- Reviewer: the same criteria-walk reviewer as the round-one section above, now reviewing the round that answers CR-301 to CR-304 and the second reviewer's F-1 to F-3.
- Scope: a DELTA review. The 14 acceptance criteria were walked and confirmed met on 6fca6db by two independent reviewers; they are not re-walked here. The two questions are whether the six findings are genuinely closed and whether the refactor broke anything that previously worked.
- Isolation used: a private clone at
  `/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/p4-delta-opus`
  at 5aa9a8e, plus a second private clone `.../p4-delta-opus-old` at 6fca6db for the before-and-after reproductions, plus `.../p4-delta-opus-work` for scratch fleets. `npm ci` in both clones. Nothing outside those three directories was written. Every sabotage was applied in the 5aa9a8e clone, reverted with `git checkout --`, and the tree verified clean with `git diff --quiet`; the clone was confirmed clean at the end.
- Environment: Node v22.22.2 (floor >=26, EBADENGINE expected, CI is the authority), git 2.43.0, gh absent.

### VERDICT

FIX-ROUND-NEEDED, narrowly.

All six findings are genuinely closed. I reproduced F-1 and F-2 on 6fca6db and confirmed each closed on 5aa9a8e, reproduced both CR-301 scenarios and confirmed both closed, executed CR-304's printed route end to end, and confirmed CR-303 structurally and empirically. The three classification decisions are correct, including the refusal to classify a throw out of `adapter.launch`, which I attacked directly and could not break. No behavior regression was found: three of the four round-one witnesses I re-performed are still red 3/3 against the shipped source.

What blocks the merge is not a behavior defect. It is two false statements in the durable record plus the missing witness one of them wrongly declares impossible:

1. **N-401**: witness W9 is now GREEN 3/3 against the fixed source. The CR-304 pre-check short-circuits it, so the phase's only guard on "the scout teardown path must not pass `--delete-branch-force`" no longer exists. Work-history key decision 18 still asserts in the present tense that this decision "has its own test and witness W9 ... is red 3/3". The round re-ran five round-one witnesses "to prove the refactor did not blunt them" and excluded the one witness its own change most directly touched.
2. **N-402**: the round records the adapter-throw path as untestable because "constructing it needs an adapter injected through the library seam, which the CLI does not expose". That is false. I drove that exact path from the CLI in one command, `spawn ... --deadline 1e300`, and confirmed the prescribed test is red (a 12-line stack trace) against the unwrapped state and green (one reason line) with the fix. The round's most consequential judgement is therefore witnessable and is currently unwitnessed, and the record tells the next reader not to try.

Both are cheap to close. Two further lows (N-403, N-404) should ride along. CLAUDE.md's rule that a work history is never softened, and T-003's rule that a green witness can be worthless, are the reasons these are not "note it and merge".

### What I executed versus what I read

Executed, all in my own clones:

- `npm ci` in both clones (exit 0). At 5aa9a8e: `rm -rf dist && npm run build` exit 0 with `git status --porcelain` empty afterwards; `rm -rf dist && node --test` exit 0, tests 103, pass 101, fail 0, cancelled 0, skipped 2, todo 0, duration 66366ms. The 2 skips are the unchanged M1-P2 floor-gated doctor witnesses.
- Behavior registry check over a TAP run of that suite: 104 mappings, 103 titles, 0 missing. Rename probe: renaming the title of `spawn-refuses-occupied-task-dir` made the check report exactly `missing: 1 spawn-refuses-occupied-task-dir`; reverted and re-checked clean. The checker is sensitive, not vacuous.
- F-2 reproduced at 6fca6db and confirmed closed at 5aa9a8e, through the real CLI, with the dangling-symlink forced failure.
- F-1 reproduced at 6fca6db and confirmed closed at 5aa9a8e, through the real CLI, with the stub-git forced failure, and a second variant of my own that leaves `meta.json` present and reading `open`.
- CR-301 scenarios A and B re-run at 5aa9a8e through the CLI.
- Criterion 4 both halves re-run at 5aa9a8e through the CLI.
- CR-304's printed route executed end to end by hand.
- CR-303 confirmed by driving a real 5-line git fetch failure through teardown.
- Four round-one witnesses re-performed against the fixed source, three runs each: W3, W5, W7 (none of which the round re-ran) and W9 (which the round also did not re-run).
- One new adversarial probe: the adapter-throw classification driven from the CLI, with the recovery route measured, plus a sabotage run proving the prescribed witness is red.
- Scope audit `git diff --name-status 54ceb6e...HEAD`, convention sweeps, C-1/C-2/C-3 greps.

Read only: the second reviewer's report, the fix-round section of the work history, the plan revision-8 diff, and the parts of `src/pool.ts` and `src/fleet.ts` the delta calls into (both unmodified by this PR).

### Per-finding disposition

| Finding | Status | Evidence I produced |
|---|---|---|
| F-1 (HIGH) | CLOSED | At 6fca6db, a stub git that removes `tasks/t-mf/` the instant `git worktree remove` returns 0 gave an 18-line raw stack trace (`Error: ENOENT ... at writeTaskMeta ... at setTaskStatus ... at finish`), exit 1, worktree gone. At 5aa9a8e the same forced failure gives exit 1 and exactly ONE line: `tiphys teardown: partial teardown of task id t-mf: worktree ... HAS BEEN REMOVED and branch task/t-mf was deleted (it was 7b6d392d...), but .../meta.json could not be marked closed (...); the task record still reads status open although its worktree is gone, so repair that file and set "status": "closed" by hand`. I also built the second reviewer's exact surface (a variant stub that replaces `meta.json` with a directory so the file survives): same one-line partial-teardown report, and the surviving record verifiably still reads `"status": "open"`, which is now stated by the message instead of being left for a later reader to discover. |
| F-2 (HIGH) | CLOSED | At 6fca6db, a dangling symlink at `tasks/t-throw` (reads absent to `existsSync`, makes `mkdirSync` raise ENOENT) gave a raw stack trace and left `worktrees/t-throw`, `worktrees/t-throw.pool.json` and `refs/heads/task/t-throw` all orphaned. At 5aa9a8e the same input gives one line, `tiphys spawn: creating the task directory ... failed: ENOENT ...`, and `ls worktrees` is EMPTY, no task branch, and removing the planted link lets the same id spawn successfully (exit 0). The id is not wedged. |
| CR-301 (MEDIUM) | CLOSED as specified | Scenario A at 5aa9a8e: spawn `tr` (payload exit 3), teardown, then re-spawn with a nonexistent binary. Exit 1 with the occupied-directory reason naming the directory; `md5sum` over `tasks/tr/*` byte-identical before and after (`diff` clean); `worktrees/` empty. Scenario B: re-spawn with a payload that copies `tasks/tr/turn-end` if it exists. Exit 1, the payload never ran, no copy exists. The refusal is placed after the liveness and holdership checks and before `poolCreate` (src/spawn.ts:274, 278, 293, 303), which is the ordering I asked for and the right one: holdership still speaks first. |
| CR-302 (LOW) | CLOSED | Prose narrowed in both places (src/teardown.ts module doc, work-history key decision 17) to "every refusal that precedes the salvage step is a true no-op", with the salvage-push-failure exception named. The behavior is now pinned by a registered test (`teardown-salvage-push-failure-local-commit`) that asserts the local commit exists, is labelled, nothing is destroyed, and the reason is one line. |
| CR-303 (LOW) | CLOSED, and the structural claim is true | I checked the claim rather than accepting it. `singleLine` (src/task.ts) splits the WHOLE string, trims, drops empties and joins with "; ". Both refusal emitters apply it to the entire `result.reason` (src/commands/spawn.ts:137, src/commands/teardown.ts:77), so it does not depend on any individual interpolation being short. The interpolation sites are collapsed too, which is belt and braces, not the load-bearing part. Empirically: a real unreachable-remote fetch failure whose git stderr is 5 lines now emits exactly 1 line. The only stderr path not passing through `singleLine` is the `loadFleet` catch, and `loadFleet` throws a single authored line (src/fleet.ts:86-89), so nothing multi-line reaches it. |
| CR-304 (LOW) | CLOSED, route executed | The refusal is now teardown's own, one line, names no flag teardown lacks, and quotes the exact remedy. I executed the printed route: `git push origin HEAD:refs/heads/scout-findings` from the scout worktree, then the literal `git -C <project> update-ref refs/heads/task/ts <baseSha>` the message printed, then `teardown --task ts` again. Result: exit 0, `torn down ts`, meta `"status": "closed"`, `worktrees/` empty, and `git -C upstream rev-parse refs/heads/scout-findings` equals the scout's commit sha `2a0df674...`. The findings survive and the task reaches closed, which it could not do before. |
| F-3 (LOW) | CLOSED | Key decision 11 now carries an explicit correction naming what was and was not exercised, rather than the unconditional "everything or a clean rollback". |

### Ruling on the three classification decisions

These are the substantive engineering of the round and I judged each on its own, not on the argument offered for it.

**1. "A raised launch-record write means the payload provably never ran, so rollback is safe." CORRECT, and provable.**

In the shipped subprocess adapter the record write is the first side effect and precedes `spawnSync` of the payload (src/spawn.ts:159-166 then 172), so within that adapter the claim is not a judgement, it is an ordering fact. For any other adapter the claim rests on the `LaunchOutcome` contract, which states it explicitly at the type: "The distinction between a payload that never started and one that did is load-bearing: only the first authorizes rollback" (src/spawn.ts:121-123). So `launch-failed` means "never started" by contract, and an adapter that returns it after starting a payload has broken the contract, not the kernel. The rollback that follows uses `poolDestroy` with both force flags off, so even a contract-breaking adapter cannot get a non-pristine worktree destroyed: the destroy would refuse. That is the right defensive shape.

**2. "Anything raised after the payload ran is incomplete, and incomplete never rolls back." CORRECT for every state I can reach after the payload ran.**

The post-payload region of the adapter has exactly three exits: a raise from the hook invocation (wrapped, becomes `incomplete`), a hook that errored or exited nonzero (`incomplete`), and success (`completed`). `spawnTask` performs no further writes after `launch` returns, and `incomplete` returns `{ok:false}` without touching `rollback` (src/spawn.ts:432-435). The one place worth checking is the classification of `result.error` from `spawnSync` as `launch-failed`: with `stdio: "inherit"` and no `timeout`, `killSignal` or `maxBuffer` configured, `spawnSync` sets `error` only for failures to start the child (ENOENT, EACCES, EAGAIN), so that classification does not leak a post-payload state into the rollback path. A payload killed by a signal produces `status: null` with `signal` set and no `error`, which becomes `completed` with a 128+n code, not a rollback. I could not construct a post-payload state that reaches `rollback`.

**3. Refusing to classify a throw out of `adapter.launch`. CORRECT. I attacked the argument and it held.**

The implementer's argument is that guessing would recreate the V-1 data-loss shape with a new trigger. I tested it rather than accepting it, and the decisive question is what an operator is actually left with.

I found the path is reachable from the CLI today (see N-402/N-403): `spawn --task td ... --deadline 1e300` makes `new Date(...).toISOString()` raise inside the adapter, before the payload. At 5aa9a8e that produces exit 1 and one line naming the worktree, the task directory and the pool record as left in place. So I could measure the residue rather than reason about it:

- Left behind: `worktrees/td`, `worktrees/td.pool.json`, `refs/heads/task/td`, and `tasks/td/` holding `brief.md`, `meta.json` (status open) and the hook, with no `executor.json` and no `turn-end`.
- Recovery: `tiphys teardown --task td` exits 0, removes the worktree, deletes the branch and sets meta to `closed`. I ran it. The mess is fully recoverable through the documented CLI, in one command.

So the alternative the implementer rejected buys nothing an operator cannot get in one command, and costs the V-1 outcome whenever a future adapter raises after starting a payload: a destroyed worktree that held real work, with the same "it was only scratch" justification this project has already paid for once. Refusing to guess is right, and it is right for the stated reason, not by luck. The enumerate-and-leave shape is also the one M1-P3 already established for a partial destroy, so it is consistent rather than novel.

One thing the decision does NOT do, and should: the enumeration tells the operator what is left but not what to do about it. That is the exact gap CR-304 was raised for, and this round fixed CR-304 by adopting the standard "print a route you can actually perform". The adapter-throw reason should meet the same standard. That is N-404 below, a message change only.

### Did the wrapper blunt anything?

The round re-ran W1, W2, W5, W6 and W8. I re-performed four witnesses against the shipped source at 5aa9a8e, three of which the round did NOT re-run. Each target test was confirmed green on pristine source first, each sabotage was run three times, then reverted and the tree verified clean.

| ID | Sabotage applied to the fixed source | Test | Measured | Note |
|---|---|---|---|---|
| W3 | Landedness judged against `refs/heads/<default>` instead of the fetched tracking ref (applied at the `landedness` call site so the fetch itself is untouched) | teardown-squash-landed | 3/3 RED | Same message as round one: "a squash-landed branch was refused: ... branch task/t-squash is not landed on origin/main" |
| W5 | Salvage block moved above the landed check | teardown-dirty-and-salvage | 3/3 RED | Same assertion fails: branch tip expected `9fc0a3b6...`, i.e. the refusal had committed |
| W7 | A nonzero payload exit routed into `rollback` | spawn-turn-end-record | 3/3 RED | The spawn module changed most in this round; the no-rollback-after-the-payload property survives it |
| W9 | Scout teardown path passing `deleteBranchForce: true` | teardown-scout-committed-work-preserved | **3/3 GREEN** | **Blunted.** See N-401 |

W9 is the failure mode this probe exists to catch. The CR-304 pre-check refuses a committed scout before `finish` is called, so the value of `deleteBranchForce` on that path is no longer observable by any test. I confirmed the sabotage is behaviourally inert under the current code (the pre-check catches every scout state where the branch resolves and its tip differs from the recorded base, which is exactly the set the pool's gate caught), so this is a lost witness rather than a live defect. But the phase's stated live decision 18 is now guarded by one gate, not two, and the record says otherwise.

### The interaction the round self-reported (criterion 4)

Both halves verified by hand at 5aa9a8e, in a fresh fleet.

- Half one, a live duplicate id: `spawn --task t1` a second time exits 1 with the occupied-directory reason (the CR-301 gate, not pool create). `md5sum` over `tasks/t1/*` is byte-identical before and after (`diff` clean) and `ls worktrees` is unchanged. Criterion 4's stated outcome, "exits nonzero, the pre-existing `tasks/<id>/` contents are byte-identical before and after, and the failing invocation created no new files", holds exactly as before.
- Half two, the pool's own gate: `tiphys pool create --task t-poolonly` directly, then `spawn --task t-poolonly`, exits 1 with `task id already used: t-poolonly` and creates no `tasks/t-poolonly/` at all (`ls tasks` shows only `t1`).

Ruling: the round's self-report is accurate and the handling is right. Criterion 4's parenthetical names a cause ("If pool create fails (duplicate task id already used by a live task)") that is no longer the cause for the live-duplicate case, but the criterion is written as a falsifiable outcome and that outcome is unchanged, while the named cause is still reachable and is now separately witnessed in the same test. Reporting the interaction instead of quietly letting the criterion's assertion migrate is the correct handling, and it is the reason I could check it in one minute.

### Ruling on the declared gaps

**Gap 1, "only the mkdir write site is separately witnessed among several using the same pattern": ACCEPTABLE. Merge with it.**

The four sites (task directory, brief, meta, hook) sit in one function within thirty lines of each other and are literally the same three-line shape, `runStep(...)` then `if (!ok) return rollback(...)`. More to the point, CR-301's own gate makes the other three hard to force from outside: any pre-existing content under `tasks/<id>/` now refuses before pool create, so the EISDIR and pre-existing-directory tricks that would target the brief or meta writes are unreachable by construction. The round states the limit plainly and claims no measured rate for the unwitnessed three. That is the correct handling of a gap.

**Gap 2, "the adapter-throw path has no test because constructing it needs a library seam the CLI does not expose": NOT ACCEPTABLE. Close it before merge.** See N-402. The premise is false, the path is one CLI flag away, and the decision it fails to witness is the one the round itself calls the substantive engineering.

### Suite, scope, conventions

- Full suite from a removed `dist/`: exit 0, tests 103, pass 101, fail 0, cancelled 0, skipped 2, todo 0, 66.4s. The work history claims 103/101/0/0/2/0 and 67.9s. Accurate.
- Build from a removed `dist/`: exit 0, `git status --porcelain` empty afterwards.
- Registry: 104 mappings, 103 titles, 0 missing; the work history claims 104/0/103. Accurate. The four new entries are a pure append; nothing previously registered was modified or removed. Rename probe proves the check is sensitive.
- Scope audit, three-dot against the merge base `54ceb6e`: exactly 13 paths, being the ten files-to-touch paths actually edited, `test/behaviors.json` and the phase work history (standing pre-authorized extras), and `delivery/plan/kernel-plan-v1.md`, the plan correction this round was authorised to make. `src/pool.ts` is untouched, as the phase requires.
- Conventions over all 13 changed paths: non-ASCII scan clean (grep exit 1), literal em dash scan clean (grep exit 1), pnpm/yarn scan clean apart from the pre-existing rule statement in the plan, commit messages carry no AI or tool names.
- The plan correction itself is the wording I supplied verbatim in the round-one section, plus a revision 8 header line that states plainly that the prose was corrected to match the criteria and that no criterion, behavior or test changed. Correct handling.
- C-1: strengthened by this round, not weakened. The stale-turn-end route I found at 6fca6db is closed at the source (no new incarnation can start in an occupied directory), and F-1's fix removes the other route by which the authority could silently disagree with the filesystem.
- C-2: a grep over all seven phase sources for `process.kill`, `/proc/`, `kill(`, `SIGKILL`, `SIGTERM`, `detached`, `unref(` and a word-boundary `pid` returns nothing (exit 1).
- C-3: a grep over `src/spawn.ts` and `src/teardown.ts` for `spawn(`, `exec(`, `execFile(`, `nohup`, `setsid` returns nothing (exit 1). Everything is `spawnSync`. W7's 3/3 red confirms the payload-completion property is still guarded after the adapter refactor.

### New findings

#### N-401 (MEDIUM): witness W9 is green against the fixed source, and the work history still presents it as a live guard

**Claim.** The CR-304 pre-check (src/teardown.ts:370-386) refuses a scout whose branch tip differs from its recorded base before `finish` is ever called, so the scout path's `deleteBranchForce: false` (src/teardown.ts:389) is no longer observable by any test. Work-history key decision 18 still reads, in the present tense, "This is a live decision, so it has its own test and witness W9 (scout path forcing the delete) is red 3/3". The fix-round section states that five witnesses were re-run "to prove the refactor did not blunt them" and does not mention W9, the witness the round's own change most directly touched.

**Failure scenario.** A later maintainer reads decision 18, believes the flag choice is test-guarded, and edits the scout path (for instance by copying the ship path's `deleteBranchForce: true`). No test fails. The protection then rests entirely on the pre-check, which has a documented fall-through when the branch ref does not resolve, and the next person to touch that pre-check has no red witness telling them what it is now solely responsible for. This is the T-003 shape exactly: a registered, green, worthless witness, in the component where V-1 happened.

**Evidence.** Measured, not inferred. `deleteBranchForce: false` changed to `true` on the scout path at 5aa9a8e, then `node --test --test-name-pattern "a scout that committed to its scratch branch is refused, not silently discarded" test/teardown.test.ts` three times: `# pass 1 # fail 0` on all three runs. Reverted, `git diff --quiet` clean. For comparison, W3, W5 and W7 were each 3/3 red under the same procedure.

**Concrete fix.** Both halves, neither of which is code:

1. Correct key decision 18 to say that the flag choice is now defended by two gates, that the outer gate (the CR-304 pre-check) is the witnessed one (FW5), and that W9 is green against the fixed source and is therefore retired rather than still claimed. State the measured rate.
2. Add one sentence to the fix-round section recording that W9 was re-run and found green, and why. The round's blunting check should report what it found, including the one that moved.

If the round would rather keep a live witness for the inner gate, the cheapest honest one is a combined sabotage (pre-check removed AND `deleteBranchForce: true`) registered as its own witness, which does go red on the destroyed-commits assertion. Either resolution is acceptable; leaving decision 18 as written is not.

#### N-402 (MEDIUM): the adapter-throw path is reachable from the CLI, so the declared "no test possible" gap is false and the round's central decision is unwitnessed

**Claim.** The work history records: "The adapter-throw path (spawn refusing to guess whether the payload started) has no test: constructing it needs an adapter injected through the library seam, which the CLI does not expose". The premise is false. `--deadline` is parsed with `Number.isFinite(seconds) && seconds > 0` (src/commands/spawn.ts:81-83) and the adapter then computes `new Date(launchedAt.getTime() + seconds * 1000).toISOString()` (src/spawn.ts:153-156), which raises `RangeError: Invalid time value` for any deadline at or above about 8.64e12 seconds. That raise happens inside `adapter.launch`, before the payload, with no seam involved.

**Failure scenario.** The round's most consequential engineering decision, the one it argues at length and the one I ruled correct above, ships with no test at all, and the record tells the next reader it cannot have one. A future change to the `runStep` wrapper around `adapter.launch`, or to the classification of `launched.ok === false`, breaks the decision silently.

**Evidence.** Executed at 5aa9a8e in a fresh fleet: `spawn --task td ... --deadline 1e300` exits 1 with exactly one line, `tiphys spawn: launching the payload through the subprocess adapter failed: Invalid time value; the subprocess adapter did not report whether the payload started, so nothing was rolled back: the worktree ..., its task directory and the pool record are left in place for inspection`, and the enumerated state is exactly what is on disk (`worktrees/td`, `worktrees/td.pool.json`, `refs/heads/task/td`, `tasks/td/` holding `brief.md`, `meta.json`, `turn-end-hook.mjs`). I then proved the witness is red against the dangerous state: with the `runStep` wrapper around `adapter.launch` removed, the same command produces a 12-line raw stack trace beginning `file:///.../src/spawn.ts:155 ).toISOString();`. Reverted, tree clean.

**Concrete fix.** Register one behavior, for example `spawn-adapter-throw-not-classified`, with a test that drives `spawn ... --deadline 1e300` through the CLI and asserts: exit nonzero; stderr is exactly one line carrying the `tiphys spawn: ` prefix and no stack frame; the reason says nothing was rolled back; and the three enumerated survivors really are present on disk, so the message is checked against reality rather than against itself. Then delete the false gap sentence and replace it with what is actually true after N-403 is applied (see below): the path is reachable through this input, and this is the witness.

#### N-403 (LOW): `--deadline` accepts finite values that cannot be represented, turning a usage error into an orphaned worktree

**Claim.** The parser's only guard is `Number.isFinite(seconds) && seconds > 0`. Any deadline at or above roughly 8.64e12 seconds overflows the Date range and raises inside the adapter, after `poolCreate` has made a worktree, a branch and a pool record, and after the brief, meta and hook have been written.

**Failure scenario.** An operator fat-fingers a deadline, or passes milliseconds where seconds were meant. Instead of a usage error that creates nothing, they get a worktree, a branch, a pool record and a half-written task directory left behind, and, because of CR-301's new gate, the task id cannot be re-spawned until it is cleaned up. Nothing is destroyed and the message is honest, but this is a usage error that should have exited 64 before touching anything.

**Evidence.** Executed at 5aa9a8e: `--deadline 1e300` produced the orphan described in N-402. Threshold probes: `1e13`, `8640000000000` and `99999999999999999999` all raise; `300` does not. Recovery measured: `tiphys teardown --task td` afterwards exits 0, removes the worktree, deletes the branch and sets meta to `closed`, so the state is recoverable, which is why this is a LOW and not a MEDIUM.

**Concrete fix.** In the `--deadline` branch of the parser, reject values whose resulting instant is not representable, for example by requiring `Number.isFinite(seconds) && seconds > 0 && Number.isFinite(new Date(Date.now() + seconds * 1000).getTime())`, or simply by capping at a documented maximum. A rejected deadline is a usage error: exit 64 with the usage line, before the fleet is loaded, creating nothing, which is the shape criterion 3 already establishes. Note the ordering with N-402: write the adapter-throw witness first using this input, or keep it reachable by having the witness inject the throw another way, so that closing N-403 does not silently delete the only route to the witness.

#### N-404 (LOW): the adapter-throw enumeration names what is left but not what to do, which is the standard CR-304 just established

**Claim.** The reason at src/spawn.ts:420-426 ends "left in place for inspection". CR-304's whole lesson, applied in this same round, is that a refusal must print a route the operator can actually perform through the command that printed it.

**Failure scenario.** An operator sees a worktree, a branch and a pool record named as survivors, and a task id that CR-301's gate now refuses to reuse. The route out exists and is one command, but nothing tells them it does; the natural next move is to start deleting directories by hand, which is how a pool record and a git worktree registration get out of step.

**Evidence.** I measured that `tiphys teardown --task <id>` cleanly closes exactly this state (exit 0, worktree removed, branch deleted, meta `closed`). The message does not mention it.

**Concrete fix.** Append the route, in the same style CR-304 now uses: "...left in place for inspection; when you have inspected them, close the task with `tiphys teardown --task <id>`". Message only, no behavior change, no new authority.

### Honest failures of this delta review

- I re-performed four of the ten round-one witnesses (W3, W5, W7, W9) and none of the six fix-round witnesses FW1 to FW6 as sabotages, although I reproduced the underlying failures of FW1, FW2, FW3, FW4 and FW5 directly through the CLI on both heads, which is stronger evidence for those five than a sabotage would have been. I did not independently sabotage FW6.
- Three runs per sabotage falsifies a claim of determinism but cannot detect a rare flake. The suite as a whole I ran twice end to end (once plain, once with the TAP reporter), not repeatedly.
- Everything ran on Node v22.22.2, below the declared floor. CI on Node 26 remains the authority and I did not observe a CI run; `gh` is absent here.
- My N-403 threshold figures come from evaluating the same arithmetic the adapter performs, not from driving every value through the CLI; I drove `1e300` through the CLI and computed the rest.
- I did not re-walk the 14 criteria. Criterion 4 is the only one I re-executed, because this round changed which gate issues its refusal. If the round had broken a criterion in a way no test covers and no witness I chose touches, this review would not have caught it.
- I did not attempt the harder form of the adapter-throw case, an adapter that raises AFTER starting a payload, because no such adapter exists in M1. My ruling that refusing to classify is correct rests on the contract and on the measured recoverability, not on having observed that case.

## Final confirmation (head be7d7eb)

Narrow confirmation of N-401 to N-404 only, by the reviewer who raised them.
Delta 5aa9a8e..be7d7eb, reviewed in a private clone at be7d7eb, Node v22.22.2.
Every sabotage below was applied to the shipped source, run three times,
reverted, and the tree verified clean with `git diff --quiet` before the next.

**VERDICT: APPROVE.** All four findings are closed. The N-401 resolution is
sound and honestly recorded. The one remaining declared gap is mergeable.

### Per-finding status

| Finding | Status | How confirmed |
|---|---|---|
| N-401 witness W9 green while the record claimed it red | CLOSED | Structural guard measured red 3/3 on both dangerous edits; decision 18 corrected in place with the measured truth; W9 explicitly retired, not quietly dropped |
| N-402 false impossibility, adapter-throw path untested | CLOSED | New test drives the production `ExecutorAdapter` seam; red 3/3 with the `runStep` wrapper removed, failing with the adapter's own error escaping `spawnTask` |
| N-403 unrepresentable `--deadline` | CLOSED | Executed: exit 64, usage line, nothing created, and the refusal happens before the fleet is loaded; red 3/3 with the guard loosened |
| N-404 enumeration without a next step | CLOSED | Reason now names `tiphys teardown --task <id>`; the test executes that route through the real CLI and asserts meta reaches `closed`; red 3/3 with the route dropped |

### Ruling on the structural substitute (N-401)

**The claim is correct and the substitute is not premature. I tried to break
it and could not.**

I attempted to construct a behavioural witness for the inner gate (the scout
path's `deleteBranchForce: false`) and enumerated every way the outer
pre-check (src/teardown.ts:370-386) and the pool's own gate
(src/pool.ts:815-829) could disagree:

- Different repository. Dead. `resolveContext` refuses with a fetch failure
  (src/teardown.ts:208-220) before the scout branch is ever reached whenever
  `record.project` is missing or not a git repository, so the pool's
  `contextDir` fallback to the worktree's git-common-dir is unreachable from
  teardown.
- Different ref or different probe. Dead. Both run the identical
  `rev-parse --verify --quiet refs/heads/<record.branchName>^{commit}`
  against the identical directory, and both compare against the same
  `readPoolRecord(...).baseSha`.
- Different exit-status handling. Dead. Where the pre-check falls through
  (status 128) the pool classifies the tip `indeterminate` and refuses
  regardless of the flag.
- The pool's `baseSha === undefined` arm, and the check-then-act window
  between the two probes. These are real states the pre-check does not
  cover, but neither is deterministically forcible from a test without
  injecting a fault into `src`, and in both the flag being `false` is
  precisely what keeps the outcome safe. They are an argument FOR keeping
  the inner gate, not a route to witnessing it.

So the inner gate is genuinely unwitnessable behaviourally while the outer
gate holds, and a structural guard is the right substitute. It also has this
repository's own precedent: test/lock.test.ts:534
(`lock-no-process-probing`) is the same shape over src/lock.ts for C-2.

Measured rates on the pristine head and on three mutations, three runs each:

| State | `teardown-scout-never-forces-branch-delete` (structural) | `teardown-scout-committed-work-preserved` (behavioural) |
|---|---|---|
| Pristine be7d7eb | GREEN 3/3 | GREEN 3/3 |
| Flag flipped to `deleteBranchForce: true` | **RED 3/3** | GREEN 3/3 (confirms my original W9 measurement independently) |
| Pre-check removed, flag left `false` | GREEN 3/3 | RED 3/3, on the CR-304 assertion only; the work itself was preserved by the inner gate, which is the inner gate doing its job |
| Pre-check removed AND flag flipped | **RED 3/3** | **RED 3/3**, "committed scout work was destroyed without a word" |

Two things follow that matter more than the bookkeeping. First, the
structural test does fail on the single dangerous edit, which is the edit
the finding was raised about. Second, the DANGEROUS STATE itself, committed
scout work actually destroyed, is still behaviourally witnessed red 3/3
(row four), so the T-003 stronger form is satisfied: this is not a case of
a behavioural guarantee being downgraded to a source-text assertion, it is
a second, inner gate being pinned by source text while the destructive
outcome stays behaviourally guarded.

The structural test is also fail-closed against refactors: if the scout
branch cannot be located, if the literal is replaced by a variable, or if
the `finish` call moves past the `// (b) ship.` marker, it goes red rather
than silently passing.

**Honestly recorded: yes.** Key decision 18 is corrected in place, in the
document, naming the measured GREEN 3/3 and saying plainly that the original
claim "stopped being true the moment the fix round added the CR-304
pre-check". The honest-scope section states that the structural test "guards
the source, not the behavior, and I am claiming exactly that and nothing
more". That is the opposite of a quiet downgrade.

### N-402: the test is real

- Red witness: the `runStep` wrapper around `adapter.launch`
  (src/spawn.ts:405-414) replaced with a direct call. The named test is RED
  3/3, failing with `error: 'simulated adapter crash: the payload state is
  unknown'`, i.e. the raise escapes `spawnTask`. That is the dangerous state,
  not the absent feature.
- Production seam, not a mock: the test injects a throwing adapter through
  `options.adapter`, the same `ExecutorAdapter` type the shipped
  `subprocessAdapter` satisfies. The classification, the enumeration and the
  reason text asserted are the shipped ones, and the test then checks the
  enumeration against the real filesystem (worktree, pool record, task
  directory and task branch all still present) rather than against itself.
- The pre-N-403 CLI measurement was taken before the input was closed, as my
  ordering note asked. Sequenced correctly.

### N-403 and N-404 by execution

- `spawn --task t-x --project <dir> --brief <file> --shape ship --exec
  /bin/true --deadline 1e300` run from a NON-fleet directory: exit 64, the
  usage line on stderr, and the directory contents unchanged. Exit 64 rather
  than 1 proves the refusal precedes `loadFleet`, so the fleet is not even
  opened. Loosening the guard back to finite-and-positive makes the
  registered test RED 3/3.
- The recovery route printed by the adapter-throw reason is executed by the
  test itself through `runCli(["teardown", "--task", ...])`, the production
  CLI, and asserted to exit 0 with meta `closed`. Dropping the route from the
  reason makes the test RED 3/3. I had measured the same route working by
  hand in the previous round; it still closes the task.
- N-403 correctly declines to invent a policy maximum. The plan fixes none,
  and inventing one is not an implementer's call.

### Nothing regressed

- Full suite with `dist/` removed and rebuilt first: exit 0, tests 106, pass
  104, fail 0, cancelled 0, skipped 2, todo 0, 67.4s and 69.2s on two runs.
  The work history claims 106/104/0/0/2/0 at 66.8s. Accurate.
- `npm ci` exit 0. `npm run build` exit 0 from a removed `dist/`, and
  `git status --porcelain` empty afterwards.
- Registry: 107 mappings, 106 titles, 0 missing. The three new entries are a
  pure append; nothing previously registered was modified or removed. Rename
  probe (one title mutated by one character) correctly reports
  `missing 1`, so the check is sensitive.
- Scope audit, three-dot against the merge base 54ceb6e: exactly the same 13
  paths as the previous round. `src/pool.ts` untouched.
- Conventions over all 13 changed paths: non-ASCII scan clean (grep exit 1),
  literal em dash scan clean (grep exit 1). The two new commit messages carry
  no AI or tool names.
- C-1: unaffected by this round. C-2: scan over all seven phase sources for
  `process.kill`, `/proc/`, `SIGKILL`, `SIGTERM`, `detached`, `unref(` and a
  word-boundary `pid` returns nothing (exit 1). C-3: scan over src/spawn.ts
  and src/teardown.ts for `spawn(`, `exec(`, `execFile(`, `nohup`, `setsid`
  returns nothing (exit 1).
- Two witnesses re-run from earlier rounds, to check this round did not blunt
  anything the way the fix round blunted W9. W3 (landedness judged against
  `refs/heads/<default>` instead of the fetched tracking ref): RED 3/3. W7 (a
  nonzero payload exit routed into `rollback`): RED 3/3. Neither was blunted.

### Ruling on the remaining declared gap

**`taskDirOccupied`'s catch branch untested: ACCEPTABLE. Merge with it.**

The branch is three lines (src/task.ts:227-230) and fails closed: an
unreadable task directory is treated as occupied, which produces a refusal
that creates nothing. There is no destructive path behind it, so the worst
consequence of it being wrong is a spurious refusal, and the worst
consequence of leaving it untested is that a spurious refusal stops being
spurious. Forcing it needs a directory that exists and cannot be read, which
permission bits cannot produce for root, and the round is right that a
technique that skips on CI is not evidence. The gap is stated with its
reason and with no measured rate claimed for it, which is the correct
handling. The non-directory half is now genuinely exercised through the CLI.

### New

One observation, not a finding, and not blocking.

The honest-scope line "no behavioural witness of the inner scout gate exists
or can exist while the outer gate holds" is an absolute, and I found two
states it does not strictly cover: the pool gate's `baseSha === undefined`
arm, and the check-then-act window between teardown's pre-check and the
pool's own tip probe. Neither is deterministically forcible from a test, and
in both the flag being `false` is what keeps the outcome safe, so the
practical claim and the resolution built on it are unaffected. If the record
is ever revised, "no deterministically forcible behavioural witness" is the
formulation the measurements support. Recorded here rather than as a finding
because this document has now corrected two overstatements and I would
rather leave the third measured than unstated.

### Honest limits of this pass

- This was a narrow confirmation of four findings, as dispatched. I did not
  re-walk the 14 acceptance criteria and did not re-review the phase.
- Three runs per sabotage falsifies determinism, not rarity. The full suite
  ran twice end to end.
- Node v22.22.2, below the declared floor. CI on Node 26 remains the
  authority; `gh` is absent here and I observed no CI run.
- My enumeration of pre-check versus pool-gate divergences is a reading of
  both call sites plus targeted execution, not an exhaustive search of the
  state space. I could not construct a behavioural witness; I cannot prove
  none exists.
