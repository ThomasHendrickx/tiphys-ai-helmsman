# Clean-room review: M1-P4 (spawn and teardown guard), second reviewer

Date: 2026-08-04
PR: 6
Head: 6fca6db
Reviewer model: Claude (Sonnet 5), independent second pass
Method: read the plan and work history, then built and ran the full suite in
an isolated clone, then drove the CLI by hand against a real scratch fleet
and a real upstream/clone pair, then deliberately sabotaged several shipped
behaviors to confirm the named tests actually go red, then adversarially
probed the destructive paths (spawn rollback, teardown refusal, salvage,
scout carve-out, holdership) for exception-safety and partial-state risk.
Isolation: cloned `/home/user/tiphys-ai-helmsman` at 6fca6db into
`/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/review-p4-sonnet`
with `git clone --no-hardlinks`, `npm ci` run there; a second scratch
directory `.../scratchpad/manual-walk` held the hand-driven fleet, upstream
and project clone. No writes were made to the main repository. Both
scratchpad directories are cleaned up at the end of this review.

## VERDICT: FIX-ROUND-NEEDED

Two related defects (same root cause, two blast radii) let an ordinary,
realistic I/O failure escape the code's own ok/reason result-type discipline
as an uncaught exception. One orphans pool state on spawn; the other lets
teardown's own single state authority (meta.json) go silently wrong after a
destructive step has already run. Neither is exercised by the shipped test
suite or by the acceptance-criteria walk in the work history.

## Findings

### F-1 (HIGH): teardown can destroy the worktree and then crash before recording it, leaving meta.json falsely claiming the task is still open

**Claim under test:** C-1 states meta.json's status plus the turn-end record
are "the ONE current-state authority for a task" (src/task.ts:16-21), and
teardown.ts's own docstring (lines 55-62) is explicit that a destructive
step's failure must never be described as if nothing changed. The work
history (key decision 20) claims this is discharged: "Teardown never
re-frames a destroy failure... never describes a stage-3 partial failure as
a stage-2 refusal."

**Failure scenario:** In `src/teardown.ts`, `finish()` calls `poolDestroy`
(which physically removes the git worktree and, on the ship path, deletes
the task branch) and only afterward calls `setTaskStatus(fleet, context.meta,
"closed")`, itself a bare `writeFileSync` in `src/task.ts:132` with no
try/catch anywhere in the call chain. If that final write throws for any
reason (disk full, a permissions change, an immutable-file flag, an NFS
hiccup, a concurrent editor holding the file open on a locking filesystem),
`teardownTask` throws instead of returning `{ok:false}`. The exception
propagates uncaught through `cmdTeardown` (src/commands/teardown.ts:67, no
try/catch) and through `run` (src/cli.ts, no try/catch) to a raw Node stack
trace on stderr. Since the destroy has already completed, the worktree (and,
for a ship task, the branch) is gone from disk, but `tasks/<id>/meta.json`
is left on disk still reading `"status": "open"`, which is exactly the
value C-1 says a later reader (an operator, or the M1-P5 watcher this phase
hands off to) must trust as the current state of the task.

**Evidence (captured, reproduced live in the manual-walk fleet):**
```
$ chattr +i tasks/t5/meta.json
$ node bin/tiphys.ts teardown --task t5
node:fs:2430
Error: EPERM: operation not permitted, open '.../fleet/tasks/t5/meta.json'
    at writeFileSync (node:fs:2430:20)
    at writeTaskMeta (.../src/task.ts:98:3)
    at setTaskStatus (.../src/task.ts:132:3)
    at finish (.../src/teardown.ts:292:3)
    at async cmdTeardown (.../src/commands/teardown.ts:67:18)
Node.js v22.22.2
exit code: 1

$ cat tasks/t5/meta.json | grep status
  "status": "open",
$ ls worktrees/t5
ls: cannot access 'worktrees/t5': No such file or directory
```
The worktree is gone; meta.json says open. No test in test/teardown.test.ts
exercises a write failure at this point (`grep -n "throw\|EACCES\|EPERM"
test/teardown.test.ts` finds nothing), so this path is unguarded by the
suite.

**Fix:** wrap the `setTaskStatus` call (and, more generally, every write
that happens after `poolDestroy` has succeeded) so a failure there is
reported as its own distinct outcome, e.g. `{ok: false, reason: "task <id>
worktree was removed but meta.json could not be marked closed: <error>;
manually set status to closed"}`, never as a silent crash. The cleanest fix
is a try/catch around the metadata write in `finish()` that folds the
raised error into the existing partial-failure vocabulary the module
already has for exactly this class of problem.

### F-2 (HIGH): an uncaught exception anywhere in spawn's post-pool-create write sequence bypasses rollback entirely, orphaning the worktree, branch and pool record

**Claim under test:** Decision 11 in the work history: "A failure AFTER pool
create and BEFORE the payload starts removes exactly what this invocation
created... and nothing else (criterion 5)." Criterion 5 itself: "If a step
after pool create fails..., spawn exits nonzero and the worktree and
tasks/<id>/ entries created by that invocation are removed."

**Failure scenario:** In `src/spawn.ts`, `spawnTask` calls `assembleBrief`,
`writeTaskMeta`, `writeTurnEndHook`, and reads `executorRecordPath` between
`poolCreate` succeeding and `adapter.launch` running, none of them wrapped
in try/catch; `rollback()` is only invoked when one of these returns an
`ok:false` result (as the ENOENT executor-launch case does). Any of them
throwing instead of returning an error value (a directory where a file was
expected, a permissions error, ENOSPC, a symlink race) escapes the
`rollback` path completely. The task id is left permanently wedged: the
worktree, the pool record (`worktrees/<id>.pool.json`) and the task branch
all survive, so a retry of `spawn --task <id>` is refused by `poolCreate`'s
own duplicate-id check (`existsSync(record) || existsSync(worktree)`), and
nothing was ever reported as a task (no meta.json was written), so there is
no record an operator can find by task id to know what happened short of
reading the crash's stack trace at the time it occurred.

**Evidence (captured, reproduced live):**
```
$ mkdir -p tasks/tcrash/brief.md   # brief.md pre-exists as a directory
$ node bin/tiphys.ts spawn --task tcrash --project ./project --brief /tmp/brief.txt --shape ship --exec /bin/true
node:fs:2430
Error: EISDIR: illegal operation on a directory, open '.../fleet/tasks/tcrash/brief.md'
    at writeFileSync (node:fs:2430:20)
    at assembleBrief (.../src/brief.ts:68:3)
    at spawnTask (.../src/spawn.ts:308:17)
exit code: 1

$ ls worktrees/tcrash            # worktree LEFT BEHIND (no rollback)
README.md  work.txt
$ git -C project branch -a | grep tcrash
  task/tcrash
$ ls worktrees/tcrash.pool.json  # pool record LEFT BEHIND
worktrees/tcrash.pool.json
```
No test in test/spawn.test.ts exercises a thrown (as opposed to returned)
failure in this window; the only launch-failure test drives the caught
ENOENT path (`spawn-launch-failure-rollback`), which correctly rolls back.

**Fix:** wrap the sequence from the task-directory creation through
`adapter.launch` in a try/catch (or restructure each step to return a
result type instead of throwing), and route any caught exception through
the same `rollback()` the ok:false paths already use, so "everything or a
clean rollback" is true for I/O failures generically, not only for the
specific failure shapes the tests happen to simulate.

**Why F-1 and F-2 are both worth a fix round, not just a note:** both are
the same class of gap (a Node fs call that signals failure by throwing
rather than returning, in code that was otherwise carefully designed as an
ok/reason result type end to end), so one fix pattern (a shared "run this
step, and if it throws, treat it exactly like an ok:false step" wrapper in
both spawn.ts and teardown.ts) closes both. Given this project's stated
central safety property ("work is never silently destroyed" and "a task
cannot run without the caller holding the lease"), a defect that lets an
ordinary disk error either wedge a task id forever (F-2) or make the state
authority lie about whether a workspace still exists (F-1) is squarely in
scope for this phase, not a hypothetical edge case: ENOSPC and permission
races are exactly the kind of thing that happens on a long-running fleet
host, not an adversarial construction unique to my test setup.

### F-3 (LOW, observation, not a defect): work-history claim of universal rollback safety is broader than what was tested

Work-history decision 11 states the rollback contract in unconditional
language ("everything or a clean rollback... a failed step removes what
that invocation created, and only that") without qualifying it to the
specific failure shapes actually exercised (duplicate id, ENOENT executor).
This is exactly the "always/never claim without a falsifying measurement"
pattern CLAUDE.md's tuition history warns about. It is not a fabricated
measurement (everything reported as tested did pass as reported), but the
prose reads as a stronger guarantee than the code delivers, and F-1/F-2 are
the concrete gap between the claim and the code. Recommend narrowing the
prose in the next revision of this work history to name what was actually
exercised (caught error paths) rather than "everything."

## The two declared judgement calls

**1. Salvage commit ordering (after the landed check, not before, contrary
to the plan step 5 prose's literal order).** I worked through this
independently before reading the implementer's own reasoning and reached
the same conclusion by simulation: if the salvage commit were made before
the landed check, the newly created WIP commit is by construction not on
the fetched default branch, so the landed check would find the branch
unlanded immediately after every salvage, and criterion 8's third clause
("after the branch is landed... teardown --salvage exits 0") could never be
satisfied by any implementation that follows the prose's literal order. I
confirmed this concretely: I patched src/teardown.ts to commit before
checking landedness and re-ran the registered test
`teardown-dirty-and-salvage`; it failed immediately on the post-squash
salvage assertion (branch tip mismatch), exactly as the work history's W5
witness claims. **Ruling: the conflict is real, and following the numbered
acceptance criteria over the step prose's word order was the right call.**
Plan section 3's own binding rule and the criteria are the falsifiable
contract; ordering language in a paragraph of prose is not equal-weight
against a criterion that is unsatisfiable under the alternative reading.

**2. Scout teardown not force-deleting the branch, so a scout that
committed work is refused rather than losing it.** I tested this live
rather than only reading the code: spawned a scout task, had its exec
payload actually create a commit on the scout's scratch branch, wrote the
required report.md, then ran teardown. Result: teardown refused
(`pool destroy did not complete: branch task/s2 carries commits beyond its
base ...; task s2 stays open`), the worktree and its files were intact
afterward, and the commit was untouched. I also confirmed the negative
control: a scout with an uncommitted-only dirty tree and a report is torn
down cleanly via `--discard` with the branch cleanly removed (no extra
commits to protect). **Ruling: this matches the plan's intent.** The plan
text is silent on this exact combination, but the project's stated central
safety property is that work is never silently destroyed, PR-010's
--discard is documented as the dirty-tree override only (not a
branch-delete override), and this is the identical shape of defect
(M1-P3's V-1) the plan explicitly warns against elsewhere in this same
phase. Refusing and preserving is the conservative reading consistent with
every other refusal rule in this phase, and I could not construct a reading
of the plan that would make force-deleting a scout's committed work the
intended behavior.

## What I executed versus what I only read

**Executed:**
- `npm ci`, `npm run build` (clean, `git status --porcelain` empty
  afterward), and the full suite twice (`node --test`, both times with
  dist/ removed first): 99 tests, 97 pass, 0 fail, 2 skipped (the inherited
  M1-P2 floor-gated doctor witnesses), 0 unaccounted. Wall time in this
  environment was slower than the work history's recorded 67.6s (mine ran
  ~94s and ~95s across two runs); I attribute this to sandbox contention,
  not a regression, per CLAUDE.md's own warning that wall time is
  environment-sensitive.
- A hand-driven end-to-end walk against a real upstream repo, a real
  project clone, and a real fleet home: `tiphys init`, `lock acquire`, a
  ship spawn with a real stub payload (confirmed the payload's cwd file and
  completion marker existed the instant spawn returned, i.e. not
  backgrounded), the exec-less usage error (exit 64, nothing created), a
  duplicate task id refusal, a launch failure with a nonexistent binary
  (confirmed full rollback: no task dir, no worktree, no branch), an
  unlanded-branch teardown refusal (confirmed true no-op: commit and
  upstream both unchanged), a landed teardown after a real merge into the
  upstream's checked-out branch (confirmed success and meta closed), a
  dirty-tree teardown refusal and then a successful `--salvage` (confirmed
  the pushed WIP commit and message prefix), the holdership guard in both
  directions for both spawn and teardown (unset, wrong id, correct id), and
  the scout carve-out with real committed work (see judgement call 2
  above).
- Three deliberate-sabotage re-runs of shipped source against the exact
  registered tests the work history names, to check the red-witness claims
  rather than trust them: moving the holdership check after `poolCreate`
  (W8) turned `spawn-holdership-both-directions` red with "the refusal
  created a worktree"; passing `deleteBranchForce: true` on the scout path
  (W9) turned the scout-preservation test red with "committed scout work
  was destroyed without a word"; reordering the salvage commit before the
  landed check (W5) turned `teardown-dirty-and-salvage` red on a branch-tip
  mismatch assertion. All three matched the work history's claimed failure
  message and were reverted and reconfirmed clean (`git diff --quiet`)
  afterward.
- Two adversarial exception-injection reproductions (F-1, F-2 above),
  captured with real stack traces and real before/after filesystem state.
- A structural grep for pid/proc/signal-based identity across the new
  files (task.ts, spawn.ts, teardown.ts, brief.ts, hooks.ts, the two new
  command files): clean; the only "signal" references are the documented,
  inert 128+signal exit-code convention for a path M1 never drives.
- A scope audit (`git diff --name-status` against the merge-base with
  origin/main): exactly the eleven files-to-touch paths plus
  test/behaviors.json and the work history, matching the claim.
- ASCII/em-dash scan (`grep -rP '[^\x00-\x7F]'`) over all new source and
  test files and the work history: clean.
- `test/behaviors.json` mapping count: 100, matching the claimed figure.

**Only read, not independently re-derived:**
- The remaining seven of ten deliberate-failure witnesses (W1-W4, W6, W7,
  W10) in the work history's table: I verified three of ten myself (W5,
  W8, W9) and they held exactly as claimed; I did not re-run the other
  seven, though nothing in the code I read for F-1/F-2 gave me reason to
  doubt them.
- The lock/pool internals (src/lock.ts, src/pool.ts) beyond what this
  phase's teardown and spawn call into: they are M1-P3's, out of this
  phase's files-to-touch list, and were verified unmodified
  (`git diff --stat` shows no changes to either file in this PR).
- CI (Node 26) behavior: not run; this environment is Node 22.22.2 per the
  standing warning, and neither spawn nor teardown reads the Node version,
  so I have no reason to expect a CI-only divergence, but I did not
  witness it directly.

## What I could not verify

- Whether the M1-P5 watcher (not yet built) would actually be misled by
  F-1's stale-open meta.json in practice, since that consumer does not
  exist yet in this branch; I can only confirm the file itself is left in
  a state that contradicts the physical reality of the worktree, which is
  the condition C-1 exists to prevent regardless of which future consumer
  reads it.
- Behavior on a genuinely full disk (ENOSPC) as opposed to my EPERM/EISDIR
  reproductions; I used chattr/EISDIR as accessible proxies for "a
  writeFileSync throws instead of succeeding" because I am running as root
  in this sandbox (permission bits alone do not block root), but the code
  path implicated is identical regardless of which errno triggers it.
- CI-only Node 26 behavior, as noted above.

## Merge recommendation

Do not merge as-is. F-1 and F-2 are real, reproducible, and sit exactly on
this phase's stated central safety property (work is never silently
destroyed, and the single state authority must be trustworthy); both were
reproduced live against the shipped 6fca6db source, not inferred from
reading. Recommend a fix round that wraps the write sequences in
spawn.ts's post-pool-create path and teardown.ts's finish() in exception
handling that folds a thrown I/O error into the existing ok/reason result
type (mirroring the caught-failure rollback and partial-failure reporting
the code already does well elsewhere), plus one new red-witnessed test per
fix showing the specific danger state (an uncaught write failure) rather
than only the already-covered caught-failure shapes. Everything else
walked in this review, including both declared judgement calls, the
holdership guard, the C-2 compliance, the no-backgrounding property, the
scope audit, and the ASCII/behaviors-registry hygiene, held up under
independent, hands-on testing.
