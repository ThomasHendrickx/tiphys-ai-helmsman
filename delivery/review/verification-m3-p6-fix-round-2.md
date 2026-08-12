# Delta verification: M3-P6 fix round 2 (`2a89757..4619bf8`)

Status: IN PROGRESS (this file is appended to as each command completes; it is
the agent's beacon under the T-008 dispatch contract at CLAUDE.md:355).

Instrument: STRUCTURAL delta verification, not a criteria walk and not a
re-review of the phase. The measured basis is the fix-round contract at
CLAUDE.md:297: twelve of thirteen re-reviewed M1 fix rounds produced a new
finding attributable to the round itself.

## 0. Scope, and what this report does NOT cover

The reviewer's first check is item 3 of the fix-round contract
(CLAUDE.md:326), so this section is written first and is not a postscript.

COVERED: the six files in the delta `2a89757..4619bf8`, the central claim that
the removed row-and-field check was redundant, the witness arithmetic at
src/witness/run.ts:886, the two registries the delta touches, and the CI run on
the head.

NOT COVERED, and why:

1. **The phase itself.** The criteria walk, the role-brief content, the six
   sections of roles/implementer.md, the composed dispatch block. Two
   clean-room reviews already covered head `16bab6f` and this instrument is
   structural over the delta only. A defect present at `2a89757` and unchanged
   by this round is outside this report by construction.
2. **`delivery/work-history/m3-p6.md` as prose.** 1077 added lines. I read the
   round-2 sections and ran the claim grep over the whole file, but I did not
   re-derive every measurement it records from round 1 or earlier.
3. **`scripts/render-agent-rules-gates.mjs`.** The round's own mechanism-index
   row (tuition/mechanism-index.yaml:222) records this sibling as carrying the
   same defect UNFIXED. I confirmed the round declared it rather than fixing
   it; I did not audit that script, and it is a standing open item, not a
   finding of this round.
4. **The `full` gate bundle beyond the gates I ran.** I ran the PR bundle and
   the red-witness gate. I did not run `scripts/m2-exit-test.sh` in full mode,
   which CLAUDE.md:615 records as not runnable in this container.
5. **Non-determinism.** Every probe below was run once unless stated. The
   witness runner's own `repeats: 2` is the only repetition discipline I
   relied on.
6. **Windows/macOS portability of the new script paths.** Not exercised.

## 1. The head, and that the delta is the one I was given

```
$ git rev-list --count 2a89757..4619bf8
16
$ git diff --stat 2a89757..4619bf8
 delivery/work-history/m3-p6.md                 | 1077 ++++++++++++++++++++++++
 scripts/check-brief-drift.mjs                  |  143 ++++
 test/behaviors.json                            |    5 +-
 test/implementer-brief.test.ts                 |  270 ++++++
 tuition/mechanism-index.yaml                   |   35 +
 witness/implementer-brief-gate-list-drift.json |    3 +-
 6 files changed, 1531 insertions(+), 2 deletions(-)
```

exit 0 for both. Sixteen commits, six files, matching the dispatch exactly.
The head had NOT moved when I fetched it: `origin/claude/m3-p6-delivery-role-briefs`
resolved to `4619bf8`.

## Log

(appended as work proceeds)

## 2. THE CENTRAL CLAIM: was the removed check redundant? (task 1)

The round's argument is that the row-and-field check it added over the LOCATED
BLOCK, and then deleted in `6c1b010`, could never fire on an input the surviving
checks accept.

Name the three checks, because "the surviving checks" is not a sentence a reader
can verify:

- **A**, scripts/check-brief-drift.mjs:367, `gateBlockFindings(rendered.text, decoded.value, located.mode)`.
  Rendering against registry. Runs in EVERY mode, `--write` included. `error`.
- **R**, the REMOVED one. `gateBlockFindings(located.block, ...)`. Block against
  registry. Ran in `--check` only, between A and B. `red`.
- **B**, scripts/check-brief-drift.mjs:432, `describeDrift(rendered.text, located.block)`.
  Rendering against block. `--check` only. `red`.

### 2a. The structural argument, from the source rather than from the comment

`describeDrift` returns a NON-EMPTY list whenever its two arguments differ at
all, because of its final clause at scripts/check-brief-drift.mjs:167:

```
  if (differences.length === 0 && expected !== observed) {
    differences.push("the two blocks differ only in blank-line placement or line order");
  }
```

So B empty implies `located.block === rendered.text` as STRINGS, and therefore
`gateBlockFindings(located.block, ...)` and `gateBlockFindings(rendered.text, ...)`
are calls with identical arguments. R empty follows from A empty. R cannot fire
where A and B are both silent. The argument does not depend on judgment about
what the two functions "mean"; it depends on string equality and on A and B
being present, both of which are in the tree.

### 2b. The falsification attempt, run rather than reasoned

I did not stop at the proof. I built a two-armed probe
(`scratchpad/dvr2-probe1.mjs`, not committed): arm HEAD is the shipped script,
arm LAB is the shipped script with R textually restored in the position
`6c1b010` deleted it from. Fourteen inputs, each a real edit to the staged
brief, registry or renderer, both arms run on the same staged tree.

A falsifying input is one where LAB's R fires FIRST (so nothing before it
caught the input) and HEAD exits 0.

```
case                                                     HEAD exit  HEAD fired                   LAB exit  LAB fired
CONTROL pristine                                         0          green                        0         green
registry gains a gate, block stale                       1          B(describeDrift)             1         R(block-vs-registry, REMOVED)
block: a gate id renamed                                 1          B(describeDrift)             1         R(block-vs-registry, REMOVED)
block: a whole gate row deleted                          1          B(describeDrift)             1         R(block-vs-registry, REMOVED)
block: the unitLabel cell dropped from one row           1          B(describeDrift)             1         R(block-vs-registry, REMOVED)
block: two gate rows transposed (set-identical)          1          B(describeDrift)             1         B(describeDrift)
block: a preflight step reworded (non-row)               1          B(describeDrift)             1         B(describeDrift)
block: the table header shortened (non-row)              1          B(describeDrift)             1         B(describeDrift)
block: extra spaces inside a row cell (cells still trim-equal) 1     B(describeDrift)            1         B(describeDrift)
registry: a gate's unitLabel changed, block stale        1          B(describeDrift)             1         R(block-vs-registry, REMOVED)
renderer narrowed: strict-subset row filter              21         A(rendering-vs-registry)     21        A(rendering-vs-registry)
renderer narrowed: unitLabel column dropped              21         A(rendering-vs-registry)     21        A(rendering-vs-registry)
block: a bogus extra gate row appended to the table      1          B(describeDrift)             1         R(block-vs-registry, REMOVED)
block: a row's applicability cell changed to another legal value 1  B(describeDrift)             1         R(block-vs-registry, REMOVED)

FALSIFYING CASES (LAB's removed check fired first AND HEAD exited 0): 0
CASES WHERE THE TWO ARMS DISAGREE ON GREEN/NOT-GREEN: 0
PROBE1_EXIT=0
```

**THE CONTROL ARM IS THE FIRST ROW AND IT IS LOAD-BEARING.** Both arms exit 0 on
the pristine tree, so a probe in which every case exits nonzero for a staging
reason unrelated to the mutation is excluded. Six of the fourteen inputs are
cases where R DID fire first in LAB, which is the second control: the lab arm is
not inert, it is catching things, and HEAD catches every one of them too.

**VERDICT ON TASK 1: I could not falsify it. No coverage was lost.** The removal
is sound and the structural argument behind it is correct as written.

### 2c. What this probe did NOT reach, stated before anyone asks

- Inputs where `locateGateBlock` fails or the registry fails `decodeDocument`:
  those return before A, R and B alike, so R is irrelevant there, but I did not
  enumerate them.
- Inputs expressible only as changes to `gateBlockFindings` itself. A mutation
  of that function changes A and R together, so it cannot separate them.
- Invocations carrying `--result`/`--evidence`. I ran bare `--check` only. The
  `emit` path is common to all three checks, so it cannot separate them either,
  but I did not measure it.
- Non-UTF8 or control-character content in the brief.
- The `print` mode, where neither R nor B ever ran.

## 3. Is `describeDrift` genuinely witnessed, and does the witness arithmetic hold? (tasks 2, 3, 4)

Verified by MUTATION, not by reading. Probe 2 (`scratchpad/dvr2-probe2.mjs`)
runs the WHOLE of test/implementer-brief.test.ts under each mutation with the
TAP reporter and reads the per-test `ok`/`not ok` for four tests:

- T1 `adding a gate to the registry without re-rendering ...` (witness test 1)
- T2 `drift in the block's non-row lines is caught and named ...` (witness test 2, NEW this round)
- T3 `the shipped brief's gate rows are exactly the gates the pinned mode selects ...` (NEW)
- T4 `a narrowing inside the renderer is caught by the drift check ...` (NEW)

```
mutation                                             exit   T1        T2        T3        T4
M0 CONTROL: no mutation                              0      pass      pass      pass      pass
M1 witness member 0: src/roles.ts selected -> []     1      FAIL      FAIL      pass      FAIL
M2 witness member 1: describeDrift(...) -> []        1      FAIL      FAIL      pass      pass
M3 (mine) check A defanged: renderingFindings -> []  1      pass      pass      pass      FAIL
M4 (mine) BOTH A and B defanged                      1      FAIL      FAIL      pass      FAIL

WITNESS ARITHMETIC (src/witness/run.ts:886): red = exitCode !== 0 && failed.length === tests.length
witness tests = [T1, T2]
  M1 witness member 0: src/roles.ts selected -> []: exit 1, failed 2 of 2 -> red = true
  M2 witness member 1: describeDrift(...) -> []: exit 1, failed 2 of 2 -> red = true
PROBE2_EXIT=0
```

**The control arm M0 is all-pass at exit 0**, so the four cells are measuring the
mutation and not a broken lab.

### 3a. Task 3, the arithmetic that bit the round

I re-derived it rather than taking it. src/witness/run.ts:886 reads

```
      red: exitCode !== 0 && failed.length === tests.length,
```

and `failed` is built at src/witness/run.ts:867 by collecting only the named
tests with a failing TAP point; a MISSING name lands in `missing`, not in
`failed`, so a name that does not resolve makes the member NOT red. The
per-member verdict is then `rate.red === rate.total` for a deterministic spec
(src/witness/run.ts:1477), and this spec is `deterministic: true, repeats: 2`.

The witness now names TWO tests, so the round made its own witness HARDER to
satisfy, and that is the trap the orchestrator flagged. **Measured: it clears the
bar.** Under BOTH dangerous states, BOTH named tests fail and the exit code is
nonzero, so `failed.length === tests.length` holds in each case. Adding T2 to
the `tests` array did not relax the witness into a green that means nothing.

### 3b. Task 2, is `describeDrift` reached

Yes. M2 collapses `describeDrift`'s call site to `[]` and T1 and T2 both go from
pass to FAIL. Before this round the same mutation left T1 green, which is the
defect the round is closing; after it, the arm is reached by name.

### 3c. Task 4, one witness is not a class

Two independent readings, both green:

1. **The witness's two dangerous states are structurally different** and both go
   red: one narrows the RENDERER inside `src/roles.ts` (a different file and a
   different mechanism), one defangs the COMPARATOR in the script.
2. **T2 itself carries two members inside it**, a PREFLIGHT STEP and the TABLE
   HEADER, and probe 1 shows independently that neither is visible to the
   row-and-field check: for both of those inputs the LAB arm's restored check
   did NOT fire and `describeDrift` did. So they are members of the class T2
   claims ("drift the row-and-field check cannot see") rather than two labels on
   one path.

T4 likewise carries two members, a dropped ROW SET and a dropped COLUMN, and
probe 1 confirms both reach check A, which is the arm T4 asserts.

### 3d. THE SURVIVING PAIR IS NOT A NEW SHADOWING PAIR (the question the round's R2-19 raises)

The removal replaced one shadowed pair with a surviving pair A and B, and the
round argues each is reachable alone. **Measured, in both directions:**

- **A reachable alone**: M3 defangs A only. T4 goes FAIL while T1 and T2 stay
  pass. So an input exists that only A catches, and a named test observes it.
- **B reachable alone**: M2 defangs B only. T1 and T2 go FAIL while T4 stays
  pass. So an input exists that only B catches, and named tests observe it.

The structural reason is stronger than the measurement and worth stating: A runs
in EVERY mode including `--write` (scripts/check-brief-drift.mjs:367), and B
runs in `--check` only, after the `--write` branch returns at
scripts/check-brief-drift.mjs:397. There is a whole INVOCATION in which B does
not exist, so B cannot shadow A there. The pair is not the shape that was
removed.

### 3e. What section 3 did NOT cover

- I did not run every witness in `witness/`, only the one the delta touches.
- I ran each mutation ONCE, not twice; the witness runner's own `repeats: 2` is
  the repetition discipline and section 5 reports its result.
- T3 does not fail under any of my four mutations, BY CONSTRUCTION: it reads the
  shipped brief and parses the registry itself and calls no `src` function, so
  no code mutation can reach it. Its dangerous state is a shipped brief whose
  rows disagree with the registry, which is a CONTENT state, not a code state. I
  did not construct that state, and section 6 records what I think that means.

## 4. The gate's own verdict, which is the authority my probes only anticipate

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --only red-witness --evidence <scratch> --base origin/main --head HEAD
gates: run d23342c427e8bb5fb3839533
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
gates: every applicable gate is green
RW_EXIT=0
```

`red-witness: green, 19 witnesses evaluated (5 own, 14 stored re-evaluated in
191468ms); every witness red against every declared dangerous state and green at
head`. Base `c75152b`, head `4619bf8`, `uncoveredSources: []`.

The record for the witness this delta touches, read out of
`witness-records.json` rather than summarised:

```
--- witness implementer-brief-gate-list-drift status green reasons []
  member 0 mutation of src/roles.ts               rate {"red":2,"total":2} headGreen true
    run exit 1 red true  failed [T1, T2] passed []       missing []
    run exit 1 red true  failed [T1, T2] passed []       missing []
    run exit 0 red false failed []       passed [T1, T2] missing []
  member 1 mutation of scripts/check-brief-drift.mjs rate {"red":2,"total":2} headGreen true
    run exit 1 red true  failed [T1, T2] passed []       missing []
    run exit 1 red true  failed [T1, T2] passed []       missing []
    run exit 0 red false failed []       passed [T1, T2] missing []
```

(T1 and T2 are the two full test names, quoted in section 3; the runner prints
them in full and they match the `tests` array byte for byte, so `missing` is
empty in every run, which is the failure mode the arithmetic would otherwise
hide.)

The THIRD run of each member is the runner's own control arm at the audited head
with the mutation reverted, and it is green with both tests passing. So the
gate's evidence carries a control the same way my probes do, and it agrees with
probe 2 exactly.

All nineteen witnesses green, including the four other witnesses over this
phase's tests.

## 5. The suite, all three axes plus the SKIPPED count, and a two-test flake I hit

Standing warning 12 requires the toolchain, the build state and the invocation.
All four numbers below are node v26.6.0, `dist/` BUILT (`npm run build` exit 0,
`git status --porcelain` empty afterwards), in a fresh worktree at `4619bf8`
with `npm ci` exit 0.

| invocation | tests | pass | fail | SKIPPED | exit |
|---|---|---|---|---|---|
| `npm test` (run 1) | 620 | 618 | 2 | 0 | 1 |
| `npm test` (run 2) | 620 | 620 | 0 | 0 | 0 |
| bare `node --test` from the repository root | 622 | 622 | 0 | 0 | 0 |

The 620/622 gap is the documented one: `sandbox/test/greet.test.js`, excluded by
`package.json`'s `test` script pattern. 620 is what CI and the `suite` gate
mean. This reproduces the implementer's reported 620 and 622 exactly.

**RUN 1 FAILED AND I DID NOT AVERAGE IT AWAY.** Two tests:

```
test at test/watcher.test.ts:419:1
x the heartbeat schedule is on disk and shared by single passes (8069.081866ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  0 !== 3
      at TestContext.<anonymous> (.../test/watcher.test.ts:432:10)
    actual: 0, expected: 3
```

plus `test/coverage-gate.test.ts:189` (`actual: 'error', expected: 'green'`).

test/watcher.test.ts:432 is `assert.equal(immediate.status, 3, ...)`, the third
of three consecutive CLI spawns inside a 0.4s heartbeat interval: the assertion
is that the third spawn is NOT yet due. Actual 0 means more than 0.4s of wall
clock elapsed between spawns, which is standing warning 11's territory rather
than a defect.

Attribution, measured rather than asserted:

```
$ git log --oneline 2a89757..4619bf8 -- test/watcher.test.ts src/watcher.ts src/watcher
(no output: the delta touches none of them)

CONTROL ARM, worktree at 2a89757 (PRE-delta):
$ node --test --test-name-pattern "the heartbeat schedule is on disk and shared by single passes" test/watcher.test.ts
i tests 1  i pass 1  i fail 0  i skipped 0    CTL_EXIT=0

HEAD ARM, worktree at 4619bf8:
(same command)
i tests 1  i pass 1  i fail 0  i skipped 0    HEAD_EXIT=0

$ node --test test/watcher.test.ts test/coverage-gate.test.ts   (both files, under load)
i tests 40  i pass 39  i fail 1     (the same watcher test)     exit 1
```

So it reproduces under LOAD and not under isolation, at BOTH heads. I did not
run the full suite at `2a89757` to see whether it flakes there too, so I am not
claiming the two heads have equal flake rates; I am reporting that the isolated
arms are identical and that the delta touches neither file. The implementer
recorded two DIFFERENT flakes in the same family (R2-11, R2-12); mine is a
third instance of the same real-clock family and a fourth distinct test.

TRANSLITERATION DECLARED for every capture in this report: node's reporter
prints U+2139 (INFORMATION SOURCE) and U+2716 (HEAVY MULTIPLICATION X). I
rendered U+2139 as `i` and U+2716 as `x` with
`sed 's/\xe2\x84\xb9/i/g; s/\xe2\x9c\x96/x/g'`. Measured counts in the two full
captures I quote from: `dvr2-npmtest-2.txt` carries 8 of U+2139 and 0 of U+2716;
`dvr2-bare.txt` carries 8 and 0. Nothing else in any captured output was
altered.

## 6. CI, read by step rather than by conclusion

T-009 requires the event and the head sha, so "CI is green" is not the sentence.

**Run 31607900355, event `pull_request`, head_sha `4619bf8`, conclusion
SUCCESS.** By step, job `gates` (id 94151628958):

| # | step | conclusion |
|---|---|---|
| 1-5 | set up, checkout, setup-node, `npm ci`, `npm run build` | success |
| 6 | `npm test` | success |
| 7 | Agent-rules gate-list drift | success |
| 8 | Implementer brief gate-list drift | success |
| 9 | **M2 exit test (pull request)** | **success** |
| 10 | M2 exit test (push) | **skipped** |
| 11 | M2 exit test self-test guard | success |
| 12 | M1 exit test (local mode) | success |
| 13 | M1 exit test falsifiability guard | success |

Step 9 is the step that FAILED at `64e1ba8`, and run 31604059724 on `64e1ba8` is
recorded as conclusion `failure`, which corroborates the round's own account of
why the added check had to go rather than merely being tested.

**Step 10 is SKIPPED, so this run is evidence about the pull-request arm ONLY.**
Under T-009 rule 1 the push arm on the new `main` head remains unobserved and is
the orchestrator's to watch after merge. Nothing in this report speaks to it.

**The head moved while I worked, and the code did not.** The branch settled at
`077f339`. Verified myself rather than taken:

```
$ git diff --name-only 4619bf8..077f339
delivery/work-history/m3-p6.md
$ git diff --stat 4619bf8..077f339
 delivery/work-history/m3-p6.md | 241 +++++++++++++++++++++-
 1 file changed, 238 insertions(+), 3 deletions(-)
```

One file, work-history prose. **The code delta I verified, `2a89757..4619bf8`,
is the code delta at the settled head.** Run 31610473874 on `077f339`, event
`pull_request`, is also SUCCESS with the same thirteen steps and step 10 again
skipped.

**I verified against `4619bf8` for everything mechanical**, and read
`delivery/work-history/m3-p6.md` at BOTH `4619bf8` and `077f339`, because the
prose-only commits add sections R2-23 to R2-28 that bear on the findings below.
