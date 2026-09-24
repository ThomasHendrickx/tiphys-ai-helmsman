# Delta verification: M5-P2 fix round 2 (Opus)

- Date: 2026-09-23
- PR: #207
- Branch: claude/m5-p2-intent-to-outcome
- Head verified: 115e177 (115e1774d2065abd92f283638a2cace914a5ce12);
  previous head verified: b86b2eb
- origin/main at verification: 8558dca, which is also the merge base.
  `git merge-tree --write-tree origin/main HEAD` exits 0 (tree 9fd071b).
- Contract: delta verification of fix round 2 (CR-FR-01 to CR-FR-04), with
  the orchestrator's five questions and its follow-up on the intermittent
- Model family: Opus
- Method: everything below was run on node v26.6.0 (the scratch toolchain,
  `node --version` checked in each shell). Fleet probes ran on real `tiphys
  init` fleets. Witness members were applied one at a time and restored by
  copy. The intermittent was investigated with the gate's OWN `makeClone`,
  `parseTapStream` and `evaluateWitness`, imported from src/witness/run.ts.
  Signals were sent only to process trees my scripts started. The PR bundle
  ran in a scratch clone checked out on the real phase branch name.

## Verdict: APPROVE

| severity | count |
|---|---|
| high | 0 |
| medium | 0 |
| low | 3 |

All four CR-FR findings are closed. The intermittent red-witness run has an
established cause outside this diff: a signal sent by another agent. The
harness's handling of that signal is a real honesty gap in the red-witness
gate. It is pre-existing, and it FAILS CLOSED (it can produce a false red,
never a false green). So I record it as a low for a separate task and do not
block this phase on it.

## 1. CR-FR-01 to CR-FR-04 (executed)

Scratch script p2fr2-fleet.sh. Each case uses a real `tiphys init` fleet,
composes from the fleet root, then runs `tiphys doctor` there:

| case | compose | doctor retention |
|---|---|---|
| plain file at `charter` | exit 1, "charter could not be listed: ... ENOTDIR" | FAIL, same reason; layout FAIL "missing charter/" |
| only `charter/x.yml` | exit 0, carries x.yml's intent | WARN, names x.yml |
| undecodable file alone | exit 1, the YAML reason | FAIL, identical reason |
| undecodable file beside a charter | exit 1, names the bad file | WARN (see CR-FR2-02) |
| named pipe beside a charter | exit 1, "is a named pipe, not a regular file", bounded | WARN (see CR-FR2-02) |
| stray `kind: notes` YAML beside one charter | exit 0, the charter is used | WARN, names the charter |
| fresh fleet | exit 0, undeclared sentence | WARN not-applicable |

- **CR-FR-01 (the walker's fail-closed arms were unguarded): CLOSED.** There
  are three new specs with two members each, and each member was applied
  alone (p2fr2-wit.sh). Every member turned its named test red (1 test, 1
  fail, exit 1). Every baseline was green (1 test, 0 fail, exit 0):
  - witness/p2-charter-unlistable-refused.json: members 0 and 1 red.
  - witness/p2-charter-yml-suffix.json: members 0 and 1 red.
  - witness/p2-charter-bad-entry-refused.json: members 0 and 1 red.

  These are the same mutations that were green against both consumers in my
  round-1 verification (MB, MC and MD).
- **CR-FR-02 (an unlistable `charter/` read as undeclared): CLOSED.** The
  plain-file case is refused. Only ENOENT still means absent (quoted:
  `src/charter.ts` line 85).
- **CR-FR-03 (README wording): CLOSED.** roles/README.md now says that
  non-charter YAML refuses only when none of it is a charter, and that it is
  ignored beside exactly one charter. It also lists the unlistable and
  bad-entry refusals and the `.yml` suffix. The stray-YAML case above matches
  that text.
- **CR-FR-04 (the declaration grants): CLOSED.** `witness/` is replaced by six
  exact spec paths. The bundle's scope line names all 10 entries added at head.
  No prefix remains. The AGENTS.md overlap with M5-P5 is the orchestrator's to
  record, and this round leaves it with the orchestrator.

## 2. The doctor behaviour change (unlistable `charter/` is now FAIL)

**What actually changed.** Before this round, any listing error went to the
"no charter/ directory" WARN with condition `retention-not-applicable`. The
`full` profile already promotes that condition to FAIL (quoted:
`src/commands/doctor.ts` line 113, the `full` promotion list). So under
`--for full` the verdict was already FAIL, and it stays FAIL. The change is
visible only under the generic and `watch` profiles, where the verdict goes
from WARN to FAIL. It applies only when something exists at `charter` and
cannot be listed.

**Consistency with doctor's other checks.** The checks do not agree with each
other, and the new behaviour sides with the stricter one:

- `checkKernelArtifacts` already splits ENOENT from other listing codes and
  reports the code, so a non-ENOENT error is a failure there. The new
  retention arm matches that.
- `checkTasks` does the opposite. On ANY listing error it returns WARN with
  condition `tasks-not-established` and defers to the layout check.
- In the ENOTDIR case, the layout check ALSO FAILs ("missing charter/"). So
  the one broken layout now produces two FAIL lines. The exit code does not
  change (it was 1 already, because of layout).
- In the EACCES case, the layout check would PASS, because the directory
  exists. The retention FAIL is then the only signal. That is the reason the
  FAIL is right. I could not run this case, because the container runs as
  root.

I judge the change correct and deliberate. The duplicated FAIL for ENOTDIR is
cosmetic.

**Who reads the verdict.** I searched with
`git grep -n "CHECK retention|retention-not-applicable|retention-undeclared|\"retention\""`
across src, scripts, bin, plugin, .github, .claude and test. The readers are:

- scripts/m1-exit-test.sh step A2. It counts `CHECK retention FAIL ... retention
  is not applicable (required for profile full)` on a FRESH fleet, where
  `charter/` exists and is empty. That is the listable path, so A2 is
  unaffected. The script is unchanged on this branch.
- test/doctor.test.ts and the two new brief-compose assertions. All are green
  in the 1413-test run.

No CI script, workflow or plugin reads the retention status.

## 3. The branches the work history lists as not covered

Executed:

- **A dangling symlink inside `charter/`.** Beside a valid charter, compose
  exits 0 with the valid charter and doctor WARNs on the valid charter. Alone,
  compose exits 1 ("1 YAML document(s) ... none with kind: charter") and doctor
  WARNs retention-undeclared. Rating: **low (CR-FR2-01)**. It fails closed when
  it is alone. Beside a charter, it is ignored silently. The damaging form is
  a fleet that meant to have TWO charters, one of them a broken link: it
  composes from the other one without the "several charters" refusal. That
  needs a broken link plus a second charter, and it is a choice between two
  real documents, not a default. The work history's own recommendation, to
  refuse it in a later phase, is right.
- **A dangling symlink AT `charter`.** Compose exits 0 with the undeclared
  sentence. Doctor's layout check FAILs ("missing charter/", doctor exit 1).
  Rating: **low, folded into CR-FR2-01**. The fleet is visibly broken to
  doctor. The composer's sentence "does not exist" is literally true of the
  link target. A lstat on `charter` would let the composer refuse it as well.
- For completeness: a symlink AT `charter` that points to a real directory
  holding one charter composes exit 0 with that charter. This is CR-M5P2-F01,
  which is tracked and not changed, as instructed.

## 4. The intermittent red-witness run

### Cause: a signal from another agent, established by timing and by shape

**The record.** The red run's evidence is under the implementer's scratchpad,
`p2/ev-r2/pr-bundle/red-witness/`:
- result.json: `startedAt 2026-09-23T10:36:15.004Z`,
  `endedAt 2026-09-23T10:42:06.348Z`, status red.
- witness-records.json: doctor-retention-not-applicable-and-undeclared-stay-distinct
  is evaluation 24 of 29 (the 19th of 23 stored specs). All three members were
  red 2/2. Members 0 and 2 had green head runs. Member 1's head run had
  `exitCode 1`, `failedNamedTests []`, `passedNamedTests []` and
  `missingNamedTests [the test]`.

**Timing.**
- The six own specs account for about 58 s of the gate's 351 s, so the stored
  re-evaluation ran from about 10:37:13 to 10:42:06.
- A three-member doctor spec takes about 30 s in isolation (my measurements
  below). Evaluation 24 therefore fell roughly between 10:40 and 10:41.
- The records carry no per-run timestamps, so this is an estimate, not a
  measurement. It is consistent with the other agent's report of a `pkill -f`
  on the shared Node 26 interpreter path at about 10:40Z.

**Shape: reproduced exactly by experiment, with the harness's argv** (scratch
scripts p2fr2-kill.sh and p2fr2-kill2.sh). The signals went only to process
trees my scripts had started:

| what was signalled, during the named test | runner result | TAP test points | harness reading |
|---|---|---|---|
| the file subprocess only, SIGKILL | exit 1, no signal | only `not ok ... test/doctor.test.ts` | MISSING, exit 1 |
| the file subprocess only, SIGTERM | exit 1, no signal | only `not ok ... test/doctor.test.ts` | MISSING, exit 1 |
| runner and file subprocess, SIGTERM (pkill's default) | exit 1, **no signal** | none | **MISSING, exit 1** |
| runner and file subprocess, SIGINT | exit 1, no signal | none | MISSING, exit 1 |
| runner and file subprocess, SIGKILL | killed, signal SIGKILL | none | problem, so evaluation ERROR |

The third row matters most. `node --test` handles SIGTERM, cleans up and
exits 1 without dying by the signal. So a default `pkill -f <interpreter
path>`, which sends SIGTERM to both processes, produces exactly the recorded
record: exit 1, the named test neither passed nor failed. Only SIGKILL of the
runner would have surfaced as a harness problem. The bundle's top-level
process survived because it was started by bare `node`, so its command line
does not carry the absolute interpreter path. Children spawned with
`process.execPath` do carry it.

**Strength.** This is strong, not proven.
- The timing window matches, but only to within about a minute, from
  estimated positions.
- The record's shape is reproduced exactly by the reported action.
- 54 undisturbed runs never reproduced it (below).
- What I cannot show: that this particular child received that particular
  signal, since no process record survives. No evidence points anywhere else.

### Stability without interference

- Direct reruns of the named test in the gate's own clone
  (p2fr2-repro.mjs, the harness's argv, env scrub and TAP parser): 12
  sequential, plus 30 in six-wide parallel rounds. These ran concurrently with
  the full `npm test`, on 4 CPUs at load average 6.6 to 14.5. Result: 42 of 42
  passed, exit 0.
- `evaluateWitness` on the spec itself, 12 times (p2fr2-evalwit.mjs, inputs
  built as src/gates/red-witness.ts builds them for a stored spec, about 30 s
  each): 12 of 12 green. Every member was red 2/2, every head run exited 0,
  and no named test was missing.
- The spec also stayed green inside the full bundle run at 115e177 (below).

### Can the gate tell "the test did not run" from "the test failed"?

**No. A killed child is reported as a witness failure. That is the gate's
own honesty gap (CR-FR2-03, low, pre-existing).** From src/witness/run.ts,
which this branch does not change:

- src/witness/run.ts:926 puts a named test with no TAP point into `missing`.
  Nothing checks whether the stream carried a FILE-level `not ok` point, or
  no points at all.
- src/witness/run.ts:932 counts a repetition as red only when EVERY named test
  failed. So a killed repetition under a dangerous state does not count as
  red. The member then fails its rate, and the witness is red with
  "red in X of Y".
- src/witness/run.ts:1712 requires the head run's exit code to be 0 and every
  named test to have passed. So a killed head run reads as
  src/witness/run.ts:1584 "the named tests are not green at the audited
  head", and the witness is red.
- Only a child that itself dies BY a signal is separated out
  (src/witness/run.ts:900, "terminated by"), and that becomes an evaluation
  error. The SIGTERM path in the table above avoids exactly that branch.

So in both directions a killed child becomes RED, attributed to the diff. It
never becomes green: a false green needs exit 0 with every named test passed
(head) or every named test failed (red run), and a killed child produces
neither. The gate fails closed, but it fails loud about the wrong thing. It
blames the witness for an environment event, and it throws away the TAP
stream that would have shown the cause. `missingNamedTests` is recorded
without the file-level diagnostic (`signal:` or `error: 'test failed'` on
the `not ok <file>` point).

**Fix, as a separate task.** When a named test is missing and the exit code
is not 0, and the stream holds no point for it but does hold a file-level
`not ok` point (or no points at all), classify the run as a harness problem
("the named test did not run: <file-level diagnostic>"). That makes the
evaluation status `error`, not `red`. Also keep the first lines of TAP and
stderr in the record for any run that is not a clean pass or fail. A witness
whose named test is genuinely absent from the file is already caught
separately ("named test(s) not found in any test file at the audited head"),
so this change would not hide a real missing test.

**Operational lesson.** `pkill -f` on the shared interpreter path reaches
every agent's test processes. My own kill experiments were deliberately
scoped by parent pid for that reason.

## 5. behaviors.json, suite and bundle

- **behaviors.json union.** Merge 076ace5 has parents bf1a06e (the phase side)
  and 8558dca (main), and their merge base is 0b6eee7. Keys:
  - base 1269, phase side 1282 (13 added), main side 1275 (6 added);
  - union 1288, head 1288;
  - missing from head 0, extra in head 0, value conflicts 0, base keys
    removed 0.

  Raw key count at head is 1288, all unique, so there are no duplicate keys
  hidden by JSON parsing. The file is the exact union.
- **Suite.** `npm test` at 115e177, node v26.6.0, `dist/` built, in this
  worktree: exit 0, tests 1413, pass 1413, fail 0, cancelled 0, skipped 0.
- **Bundle.** I made a scratch clone, set its origin/main to 8558dca and
  checked out a local branch named claude/m5-p2-intent-to-outcome at 115e177.
  npm ci 0, build 0. `scripts/m2-exit-test.sh --base origin/main --head HEAD
  --phase m5-p2 --bundle pr --no-build`: **exit 0**.
  - `gates: declared 15 applicable 10 verdict 10 green 10 red 0 not-applicable 5 error 0 vacuous 0`
  - scope: green, 24 changed paths. 10 entries added at head are named, all
    exact files.
  - red-witness: green, 29 witnesses (6 own, 23 stored), "every witness red
    against every declared dangerous state and green at head". This includes
    the spec that was intermittent.
  - Citations were the only required gate not applicable. m2-assert: zero
    red, zero error, zero vacuous.
- **Other checks.** `check-authored-bytes.mjs` exit 0. The claim grep over the
  "Fix round 2" section gives 0 hits in both the line-based and
  wrap-insensitive forms. I also re-ran my charter-reader grep after the two
  main merges. The only readers are still src/charter.ts,
  src/commands/brief.ts and src/commands/doctor.ts. The main-side changes
  (orchestrator-next, the workflow, the gate registry) add no charter reader.

## Findings

### CR-FR2-01 (low): dangling symlinks near the charter

A dangling link inside `charter/` is ignored beside a valid charter. A
dangling link AT `charter` reads as undeclared to the composer, while doctor's
layout check FAILs it. Both need a broken fleet. Fix, in a later phase as the
work history recommends: type the `charter` path with lstat before listing
it, and class a dangling entry as refused, not absent. That change reaches the
shared reader's other callers, which is the reason to take it deliberately.

### CR-FR2-02 (low, pre-existing): doctor's retention verdict depends on file order when a bad entry sits beside a charter

With `a.yaml` (a charter with no retention) and a pipe or undecodable
`z.yaml`, doctor returns its WARN at `a.yaml` and never reaches the bad
entry, so it exits 0. Compose, from the same directory, refuses (exit 1). If
the bad file sorted first, doctor would FAIL. This is the early-return order
that round 1 preserved on purpose, so it is not a regression. It is the one
place where the shared entry list still yields different verdicts in the two
commands. Fix, optional: in doctor, return a refused or undecodable entry's
FAIL before the per-charter early returns.

### CR-FR2-03 (low, pre-existing, gate honesty): the red-witness harness reports a killed test child as a witness failure

Section 4 has the claim, the evidence, the no-false-green argument and the
fix. It belongs in a separate task against src/witness/run.ts, not in this
phase.

## Honest failures

- The EACCES arm (`charter/` present and unreadable) was not executed,
  because the container runs as root and mode 000 is still listable (probe 10
  composed normally).
- The cause of the intermittent is established by timing and shape. It is not
  proven by a process record for that exact child.
- I did not read CI for 115e177.
