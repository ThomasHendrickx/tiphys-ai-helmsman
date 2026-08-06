# Clean-room DELTA review (hazard-contract lens): M2-P1 fix round 1

PR #11, branch `claude/m2-p1-gate-contract-and-runner`
Head under review: `3c7970b`. Previous reviewed head: `ac3b2f6`.
Scope: DELTA only (`git diff ac3b2f6..3c7970b`) plus closure verification of
CR-800 to CR-813 from `delivery/review/clean-room-m2-p1-hazard.md`.
Reviewer: hazard-contract, delta round 1. Date 2026-08-06.
Worktree: `scratchpad/m2p1-d-hazard`, detached at `3c7970b`, `npm ci` exit 0.

## VERDICT: FIX-ROUND-NEEDED

2 medium, 5 low, 0 high. Both mediums are NEW, introduced by the CR-803
evidence-directory claim; neither is a reopening of CR-800 to CR-813.

## The four explicit answers

1. **Is CR-800 closed at the class? YES.** Reproduced all three members and
   all three controls myself with a fixture written from scratch; both routes
   to `not-applicable` are now identical in the summary and both fail closed,
   and the green control still exits 0. Defanging the mechanism
   (`applicable: ingested.status !== "not-applicable"` back to `true`) reddens
   the guard; defanging the aggregate rule (`counts.verdict` back to
   `counts.applicable`) reddens the pure-function guard. Exit 0 now provably
   implies `green > 0`, and a green record with `units 0` is still rewritten
   to error, so exit 0 implies at least one gate examined at least one unit.
2. **Did any fix break something? YES, one of the five.** The CR-803 evidence
   claim introduced CR-860 and CR-861. The other four are clean under attack:
   the ctime pin does NOT false-positive under `npm ci` or `npm run build`
   (measured, 0 differences, with a positive control that yields exactly 1);
   load-time schema pattern compilation does NOT kill the runner before its
   crash discipline is armed (the claim precedes the manifest load, and a bad
   pattern gives exit 21 with an aborted summary); the CR-805 anchoring and
   escaping hold against the decoy branch and a metacharacter phase id.
3. **Are the declines sound boundaries? YES, all three.** See "The declines".
   One bookkeeping consequence is CR-863.
4. **Is anything from CR-800 to CR-813 still open?** No finding is unfixed.
   CR-810 has a partial RECURRENCE recorded as CR-865 (low): the raw count in
   the round's own claim-grep transcript does not reproduce, although the
   dispositioned set does, exactly.

---

# Findings

## CR-860 (MEDIUM) The crash path releases the evidence-directory claim BEFORE it finishes writing to the directory, and then releases a second time, so a run that no longer holds the claim can unlink another run's

**Mechanism, not the instance.** *Cleanup that is valid only while the claim is
held is performed from a frame that does not know whether the claim is held.*
`releaseEvidenceDirectory` is called from two places for one claim:
`runGatesInner`'s `finally` (src/gates/run.ts:994-996) and, unconditionally,
`runGates`'s outer `catch` (src/gates/run.ts:920). The `finally` of the inner
frame runs BEFORE the `catch` of the outer frame, so on every crash path the
order is: release, then write `summary.json`, then release again.

**Measured**, with markers added to a COPY of the tree
(`scratchpad/DH-lab/instr`, never the worktree), crashing the runner the way
the round's own CR-801 member 1 does:

```
TRACE 8867166096225 release .../ev-instr
TRACE 8867167176310 writeAbortedSummary-enter
TRACE 8867168179959 writeAbortedSummary-done
TRACE 8867168231172 release .../ev-instr        <- second release
EXIT=21
```

Window between the first release and the second: 2,134,947 ns (2.13 ms), and
the aborted summary is written inside it, through `guardedWrite` rather than
the atomic stage-and-rename path the successful run uses.

**Why dangerous.** Two consequences, both the hazard CR-803 exists to stop:
(a) for 2.13 ms this run writes into a directory it does not own, and a second
runner that claims in that window has `summary.json` overwritten by a run that
died; (b) the second release unlinks whatever claim file is present, which by
then may be the SECOND runner's, revoking a live run's exclusion so that a
third runner can enter. This is "release a lock you no longer hold", the
classic claim-file defect, and the module the round says it followed
(`src/lock.ts`) guards its release with a holder check for exactly this reason.
Seven phases run this concurrently, and the phase's own hazard-class sentence
in the plan is "a runner that writes a record for a gate it did not execute".

**Scope of what I did NOT establish.** I did not force an actual collision
inside the 2.13 ms window; I measured the ordering and the width. The finding
is the mechanism plus the measured window, not a witnessed two-runner loss.
The round's own not-covered list (CR-803 item 2) says it "does not cover a
process that deletes the claim file mid-run", framing that as an EXTERNAL
process; the runner is now itself such a process, and that is new in this round.

**Concrete fix.** Delete the release at src/gates/run.ts:920 and move
`writeAbortedSummary` inside the claimed region so the order is write, then
release, once; or make `releaseEvidenceDirectory` read the claim file and
unlink only when its `runId` matches this run's, which is what `lock.ts` does.

---

## CR-861 (MEDIUM) A run REFUSED the evidence directory exits 21 and leaves the previous run's green summary in place, and never emits its own runId, so "a bundle is attributable" does not hold at the boundary the fix claims it for

**Mechanism.** *The refusal path deliberately writes nothing, so the only
statement in the directory about what happened is a different run's.* The
`runId` that is supposed to make the bundle attributable is written into
`summary.json` only, and is never printed to stdout, never printed in the
refusal, and never returned to the caller, so no caller can tell whether the
summary it reads is its own.

**Measured**, floor toolchain, worktree at `3c7970b`:

```
=== run 1: clean green ===
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
gates: every applicable gate is green
EXIT=0
=== plant a stale claim (what a SIGKILLed run leaves) ===
=== run 2: refused ===
tiphys gates run: evidence directory .../ev-stale is already claimed by another
run; claim file .../ev-stale/.tiphys-gate-run.json holds
{"runId":"deadbeefdeadbeefdeadbeef","manifest":"other",...}. ...
EXIT=21
=== what a programmatic consumer reads from summary.json AFTER the refusal ===
{"runId":"4f1e6df45cd61127fcd58d0e","exitCode":0,"aborted":false,
 "reason":"every applicable gate is green",
 "counts":{"declared":1,"applicable":1,"verdict":1,"green":1,"red":0,
           "not-applicable":0,"error":0,"vacuous":0}}
```

The refused run's own runId appears nowhere. The summary in the directory says
green, `aborted: false`, exit 0.

**Why dangerous.** The work history states the property as "The runId is
stamped in the SUMMARY, so a bundle is attributable, without binding anyone
else's implementation" (CR-803 not-covered item 5, the record-level runId
decline rests on it). Attribution needs the caller to know the runId it should
see, and nothing gives it one. M2-P9's harness is named in this repository as
a programmatic consumer of the bundle. Before this round a second run into the
same directory at least produced a summary of a run that executed; now the
refusal leaves another run's green in place with nothing to mark it stale.
The exit code is 21 and stderr is loud, so a caller that checks the exit code
is safe; a caller that reads the artifact is not, and the artifact is the thing
the phase ships.

**Scope of what I did NOT establish.** I did not find a consumer in this tree
that reads `summary.json` without also checking the exit code (there is none
outside `test/`). The exposure is to consumers M2-P9 will write.

**Concrete fix.** Any one of: print `runId <id>` on stdout for every run; write
an `aborted: true` summary named for the refusal (to a path the owning run
cannot collide with, or refuse to touch the directory but say in the refusal
that any `summary.json` there belongs to another run); or add the runId to the
`RunOutcome` the command layer already holds.

---

## CR-862 (LOW) `decideAggregate`'s success-path assertion is not total: it is `counts.green === 0`, which is false for NaN, undefined, a missing key or a negative value, and all four exit 0

The whole point of extracting this function, per its own header comment, is
that it "can be handed states the runner cannot currently produce, including
the internally inconsistent ones the invariants below exist for". Handed those
states, four of them pass:

```
NaN green                            {"exitCode":0,"reason":"every applicable gate is green"}
NaN verdict                          {"exitCode":0,"reason":"every applicable gate is green"}
negative green                       {"exitCode":0,"reason":"every applicable gate is green"}
undefined green                      {"exitCode":0,"reason":"every applicable gate is green"}
missing verdict key                  {"exitCode":0,"reason":"every applicable gate is green"}
missing green key                    {"exitCode":0,"reason":"every applicable gate is green"}
```

(18 combinations probed; every runner-reachable one behaved correctly,
including the three the new test asserts and both precedence controls.)

**Scope.** NOT reachable through the runner today: `counts` is built locally
at src/gates/run.ts:1024 from integer literals and `+= 1`. This is a low
because the function is exported and its stated contract is to be total over
inconsistent input. `!(counts.green > 0)` closes all six lines above.

---

## CR-863 (LOW) `MECHANISMS.md`'s claim-file row still says there are two claim-file users; there are now three, and nothing points the fourth at `src/gates/run.ts`

The row reads "There are now two claim-file users; a third reads `src/lock.ts`
first." The implementer did read `src/lock.ts` and followed its rule, which is
what the row demands, and recorded the one deliberate difference (no wait).
But the row is the mechanism's own index, and it is now wrong: a fourth user
will read "two", find `lock.ts` and `task.ts`, and never learn that a third
implementation exists in the gate runner with different semantics (no expiry,
no takeover, no wait). That is the T-005 shape one level up, in the file
written to prevent T-005.

`MECHANISMS.md` is outside the phase's 16-file scope, so this is for the
orchestrator alongside the plan ripple, not necessarily for the implementer.

---

## CR-864 (LOW) Two lines of the round's own commit message lost `$ref` to shell expansion, so the durable record of what CR-802 fixed is unreadable

Commit `4d7f5d9`, verified with `od -c` against the object rather than through
a shell:

```
0001260   0   8   ,       C   R   -   8   1   1   :           s   i   b
0001300   l   i   n   g   s       a   r   e       r   e   f   u   s   e
```

The body reads "CR-802, CR-807, CR-808, CR-811:  siblings are refused at load"
and "A control found that  '#' did not resolve at all". `$ref` was interpolated
away by a double-quoted `-m`. Cosmetic, unfixable without a rewrite of a pushed
commit, and recorded so the next reader knows the words are missing rather than
that the sentence was written that way.

---

## CR-865 (LOW) CR-810 partially recurs: the raw claim-grep count recorded in the work history (20) does not reproduce at the submitted head (27)

```
$ grep -cEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/m2-p1.md
27
```
recorded in the file: 20 raw / 11 filtered.

Counts at each commit of the round: `ac3b2f6` 12, `4d7f5d9` 12, `3c7970b` 27.
The 20 was captured mid-edit, before the disposition table that quotes the
phrases it adjudicates was appended, which is CR-810's exact cause reappearing.

**In the round's favour, and it matters:** the FILTERED set does reproduce
exactly. The table lists lines 74, 350, 685, 874, 895, 897, 913, 926, 1185,
1192, 1261, which is 11 lines, and the two excluded transcript regions
(678-703, 1369-1392) account for the remaining 16: 11 + 16 = 27. Every
substantive hit is dispositioned and three were restated rather than defended.
The mechanical fix is to record only the filtered set, or to name the commit
the raw count was taken at, because a count of a file that contains the count
is self-referentially unstable.

---

## CR-866 (LOW) The plan ripple amends step 7 with `counts.verdict` but leaves step 8's field list without it

`c0343a1` (orchestrator's, on `claude/m2-era-paperwork`) step 8 still reads
"counts `declared`, `applicable`, `green`, `red`, `not-applicable`, `error`,
`vacuous`". `verdict` is now in the shipped summary and in step 7's amendment.
One word, in the orchestrator's file, not the implementer's.

---

# The declines, judged

| decline | judgement |
|---|---|
| `bin/tiphys.ts` uncaughtException handler, on scope | **CORRECT BOUNDARY.** `bin/tiphys.ts` is not on the files-to-touch list, and a handler in `src/cli.ts` would change the exit behaviour of seven merged M1 subcommands this phase does not own. The bound is stated ("the `gates` subcommand only. A throw from another subcommand still exits 1") and it is achieved: `cmdGates`'s try/catch is the single entry, and I confirmed a bad shipped schema gives exit 21 with an aborted summary through `gates run` and `red` through `gates self-check`, never 1. |
| record-level `runId` in the gate subprocess contract | **CORRECT BOUNDARY**, with a caveat that is CR-861. Changing a contract seven unwritten phases build against, to close a hole the directory claim closes, is the wrong trade. The caveat is that the stated compensating property ("the runId is stamped in the SUMMARY, so a bundle is attributable") does not hold, because the runId is never emitted to the caller. Fixing CR-861 costs one line and does not touch the gate contract, so the decline survives. |
| `src/lock.ts` / `src/task.ts` untouched | **CORRECT.** Neither is on the files-to-touch list. |
| the evidence claim as a SECOND implementation of the claim-file mechanism | **EARNED, and it is not the T-005 mistake.** T-005 was a SILENT reimplementation. Here `src/lock.ts` was read as the row requires, its rule was followed verbatim (`wx`, EEXIST is a loud refusal that names the stuck file, no steal, no age heuristic), and the one difference was stated. The difference also earns itself structurally: `lock.ts`'s claim is a LEASE with expiry, holder ids and takeover, and importing that here would give an evidence directory an expiry it must not have. What is shared is four lines. The residue is that this claim has NO expiry, so a killed run bricks a reused directory until a human deletes the file, which is documented in the refusal text. That is a defensible choice; CR-863 is the bookkeeping half of it. |

# The three greens, verified

- **F3** (the guard that asserted text, which drove the `decideAggregate`
  extraction). Verified: the replacement DOES redden under
  `if (false && ...)` sabotage of the caller.
  ```
  BASELINE  tests 1  pass 1  fail 0
  D1 if (false && exitCode === EXIT_GREEN && counts.green === 0)
            FAIL: the runner cannot report success over an empty green bucket
            tests 1  pass 0  fail 1
            AssertionError: Expected "actual" to be strictly unequal to: 0
  ```
  The account in the work history is accurate and unsoftened. See CR-862 for
  the one direction the replacement still does not cover.
- **F22** (the unguarded `--head`). The added assertion is honest: the test
  says in its own comment "A PINNED SHAPE, AND IT IS A TEXT ASSERTION, said
  plainly rather than dressed up as behaviour", names what stays unguarded
  ("everything about how GitHub resolves the expression; that is not readable
  from this tree and is not claimed"), and fails closed with a `doesNotMatch`
  on the old value (test/gates.test.ts:1300-1315). This is MECHANISMS.md's
  second tier applied correctly.
- **F4** (defang harness error, the `dist/`-without-rebuild trap). Correctly
  diagnosed and recorded; I hit the same class myself, see honest failures.

# Probes run, with the scope of every empty-handed result

| probe | result |
|---|---|
| CR-800 members 1/2/3 and controls A/B/C, own fixture | closed at the class, see the verdict section |
| `decideAggregate` over 18 count combinations | 6 escapes, all non-numeric or negative, none runner-reachable: CR-862 |
| every consumer of `counts` in the repository (`grep -rn 'counts'`, excluding node_modules/.git/dist) | one `deepEqual` (test/gates.test.ts:280), updated with `verdict: 2`; no production key iteration; `summary.json` is not schema-validated, so a new key breaks nothing. **SCOPE: this repository only. M2-P9's harness does not exist in this tree.** |
| evidence claim: stale claim after a kill | bricks a reused directory by design, loudly, naming the file. Residue accepted, see the declines table |
| evidence claim: cleanup on every exit path | **CR-860** |
| evidence claim: refusal vs contention distinguishable | same message either way, which is the stated design (no wait); the refusal quotes the holding claim's contents, so a human can tell |
| ctime pin under `npm ci` and `npm run build` | 0 differences after each, over roots `src` and `test`. Positive control, the T-004 shape: a `cp -p` byte-identical restore gives exactly `1 src/gates/pin.ts changed during the run (ctimeMs)`, which mtime alone would miss. **SCOPE: roots `src` and `test`, this container's filesystem, not a GitHub runner. NOT tested: a root that contains `dist/` or `*.tsbuildinfo` (the build writes both, and `takePin` has no exclusions, so such a root WOULD report added files). That is a caller's choice of roots, not this module's defect, but M2-P2 and M2-P3 should not point a pin at the repository root.** |
| load-time schema pattern compilation vs the crash discipline | armed. The claim is taken before `loadManifest`, and a bad regex in a shipped schema gives `aborted: true`, `exitCode: 21`, reason naming the pointer and the SyntaxError, with the gate's own record still on disk. `gates self-check` gives `red` with the same reason. Never exit 1. |
| `branch-matches` anchoring and escaping, own git repo | decoy `evil/claude/m2-p4-scope-auditor-DECOY` -> `not-applicable`, reason `does not match ^(?:claude/m2\-p4-.*)$`, exit 21; real branch -> green, exit 0; phase `m2.p4` vs branch `claude/m2xp4-thing` -> `not-applicable` against `^(?:claude/m2\.p4-.*)$`. Both controls hold |
| defang sweep, 11 defangs | 11 red. Three came back green on my first pass; all three were MY harness, see honest failures |
| M2-C-6 mkfifo, three placements | green |
| diagnostic ordering, ten runs, three producers | green, one distinct ordering |
| `file-absent` (the round's new coverage) | green |
| CR-806 / CR-812 / CR-813 spot checks | `vacuous <= error` holds live; self-check now reports `units 2` against `unitLabel "schema documents validated"` with 2 schema documents present; the `note` field is accepted by the schema and the kernel's own manifest runs green with it |
| criteria spot check, plan criterion 5 | **MET, but only via the new summary field.** With one required gate whose precondition is unmet, the run is now exit 21 `no applicable gate`, so the REASON LINE no longer names the gate; `summary.requiredNotApplicable: ["pre"]` does. With a green gate also present the reason line names it and the exit is 20. Flagged for the criteria reviewer, not a finding: the precedence is documented and the naming survives |
| criteria spot check, plan criteria 2, 3, 9 | unchanged and met; criterion 2's `deepEqual` still reports declared 4 applicable 3 green 1 red 1 not-applicable 1 error 1 vacuous 0, with `verdict: 2` added |
| conventions | 0 non-ASCII bytes in any of the 13 delta files (so no em dashes); 0 AI or tool names in either commit message |
| scope | `git diff --name-only ac3b2f6..3c7970b` = 13 files, all inside the phase's 16; `git diff --name-only 037477e..3c7970b` = the same 16 as round 1. No `bin/`, no `src/task.ts`, no `src/lock.ts`, no plan edit |

## Gate numbers, measured by me, `node --version` checked in the shell that ran each command

Floor toolchain (`scratchpad/toolchain/node-v26.6.0-linux-x64/bin` first on PATH):

```
node v26.6.0 / npm 11.18.0
npm ci                                   exit 0, no EBADENGINE
npm run build                            exit 0
npm test  (dist present)                 exit 0   tests 193  pass 193  fail 0  skipped 0
npm test  (dist REMOVED)                 exit 0   tests 193  pass 189  fail 0  skipped 4
npm run build (rebuild)                  exit 0
git status --porcelain after the build   only my own untracked review files
```

Container default, through `bash -lc` (a stripped `env -i` resolves Node
20.20.2 and is NOT the default toolchain, CLAUDE.md warning 1):

```
node v22.22.2
npm test                                 exit 0   tests 193  pass 191  fail 0  skipped 2
```

The 2 default-toolchain skips are the pre-existing floor-gated doctor tests.
All three numbers match the work history exactly.

## Registry

```
registry entries: 199
unresolved:       0
```

Resolved by NAME against the literal test titles in `test/`, with my own
script. 6 duplicate titles exist, all pre-existing M1 names (pool destroy,
watch --once, stale beacon x2, future beacon x2); none is from this round.

# Honest failure section

1. **My first fixture gate wrote the OLD record shape** (`gateId`, `version`,
   `preconditions`), so my first CR-800 reproduction reported EVERY arm,
   including the green control, as `error` with exit 21. It looked like a
   finding. It was my fixture failing `gate-result.schema.json`. Corrected and
   rerun. Recording it because a reviewer's malformed fixture makes every arm
   nonzero, which is easy to read as "the guard fired".
2. **Three of my eleven defangs came back green on the first sweep** (D3, D7,
   D10). All three were my harness: `--test-name-pattern` pointed at
   `test/gates.test.ts` for a `test/pin.test.ts` behaviour, and at the wrong
   behaviour for the `verdict` branch. Re-targeted individually, all three
   redden. This is the same class as the round's own F4, hit by the reviewer.
3. **I did not force an actual two-runner collision inside CR-860's window.**
   I measured the ordering and its width (2.13 ms) with markers in a copy. The
   finding is the mechanism plus the measurement, not a witnessed loss.
4. **My first default-toolchain measurement was wrong.** I used `env -i`, which
   resolved Node 20.20.2, and got a failure that was not the toolchain's. Redone
   through `bash -lc`.
5. **I did not force a throw from another CLI subcommand** to test the
   `bin/tiphys.ts` decline's residue ("a throw from another subcommand still
   exits 1"). I judged that decline on the recorded derivation plus my own
   reading of `src/cli.ts`, not on a forced throw.
6. **Sabotage hygiene.** All defangs and instrumentation were done in copies
   under `scratchpad/DH-lab/`. The worktree's `src/` was never edited; every
   copy was restored and proven byte-identical by md5 before and after
   (`src/gates/run.ts` ac13579b..., `src/gates/pin.ts` 001064ca...,
   `src/gates/validate.ts` 25d7a951..., `gate-result.schema.json` d70aaf19...).
   No `git checkout --` was used anywhere.
