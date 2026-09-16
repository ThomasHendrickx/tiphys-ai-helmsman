# Clean-room review: M4-P2
branch claude/m4-p2-async-launch, head b12dc98, base 3b40118 (true phase base 6961186)
Reviewer: Opus 5. Framing: CORRECTNESS AND DATA LOSS.

## 0. First check: the not-covered statement (fix-round contract item 3)

HONEST, and unusually thorough. Two separate not-covered blocks:
- per-derivation ("What the derivation did NOT cover", 5 items, wh.md:415)
- phase-level ("What this phase does NOT cover", 6 items, wh.md:758)

Two things it admits are BETTER than they sound:
- the "stale turn-end from a previous incarnation" OPEN QUESTION is closed by
  taskDirOccupied (src/task.ts:406): the dir must be empty at spawn, so no
  stale turn-end can exist. Verified by reading, not by the implementer.
- rule (b) of the red-witness gate, which the implementer DEDUCED: I executed
  it. All three spec `behavior` ids resolve in test/behaviors.json, including
  watcher-signal-surfaced-once (pre-existing row). The deduction holds.

One thing it admits that is WORSE than it sounds: see finding 1.

## Findings (in progress)

## Independent reproductions (all run by me, not copied)

- clone: `git clone --no-local --shared /home/user/tiphys-ai-helmsman` into the
  scratchpad, a REAL git checkout (not a `git archive` copy), at b12dc98.
- interpreter /home/user/n26/node-v26.6.0-linux-x64/bin/node v26.6.0.
- `npm ci` exit 0, `npm run build` exit 0, `git status --porcelain` empty after
  the build. Criterion 1 reproduced.
- witness member 0 (delete the precondition): 2 named tests, both FAIL, exit 1.
- witness member 1 (weaken it to the existsSync shape): pass 1, fail 1, exit 1.
  The asymmetry the work history claims is real: the absence arm stays green and
  only the present-but-wrong arm reddens. The two members ARE structurally
  different.
- rule (b) of the red-witness gate, which the implementer deduced: executed.
  All three spec behavior ids resolve in test/behaviors.json.
- behavior derivation: 20 behaviors resolve by name from this file; each of the
  7 named descriptions occurs EXACTLY ONCE in the source, so the run-time
  derivation is not matching a comment. No count pinned anywhere.
- scope: 11 changed paths against the true phase base 6961186, all declared.
  No overlap with any of the other ten M4 branches on src/, witness/ or any
  test file except the shared append-only test/behaviors.json.

## FINDING 1 (HIGH, blocking): the red-witness gate is RED on this branch, and
## the work history's enumeration of the rules it deduced is itself incomplete

The implementer could not run the `red-witness` gate (shallow clone) and
DEDUCED green from rules (b), (a), (e), (d) and (g). Rules (c) and (f) are not
in that enumeration at all.

Rule (f) (src/witness/run.ts:1277-1294): if any member of a spec touches a
CHANGED file whose head content matches SPAWN_GREP
(src/witness/run.ts:319, /child_process|execFile|spawnSync|execSync/), the spec
MUST declare `consumesExternalOutput`.

- src/spawn.ts is changed and matches the grep 4 times (it imports spawnSync
  from node:child_process).
- witness/spawn-completed-without-turn-end-is-incomplete.json and
  witness/spawn-rejected-launch-rolls-nothing-back.json both have members with
  "file": "src/spawn.ts".
- Neither declares `consumesExternalOutput`.

Measured with the DELIVERED functions (SPAWN_GREP, shellSpawnsAndParses,
memberTouchedFiles), same derivation the gate performs:

    spawningChangedFiles: delivery/work-history/m4-p2.md, src/spawn.ts,
      test/credentials-gate.test.ts, test/spawn.test.ts
    spawn-completed-without-turn-end-is-incomplete.json: touches src/spawn.ts
      -> consumesExternalOutput ABSENT  *** RULE (f) REFUSAL ***
    spawn-rejected-launch-rolls-nothing-back.json: touches src/spawn.ts
      -> consumesExternalOutput ABSENT  *** RULE (f) REFUSAL ***

Corroboration that the rule really bites: witness/citation-na-precondition.json
declares `consumesExternalOutput` with the provenance note "red-witness rule (f)
binds this witness (SPAWN_GREP matches the changed file)".

## FINDING 2 (MEDIUM, tracked): criterion 5's evidence command audits the wrong
## line range, and two criteria-walk citations point into the wrong test

Work history, criteria walk: criterion 5 cites test/spawn.test.ts:1032 and is
"settled by a command over that test's own body rather than by reading it":

    sed -n '1031,1069p' test/spawn.test.ts | grep -cE "Date\.now|performance\.|setTimeout|hrtime"
    0

Measured at head b12dc98:
- the sentinel test is test/spawn.test.ts:1047 and runs to line 1086.
- the cited line 1032 is `assert.equal(existsSync(taskDirOf(scratch,
  "t-launchfailed")), false);`, inside the PREVIOUS test.
- the audited range 1031-1069 therefore covers 16 lines of a different test and
  EXCLUDES lines 1070-1086 of the test under audit, which is where its two
  assertions live.
- I re-ran the same grep over the correct range 1047,1086: also 0. So the
  CONCLUSION survives; the evidence as published does not.

Same class: criterion 7 cites test/spawn.test.ts:1118, which is inside the
"deferred" test; the criterion-7 test is at test/spawn.test.ts:1134.

Reachability (DR-0027): does not reach a shipped artifact. TRACKED.

## FINDING 3 (MEDIUM, tracked): the destructive arm is still believed on the
## adapter's word, and the evidence to refute it is now ten lines above

This phase's whole rationale is that `completed` can no longer be taken on an
async adapter's word. The SAME reasoning applies verbatim to `launch-failed`,
which is the arm that calls `rollback()` (src/spawn.ts:451-484) and is the only
arm that unlinks the task's records. Nothing checks it.

What a false `launch-failed` destroys, measured by reading src/pool.ts:776-834:
poolDestroy is called with discard:false and deleteBranchForce:false, so it
REFUSES a dirty worktree and REFUSES a branch carrying commits beyond its base.
The agent's WORK therefore survives. What does NOT survive is the unconditional
half that runs first: brief.md, meta.json, turn-end-hook.mjs and executor.json
are unlinked and the scrub root is removed before poolDestroy is ever called.
teardown then refuses ("no readable task meta for task id <id>; teardown needs
tasks/<id>/meta.json", src/teardown.ts:189-195), so the surviving worktree is
unreachable by the documented route out, and the rollback's own failure message
names no route out at all.

Reachability (DR-0027): I cannot name a shipped file or user-visible command
that reaches it. subprocessAdapter returns `launch-failed` only before the
payload spawn or when spawnSync itself errored, so today the payload provably
never started. It becomes reachable the moment a second adapter ships (M4-P3,
M4-P4, M4-P8). TRACKED, and worth raising with the orchestrator as a plan item
rather than fixed here, since the plan authorised the `completed` check only.

Related, and it is the implementer's own good work rather than a finding: the
plan's criterion 4 says the dangerous state is "a rejection destroying a
worktree that may hold real work". The work history's DS-C capture shows that
is NOT what happens: poolDestroy refuses the dirty worktree, so the worktree
survives and the RECORDS are what a wrongly-run rollback destroys. The plan's
framing is now known to be wrong and the tests assert the corrected version.

### FINDING 1, EXECUTED rather than derived

I ran the gate in a NON-SHALLOW clone (the orchestrator's clone is not shallow;
only the implementer's worktree was, so "the gate CANNOT RUN in this container"
is true of that worktree and not of this machine):

    node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
      --only red-witness --evidence <scratch> --base plan/pstack-borrow-review --head HEAD

    gates: declared 1 applicable 1 verdict 1 green 0 red 1 not-applicable 0 error 0 vacuous 0
    gates: red-witness: red: 3 witness(es) evaluated (3 own, 0 stored ...);
      witness spawn-completed-without-turn-end-is-incomplete: red: rule (f): ... omits it;
      witness spawn-rejected-launch-rolls-nothing-back: red: rule (f): ... omits it
    gates: 1 gate(s) reported red: red-witness
    GATE_EXIT=1

From witness-records.json: both refused specs have `"members": []`. The refusal
SHORT-CIRCUITS before any member runs, so the two witnesses that guard this
phase's money path are, as far as CI is concerned, never exercised.

`watcher-signal-surfaced-once` is GREEN in the same run: member 0 red/red over
two repetitions then green, member 1 the same. That independently discharges
the `deterministic: true, repeats: 2` obligation the implementer could only
deduce, and it settles the "are the two members different" question in the
gate's own terms.

`red-witness` is in gates.manifest.json on this branch, so the CI pull_request
bundle runs it and will report the same red.

## The other checks, briefly

### 2. A guard that cannot go red
No new check passes for a reason unrelated to its property, and one existing
one was FOUND to be that shape and fixed by the implementer: the rejection
test's original four residue assertions all stay green through a rollback that
ran, because poolDestroy refuses a dirty worktree. The three added assertions
(meta.json, brief.md, turn-end-hook.mjs) are what distinguish the two states,
and the DS-D capture shows meta.json is the FIRST failure, which proves the
preceding assertions passed under the defect. That is the correct method.

The one weak guard is the watcher witness, and it is weak by construction
rather than by mistake: this phase's watcher change is a de-duplication, so
there is no dangerous state it can produce, and both members re-introduce a
hand-authored private copy. They redden for genuinely different reasons
(member 0 leaves surfaced.value a pending promise; member 1 awaits and then
misclassifies success as failure), and the gate confirms both red. But note
member 0's `find` is a strict SUBSTRING of member 1's `find`, so rule (g)'s
file+find equality passes for a reason unrelated to the members being
different sites. Recorded, not blocking; witness/ is not a shipped surface.

### 3. A count pinned over an append-only registry
NONE. The behavior-resolution test derives its owned set at run time by
matching registry descriptions against the file's own source. I verified each
of the 7 named descriptions occurs EXACTLY ONCE in test/spawn.test.ts, so the
derivation matches titles and not comments, and the derived set is 20
behaviors with no number pinned anywhere. `owned.length > 0` is the
anti-vacuity guard and it is correct.

### 4. Unexecuted claims
Line-based claim grep: 5 hits. Wrap-insensitive form: 5 occurrences. The two
agree, so no hit straddles a wrap. Passive-form grep (the seven forms the
binding command misses): 4 hits, all of them test titles or a
recording-rather-than-implying disclosure ("I am recording that rather than
implying the branch is covered"). No over-claim survives. The only "cannot"
sentences carry adjacent captures. This is the cleanest claim audit I have
seen in this repository's work histories.

### 5. The suite sentence
Interpreter, build state, invocation, head, pass count and SKIPPED count are
all present. The FOURTH qualifier (git checkout vs `git archive` copy) is not
stated; the run was in a worktree, so it is a checkout, but the document does
not say so. The base was established FIRST (849 tests, 848 pass, 1 fail at
6961186, the pre-existing watcher flake) before any failure was attributed.
The contended-box false red is reported rather than dropped, with load
averages, and its signature (`did not complete within 250ms` on a pattern that
cannot backtrack) is correctly diagnosed. My own run is below.

### 6. Scope
CLEAN. 11 changed paths against the true phase base 6961186, every one
declared. No overlap with any of the other ten M4 branches on any src/ file,
any witness spec filename, or any test file other than the shared append-only
test/behaviors.json. test/credentials-gate.test.ts and the three witness specs
are declaredExtras and are touched by nobody else. The scope GATE cannot run
(the declaration is created by this branch, so the merge base has none, and
the merge base is not an ancestor of origin/main); the work history states
both and reproduces the declaration half by script. Orchestrator matter.

### 7. Citations
Sampled 50 distinct `path:line` tokens and resolved every one at head b12dc98.
- 41 exact.
- 3 near (a doc block above the named symbol, or a paragraph offset):
  src/witness/run.ts:682, src/gates/coverage.ts:253, CLAUDE.md:14.
- 2 WRONG and silently resolving: test/spawn.test.ts:1032, :1118 (finding 2).
- 10 are pre-change line numbers inside a captured `git grep` block, and the
  document declares them as such in the line immediately after the capture.
Hit rate on assertive citations: 44/46 = 96%.

### 8. C-1, C-2, C-3
- C-1: the new read is a whole JSON document, not the tail of an append-only
  log. It is used as EVIDENCE of ending, never as state: `spawnTask` still
  returns `outcome.exitCode` from the adapter, not the turn-end record's. The
  work history records that a disagreement between the two is unchecked.
- C-2: no pid, no process liveness, no signals, no /proc anywhere in the diff
  (grep over src/spawn.ts and test/spawn.test.ts returns nothing).
- C-3: the launch is AWAITED, never detached. No `unref`, no `detached`, no
  auto-backgrounding. Criterion 5's test witnesses it on a sentinel file.
  I attacked this from the other side too: `await` on a non-thenable returns
  the value, so an old synchronous adapter still works, and a synchronous
  THROW from `adapter.launch` is converted to a rejection by the async arrow
  and folded by runStepAsync. Both arms hold.

## FINDING 4 (LOW, tracked): the evidence the kernel now trusts is written
## inside a directory the payload itself can reach

The precondition moves trust from "the adapter's report" to "the turn-end
artifact". That artifact lives at tasks/<id>/turn-end, and the payload's HOME
is redirected to tasks/<id>/scrub-env/home (src/exec/env.ts), so the payload is
two `..` from the file whose presence now authorises deleting its own
redirected HOME. This is the same shape m4-prototype-probes.md item 3 measured
for the credential scrub: redirecting HOME hides a path from RESOLUTION without
removing WRITE access to the absolute path.

No harm today: spawnSync blocks until the payload exits, so `completed` cannot
be returned while the payload lives, and the hook rewrites the file after the
exit regardless. It becomes live with any adapter that does not block. Not a
reason to change this phase; a reason for the adapter phases to not read this
precondition as a boundary. TRACKED.

## What I tried to break and could NOT

- `await` on an adapter that returns a plain (non-promise) LaunchOutcome: works,
  so the interface change is runtime-compatible with a pre-M4 adapter.
- a synchronous throw from `adapter.launch`: the `async () =>` arrow converts it
  to a rejection and runStepAsync folds it. No unhandled rejection.
- a FIFO at the turn-end path: readRegularFileIfPresent classifies with
  lstat+stat and never opens, so it is a refusal and not a hang.
- a multi-line JSON.parse detail leaking a multi-line reason line: real (V8
  embeds the offending text, newlines included), but src/commands/spawn.ts:155
  applies singleLine() at the CLI boundary, so the user-visible contract holds.
  Withdrawn as a finding.
- a stale turn-end from a previous incarnation of the task id (the work
  history's own OPEN QUESTION): unreachable. taskDirOccupied (src/task.ts:406)
  refuses any non-empty task directory before pool create, so the precondition
  cannot read another incarnation's record.
- a false negative on the shipped path: the generated hook writes exactly
  {endedAt: string, exitCode: integer} (src/hooks.ts:54) and the adapter returns
  `completed` only after the hook child exits 0, so no previously-successful
  spawn becomes a refusal.
- runStepAsync drift from runStep: bodies are character-identical and both
  return the same exported StepResult<T> (src/task.ts:437). The watcher has one
  import site and one call site and no definition left.

## What the fix for finding 1 actually costs, so it is not read as a one-liner

Adding `consumesExternalOutput` to the two spawn specs then engages rule (c)
(src/witness/run.ts:1243-1274): each cited capture must EXIST, be NON-EMPTY,
and at least one capture's BASENAME must be referenced from the named tests'
own sources. So it needs a real captured-output file under witness/captures/
and a reference to it from test/spawn.test.ts. witness/citation-na-precondition.json
is the worked example already in the tree.

That is the right outcome rather than a tax: test/spawn.test.ts asserts on the
behaviour of a module that spawns children, and rule (f) exists to make such a
test anchor on real captured output instead of hand-written strings.

## My own suite run, complete sentence with the fourth qualifier

Interpreter node v26.6.0 (/home/user/n26/node-v26.6.0-linux-x64/bin/node),
`dist/` BUILT (npm ci exit 0, npm run build exit 0, `git status --porcelain`
empty after it), invocation `npm test`, tree a REAL GIT CHECKOUT (git clone,
not a `git archive` copy), head b12dc98, machine load average 53 to 66 with up
to 48 concurrent `node --test` processes throughout:

    tests 855, pass 852, fail 3, cancelled 0, SKIPPED 0, exit 1,
    duration_ms 1094987

855 matches the work history's 855 exactly. The three failures:

1. test/coverage-gate.test.ts "the coverage gate against the real migration
   table ... units 115":
   `pattern ^(?:R-[0-9]+[a-z]?)$ did not complete within 250ms against a value
   of length 6 (possible catastrophic backtracking)`
2. test/coverage-gate.test.ts "deleting an appendix row is red naming the
   orphan id":
   `pattern ^(?:M([0-9]+)-P[0-9]+)$ did not complete within 250ms against a
   value of length 5`
3. test/gates.test.ts:3571 "a precondition command exiting nonzero is error...":
   `Cannot find module '<scratchpad>/m4p2/bin/tiphys.ts'` from the unprivileged
   uid. That is the /tmp/claude-0 traversal trap of standing warning 1, a
   property of where MY clone sits, not of the branch.

(1) and (2) are exactly the signature the work history documents, on patterns
that plainly cannot backtrack, and they are a SECOND independent instance in
two different tests from the ones the implementer hit, which strengthens their
report rather than contradicting it.

None of the three is in spawn, task, watcher, teardown or credentials-gate. The
branch's own tests all pass. Criterion 8 holds on the code; the suite exit is
1 for environment reasons in my clone.

## Verdict: FIX-ROUND-NEEDED

One blocking item (finding 1: the required `red-witness` gate is RED on this
exact head, executed, not deduced). Findings 2, 3 and 4 are TRACKED under
DR-0027 and do not by themselves bar the merge.

The rest of the phase is the best-evidenced work history I have reviewed in
this repository: the derivations are published with full output, the
not-covered statement is honest, the claim greps are clean, the red witnesses
are real, and the implementer found and fixed a green-and-worthless assertion
block in their own test by asking what it proved.
