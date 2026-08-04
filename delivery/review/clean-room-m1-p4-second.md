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

---

# Delta review of the fix round (head 5aa9a8e)

Date: 2026-08-04
PR: 6, fix delta 6fca6db..5aa9a8e
Reviewer: same reviewer as above, same lens (destructive paths), narrow
delta scope per the orchestrator's instructions: are F-1 and F-2 genuinely
closed, and did the fix introduce anything new.
Isolation: cloned `/home/user/tiphys-ai-helmsman` at 6fca6db into a second
scratch clone (`p4-old-head`) purely to reproduce the two findings on the
pre-fix source, and at 5aa9a8e into `p4-delta-sonnet` for everything else
(`npm ci`, build, full suite, sabotage-and-revert, and two independent
hand-driven fleets under `manual-walk-old` and `manual-walk-new`). No
writes were made to the main repository's working tree or git state by
any of that work; only this review file's append touches the main
checkout, per the task's explicit deliverable instruction, and it was not
committed.

## VERDICT: APPROVE

Both HIGH findings from the first round are closed, reproduced honestly
against the pre-fix source and confirmed fixed against the post-fix
source with independent forced failures (not just the round's own named
witnesses). The single `runStep` wrapper is applied consistently at every
throw point in the danger windows I reviewed, the three classification
decisions are sound, the printed scout recovery route works end to end
exactly as documented, and the round's declared gaps are accurate and are
not the only two but the additional ones I found are cosmetic, not
destructive. No new HIGH or MEDIUM finding.

## F-1 and F-2: closed, with independent reproduction

**F-2 (spawn, mkdir-raise orphaning), OLD head 6fca6db:** reproduced with
a dangling symlink at `tasks/t-throw` (independent of the round's own FW1
witness, same technique). Result: raw stack trace to stderr
(`at mkdirSync ... at spawnTask (src/spawn.ts:305:5)`), exit 1, and the
worktree, `worktrees/t-throw.pool.json`, and branch `task/t-throw` all
survived, orphaned, exactly as F-1's original report claimed.

**F-2, NEW head 5aa9a8e**, same symlink, same task id: single reason line
(`tiphys spawn: creating the task directory ... failed: ENOENT: ...`), no
stack trace, and after clearing the link `worktrees/`, the pool record and
the branch are gone: `ls worktrees/` empty, `git branch -a` shows no
`task/t-throw`. Retried the identical spawn immediately afterward: it
succeeded (exit 0), proving the id was not wedged. **F-2: CLOSED.**

**F-1 (teardown, meta-write-raise leaving a false "open"), OLD head:**
reproduced with `chattr +i tasks/t5/meta.json` (the technique the original
review used and the round declined to use for CI-portability reasons; I
used it here specifically because it is independent of the round's own
stub-git FW2 witness). Result: raw stack trace
(`at writeTaskMeta ... at setTaskStatus ... at finish (src/teardown.ts:292:3)`),
exit 1, `worktrees/t5` gone, `meta.json` still reads `"status": "open"`.

**F-1, NEW head**, same chattr technique on a freshly spawned `t5`: single
line, no stack trace:
`tiphys teardown: partial teardown of task id t5: worktree ... HAS BEEN REMOVED and branch task/t5 was deleted (it was <sha>), but .../meta.json could not be marked closed (... EPERM ...); the task record still reads status open although its worktree is gone, so repair that file and set "status": "closed" by hand`.
This is the honest report F-1 asked for: it does not claim nothing
changed, it names exactly what changed, and it gives the manual remedy.
**F-1: CLOSED.**

Both reproductions used a technique different from the one the fix round
itself used (chattr vs. the round's dangling-symlink and stub-git tricks),
so this is a genuinely independent confirmation, not a re-run of the same
script.

## Sabotage-and-revert of the new guards themselves

To make sure the round's own witnesses were not accidentally testing
something narrower than the fix, I re-sabotaged the fixed source directly
and re-ran the two new tests:

- Unwrapped the task-directory `mkdirSync` in `src/spawn.ts` (removed the
  `runStep` around it, called `mkdirSync` bare): `spawn-thrown-failure-
  rolls-back` (test name "a write that THROWS after pool create still
  rolls the task back") went red immediately, failing on the line-count
  assertion with the same raw stack trace signature the original F-2
  showed. Reverted; `git diff --quiet src/spawn.ts` confirmed clean.
- Unwrapped the `setTaskStatus` call in `finish()` in `src/teardown.ts`
  (removed the `runStep`, called `setTaskStatus` bare): `teardown-meta-
  write-failure-partial` went red immediately, same signature as the
  original F-1. Reverted; `git diff --quiet` confirmed clean.

Both tests are genuinely red against the reintroduced dangerous state, not
merely green by construction.

## The three classification decisions

**1. Raised launch-record write treated as launch-failed (rolls back).**
Sound. The record write happens before the payload's `spawnSync`, so a
throw there is provably pre-payload; routing it through the existing
`rollback()` is the same safe class of action the returned-ENOENM
launch-failure path already used pre-fix. No new risk: `rollback()` never
force-deletes, so a worktree that is for any reason not pristine still
refuses via the pool's own gate.

**2. Anything raised after the payload has run treated as incomplete
(never rolls back).** Sound, and correctly scoped: the turn-end hook
write is the only unwrapped-by-return, wrapped-by-runStep write after the
payload starts, and its failure reports "the worktree and the task
directory are left in place" rather than attempting cleanup. Verified by
reading; this is exactly the F-2 fix's own stated boundary and matches
V-1's lesson (never destroy a worktree that might hold real work).

**3. A throw out of `adapter.launch` itself is not classified; nothing
rolls back.** Sound, and I tested it directly rather than only reading it.
The CLI cannot inject a custom adapter, so I called `spawnTask` from a
small script with a throwing adapter (library-level call, same technique
the round declared it could not reach through the CLI):

```
result = spawnTask(fleet, { ..., adapter: { name: "throwing-test-adapter",
  launch() { throw new Error("simulated adapter crash: the payload state
  is unknown"); } } })
```

Result: `{ ok: false, reason: "launching the payload through the
throwing-test-adapter adapter failed: ...; the throwing-test-adapter
adapter did not report whether the payload started, so nothing was rolled
back: the worktree ..., its task directory and the pool record are left
in place for inspection" }`. The worktree, `meta.json` (status "open",
which is honestly still true), the task directory and the branch were all
intact afterward, matching the reason exactly.

I then asked the practical question the task raises: what does an
operator actually do with that state next? I ran plain `tiphys teardown
--task t-adapterthrow` against it with no special handling. It exited 0
and closed the task cleanly, because the worktree was in fact untouched
(clean, branch tip == base) and teardown's ordinary landed/dirty logic
handled it correctly with no extra machinery. So the recovery route for
this refusal is exactly "run teardown", which already works today; the
reason text does not spell this out explicitly (unlike the CR-304 scout
refusal, which names the exact recovery command), but the omission is
cosmetic, not a dead end, since the standard command an operator would
reach for regardless is the one that resolves it. I recommend a follow-up
of adding one clause to the reason text noting "run tiphys teardown to
resolve" for a future round, but I am not blocking approval on it: it is
a documentation nicety, not an unrecoverable state, and I verified the
state is in fact recoverable through the ordinary command with no
force flags and no data lost either way.

**Ruling: all three classification decisions are sound as implemented and
as tested by me independently of the round's own suite.**

## The printed scout recovery route, run by hand end to end

Spawned a fresh scout, had its exec payload create a real commit
(`findings.txt`) on the scout's scratch branch and write `report.md`, then
ran teardown. Refused, single line, with the exact printed route:
```
tiphys teardown: scout task s-scout1 has commits on its scratch branch
task/s-scout1 (tip 834655c..., base b00a95a...) and teardown never
deletes committed work: copy or push them somewhere durable, then release
the branch with "git -C <project> update-ref refs/heads/task/s-scout1
b00a95a..." and re-run teardown
```
I then followed it literally, by hand, with no adaptation:
1. `git -C worktrees/s-scout1 push origin HEAD:refs/heads/scout-findings`
   -- succeeded, new branch created on the bare upstream.
2. The exact printed `git -C <project> update-ref refs/heads/task/s-scout1
   <base-sha>` -- succeeded.
3. `tiphys teardown --task s-scout1` again -- exited 0, "torn down
   s-scout1".

Confirmed afterward: `meta.json` reads `"status": "closed"`, the worktree
is gone, and `git -C upstream.git rev-parse refs/heads/scout-findings`
resolves to the exact commit sha the scout made, with the file content
intact. The route works exactly as claimed and nothing was lost.

## Honesty of the round's declared gaps

The round declares two gaps: no test for the adapter-throw path (CLI
cannot inject an adapter), and only the mkdir site among four
identically-shaped wrapped writes (task dir, brief, meta, hook) is
separately witnessed. Both are accurate; I independently exercised the
adapter-throw gap myself (above) using the same "library seam, not CLI"
route the round named, and it behaved exactly as claimed.

I looked for undeclared gaps and found two, both cosmetic:

- `taskDirOccupied`'s fail-closed branch (an unreadable directory,
  `statSync`/`readdirSync` throwing for a reason other than "does not
  exist") has no test. It fails toward refusal (treats unreadable as
  occupied), which is the safe direction, so this is a coverage gap, not
  a defect.
- `process.stderr.write` in the `loadFleet()` catch blocks of both
  `src/commands/spawn.ts:120` and `src/commands/teardown.ts:64` is not
  passed through `singleLine`, unlike the main `result.reason` path
  added under CR-303. I checked whether this can actually produce a
  multi-line stderr line: `loadFleet`'s only thrown error is
  `not a fleet home: <dir> is missing <list>`, built by joining an array
  with `, `, which is single-line by construction, and other fs errors
  Node raises here (ENOENT/EACCES on `resolve`/`statSync`) are
  themselves single-line messages. So this is a structural inconsistency
  worth tidying (LOW, not blocking): the two catch blocks rely on "this
  particular thrown message happens to be short" rather than the
  structural guarantee `singleLine` gives everywhere else CR-303 was
  applied. No failing input exists today that would violate the
  single-reason-line contract through this path.

Neither of these rises to a finding that should hold up the merge; both
are one-line hardening items for a future pass.

## What I executed versus what I only read

**Executed:**
- `npm ci` and a from-clean `npm run build` at 5aa9a8e: exit 0,
  `git status --porcelain` empty afterward.
- Full suite from a from-clean `dist/`: 103 tests, 101 pass, 0 fail, 2
  skipped (the same floor-gated M1-P2 pair), 0 unaccounted, matching the
  round's claimed count exactly.
- ASCII/em-dash scan (`grep -rP '[^\x00-\x7F]'`) over `src/`, `test/`, the
  work history and the plan: clean (grep exit 1).
- Scope audit (`git diff --name-status 6fca6db..5aa9a8e`): exactly the
  ten files the round's disposition list names, no more.
- `test/behaviors.json` mapping count: 104, and spot-checked all six
  named red-witness test titles (FW1-FW6's registered names) resolve to
  the correct descriptions.
- F-1 and F-2 reproduced live on OLD head 6fca6db in an independent
  hand-built fleet (`manual-walk-old`), using chattr and a dangling
  symlink, techniques different from the round's own FW1/FW2 forcing
  mechanisms.
- F-1 and F-2 confirmed closed live on NEW head 5aa9a8e in an independent
  hand-built fleet (`manual-walk-new`), same chattr/symlink techniques,
  plus a same-id retry after each to confirm no wedging.
- Direct sabotage-and-revert of the shipped `runStep` call sites for both
  fixes (bare `mkdirSync`, bare `setTaskStatus`), each driven through the
  actual registered test, confirmed red against the reintroduced danger
  and confirmed the tree was clean after reverting.
- A library-level call to `spawnTask` with a throwing custom adapter
  (bypassing the CLI, which cannot inject one), to test the adapter-throw
  classification directly rather than only read it, followed by a plain
  `teardown` against the resulting state to test the real recovery route.
- The scout committed-work refusal and its printed recovery route, run by
  hand end to end against a real bare upstream, a real project clone, and
  a real scout worktree with a real commit, confirming the findings
  survive on the pushed branch.
- A live re-check of CR-301's interaction note: spawning a live
  (never-torn-down) task and immediately re-spawning the same id confirms
  the new occupied-directory gate refuses before pool create is reached.

**Only read, not independently re-derived:**
- The five round-one witnesses (W1, W2, W5, W6, W8) the round claims it
  re-ran against the fixed source at 2/2 each; I did not re-run these
  myself, this delta review being scoped to F-1/F-2 and new risk.
- FW3, FW4, FW5, FW6 (CR-301, CR-303, CR-304, CR-302) as registered
  tests: run as part of the full suite pass above and read in source, but
  not separately re-sabotaged by me; CR-304's outcome (the scout route)
  was independently re-verified end to end by hand instead, which is the
  stronger form of confirmation for that one.
- CI (Node 26) behavior: not run; this environment is Node 22.22.2 as
  before, and nothing in the touched files reads the Node version.

## What I could not verify

- Whether a real ENOSPC (as opposed to chattr/EPERM and a dangling
  symlink/ENOENT) drives exactly the same code path; the throw point is
  identical regardless of which errno triggers it, so I have no reason to
  expect divergence, but I did not force an actual full disk.
- The seven other identical-pattern-but-unwitnessed write sites the round
  itself flags (brief, meta, hook writes in spawn's window) at rates
  beyond the one (mkdir) both the round and I independently forced; I
  read the code and it is the same wrapper shape, but "same shape" is an
  inference, not a separate measurement, for those three.

## Merge recommendation

APPROVE. F-1 and F-2 are closed, confirmed with reproductions independent
of the fix round's own named techniques on both the old and the new head.
The `runStep` wrapper is applied consistently across every throw point I
checked in spawn's post-create window and teardown's finish(), no path
now rolls back where it previously refused-and-survived, no path now
reports success over a real failure, and no raise escapes at any site I
tested. The three classification decisions, including the deliberately
unclassified adapter-throw case, are sound and were confirmed by direct
testing, not just by reading the reasoning; the practical recovery route
for that unclassified case is the ordinary teardown command and it works.
The scout recovery route prints a command that works, verified by
literally running it. The round's declared gaps are honest; the two
additional gaps found here (an untested fail-closed branch and two
un-singleLine'd but structurally-safe catch blocks) are cosmetic and do
not block merge.

## Final confirmation (head be7d7eb)

Delta reviewed 5aa9a8e..be7d7eb (round three, addressing N-401 to N-404 and
the two lows raised above) in a fresh clone, checked out to be7d7eb, `npm
ci` clean. This is a confirmation pass, not a fresh review; scope was the
round's own diff plus the two probes above and a hunt for regressions.

### 1. My two original highs, re-run on be7d7eb

Both reproduced live, using the same forcing techniques as my original
findings, in a fresh scratch fleet built by hand (init, a bare upstream
with `main` as its symref HEAD, a clone, a spawned ship task).

F-1 (teardown crash after destroy, meta left claiming open): `chattr +i
tasks/t5/meta.json`, then `teardown --task t5`. Result: exit 1, one
stderr line, no stack trace:
```
tiphys teardown: partial teardown of task id t5: worktree
.../worktrees/t5 HAS BEEN REMOVED and branch task/t5 was deleted (it was
145be2a7...), but .../tasks/t5/meta.json could not be marked closed
(marking task t5 closed failed: EPERM: operation not permitted, open
'.../tasks/t5/meta.json'); the task record still reads status open
although its worktree is gone, so repair that file and set "status":
"closed" by hand
```
Worktree confirmed gone, meta.json confirmed still `"status": "open"`.
Honest partial-teardown report, exactly the shape claimed. CLOSED.

F-2 (throw in spawn's post-pool-create window escapes rollback): the
original repro (`mkdir -p tasks/tcrash/brief.md` before spawn) is now
intercepted earlier, by CR-301's occupied-task-dir gate, before pool
create ever runs, so it no longer reaches the write sequence at all
(exit 1, "already holds records", nothing created). That gate moving in
front of the old trigger is itself a sign the fix is holding, not a gap,
but I re-drove the original failure mode from a different angle to be
sure the `runStep` wrapper is still live behind it: `chattr +i tasks`
(the parent, empty of the fresh id `tcrash2`) so the occupied gate passes
(the id is not yet used) and the task-directory `mkdir` inside `spawnTask`
throws EPERM after pool create has already made the worktree, branch and
pool record. Result: exit 1, one stderr line, no stack trace:
```
tiphys spawn: creating the task directory .../tasks/tcrash2 failed:
EPERM: operation not permitted, mkdir '.../tasks/tcrash2'
```
Confirmed after the call: no `worktrees/tcrash2`, no
`worktrees/tcrash2.pool.json`, and `git branch -a` in the project clone
shows no `task/tcrash2` -- full rollback, nothing orphaned. CLOSED.

Neither reason string, exit code, or rollback/report shape moved from the
round-two behavior I approved. The only textual change nearby is the
appended teardown-route clause on the adapter-throw reason (new this
round, not part of F-1/F-2) and the `singleLine` wrap now also applied to
the two `loadFleet` catch blocks (a round-two open item, closed here);
neither touches the F-1 or F-2 code paths themselves.

### 2. The new --deadline validation

Read the change in `src/commands/spawn.ts`: the new check runs inside
`parseFlags`, entirely before `loadFleet` and therefore before any pool
create, fleet load, or filesystem write. Confirmed by source order, not
inference.

Ran the registered test directly and by hand: `--deadline 1e300`,
`--deadline 1e13`, and `--deadline 8640000000000` all exit 64 with the
usage line on stderr and create nothing (no task dir, no worktree, no
pool record) in the registered test's own assertions, which I read and
which match the parser logic. `--deadline 300` (and by extension any
ordinary value: minutes, hours, days, even up to roughly the current
epoch offset short of 8.64e12 seconds) still succeeds; the registered
test asserts this explicitly as the non-blanket-ban check. I did not find
a reasonable operator-facing value this rejects: the threshold is the
actual `Date` representable range, not an invented policy ceiling, and
the round's own honest-scope note says exactly that (no policy maximum
was invented). Ruling: the validation is correctly placed (before
anything is created) and correctly scoped (rejects only what the adapter
could never have represented anyway).

### 3. Honesty of the structural substitute

Read `test/teardown.test.ts`'s new `teardown-scout-never-forces-branch-delete`
and the corrected key decision 18 in the work history. The test slices
`src/teardown.ts` between the scout-branch marker and the ship-branch
marker and asserts the slice contains `deleteBranchForce: false` and not
`deleteBranchForce: true`. I sabotaged the source (flipped the scout
path's flag to `true`) and the test went red immediately; reverted and
confirmed `git diff --quiet` clean and the full teardown suite green
again.

The work history's own words: "The structural test guards the source,
not the behavior, and I am claiming exactly that and nothing more." That
is exactly what the test does and no more -- it does not exercise
`teardownTask` at all, it greps compiled intent out of source text. The
record also states plainly, and I confirmed by reading the CR-304
pre-check, that the inner flag's value is no longer observable at
runtime because the outer gate (the committed-scout refusal) intercepts
every state in which the flag would matter first. Ruling: the claim is
honestly scoped. It does not overstate a source-text check as a
behavioral guarantee, which is the exact failure mode this project has
been bitten by before (T-003). I have no correction to offer here.

### 4. Hunt for new breakage

- Scout path (`src/teardown.ts`): untouched this round (confirmed by
  `git diff`, zero lines changed in that file). No new risk introduced.
- Spawn's argument parsing (`src/commands/spawn.ts`): the only change is
  the deadline representability check, additive and pre-fleet-load as
  above; the other flags (`--task`, `--project`, `--brief`, `--shape`,
  `--exec`, `--offline`) are untouched.
- Both commands' error emitters: `loadFleet`'s catch in both
  `spawn.ts` and `teardown.ts` now routes through `singleLine`, same as
  `result.reason` already did. `singleLine` joins non-empty trimmed lines
  with "; " -- it collapses to one line, it does not drop any line's
  content, so no message loses information. I found no path where the
  new validation runs too late (it is the first thing checked, before
  the fleet is even loaded) and no path that now refuses where it
  previously, correctly, proceeded: I re-ran the full suite from a
  removed `dist/` and confirmed no regression outside the two new test
  files and the two edited command files' diffs.
- The adapter-throw reason's appended clause
  ("...close the task with tiphys teardown --task <id>") is additive
  text at the end of an existing single-line reason; it does not
  restructure the enumeration that precedes it, and I confirmed by
  reading and by the registered test that the worktree, pool record and
  task directory are still all left in place exactly as before, and that
  plain `teardown --task <id>` (no flags) closes it.
- No new finding. Nothing this round touched behaves differently for a
  legitimate caller, and the two things it touched behaviorally
  (deadline validation, the adapter-throw reason wording) are both
  additive refusals/clarifications, not narrowings of what succeeds.

### 5. Quick confirmations

- `npm ci`: clean install, EBADENGINE warning only (expected, Node
  22.22.2 against the >=26 floor).
- `npm run build` (tsc -b) from a removed `dist/`: exit 0,
  `git status --porcelain` empty afterward.
- `node --test` from a removed `dist/`: 106 tests, 104 pass, 0 fail, 2
  skipped (the same M1-P2 floor-gated pair as every prior round), 0
  unaccounted -- matches the round's claimed count exactly.
- Registry check (`test/behaviors.json` against test titles found by
  regex across `test/*.test.ts`): 107 mappings, 0 missing -- matches the
  round's claimed "107 mappings, 0 missing, 106 titles" exactly.
- Scope audit (`git diff --name-status 5aa9a8e..be7d7eb`): exactly
  `delivery/work-history/m1-p4.md`, `src/commands/spawn.ts`,
  `src/commands/teardown.ts`, `src/spawn.ts`, `test/behaviors.json`,
  `test/spawn.test.ts`, `test/teardown.test.ts` -- matches the round's
  disposition list, and `src/task.ts` is confirmed unchanged (empty
  diff), matching the round's own "no change" note.
- ASCII / em-dash scan (`grep -rP '[^\x00-\x7F]'`) over `src/`, `test/`,
  and the work history: clean (grep exit 1).

### What I could not verify

Same residual gaps as the prior round, both explicitly declared there and
here, neither blocking: `taskDirOccupied`'s fail-closed catch branch
(unreadable directory) remains untested, for the reason the round itself
gives (this suite runs as root, where permission bits do not bite); and I
did not force a real ENOSPC, relying instead on chattr/EPERM as a
same-throw-point substitute, as in the prior round.

### VERDICT: APPROVE

F-1 and F-2 remain closed on be7d7eb, reproduced independently with the
same and with a varied forcing technique; neither the failure mode, the
exit code, the single-line reason shape, nor the rollback/report behavior
moved. The new --deadline validation runs before anything is created,
rejects only genuinely unrepresentable values, and does not narrow any
reasonable use. The structural substitute for the retired W9 witness is
honestly described as guarding source text, not behavior, and does no
more than it claims. Nothing this round touched behaves differently for
a legitimate caller; no new defect found. Merge.
