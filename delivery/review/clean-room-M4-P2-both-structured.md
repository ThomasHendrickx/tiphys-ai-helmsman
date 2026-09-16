# M4-P2 clean-room review by Claude Fable 5.1 (claude-fable-5-1), Anthropic model family

## phase

M4-P2 (branch claude/m4-p2-async-launch, head b12dc98, phase-own commits from f87bedc on top of the shared planning tip 6961186; 3b40118 is origin/main and the branch also carries the orchestrator's unmerged M4 paperwork)

## verdict

APPROVE

## framing

EVIDENCE INTEGRITY: every work-history claim treated as unproven until re-run or traced to a raw capture; attention on src/spawn.ts, src/task.ts, src/watcher.ts.

## derivation_honesty

The work history (delivery/work-history/m4-p2.md:302 onward and :757 onward) states what its derivations did NOT cover, and every admission I checked is accurate rather than understated. The `.launch(` derivation excludes untracked files, computed-property access and out-of-repo consumers, each with a reason; the second missing file (witness/) was found by executing the delivered coverage rule, not by grep, and it says so. The not-covered list names: the red-witness gate verdict (unrun, shallow clone at the time), the pre-existing watcher flake rate, the scope gate (branch topology), the FIFO arm, the --allow-pr-credentials composition, record-content beyond shape, a stale turn-end from a previous incarnation (marked OPEN QUESTION), and read/removal concurrency. I settled three of these myself: the FIFO arm refuses in 375ms with the scrub root intact; the allow-pr-credentials composition refuses with a message that omits the scrub root and stages none; the stale turn-end is unreachable because taskDirOccupied (src/task.ts:406, readdirSync length > 0) refuses at src/spawn.ts:426 before the precondition. Nothing admitted is worse than it sounds; one admission (record content not compared with the adapter's report) is plan-sanctioned and I confirmed it by probe: record exitCode 3, adapter 0, endedAt "not-a-date" is ACCEPTED and reported as exit 0.

## what_i_tried_to_break

SHIPPED CODE. (1) Confirmed by diff that subprocessAdapter's body is unchanged except the signature line. (2) Sync throw inside a non-async adapter: wrapped by `async () => adapter.launch()` so it becomes a rejection caught by runStepAsync. Held. (3) Legacy adapter returning a plain outcome: await on a non-promise works. Held. (4) Hook writes {endedAt ISO string, exitCode integer-validated} at exactly turnEndPath (src/hooks.ts:46-63); the shape check matches. Held. (5) Resident watcher racing the precondition: watcher never unlinks/renames turn-end (its rename at src/watcher.ts:744 is the check request). Held. (6) FIFO at turn-end: refused, no hang, 375ms. Held. (7) allow-pr-credentials + fabricated completion: refused, no scrub root named or staged. Held. (8) Stale record from a prior incarnation: refused by CR-301 first. Held. (9) Disagreeing record: accepted (plan-sanctioned, disclosed). (10) CLI src/commands/spawn.ts:142 awaits spawnTask, refusal is one stderr line + exit 1. (11) C-1/C-2/C-3: no log-tail reads, no pid, the promise is awaited inside spawnTask. Held. WITNESSES: spec 1's two members are structurally different (guard deleted vs weakened to an existence check; the WH's pass 1 / fail 1 asymmetry is corroborated). Spec 2 member 0 (runStep for runStepAsync) is the real unawaited state; member 1 (rethrow in src/task.ts) exists for coverage and reddens by making spawnTask throw, not by rolling anything back; the rollback-shaped labs DS-C and DS-D are hand-run only and not in the spec. Spec 3's two members are one reintroduction with two different bugs (no await vs misclassification); I accept the WH's own weaker reading as a real caveat. I verified the implementer's harness verify-witness.mjs (find must occur exactly once, pattern flag before path, red then green) and raw logs dsB2.log / dsD.log match the WH verbatim. GUARDS THAT CANNOT GO RED: the behaviors-resolve test derives the owned set at run time and asserts non-empty; the residue assertions were shown non-vacuous by DS-D (meta.json first failure). COUNT PINNING: none; the resolution test asserts by name. CLAIM GREPS: 5 line hits, 5 wrap-insensitive (no wrap miss), passive form 4 hits; all quoted titles, captured output or negations. SCOPE: real gate run in a staged clone whose trunk is 6961186: RED for the predicted reason (no declaration at merge base); with the declaration staged at the merge base: GREEN, 10 paths audited. No other wave-1 branch touches any of this phase's files. BYTES: scripts/check-authored-bytes.mjs exit 0. WHAT DID NOT HOLD ON MY SIDE: my first worktree at scratchpad/m4p2 was clobbered by a sibling agent (now a foreign `git clone`, reflog `clone:` then `checkout:`), so my first suite run is discarded; the re-run in a uniquely named worktree was forced to report before completion.

## suite_reproduced

PARTIAL, and stated as such. Interpreter node v26.6.0 (/home/user/n26-review, home-dir prefix to avoid the /tmp/claude-0 traversal trap), dist BUILT (npm run build exit 0, git status clean), invocation `npm test`, tree = git WORKTREE (fourth qualifier), head b12dc98, load 29 to 67 on 4 CPUs (three reviewers' suites concurrent): at the forced reporting time 224 pass, 2 fail, 0 skipped so far, incomplete. Both fails are in test/coverage-gate.test.ts, the file the WH names as the wall-clock false-red signature (REGEX_EXEC_TIMEOUT_MS at src/gates/coverage.ts:235); I did not read their assertion text and do not attribute them. The WH's own sentence (855 pass, 0 fail, 0 skipped, exit 0 at abe1689, v26.6.0, dist built, npm test) does NOT name the tree kind; it was a git worktree under .claude/worktrees per verify-witness.mjs's root path, so the fourth qualifier is satisfied by inference, not by its text. Base established by the WH before any edit (849 tests, 848 pass, 1 fail at test/watcher.test.ts:723) and I did not reproduce the base. The red-witness gate did not start in my run; its verdict is unobserved by me and must come from CI with fetch-depth 0. My real scope gate run: green with the declaration staged at the merge base.

## citation_hit_rate

57 distinct path:line tokens in the work history; 16 sit inside a fenced pre-change block the gate treats as quoted. Of the 41 prose citations I resolved every one against the head tree: 36 exact, 2 STALE (test/spawn.test.ts:1032 and :1118, shifted by the final commit abe1689; the sentinel test is at 1047 and the resolution test at 1134, both resolving silently into the wrong test), 1 off by one (CLAUDE.md:14, the sentence is at :15-16), 2 marginal (src/witness/run.ts:682 is the doc comment above findOccurrenceLines at :686; m4-conflict-pre-pass.md:13 is the table's first row). Rate 36/41 exact, 38/41 acceptable. Criterion 5's `sed -n '1031,1069p'` count of 0 was measured over a range that at head straddles two tests; re-measured over the real range 1048-1085: still 0, so the claim stands and only the evidence range was stale. The citations gate is not-applicable to delivery/work-history/, so nothing reddens.

## not_read

The full text of delivery/plan/kernel-plan-m4.md beyond the M4-P2 section and headings; the ten probe beacons under delivery/evidence/m4-probes/ (only the summary delivery/verification/m4-prototype-probes.md was read in full, and the WH contradicts none of its twelve items); the DR-0035 to DR-0043 records on the branch (orchestrator paperwork, not phase work); src/witness/run.ts refusal rules (b), (a), (e), (g) were not executed by me either; the assertion text of the two coverage-gate failures in my partial suite run.

## findings

### 1. [MEDIUM] The real scope gate cannot go green on this branch as cut: the declaration delivery/plan/phase-declarations/m4-p2.json is created BY the phase, as the plan instructs, so it is absent at the merge base and the gate reds before auditing anything. This will recur for every M4 phase whose plan lists its declaration as '(create)'.

- **citation**: src/gates/scope.ts:986; delivery/plan/kernel-plan-m4.md:356; delivery/work-history/m4-p2.md:765

- **evidence**: Staged clone with origin/main forced to 6961186: `gates run --only scope --phase m4-p2 --base origin/main --head HEAD` -> red: 'no phase declaration exists at delivery/plan/phase-declarations/m4-p2.json in the merge base 6961186...'. With the declaration committed onto the trunk and merged into the branch: green, '10 changed path(s) audited ... (2 declared path(s) not touched: delivery/plan/phase-declarations/m4-p2.json, test/watcher.test.ts)'. Scope gate reads both declarations (src/gates/scope.ts:986-989) but only after the merge-base one exists.

- **reaches_shipped**: Reaches no shipped file; it reaches the pull request's required `scope` check and therefore the DR-0012 merge precondition. Not a defect in the change. TRACKED for the orchestrator: land the declaration on main first or cut M4 phase branches from a trunk that carries it.

- **recommendation**: Orchestrator action, not a fix round: commit the eleven wave-1 declarations to the trunk the branches are cut from before opening PRs, or accept that the PR's scope verdict is supplied by the staged-clone reproduction above (green).

### 2. [LOW] Two work-history citations are stale after the final commit abe1689 and resolve silently into the wrong test, which is the exact trap CLAUDE.md rule 3b names: test/spawn.test.ts:1032 (criterion 5, the sentinel test) points inside the rejection test; test/spawn.test.ts:1118 (criterion 7) points at a closing brace. CLAUDE.md:14 is off by one.

- **citation**: delivery/work-history/m4-p2.md:716; delivery/work-history/m4-p2.md:718; delivery/work-history/m4-p2.md:742

- **evidence**: git show b12dc98:test/spawn.test.ts line 1032 = `assert.equal(existsSync(taskDirOf(scratch, "t-launchfailed")), false);`, line 1118 = `},`; the sentinel test starts at 1047-1048 and the resolution test at 1134. Criterion 5's grep re-measured over 1048-1085: 0 timing APIs, so the claim itself stands.

- **reaches_shipped**: Cannot reach a shipped artifact; work-history prose only, and the citations gate is not applicable to delivery/work-history/. Tracked.

- **recommendation**: Re-point the two lines to 1048 and 1134 and CLAUDE.md:14 to :15 in the next commit that touches the work history; no fix round.

### 3. [LOW] witness/spawn-rejected-launch-rolls-nothing-back.json carries no rollback-shaped dangerous state. Member 0 is the unawaited launch (real), member 1 rethrows inside runStepAsync and reddens by making spawnTask throw. The two labs that actually showed the residue assertions are non-vacuous (DS-C: rollback on rejection refused by pool destroy; DS-D: unlink half only, meta.json first failure) were run by hand and are not registered, so the gate will not re-verify that property on a future edit.

- **citation**: delivery/work-history/m4-p2.md:660

- **evidence**: Spec members at witness/spawn-rejected-launch-rolls-nothing-back.json (both quoted in the review); DS-C and DS-D captures at delivery/work-history/m4-p2.md:642 and :666, corroborated by scratchpad dsD.log 'meta.json was unlinked by a rollback that should not have run'.

- **reaches_shipped**: Cannot reach a shipped artifact; witness/ specs are gate input under test/-equivalent rules. Tracked.

- **recommendation**: Add a third member replacing `return {ok:false, reason: ...}` in the rejection arm with the unlink loop, so the gate guards the residue assertions' non-vacuity rather than a hand lab.

### 4. [LOW] The completion precondition accepts any record with a string endedAt and an integer exitCode, without comparing exitCode to the adapter's report or parsing endedAt, and the test adapters write the record themselves, so 'the payload's own artifact' is in practice 'any file of the right shape at the right path'.

- **citation**: src/spawn.ts:326

- **evidence**: My probe: adapter reports exitCode 0, record says exitCode 3 and endedAt 'not-a-date' -> spawnTask ok=true, exitCode 0. Plan step 5 says 'if it parses, the spawn proceeds exactly as today' (delivery/plan/kernel-plan-m4.md:376), and the WH discloses it at delivery/work-history/m4-p2.md:827.

- **reaches_shipped**: Reaches src/spawn.ts, but the behaviour is the one the plan authorises and the phase states it rather than hiding it; no user-visible command is made wrong relative to the plan. Tracked for M4-P3/M4-P4 where the executor record gets a schema.

- **recommendation**: When M4-P3 schemas executor.json, have the precondition compare the record's exitCode with the adapter's report and refuse on disagreement; a tuition-grade guard should not be satisfiable by the party it guards against.

### 5. [LOW] Environment, for the orchestrator's tuition rather than the phase: the scratchpad directory is shared across every concurrent agent, and a sibling reviewer replaced my `scratchpad/m4p2` worktree with a `git clone` mid-suite (files vanished under a running test run; 53 MODULE_NOT_FOUND / ENOENT failures that were nothing to do with the branch). git's worktree registry still points at a path that is now a foreign clone.

- **citation**: CLAUDE.md:565

- **evidence**: `ls -ld scratchpad/m4p2/.git` -> directory; `git -C scratchpad/m4p2 reflog` -> 'clone: from /home/user/tiphys-ai-helmsman' then 'checkout: moving ...'; `git worktree list` still lists that path at b12dc98 (detached). The WH's own harness scripts (verify-witness.mjs, harm-probe.mjs) live in the same shared directory.

- **reaches_shipped**: Cannot reach a shipped artifact. Tracked: agents in one scratchpad must use unique directory names, and a suite result from a shared directory is not evidence until the directory's identity is checked.

- **recommendation**: Record as tuition; brief every concurrent agent to suffix scratch directories with something unique and to check `.git` is a file before trusting a worktree.


---

# M4-P2 clean-room review by Claude Opus 5 (claude-opus-5)

## phase

M4-P2 (branch claude/m4-p2-async-launch, head b12dc98, base 3b40118, true phase base 6961186)

## verdict

FIX-ROUND-NEEDED

## framing

Correctness and data loss: I assumed the change can destroy work and looked for the path, then checked whether the guards it adds can actually be shown red.

## derivation_honesty

HONEST, and unusually good, with ONE gap that turned out to be decisive. The work history carries two separate not-covered blocks: a per-derivation one after the `.launch(` enumeration (five items, naming tracked-files-only scope, computed-property/spread access, out-of-repository consumers, delivery/ documents, and an admission that this derivation could not have found the missing witness/ directory) and a phase-level one (six items). Two of its admissions are BETTER than they sound: the "stale turn-end from a previous incarnation" OPEN QUESTION is closed by taskDirOccupied at src/task.ts:406, which refuses any non-empty task directory before pool create, so no stale record can exist; and rule (b) of the red-witness gate, which it deduced, I executed and it holds (all three spec behavior ids resolve in test/behaviors.json). One admission is WORSE than it sounds, and it is finding 1: the work history says the red-witness gate CANNOT RUN in this container and names the rules it reasoned about as (b), (a), (e), (d) and (g). Rules (c) and (f) are not in that enumeration at all. Rule (f) is the one that bites. So the not-covered statement is honest about the CONCLUSION being deduced, but the ENUMERATION OF RULES it deduced over is itself incomplete, which is the exact "a search whose scope is wrong returns an empty result indistinguishable from an absence of defects" shape the contract's item 3 exists to catch, one level up. The reviewer-visible tell was available: the document lists five rule letters out of at least seven that the source defines.

## what_i_tried_to_break

I attacked the shipped data-loss path first and it held in every arm I could reach. (a) `await` on an adapter that returns a plain non-promise LaunchOutcome still works, so a pre-M4 adapter is runtime-compatible. (b) A synchronous throw out of `adapter.launch` is converted to a rejection by the `async () =>` arrow and folded by runStepAsync, so no unhandled rejection escapes. (c) A FIFO at the turn-end path is a refusal and not a hang, because readRegularFileIfPresent classifies with lstat+stat and never opens. (d) I tried to make the new precondition a false NEGATIVE on the shipped path: the generated hook writes exactly {endedAt: string, exitCode: integer} (src/hooks.ts:54) and the adapter returns `completed` only after that hook child exits 0, so no previously-successful spawn becomes a refusal. (e) I tried to make the refusal leak a multi-line reason line through a multi-line JSON.parse detail; the detail IS multi-line in V8, but src/commands/spawn.ts:155 applies singleLine() at the CLI boundary, so I withdrew it. (f) I tried to make the rollback destroy committed work: poolDestroy is called with discard:false and deleteBranchForce:false and refuses both a dirty worktree and a branch carrying commits beyond base (src/pool.ts:780-831), so the agent's work survives. (g) I re-ran both members of the completion witness myself against mutated clones and reproduced the implementer's numbers exactly, including the asymmetric pass-1-fail-1 of the existsSync-shaped weakening. (h) I re-ran the whole suite in a real git checkout on node v26.6.0 with dist built and got the same 855 total. Where it did NOT hold was one level out from the code: I executed the red-witness gate itself in a non-shallow clone and it is RED.

## suite_reproduced

YES, and it agrees on the total. Interpreter node v26.6.0 (/home/user/n26/node-v26.6.0-linux-x64/bin/node), dist/ BUILT (npm ci exit 0, npm run build exit 0, git status --porcelain empty after it), invocation `npm test`, tree a REAL GIT CHECKOUT (git clone, not a `git archive` copy), head b12dc98, machine load average 53 to 66 with up to 48 concurrent `node --test` processes: tests 855, pass 852, fail 3, cancelled 0, SKIPPED 0, exit 1, duration_ms 1094987. 855 matches the work history's 855 exactly. The three failures are: two in test/coverage-gate.test.ts with `pattern ^(?:R-[0-9]+[a-z]?)$ did not complete within 250ms against a value of length 6` and `pattern ^(?:M([0-9]+)-P[0-9]+)$ did not complete within 250ms against a value of length 5`, which is precisely the wall-clock false-red signature the work history documents (and they are two DIFFERENT tests from the ones the implementer hit, so this is a second independent instance that strengthens their report); and one in test/gates.test.ts:3571 with `Cannot find module '<scratchpad>/m4p2/bin/tiphys.ts'` from the unprivileged uid, which is the /tmp/claude-0 traversal trap of standing warning 1 and is a property of where MY clone sits. None of the three is in spawn, task, watcher, teardown or credentials-gate. The work history's own suite sentence carries interpreter, build state, invocation, head, pass count and SKIPPED count; it does NOT carry the fourth qualifier (checkout versus archive tree). The base was established FIRST, at 6961186, 849 tests / 848 pass / 1 fail, before any failure was attributed to the change.

## citation_hit_rate

44 of 46 assertive citations resolve to what is claimed, 96%. I sampled 50 distinct path:line tokens and resolved every one at head b12dc98. 41 exact; 3 near (a doc block immediately above the named symbol, or a paragraph offset): src/witness/run.ts:682, src/gates/coverage.ts:253, CLAUDE.md:14; 2 WRONG and silently resolving into an unrelated test, both in the criteria walk: test/spawn.test.ts:1032 (cited for criterion 5, is inside the launch-failed test; the sentinel test is at test/spawn.test.ts:1047) and test/spawn.test.ts:1118 (cited for criterion 7, is inside the deferred test; the criterion-7 test is at test/spawn.test.ts:1134). A further 10 tokens are pre-change line numbers inside a captured `git grep` block, and the document declares them as such on the line immediately after the capture, so I did not count them against the rate.

## not_read

I did not read the whole 3719-line delivery/plan/kernel-plan-m4.md, only the M4-P2 section and its neighbours (lines 310 to 470). I read only the first 120 lines of delivery/verification/m4-prototype-probes.md, so probes 7 to 14 are unread; nothing in 1 to 6 contradicts the work history. I did not read the ten beacon files under delivery/evidence/m4-probes/, nor the nine new decision records, nor delivery/plan/m4-intake.md, nor delivery/plan/pstack-borrow-review.md; those are on the branch only because it was cut from the unmerged plan branch and are not this phase's subject. I did not read test/watcher.test.ts in full (the phase does not edit it) beyond confirming the named test exists at line 723 and that it contains none of the four destructiveCommands strings. I did not re-run the two members of witness/spawn-rejected-launch-rolls-nothing-back.json by hand, because the gate refused that spec before running any member; I verified members of the other two specs. I did not run the full gate bundle, only --only red-witness. I did not observe any CI run on this head.

## findings

### 1. [HIGH] The required `red-witness` gate is RED on this exact head. Both new spawn witness specs violate rule (f): they mutate src/spawn.ts, which is a CHANGED file whose head content matches SPAWN_GREP, so `consumesExternalOutput` is required and neither declares it. The work history deduced the gate green from an enumeration of rules ((b), (a), (e), (d), (g)) that never mentions rule (f) or rule (c).

- **evidence**: EXECUTED, not derived. My clone of this repository is NOT shallow (the implementer's worktree was), so I ran the gate:

  node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full --only red-witness --evidence <scratch> --base plan/pstack-borrow-review --head HEAD

  gates: declared 1 applicable 1 verdict 1 green 0 red 1 not-applicable 0 error 0 vacuous 0
  gates: red-witness: red: 3 witness(es) evaluated (3 own, 0 stored re-evaluated in 0ms); witness spawn-completed-without-turn-end-is-incomplete: red: rule (f): the phase diff touches src/spawn.ts, which the spawn/parse derivation (JS: child_process|execFile|spawnSync|execSync; shell *.sh: spawn-and-parse) matched, so consumesExternalOutput is required and this witness omits it; witness spawn-rejected-launch-rolls-nothing-back: red: rule (f): ... omits it
  gates: 1 gate(s) reported red: red-witness
  GATE_EXIT=1

The rule is at src/witness/run.ts:1277 and SPAWN_GREP at src/witness/run.ts:319. src/spawn.ts matches it 4 times. From the gate's own witness-records.json, both refused specs carry "members": [], so the refusal SHORT-CIRCUITS before any member runs: the two witnesses that guard this phase's destructive path are never exercised by the gate at all. The third spec, watcher-signal-surfaced-once, is GREEN in the same run with both members red over two repetitions then green, which independently discharges the deterministic/repeats:2 obligation the implementer could only deduce. Corroboration that rule (f) is a live obligation and not a reading of mine: witness/citation-na-precondition.json already in the tree declares consumesExternalOutput with the provenance note 'red-witness rule (f) binds this witness (SPAWN_GREP matches the changed file)'. `red-witness` is present in gates.manifest.json on this branch, so the CI pull_request bundle runs it and will report the same red.

- **reaches_shipped**: It does not itself edit a shipped file. Two things make it blocking anyway. First, it makes a REQUIRED gate red on the exact head, and DR-0012 conditions delegated merge authority on CI green on that exact head, so the merge is barred mechanically rather than by a severity label. Second, and this is the shipped-surface connection: the phase's new destructive-path guard in src/spawn.ts (the completion precondition, src/spawn.ts:299 and src/spawn.ts:629) therefore ships with NO gate-executed red witness, because the gate refused both spawn specs before running a single member. The hand reproduction is good and I independently repeated it, but the gate's verdict on the shipped guard is currently 'refused', not 'green'.

- **recommendation**: Add `consumesExternalOutput` to witness/spawn-completed-without-turn-end-is-incomplete.json and witness/spawn-rejected-launch-rolls-nothing-back.json. Note this is not a one-line edit: rule (c) (src/witness/run.ts:1243) then requires each cited capture to EXIST, be NON-EMPTY, and have its basename referenced from the named tests' own sources, so it needs a real capture under witness/captures/ and a reference to it from test/spawn.test.ts. witness/citation-na-precondition.json is the worked example. That is the right outcome rather than a tax: test/spawn.test.ts asserts on a module that spawns children, and rule (f) exists to make such a test anchor on real captured output. Re-run the gate before pushing; it runs here.

### 2. [MEDIUM] Criterion 5's evidence command audits the wrong line range, and two criteria-walk citations resolve silently into an unrelated test.

- **evidence**: The work history says criterion 5 is 'settled by a command over that test's own body rather than by reading it' and shows `sed -n '1031,1069p' test/spawn.test.ts | grep -cE "Date\.now|performance\.|setTimeout|hrtime"` returning 0. Measured at head b12dc98: the sentinel test is test/spawn.test.ts:1047 and runs to line 1086. Line 1032, cited in the criteria table for criterion 5, is `assert.equal(existsSync(taskDirOf(scratch, "t-launchfailed")), false);`, which is inside the PREVIOUS test. The audited range 1031-1069 therefore covers 16 lines of a different test and EXCLUDES lines 1070-1086 of the test it claims to audit, which is exactly where that test's two assertions live. I re-ran the same grep over the correct range 1047,1086 and also got 0, so the CONCLUSION survives, but the published evidence does not establish it. Same class: criterion 7 cites test/spawn.test.ts:1118, which is inside the deferred test; the criterion-7 test is at test/spawn.test.ts:1134. This is CLAUDE.md:202's 'a branch-line citation that happens to be IN range resolves SILENTLY, against the wrong line', in a work history that cites CLAUDE.md:202 correctly elsewhere.

- **reaches_shipped**: I cannot name a shipped file or user-visible command this reaches. It is a work-history evidence defect, so it is TRACKED rather than blocking under DR-0027. It matters because it is the evidence for an acceptance criterion in the one class of document a later reviewer trusts.

- **recommendation**: Re-run the criterion 5 command over 1047,1086 and paste the corrected capture; correct the two criteria-table citations to test/spawn.test.ts:1047 and test/spawn.test.ts:1134. Derive the range from the test's own start and end rather than typing it, so the next edit to a preceding test cannot silently slide it again.

### 3. [MEDIUM] The phase hardens `completed` against a lying adapter but leaves `launch-failed`, the only arm that destroys the task's records, believed on the adapter's word, and the evidence that would refute it is the turn-end record the new function reads ten lines above.

- **evidence**: src/spawn.ts:130 now invites window and cloud-session adapters the kernel did not write, and src/spawn.ts:274 states the rationale: `completed` can no longer be taken on the adapter's word. The same reasoning applies verbatim to `launch-failed`, which calls rollback() at src/spawn.ts:451. Nothing checks it. What a false `launch-failed` costs, read from src/pool.ts:776-834: poolDestroy is called with discard:false and deleteBranchForce:false, so it REFUSES a dirty worktree and REFUSES a branch carrying commits beyond its recorded base. The agent's WORK therefore survives. What does not survive is the unconditional half that runs FIRST: brief.md, meta.json, turn-end-hook.mjs and executor.json are unlinked and the scrub root is removed before poolDestroy is ever called. Teardown then refuses with 'no readable task meta for task id <id>; teardown needs tasks/<id>/meta.json' (src/teardown.ts:189-195), and the rollback's own failure message ('rollback of the worktree did not complete: ...') names no route out, so the surviving worktree is unreachable by the documented command. Related and to the implementer's credit rather than against them: the plan's criterion 4 calls the dangerous state 'a rejection destroying a worktree that may hold real work', and the work history's DS-C capture shows that is not what happens; the tests assert the corrected version.

- **reaches_shipped**: It reaches src/spawn.ts, which is shipped, but I CANNOT name a user-visible command that triggers it today: subprocessAdapter returns `launch-failed` only before the payload spawn or when spawnSync itself errored (src/spawn.ts:206-224), so the payload provably never started and rollback's stated precondition holds. It becomes reachable the moment a second adapter ships (M4-P3, M4-P4, M4-P8). TRACKED, not blocking.

- **recommendation**: Do not fix it inside this phase: the plan authorised the `completed` check only, and binding convention 2 says if it is not written there it is not being made. Raise it with the orchestrator as a plan item for the adapter phases, phrased as the mechanism rather than the instance: 'an arm whose destructive action rests on an adapter's unverified assertion'. The turn-end record refutes a false `launch-failed` as directly as it refutes a false `completed`.

### 4. [LOW] The artifact the kernel now trusts as proof that the payload ended sits inside a directory the payload itself can write.

- **evidence**: The precondition moves trust from the adapter's report to tasks/<id>/turn-end. The payload's HOME is redirected to tasks/<id>/scrub-env/home by the credential-store redirections, so the payload is two path segments from the file whose presence authorises deleting its own redirected HOME. delivery/verification/m4-prototype-probes.md item 3 measured the same shape for the scrub itself: redirecting HOME hides a path from RESOLUTION without removing access to the absolute path, and the child runs at the same uid.

- **reaches_shipped**: It reaches src/spawn.ts, which is shipped, but there is no harm on the shipped path: spawnSync blocks until the payload exits, so `completed` cannot be returned while the payload lives, and the hook rewrites the file after the exit regardless. TRACKED.

- **recommendation**: Nothing to change here. Record it so the adapter phases do not read the completion precondition as a security boundary; it is an evidence check against an honest-but-wrong adapter, not against a hostile payload.

### 5. [LOW] The watcher witness's two members are anchored on the same overlapping site, and the dangerous state they encode is one this phase's diff cannot produce.

- **evidence**: Member 0's `find` ("  runStepAsync,\n  turnEndPath,\n} from \"./task.ts\";\n") is a strict SUBSTRING of member 1's ("  runStep,\n  runStepAsync,\n  turnEndPath,\n} from \"./task.ts\";\n"), so rule (g)'s file-plus-find equality check (src/witness/run.ts:1368) passes for a reason unrelated to the members being different sites. The work history argues the difference substantively and offers the weaker reading itself; I agree with the stronger reading, because member 0 leaves surfaced.value a pending promise while member 1 awaits correctly and then misclassifies success as failure, and the gate confirms both red over two repetitions. The deeper point is that this phase's watcher change is a de-duplication, so there is no dangerous state it can reach: the witness exists to satisfy the gate's coverage rule for a changed src file, and both members re-introduce a hand-authored defect.

- **reaches_shipped**: I cannot name a shipped file this makes wrong. witness/ is not on DR-0027's shipped surface. TRACKED.

- **recommendation**: No change in this phase. The work history's own note that 'this is a gap every M4 KERNEL phase will hit' is the right escalation: the coverage rule forces a witness for every changed src file whether or not the change has a hazard, and the orchestrator should decide whether a de-duplication needs one.


---
