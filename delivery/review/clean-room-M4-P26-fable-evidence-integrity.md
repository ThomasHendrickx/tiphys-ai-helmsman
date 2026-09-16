# Clean-room review: M4-P26 (branch claude/m4-p26-rollback, head 7dcce83, base de9b386)

Reviewer: Fable 5.1 (clean-room, evidence-integrity framing).
Started: 2026-09-16. Written incrementally; this file is the beacon.

## 0. Setup

- Branch resolved locally at `.claude/worktrees/wf_2b81e806-d59-1`, head 7dcce83.
- Base de9b386 is an ancestor of the branch (git log shows it), 18 commits on top.
- Diff: 18 files, +4585 -1.

## Log (appended as work proceeds)

### Read so far (all 18 files in the diff read in full, plus plan section 3334-3600, probes 8 and 9, pre-pass wave 1b)

Candidate findings to test, not yet graded:
- C1. `targetFor` returns `record.restoreTo` for `retirement-unmet`; after one rollback restoreTo becomes the previous state, so a SECOND `rollback --trigger retirement-unmet` flips every switch FORWARD to `kernel`. Work history says "Nothing here flips a switch forward". Test by running twice.
- C2. `inFlightItems` fails OPEN: meta.json `refused` (irregular/unexaminable) is skipped; turn-end `irregular`/`unexaminable` is treated as finished. Only unparseable meta.json counts. Test with a FIFO.
- C3. The atomic temp+rename write has no red witness: the criterion-2 test injects the failure in the in-memory observer, so a plain `writeFileSync(path, body)` would stay green. Test by mutation.
- C4. `syncFleetState` does `git add -A` over the whole fleet home, so a rollback commit carries whatever else is dirty.
- C5. Witness spec `cutover-rollback-atomic` member 2 removes the try/catch: red because the throw propagates, not because the file changed.
- Claim grep: 64 line-visible, 64 wrap-insensitive (matches the work history). rollback.md: 10/10.
- ASCII check on the scratch clone at 7dcce83: exit 0.

## 1. Derivation honesty (first check)

The "WHAT THE DERIVATION DID NOT COVER" section lists four exclusions: scoped to the two cutover source files (with a grep showing no other src/bin file mentions cutover), exported sites only, the pilot, and the rehearsal script line by line. Item 4 records that a prediction about `observe()` was measured and found wrong. This is honest and specific. What it admits that is worse than it sounds: item 2 (exported sites only) is where the fail-open drain arms live (`isDirectory`, the `continue` on a refused meta.json, the `irregular` turn-end), and the derivation table's row for `inFlightItems` lists W5a/W5b, which are both "counts too many" members; no member is "counts too few", and that is the dangerous direction for a drain predicate. Also `readRetirementInventory` is admitted unwitnessed, which is fine.

## 2. Confirmed by execution (my own runs, scratch clone of 7dcce83, node v26.6.0)

### F1 (HIGH): `rollback --trigger retirement-unmet` is not idempotent; a second run flips all five switches FORWARD to `kernel` and pushes it, exit 0.
exp-idempotence.mjs against the branch's modules: initial kernel/current x5; run 1 exit=0 -> current/kernel x5; run 2 exit=0 -> kernel/current x5; origin/main cutover.json closeout = state kernel, flippedBy "tiphys cutover rollback". Mechanism: `targetFor` returns `record.restoreTo`, and `planRollback` rewrites `restoreTo: record.state`, so the target of a repeated rollback is the state it just left. The work history's boundary table says "writing a switch to kernel: NO. Not built. Nothing here flips a switch forward" (delivery/work-history/m4-p26.md, boundary table) and the module header says "does not write switches to kernel". Both false. The exposed path is the documented failure arm: step 1.3 exits nonzero when the push does not land, the file is already rewritten and committed locally, and the natural retry re-runs the same command. For drain-reversal the second run is harmless to state but overwrites restoreTo to current/current, losing the record of what the switch left.

### F2 (MEDIUM): drain fails OPEN on an unexaminable meta.json and on an irregular turn-end.
exp-drain.mjs: five tasks, all status open where readable: turn-end is a FIFO -> NOT in flight; turn-end is a directory -> NOT in flight; meta.json is a FIFO -> NOT in flight; meta.json unparseable -> in flight ("meta.json is unparseable"); control (no turn-end) -> in flight. classifyEntry on the FIFO turn-end returns kind "irregular". So a task whose turn-end is a named pipe (the T-003 hazard shape) reads as finished and drain reads clean. The code's own comment for unparseable meta.json ("not evidence that the task finished, so it counts as in flight") states the right rule and the neighbouring arms do the opposite. Both witnesses W5a/W5b are "counts too many" members; nothing reddens on "counts too few".

### F3 (MEDIUM): the atomic temp+fsync+rename write has no red witness.
Mutation: `publishCutoverState` replaced by `mkdirSync; writeFileSync(path, body)`. `node --test test/cutover.test.ts`: 27 tests, 27 pass, 0 fail, EXIT=0. The document says "The rewrite is ATOMIC ... published by one rename ... the two witnesses are at test/cutover.test.ts:135 and :177"; criterion 2 asks for an injected WRITE failure. The shipped witness injects a throw in the in-memory observer, which is red only against a per-switch publish (W1a). The rename property itself is asserted in prose.

### F4 (MEDIUM, evidence integrity): a claimed manual re-verification of citations did not happen at the head it describes.
rollback.md and the work history cite test/cutover.test.ts:135 and :177 as "the two atomicity witnesses". At 7dcce83 line 135 is a comment inside the git-contract test and 177 is `writeFileSync(join(root, "untracked.txt"), ...)`; the atomicity tests are at 210 and 252. The lines were correct at 623e17d and went stale at f42217c (the git-contract test was inserted above them). The sentence "The document's own citations were also re-verified by reading each target line directly: ... test/cutover.test.ts:135 and test/cutover.test.ts:177 are the two atomicity witnesses" was added at 6cca9b1, AFTER f42217c. The citations gate resolved them silently because both are in range, which is the CLAUDE.md 3b trap verbatim.

### F5 (LOW): `syncFleetState` runs `git add -A` over the whole fleet home.
exp-addall.mjs: a rollback commit "cutover rollback: drain-reversal" carried backlog.md (an unrelated half-written edit) and tasks/t1/scratch.txt alongside cutover.json. The rollback commit is not scoped to the switch file, so it publishes whatever else was dirty under the rollback's name.

### Rehearsal arms re-run by me: drain-reversal 0, retirement-unmet 1, retirement-unmet --port 0, freeze-point-restore 3 (one REFUSED line), freeze-point-restore-input 0; SELF-CHECK OK on all five, zero MISMATCH lines. Matches the work history.

### Scope: all 18 changed files are within the declaration (five plan files + witness/ + the three standing extras). `witness/` is on the declaration but not on the plan's list; no other branch adds witness/cutover-* or touches the five plan files. M4-P27 touches delivery/plan/cutover/entry-trigger.md (a different file in the same new directory), no collision.

## 3. The checklist, in the order given

1. Red witnesses. Nine gate specs, eighteen members, re-run by me through the gate: green, 9 evaluated, every member red. W8 (observe() always true) re-run by hand: 4 rehearsal tests red, EXIT=1. The pairs are genuinely different in seven classes. Two are weaker than stated: `cutover-rollback-atomic` member 2 (try/catch removed) is red because the observer's throw propagates, not because the file changed, so it is the same defect as member 1 seen from the exception side; and the drain class has no "counts too few" member (F2). The atomic write itself has no witness (F3).
2. Guard that cannot go red. F3 is one: the ATOMIC claim in the document and criterion 2's "write failure" are asserted by prose, and a plain write passes 27/27. F2 is the fail-open sibling.
3. Pinned counts over a registry. None found. The behaviors test asserts by name; `steps.length >= 12` is over the document, not a registry; `remoteBranches.length === 4` and `fields === 3` are over fixtures.
4. Claim grep. Line-based 64, wrap-insensitive 64 (matches the work history); rollback.md 10/10. I audited the pre-table hits; each has an adjacent capture or is a quoted program output, except the two boundary claims "Nothing here flips a switch forward" (work history line 43) and the module header's "does not write switches to kernel" (src/cutover.ts:25), which the claim grep cannot see (no trigger word) and which F1 shows false.
5. Suite sentence. The work history's sentence is complete (interpreter, build state, invocation, pass and skipped counts) and honest that the branch was never observed fully green. The BASE was measured under a DIFFERENT invocation (absolute-path npm, PATH unchanged), which the author admits, so the base's coverage-gate result under the same invocation was NOT established by them. I established it: test/coverage-gate.test.ts alone at de9b386, node v26.6.0 first on PATH, load average 26.78: 17 tests, 17 pass, 0 fail, 0 skipped; at 7dcce83 same: 17/17. My full-suite run at 7dcce83 is recorded in section 4 below.
6. Scope. Clean against the declaration; `witness/` is a plan gap the work history reports; no concurrent branch collides on any of the six paths. The scope gate is red for the merge-base declaration reason the work history states, which is an orchestrator grant, not a defect.
7. Citations. 25 sampled by reading the target line on the branch: 22 say what is claimed; 2 wrong (test/cutover.test.ts:135 and :177, F4); 1 off by one (src/fleet.ts:29 is blank, FLEET_IGNORED is at 28). Hit rate 22/25 = 88 percent.
8. C-1, C-2, C-3. Clean: state read from cutover.json and meta.json plus turn-end, no pid or process probing (temp name uses randomBytes), spawnSync throughout, nothing detached.

## 4. Verdict

FIX-ROUND-NEEDED. F1 is HIGH (a rollback verb that flips authority forward and pushes it, contradicting the phase's own boundary statement). F2, F3 and F4 are MEDIUM. Under DR-0012 any one of them bars the merge.

The mechanism, named for the fix round rather than the four instances: THE TARGET OF A RECOVERY ACTION IS DERIVED FROM STATE THE ACTION ITSELF REWRITES OR FROM AN ARM THAT WAS NEVER EXERCISED. F1 (target from restoreTo, which the rollback overwrites), F2 (finished-ness from an arm classified irregular, never exercised), F3 (atomicity from a write path never failed), F4 (a verification from a line number that moved).

## 5. My suite sentence

Interpreter node v26.6.0 (/home/user/n26/node-v26.6.0-linux-x64/bin/node first on PATH), fresh clone of 7dcce83 in the scratchpad, `npm ci` exit 0, `npm run build` exit 0, git status lines after build 0, invocation `NODE_OPTIONS=--test-reporter=tap npm test`, load average 16 to 28 during the run: 876 tests, 876 pass, 0 fail, 0 skipped, TEST_EXIT=0. This is the first fully green full-suite run of this branch that I know of; the work history's two red runs were coverage-gate wall-clock failures under load 46 to 51, and both the base (de9b386) and the branch pass test/coverage-gate.test.ts 17/17 alone under my load, so I agree with the attribution.

Not read: the M4 plan outside the M4-P26 and M4-P27 sections; delivery/verification/m4-prototype-probes.md beyond headings and sections 8 and 9; src/task.ts beyond classifyEntry, readRegularFileIfPresent and the status vocabulary; the scope gate was not run by me (checked by hand against the declaration); the base full suite under the toolchain-first invocation was not run (only coverage-gate alone).
