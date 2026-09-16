# Delta verification: the M4-P26 fix round

Subject: phase M4-P26, branch `claude/m4-p26-rollback`.
Reviewed head (both clean-room reviews): `7dcce83`.
Fix-round head under verification: `a0f8dcb0101523a9835d6b19d6b4517bc60e24ca`.
Delta verified: `git diff 7dcce83..a0f8dcb`, 25 files, +2859 -101.

**Verdict: APPROVE.** Every HIGH and MEDIUM either reviewer raised is closed AT
THE MECHANISM and I reproduced each one at `7dcce83` and showed it gone at
`a0f8dcb` with my own probe. Two new findings came out of attacking the round
(V-1, V-2). Both are gaps in WITNESS COVERAGE over code whose behaviour I
measured to be correct at this head, so under
delivery/decisions/DR-0027-reviews-target-shipped-value-not-ceremony.md:45,
"A gap reachable solely by a future editor of the guard itself is a TRACKED
ITEM, not a blocker", and the sentence at
delivery/decisions/DR-0027-reviews-target-shipped-value-not-ceremony.md:46,
"The severity label is not the test; reachability is", they are TRACKED and not
blocking.

## Citation discipline in THIS document

`git diff --name-only origin/main...HEAD` lists 60 paths, including
`src/cutover.ts`, `src/commands/cutover.ts`, `test/cutover.test.ts`,
`test/behaviors.json`, `witness/*`, `CLAUDE.md` and
`delivery/work-history/m4-p26.md`. Every reference to those is QUOTED, because
a line number into a file this branch changes points at a different line in the
base tree, and an in-range one resolves SILENTLY against the wrong line. The
resolving citations in this document are into files that are byte-identical on
both sides: src/task.ts:118, src/task.ts:179, and the decision record cited
above.

## Working copy and toolchain

Fresh `git clone --no-local` of the kernel repository into the scratchpad, at
`a0f8dcb`. `npm ci` exit 0, `npm run build` exit 0, `git status --porcelain`
clean afterwards except for this report. Interpreter for every measurement
below: node v26.6.0 at `/home/user/n26/node-v26.6.0-linux-x64/bin/node`.
The container default is v22.22.2, which is below the declared floor.

## 0. FIRST CHECK: the not-covered statement, run and then WIDENED

The fix-round contract's third item is the reviewer's first check. The work
history has one, section "WHAT THE DERIVATION DID NOT COVER", five numbered
exclusions, and two of them admit their own evidence is a READING rather than a
command. That is the honest shape rather than a claim of completeness.

### 0a. The author's derivation, re-run by me at `a0f8dcb`

```
$ grep -nE 'return \{ *(ok: true|kind: "read")|verdict: "ported"|^ *continue;' \
    src/cutover.ts src/commands/cutover.ts | wc -l
19
```

Nineteen sites, the same count the document reports, and the same paths. The
cast and `JSON.parse` enumerations also reproduce.
`grep -rln 'cutover' src bin scripts` prints exactly the three files named.

One difference worth stating: two line numbers in the document's fenced capture
(`1244`, `1290`) are `1263` and `1309` in my run, because the fix added lines
above them after the capture was taken. The document predicts exactly this and
explains it for the one row that RESOLVES; I re-read that row's target
(`src/cutover.ts:1288`) and it is correct at this head.

### 0b. Four widenings, each in a direction the author excluded

**Widening 1: the two files exclusion 1 names, `src/fleet.ts` and
`src/task.ts`.** The exclusion is scope-correct and NOT mechanism-correct: the
fail-closed property of both `inFlightItems` and `readRetirementInventory` is
inherited from `classifyEntry` (src/task.ts:118) and `readRegularFileIfPresent`
(src/task.ts:179), so a fall-through there reaches this phase's verdict.

```
$ grep -nE 'return \{ *(ok: true|kind: "read")|verdict: "ported"|^ *continue;' \
    src/fleet.ts src/task.ts scripts/rehearse-cutover-rollback.mjs
src/task.ts:200:  return { kind: "read", body };
src/task.ts:348:    return { ok: true };
src/task.ts:381:  return { ok: true };
src/task.ts:459:    return { ok: true, value: step() };
scripts/rehearse-cutover-rollback.mjs:574,578,582:      continue;
```

I read both helpers in full. Each reaches its benign outcome from a POSITIVE
test (`stats.isFile()`, `entry.kind === "regular"`); every other path is
`irregular`, `unexaminable`, `refused`, `absent` or `dangling`. No
fall-through. The widening returns nothing, and that is a measured result
rather than an unsearched region.

**Widening 2: the shape exclusion 2 admits its pattern cannot print** (a benign
outcome assigned to a variable, or a bare `return;`). The author settled this by
READING. Here is the command they did not write:

```
$ grep -nE '^\s*return;|^\s*return (true|false);' src/cutover.ts src/commands/cutover.ts
src/cutover.ts:999:    return true;
src/cutover.ts:1010:  return false;
src/cutover.ts:1063:        return;
src/cutover.ts:1072:        return;
src/cutover.ts:1078:        return;
```

Five sites the derivation never printed. All five are in `isEmptyValue` and the
`forEach` inside `generateRestoreRequest`; each bare `return;` pushes a REASON
on the line before it, so the outcome is a refusal. Nothing found, but the
author's exclusion was right that a command is what settles it.

**Widening 3: defaulting operators, which no part of the derivation covers at
all.** A `??` default IS a fall-through to a value, and the dangerous direction
is a default that is benign.

```
$ grep -nE '\?\?|\?\.' src/cutover.ts src/commands/cutover.ts
src/cutover.ts:378, 704, 705, 706
src/commands/cutover.ts:96, 168, 232
```

Seven sites. The one that could have mattered is `runGit`, where a null exit
status (a git killed by a signal) defaults to **1**, the FAILING value. The
`--root` default is an empty list and the next line refuses on
`roots.length === 0`. None defaults to a benign value.

**Widening 4: every write site against the repository's own
`refuseOpenForWrite` convention**, which the round conformed to without any
reviewer asking.

```
$ grep -nE 'writeFileSync|openSync|appendFileSync|createWriteStream|writeSync' \
    src/cutover.ts src/commands/cutover.ts
src/cutover.ts:265:    handle = openSync(temporary, "wx");
src/cutover.ts:266:    writeSync(handle, body);
src/commands/cutover.ts:294:    writeFileSync(target, outcome.text);
```

Two write sites. The command one is now probed. The other opens a
`randomBytes(8)` temporary with the `wx` flag, and rather than assert that the
flag makes a named pipe unreachable I measured it, with the plain `w` flag as
the control that shows the probe is capable of hanging:

```
$ mkfifo f
$ node -e "openSync('f','wx') then openSync('f','w'), timing each"
wx (the flag publishCutoverState uses) -> EEXIST after 1 ms
w (the flag it does not)               -> [no output; the process was killed by timeout]
PROBE_EXIT=124
```

`wx` refuses an existing path in a millisecond; `w` on the same path blocked
until the ten-second timeout killed it, which is the T-003 hazard shape. Both
write sites covered.

**Result: the widened search finds nothing the narrow one missed**, and that is
the outcome of four commands, three of which the round did not run.

## 1. Every original finding: mechanism, other call sites, and a reproduction on both sides

I wrote my own probe from the two REVIEW TEXTS, never from the phase's test
file and never from the round's own probe, and ran ONE probe file against TWO
source trees: `git archive 7dcce83 src` unpacked into a scratch directory, and
this head's working tree. One variable changed. Node v26.6.0.

| id | the MECHANISM, not the instance | at `7dcce83` | at `a0f8dcb` |
|---|---|---|---|
| F1 / M1 | a recovery target read from a field the recovery itself rewrites | run 2 returns all five switches to `kernel`, `changes=5` | run 2 `changes=0`, no switch at `kernel`, `restoreTo` untouched |
| M2 | a write serialising the typed VIEW rather than the document that was read | `schemaVersion` and `ownerNote` gone | both present, plus a per-record key on a MOVED switch |
| F2 | finished-ness inferred from `!== "open"` instead of `=== "closed"` | five undecidable tasks all read NOT in flight | all five in flight, each with a naming reason |
| H2 | a verdict reached by negating a VALUE rather than testing a TYPE | six unreadable rows read `ported`, one threw | all `unported`; `DELETE` and `KEEP` unchanged |
| H1 / F5 | a commit whose scope is wider than the sentence naming it | commit carried `backlog.md` and `tasks/t1/scratch.txt` | carried `cutover.json` alone; pre-staged index refused; empty path list refused |
| M3 | a verdict (`RESTORED`) wider than the operation that produced it | residue `retired/added-after.md`, then `retired/renamed.md` | residue empty both times, removals reported by name |
| 5a, the round's own | a property read off a value whose type is not established | a file holding `null` THREW out of a three-way refusal | refused, naming the file |
| 5b, the round's own | the same mechanism one field along (`.length` on an untyped command) | five shapes THREW, one silently spawned `t` with args `r u e` | all `unported`, each with a reason |

**Controls that must NOT move, and did not.** `t7-closed` and
`t8-open-with-turnend` not in flight on both sides; `DELETE` and `KEEP` `ported`
on both sides; a real witness exiting 3 `ported` and exiting 0 `unported` on
both sides; a well-formed inventory `read` and an absent one `absent` on both
sides; `restoreRetirementRoots` refusing a dirty tree identically on both sides
with the uncommitted edit byte-preserved. The flips above are the fix, not a
guard that became indiscriminate.

### 1a. Fixed at the MECHANISM: the other call sites, enumerated by me

- **F1 / M1.** The only consumer of `restoreTo` is `targetFor`, and the clamp is
  `record.state === "current"`. `SWITCH_STATES` is a TWO-value vocabulary, so I
  did not argue the clamp is total, I enumerated the whole domain: three
  triggers by two states by two `restoreTo` values, twelve rows, **zero rows
  where a switch moves `current` to `kernel`**. That turns the module header's
  sentence "does not write switches to `kernel`", which the fable review showed
  FALSE at `7dcce83`, into something proved by exhaustion rather than asserted.
- **M2.** The narrower-than-the-file mechanism has exactly two sites: the
  top-level document and the per-switch record. `withSwitches` spreads the
  first, `...record` spreads the second, and the unmoved branch carries the
  record through untouched. I checked the harder of the two, a per-record key on
  a switch the rollback MOVED, and it survives.
- **H2 / 5b.** The sub-mechanism is a property read off an untyped value. I
  enumerated every `as` cast and every untyped property read in both files
  (widening 3 above); the two the round found were the last two.
- **H1 / F5.** `git add -A` appears nowhere in either file at this head:
  `grep -n '"-A"' src/cutover.ts src/commands/cutover.ts` exits 1.

## 2. Attacking the round: what it broke, and where its new guards stop

### 2a. I defanged every fix the round made, one at a time. NINE of ELEVEN redden.

Method: one mutation at a time, source restored between runs with
`git show HEAD:<file>`, never with `git checkout --` (standing warning 8), and
`md5sum -c` confirming each restore. Node v26.6.0, dist built, invocation
`node --test --test-reporter=tap test/cutover.test.ts`.

| my mutation of one of the round's fixes | result |
|---|---|
| remove the monotone clamp in `targetFor` (F1 / M1) | EXIT=1, 2 fail: `a second rollback is a no-op and never moves a switch forward to kernel`, `a switch the rollback does not move is left byte-identical` |
| rebuild the switch record from the interface instead of `...record` (M2) | EXIT=1, `a rollback preserves document keys it does not own, top level and per record` |
| publish `plan.next` instead of `withSwitches(read.document, ...)` (M2) | EXIT=1, same test |
| restore the `.length` read on `negativeWitness` (5b) | EXIT=1, `a PORT row whose negative-witness command is not a list of strings is unported, not a throw` |
| drop the inventory type test (5a) | EXIT=1, `a malformed retirement inventory is refused with a reason rather than thrown` |
| drop the `refuseOpenForWrite` probe on `--out` (the round's unprompted fix) | EXIT=1, `the owner restore request refuses to write to a path that is not a regular file` |
| drop the post-freeze removal in `restoreRetirementRoots` (M3) | EXIT=1, `restoring a retirement root removes what was added after the freeze and verifies the result` |
| drop the pre-staged-index refusal in `syncFleetState` (H1) | EXIT=1, `the rollback commit carries cutover.json and nothing else` |
| replace `renameSync` with `copyFileSync` plus a remove (F3), a THIRD member neither the spec nor the reviewer wrote | EXIT=1, `the destination must be replaced, not written through` |
| **drop the stray-path check in `syncFleetState`** | **EXIT=0, 41 pass** |
| **drop the residue verification in `restoreRetirementRoots`** | **EXIT=0, 41 pass** |

The F3 row is the one I care most about: I invented a third member precisely
because a witness tuned to its own two members would not have helped, and the
new test caught a mutation nobody had written down. F3 is genuinely closed.

### 2b. NEW FINDING V-1 (MEDIUM, TRACKED, not blocking): the drain class witness covers FOUR arms of a mechanism with at least EIGHT, and one uncovered arm is the SIBLING of a covered one

The round's answer to F2 is a four-member witness, and the reviewer's complaint
(no counts-too-few member at all) is genuinely closed. What is NOT closed is the
class. I enumerated every arm of `inFlightItems` that decides "undecidable
counts as in flight", not only the four the spec names, and mutated each into a
counts-too-few form the spec does not contain.

| arm I defanged (none is a listed member) | phase test file |
|---|---|
| `metaRead.kind === "absent"` folded to `continue` (a task directory with no meta.json reads FINISHED) | **41 pass, 0 fail, EXIT=0** |
| the `JSON.parse` catch folded to `continue` (an unparseable meta.json reads FINISHED) | **41 pass, 0 fail, EXIT=0** |
| `worktrees.kind !== "listed"` folded to `if (false)` (an unenumerable worktrees directory is SILENT) | **41 pass, 0 fail, EXIT=0** |
| the worktree `probe.kind === "unexaminable"` push deleted (an unexaminable worktree is SILENT) | **41 pass, 0 fail, EXIT=0** |
| `tasks.kind !== "listed"` folded to `if (false)` (THE CONTROL: this one IS covered) | EXIT=1, `not ok 32 - drain counts the entries it cannot decide rather than reading them as finished` |

The control is what makes the four greens mean something: the same kind of
mutation on a covered arm reddens loudly, so this is an absent test and not a
broken harness.

**The sibling.** The tasks-directory arm is covered and the worktrees-directory
arm is not, and the two blocks sit twelve lines apart in the same function.
That is the exact shape the T-009 corollary names: one arm fixed, the sibling
twelve lines away left alone.

**Why the test cannot catch it.** The new drain test asserts `deepEqual` over
an EXACT list of fixture ids, so an arm with no fixture cannot redden whatever
it does. And nothing else in the suite exercises the predicate:

```
$ grep -rn 'inFlightItems' --include=*.ts --include=*.mjs src test scripts | grep -v '^src/cutover.ts'
src/commands/cutover.ts:34, :154
test/cutover.test.ts:346, :1121, :1144
scripts/rehearse-cutover-rollback.mjs:238, :307
```

**REACHABILITY.** The behaviour at this head is CORRECT on all four arms; my
probe shows an absent meta.json and an unparseable one both counted in flight,
each with a naming reason. The only party the gap reaches is a future editor of
`inFlightItems`. I cannot name a shipped file or a user-visible command it
reaches today and I say so plainly, so under DR-0027 this is **TRACKED**.

### 2c. NEW FINDING V-2 (MEDIUM, TRACKED, not blocking): in BOTH places the round added a measurement, the measurement itself has no witness

The two greens in 2a are one mechanism, not two accidents, and it is the mirror
of the mechanism the round named for itself.

Both fixes work by MEASURING after the operation. `restoreRetirementRoots`
compares the tree against the freeze sha and refuses on residue, under a comment
that says "THE VERDICT IS MEASURED". `syncFleetState` compares the staged set
against the requested set and refuses on a stray, under "The scope is VERIFIED
and not assumed". Deleting either measurement leaves the phase's whole test file
green at 41 pass.

Why each witness misses it, read from the specs rather than guessed:

- `witness/cutover-restore-is-verified.json` member 2 removes `--no-renames`,
  a defect the residue check CATCHES, so that member reddens THROUGH the check.
  No member removes the check while leaving the tree restorable, and no fixture
  makes the restore incomplete for any other reason.
- `witness/cutover-rollback-commit-scoped.json` member 0 replaces
  `add -- ...paths` with `add -A`, which the stray check catches. Same shape.

So each measurement is exercised only as the catcher of another member's
defect, and passes on its own for a reason unrelated to the property it claims.
That is the "guard that cannot go red" family, applied to a verification arm.

**REACHABILITY.** Both arms WORK at this head and I measured each rather than
reading it: the stray check refuses `paths: ["."]` with
`staging . also staged 1 path(s) outside it, and nothing was committed:
cutover.json`, and the residue check is what turned the rename case into a
refusal, which is why `--no-renames` exists at all. The gap reaches a future
editor of these two functions and nobody else. Under DR-0027, **TRACKED**.

### 2d. The round's biggest new guard, defanged with members it does not contain

`every cutover behavior resolves by name to a test that exists` is finding 5d
turned into a test. I ignored the spec's members and wrote two of my own, on a
different registry row and a different test:

| my mutation | result |
|---|---|
| `test/behaviors.json`: append ` for an unknown subcommand` to the `cutover-usage-errors` value | **EXIT=1**, names the offending row |
| `test/cutover.test.ts`: rename `the rollback document carries all three triggers` | **EXIT=1**, names `cutover-document-carries-three-triggers` |

Two structurally different members, both red, and the message names the row
rather than printing a count.

**Three ways I tried to make it vacuous, all blocked.** An empty or failed
test-name scan is caught by a `testNames.size > 100` assertion; a registry with
no `cutover-` rows is caught by a `checked > 0` assertion; a test file outside
`test/` top level would be invisible to the scan, and
`find test -name '*.test.ts' | grep -v '^test/[^/]*\.test\.ts$'` returns
nothing, with the failure direction being a FALSE RED rather than a false green.

### 2e. Binding convention 5: no count pinned over an append-only registry

Every numeric assertion the round added, checked. `changes.length === 5` is over
`CUTOVER_SWITCHES`, a CLOSED list of five, not a registry. `rows.length === 1`
is over a fixture the test writes. The behaviors guard derives its `checked`
count at run time from a prefix filter. `testNames.size > 100` is a FLOOR over a
growing set, so appending tests cannot redden it. **Clean.**

Registry hygiene, measured directly rather than through the gate: comparing
`7dcce83:test/behaviors.json` with this head gives **zero ids removed**, 13 ids
added, 23 values changed and every changed value a `cutover-` row of this
phase's own. 802 rows to 815. Append-only respected; no other phase's row
touched.

### 2f. C-1, C-2, C-3

```
$ grep -nE '\bprocess\.pid\b|/proc/|process\.kill' src/cutover.ts src/commands/cutover.ts   # exit 1
$ grep -nE 'detached|unref\(' src/cutover.ts src/commands/cutover.ts                        # exit 1
$ grep -nE 'slice\(-1\)|\.pop\(\)|at\(-1\)' src/cutover.ts src/commands/cutover.ts          # exit 1
```

One thing a hurried reader would flag and should not: the round ADDED a
`run.signal !== null` arm to `evaluatePortRow`. That reads the result of a
`spawnSync` this process itself started and that has already exited. It is not
a liveness probe and not an identity, so C-2 is untouched. The temporary
filename in `publishCutoverState` is `randomBytes(8)` with a comment saying why
it is not a pid.

### 2g. Things I tried that did NOT become findings

- **A gitignored file added under a retirement root after the freeze survives a
  reported restore.** Measured: `ok=true, removed=[]` and the file is still
  there, because `git status --porcelain` does not list ignored paths and
  `git diff --name-only <sha>` does not either. Not a finding: a gitignored
  path is by construction not part of the ruleset the freeze sha captured.
- **Retirement roots given as `""`, `".."`, `"nonexistent"`, `"."` and a glob
  pathspec.** The first three are refused with git's own message; the last two
  succeed and are correct on a clean tree. No fall-through.
- **`syncFleetState` with `paths: ["."]`**, the obvious accidental way back to
  `add -A`: refused, and it is the stray check that catches it, so that check
  is load-bearing even though 2c shows it unwitnessed.
- **The two members of `witness/cutover-dirty-tree-guard.json` mutate the same
  lines.** One deletes the guard, the other moves it after the checkout. The
  outcomes differ (success over a clobbered tree versus a refusal over a
  clobbered tree), so I judged them adequately different rather than the same
  defect twice, but a reader should know they overlap.
- **The acceptance-criteria table still cites W1a and W1b for criterion 2**, the
  evidence the fable review showed insufficient. The actual closure is in the
  appended fix-round section and in the plan document. A documentation nit, not
  a defect.

## 3. The claim grep, both forms, and the gap audited

Run by me over the work history at this head, counting OCCURRENCES so the two
numbers are comparable:

| form | matching lines | occurrences |
|---|---|---|
| binding command, line-based | 49 | 76 |
| binding command, wrap-insensitive | n/a | 76 |
| extended vocabulary (`is refused`, `is guarded`, `is checked`), wrap-insensitive | n/a | 17 |

**Zero missed by wrap**, which reproduces the work history's own numbers
exactly. The seventeen extended-only hits break down as `is refused` 12,
`is guarded` 3, `is checked` 2, matching the document's own table.

I audited every hit inside the fix-round-2 section by hand. All of them are
either quoting a program's captured output, quoting a document in order to
refute it, or a NEGATIVE statement ("not evidence the path is guarded"), which
is the honest form. The one over-claim of the round-1 era ("a malformed
inventory is refused by its own code path") is left standing with its
refutation and its capture directly beneath it, which is the right treatment:
a work history that quietly repairs its own false sentence teaches a later
reader nothing.

## 4. The suite sentence, and a SECOND flaky test that is not this branch's

**My full-suite sentence, all four axes named.** Interpreter node v26.6.0 at
`/home/user/n26/node-v26.6.0-linux-x64/bin/node` first on PATH; build state
`dist/` BUILT (`npm run build` exit 0, `git status --porcelain` clean after);
invocation `NODE_OPTIONS=--test-reporter=tap npm test` from the clone root;
load average **12.45 at the start and 10.04 at the end**:

```
# tests 890
# pass 890
# fail 0
# skipped 0
# todo 0
# duration_ms 340889.536578
SUITE_EXIT=0
```

**890 pass, 0 fail, ZERO SKIPPED, exit 0**, which matches the work history's
890 at the gate.

**The suite GATE gave me one red and one green at the SAME head**, and it is
reported rather than dropped.

| run | only | load before / after | verdict |
|---|---|---|---|
| 1 | `--only suite --only scope` | 5.20 / 17.16 | **suite RED**: `failing test: "a precondition command exiting nonzero is error, not a skip, whenever a path-shaped argv element cannot be opened..." (test/gates.test.ts)` |
| 2 | `--only suite` | 8.59 / 4.34 | **suite GREEN**: 890 test(s) from 46 file(s), pass 890, fail 0, skipped 0, 815 behaviour(s) resolve |

**The base was established before the failure was attributed**, by the method
that settles it: `test/gates.test.ts` and `src/gates/run.ts` are BYTE-IDENTICAL
to the merge base `3b401182301361700ffa0fd4b2ae099993b3d733`, so base and
branch are the same program for that test. I also ran the test alone at this
head: 1 test, 1 pass, 0 fail, 0 skipped, exit 0. And `npm test` at this head is
890/890 green.

So this is a flake under load, in another phase's file, and it is a DIFFERENT
test from the coverage-gate one the work history records. I did NOT establish
the cause; the test spawns a child under an unprivileged uid after chmodding
shared paths, which makes a concurrency race plausible, and plausible is not
measured. Recorded so the next reader of a red `suite` on this branch has both
runs rather than one.

An earlier bundle run of mine reported `suite: error: M2-C-5: the tree changed
during the run`. That was MY fault, not the branch's: I had mutation probes
touching `src/cutover.ts` while the gate ran. The gate catching it is the gate
working, and the clean re-runs above are the ones that count.

## 5. The rest of the gate bundle, run by me at this head

Full registry, mode full, `--phase m4-p26`, `--base origin/main --head HEAD`:

```
gates: declared 16 applicable 11 verdict 10 green 10 red 0 not-applicable 5 error 1 vacuous 0
gates: red-witness: green: 22 witness(es) evaluated (22 own, 0 stored re-evaluated);
  every witness red against every declared dangerous state and green at head
gates: citations: green: linted 17 changed document(s) at a0f8dcb...: 531 citation(s)
  resolved, 0 self-citation(s), 0 unverifiable-external
gates: clause-map: green: 74 rows checked, 0 pending
gates: coverage: green: 115 inventory id(s) checked
gates: manifest-self-check / credential-scrub / agent-rules-drift / brief-drift /
  check-agents-references / license: green
```

The one `error` in that line is the M2-C-5 self-inflicted one described above;
the suite gate's real verdicts are the two runs in section 4.

I read the red-witness evidence directly rather than trusting the summary
line. `witness-records.json` holds **22 evaluations and 47 members**, every
member red on 2 of 3 runs with the head green, and `uncoveredSources` empty.
All 22 are this phase's `cutover-*` witnesses.

`scope` is RED, with the reason both clean-room reviewers already gave: the
phase declaration is new on this branch and the gate reads it from the MERGE
BASE. That is an orchestrator grant to obtain, not a defect this phase can fix.

`check-authored-bytes.mjs` exits 0.

## 6. Verdict

**APPROVE.**

| original finding | closed at the mechanism | reproduced by me on both sides |
|---|---|---|
| F1 / M1 (HIGH / MEDIUM) | yes, and proved by exhausting the whole domain of `targetFor` | yes |
| H1 / F5 (HIGH / LOW) | yes, three checks: named paths, a pre-existing index refused, the staged set verified | yes |
| H2 (HIGH) | yes, a closed vocabulary plus a row type test | yes |
| F2 (MEDIUM) | yes, positive tests on both halves | yes |
| F3 (MEDIUM) | yes, and red under a third member I invented | yes |
| M2 (MEDIUM) | yes, both sites | yes |
| M3 (MEDIUM) | yes, removal plus a measured verdict | yes |
| M4 / F4 (MEDIUM) | yes, the false sentence stands with its refutation and quoted paths | yes, all seven new citations re-read |
| L1, L2 (LOW) | not fixed, with reasons given in the handover notes | n/a |

Ten of ten HIGH and MEDIUM findings are closed, every one with a
before-and-after capture I produced myself rather than read.

My two new findings, V-1 and V-2, are both gaps in WITNESS COVERAGE over code
whose behaviour I MEASURED to be correct at this head. Neither reaches a
shipped artifact or a user-visible command today; both reach only a future
editor of the guarded code. Under
delivery/decisions/DR-0027-reviews-target-shipped-value-not-ceremony.md:46,
"The severity label is not the test; reachability is", they are TRACKED.

**No blocking finding survived. The verdict is APPROVE.** The phase's round
budget is three and this was round two, so a FIX-ROUND-NEEDED verdict here
would have spent the last one; I want it on the record that I looked for a
blocker with eleven mutations of the round's own fixes, five mutations of a
class it claims to have closed, three attempts to make its best new guard
vacuous, four widenings of its derivation, an exhaustive enumeration of
`targetFor`, and a probe written from the review texts rather than from the
phase's tests, and the two things I found are both future-editor gaps.

**What I did NOT cover, stated before anyone has to ask.**

1. I did not run the rehearsal script's five arms myself; I relied on the
   fable reviewer having re-run them and on the in-suite test that now asserts
   the self-check ordering.
2. I did not read `delivery/plan/kernel-plan-m4.md` outside the M4-P26 section,
   nor the M4-P25 or M4-P27 sections beyond checking for a file collision.
3. I did not establish the CAUSE of the `test/gates.test.ts` flake, only that
   it is not this branch's.
4. My mutation testing of the drain class ran the phase's test FILE, not the
   whole suite, for each arm. I justified that by showing no other file
   references the predicate, which is a grep and not an execution.
5. I did not run the gate bundle at the merge base, so "green at head" is not
   paired with a base reading for anything except the two files named in
   section 4.

## 7. The claim grep over THIS document

```
line-based matching lines : 12
occurrences               : 13
wrap-insensitive          : 13
```

Zero missed by wrap. Disposition by site: three hits are inside quoted captured
output (a TAP line, a gate verdict, a test name); four are statements about my
own METHOD ("never from the phase's test file", "never with `git checkout --`");
`is covered` and the two `catches` are each immediately preceded or followed by
the capture or the spec text that settles them; and the one `cannot be` that was
an authored claim has been replaced above by the measurement with its control.

## 8. Checks on this document

`node scripts/check-authored-bytes.mjs` exits 0 at the commit this file lands
in. Four substantive citations, all into files that are BYTE-IDENTICAL between
`origin/main` and this branch, so none of them resolves silently against a
different line in the base tree. Every reference to a file this branch changes
is quoted.

## 9. Two notes for the orchestrator, neither a finding about the round

**This document is not gated by `citations`, and that is by design rather than
by luck.** The gate's document set is `delivery/plan/`,
`delivery/verification/`, `delivery/decisions/`, `delivery/tuition/`,
`delivery/requirements/` and `delivery/STATE.md`; `delivery/review/` was
removed from it deliberately, with the reasoning written into the gate's own
source: a review is a record of what was examined at the time, and requiring a
record's `path:line` refs to still resolve at head re-litigates settled history
against current code. The run at my commit reports the same 531 citations as
the run before it, which is the arithmetic proof that this file was not linted.
I applied the quoting discipline anyway, because it costs nothing and the rule
may change.

**The scope gate will have something to say once the declaration grant lands.**
`delivery/plan/phase-declarations/m4-p26.json` lists six files to touch plus
three declared extras, and `delivery/review/` is on neither list. Three review
documents now sit on this branch under that path: the two clean-room reviews
that commit `a0f8dcb` added, and this one. Today the gate never reaches the
file audit, because it stops at "no phase declaration exists in the merge
base". When the orchestrator lands the declaration on `main` and the audit
starts running, those three paths become scope findings. Better decided now
than discovered then: either the declaration gains `delivery/review/` as an
extra, or the reviews move. This is a plan and grant question, not a change
this phase may make, and it is raised rather than taken.
