# Clean-room DELTA review of PR #9 (M1-P6) FIX ROUND 2, HAZARD contract

- head reviewed: `9b766397291f7374b42bd94469a26c9de18bc3c9`
- previous reviewed head: `8954b058af96af4e8e913416abcc68516f556a9b`
- branch: `claude/m1-p6-toy-sandbox-exit`
- contract: hazard (T-007), DELTA scope. The six acceptance criteria were
  NOT re-walked and the path inventory was NOT re-derived, per dispatch.
  A criteria reviewer ran concurrently on the same head.
- verdict: **FIX-ROUND-NEEDED**
- findings: 5 total, **0 high, 2 medium (CR-680, CR-681), 3 low**
- isolation (T-004): all work in the detached worktree
  `/tmp/claude-0/.../scratchpad/p6c-hazard` at `9b76639`, plus scratch
  dirs `.../scratchpad/HZ3-lab`, `.../scratchpad/HZ3-defang`. Nothing in
  `/home/user/tiphys-ai-helmsman` was written. The sibling worktree
  `p6c-criteria` was never touched. `git status --porcelain` in my
  worktree is empty at the end of this review and `ps` shows no
  surviving `tiphys watch` and no orphan watchdog.
- **Nothing was written to the real sandbox repository.** Every harness
  run used a `file://` remote; the two `sandboxRemote` values recorded in
  my bundles are `file:///.../HZ3-lab/sandbox.git` and
  `file:///tmp/tiphys-m1-exit-lKNk4Y/toy-sandbox.git`. I never referenced
  `ThomasHendrickx/tiphys-ai-helmsman-sandbox` at all, not even to read.

## Method

Node 26 toolchain first on PATH throughout except where Node 22 is named.

```
node v26.6.0 / npm 11.18.0
npm ci          exit 0, no EBADENGINE line
npm run build   exit 0
git status --porcelain after build: EMPTY
npm test        exit 0: tests 155, pass 155, fail 0, skipped 0, 88.2s

node v22.22.2 (container default)
npm test        exit 0: tests 155, pass 153, fail 0, skipped 2
                (both skips are the pre-existing M1-P2 floor gates and
                 carry their reason on the TAP line)

bash -n scripts/m1-exit-test.sh            exit 0
behaviors.json                             161 mappings, 0 unresolved
```

Both toolchains match the reported numbers exactly. Registry resolution
was checked by harvesting all 155 test titles from the Node 26 TAP run
and matching every one of the 161 descriptions against them: 0
unresolved, and the renamed id `exit-test-falsifiability-guard-wired`
resolves to `the gates falsifiability guard fails the job when the
harness cannot fail`.

Work executed: 8 defangs of `gates.yml` against the rewritten guard test;
1 real full-mode stage A with a reviewer-built `gh` stand-in (exit 0, 37
records, 1m43s); 3 stage C runs on that bundle (adversarial `session.json`,
expired lease, and the round-1 harness for comparison); 1 real local-mode
run (exit 0, 56 records, 2m0s); 5 standalone runs of the shipped
`validate_bundle` extracted verbatim; 2 executions of the workflow step's
extracted script under a round-1/round-2 A-B; and 4 faithful extractions
of harness fragments under adversarial input.

---

## Note for the orchestrator before reading the findings

Two mediums formally means FIX-ROUND-NEEDED, and that would be **fix
round 3** on this phase. DR-0012's limit ("stop rather than grind when a
phase needs more than two fix rounds") is therefore in play and this
review is not the place that decides it. What I can offer is the size of
each remedy, measured rather than guessed:

- **CR-681** is two `assert.doesNotMatch` lines in a test that already
  exists, no harness change, no new test, no behaviour registered. Both
  assertions are against text already in the file.
- **CR-682** is one `assert.equal(hits.length, 1, ...)`.
- **CR-683** is a three-line `existsSync` guard in the workflow plus one
  more stub case.
- **CR-684** is one `if [ -z ... ]` line matching a guard that already
  exists on the adjacent variable.
- **CR-680** is the only one needing a real decision: either a six-line
  take-over branch (constructed and verified below), or a correction to
  three pieces of prose that currently state something false.

Whether that is a same-round correction under DR-0012 clause 6 or a third
dual round is the orchestrator's call, not mine. I record severity by the
standard the previous rounds used, not by what is convenient.

---

## FINDINGS

### CR-680 (medium): the DR-0015 lease report is non-fatal, but the run dies anyway sixteen records later, and the bundle records a claim that is false

**Claim.** The lapse branch fires correctly and then the run fails at C2
regardless, because `tiphys teardown` refuses on an expired lease. The
whole justification for making the observation non-fatal, written into
`scripts/m1-exit-test.sh` (header lines 70-81 and the `stage_c` comment at `:839-847`),
into the evidence record itself, and into the work history, is that
failing there "would fail a certification run for a slow approval". It
fails anyway. The record asserts the opposite, in the bundle, in
capitals.

**Why it is dangerous.** DR-0015 sized the lease at 14400 seconds so the
lapse should not happen, and the header itself concedes it can ("If a
wait longer than the sized lease is expected, renew before it"). This
phase alone has taken three review rounds; a four hour stage B wait is
plausible, not exotic. When it happens, the operator gets a bundle
containing a record that says the run continues deliberately, followed by
a hard failure whose diagnostic names the lock and not the wait. The
implementer's own "What this round did NOT execute" item 3 says this
branch was written but never triggered. Triggering it is what shows the
design premise is wrong.

**Evidence, constructed.** Real full-mode stage A bundle (37 records),
work directory restored from a byte copy, lease expired by editing only
`expiresAt` in `fleet/state/orchestrator.lock` and nothing else:

```
$ node dist/bin/tiphys.js lock status
expired holder d43cadc3-... acquired 2026-08-05T14:33:44.257Z expires 2026-08-05T14:35:00.000Z

$ scripts/m1-exit-test.sh --mode full --stage c --approval ... .../ev-lapse
m1-exit-test: A3 observed (lease state after the stage B wait: exit 0)
m1-exit-test: A3 recorded (observation: THE LEASE DID NOT SURVIVE STAGE B)
m1-exit-test: C1 ok (the payload's change is on the sandbox default branch)
...
tiphys teardown: lease .../orchestrator.lock expired 2026-08-05T14:35:00.000Z
  (holder d43cadc3-...); re-acquire or take over before mutating tasks
m1-exit-test: FAILED: step C2 (tiphys teardown after the squash merge): expected exit zero, got 1
STAGE C (EXPIRED LEASE) EXIT=1
```

No `bundle-validation.out` was ever written: the run dies before C3, so
the bundle is incomplete as well as failed.

The record written at `040-A3.json` says, verbatim: *"The run continues,
because an expired lease does not block a release and failing here would
fail the run for a slow approval; this record is the report."* The first
half is true and irrelevant, the second half is false:

```
$ node dist/bin/tiphys.js lock release --holder d43cadc3-...
released d43cadc3-...                                     exit 0   <- release is fine
$ TIPHYS_HOLDER_ID=d43cadc3-... node dist/bin/tiphys.js teardown --task m1-exit
tiphys teardown: lease ... expired ...; re-acquire or take over ...   exit 1   <- teardown is not
```

**Fix, constructed and verified end to end.** The remedy is CLI-only, no
lock semantics change, in the branch that already exists:

```
$ node dist/bin/tiphys.js lock acquire --take-over --duration 14400
acquired ccc4e83d-... expires 2026-08-05T18:45:29.714Z            exit 0
$ TIPHYS_HOLDER_ID=d43cadc3-... node dist/bin/tiphys.js teardown --task m1-exit
tiphys teardown: lease ... is held by ccc4e83d-..., not by TIPHYS_HOLDER_ID d43cadc3-...
                                                                  exit 1
$ TIPHYS_HOLDER_ID=ccc4e83d-... node dist/bin/tiphys.js teardown --task m1-exit
torn down m1-exit                                                 exit 0
```

So the lapse branch should, after writing its report: run
`lock acquire --take-over --duration ${CERTIFICATION_LEASE_SECONDS}`,
re-read the holder id from that output, re-export `TIPHYS_HOLDER_ID`, and
update `holderId` in `session.json` so C3's `lock release --holder`
matches. Two traps to avoid, both measured above: the take-over WITHOUT
`--duration` reverts to the kernel default of 900 seconds (measured:
`acquire --take-over` at 14:45:11 gave `expires 15:00:11`), and teardown
refuses a stale `TIPHYS_HOLDER_ID` with a different message than it uses
for expiry. If the take-over is not taken, the header, the `stage_c`
comment and the record text must all be corrected to say that the run
WILL fail at C2, which is the honest alternative.

Positive control, so this is not read as a general breakage: on the same
bundle with the lease untouched, stage C exits 0 and the SURVIVED branch
records `still held by this run: held holder d43cadc3-... expires
2026-08-05T18:34:00.122Z`.

---

### CR-681 (medium): the rewritten guard test closes the shell class of defangs and leaves the YAML class open, and the work history says otherwise

**Claim.** All five named defangs redden the test, verified below. But
`continue-on-error` was one MEMBER of the class "YAML-level edits that
disable the step without touching its script", not the class. Adding
`if: false` to the step is a one-line edit in the same file that leaves
the test green and stops the guard running in CI. The work history states
the class is exhausted: *"`continue-on-error` is YAML semantics rather
than shell, so no exit code from the script can witness it; that one
alone stays a structural assertion"*.

**Why it is dangerous.** This is CR-640/CR-661 in reduced form. By the
project's own T-003 stronger rule, a test counts only when it is red
against the DANGEROUS state, and "the guard no longer fails the job" is
reachable by an edit the test does not see. It is also, in miniature,
exactly the instance-versus-mechanism pattern that CR-644 was raised
about and that cost M1-P5 four rounds: one member of a class closed, the
class left open, and a sentence written asserting the class.

**Evidence, constructed.** Each edit applied to a copy of the shipped
`gates.yml` in an isolated lab, then
`node --test --test-name-pattern "the gates falsifiability guard fails
the job when the harness cannot fail" test/exit-test-local.test.ts`
(pattern before the path), then the file restored and `diff`-confirmed
identical.

| # | Edit | test exit | verdict | assertion that fired |
|---|---|---|---|---|
| baseline | none | 0 | green | - |
| D1 | `exit 1` to `exit 0` in the guard-broken branch | **1** | CAUGHT | "the guard passed a harness that exited 0 on the skip-stage-B path" |
| D2 | `continue-on-error: true` on the step | **1** | CAUGHT | "the falsifiability step is marked continue-on-error ..." |
| D3 | `process.exit(1)` dropped from the C2 arm | **1** | CAUGHT | "the guard accepted a nonzero run with no failing C2 record" |
| D4 | the whole step deleted | **1** | CAUGHT | "no workflow step whose name contains falsifiability guard" |
| D5 | the `if` block replaced by `\|\| true` | **1** | CAUGHT | "the guard passed a harness that exited 0 on the skip-stage-B path" |
| **D6** | **`if: false` on the step** | **0** | **NOT CAUGHT** | - |
| **D7** | **`continue-on-error: true` on the `test` JOB** | **0** | **NOT CAUGHT** | - |

D6 is the sharp one and needs no reasoning about GitHub internals: a step
carrying `if: false` does not run, the remaining steps pass, the job
concludes success, and the `gates` fan-in job (which only tests
`needs.test.result != success`) stays green. The guard-on-guard sees
nothing because the step's block still parses, its `run:` script still
extracts, and all four behavioural probes still pass against it.

D7 is recorded alongside it but is scoped weaker: `block` is sliced from
the step's own lines, so a `continue-on-error` at `jobs.test` is outside
the only text the test scans. That half is measured. The CI consequence
(job-level `continue-on-error` reports `success` to `needs`) is reasoned
from GitHub Actions semantics and was NOT measured on a runner here.

**Scope of the defang search.** Eight edits, all confined to
`.github/workflows/gates.yml`. I did not attack `test/exit-test-local.ts`
itself, and I did not attack the `gates` fan-in job's `needs:` list.

**Fix.** Two assertions in the test that already exists, no harness
change, both against text that is already there:

```js
assert.doesNotMatch(block, /^\s{8}(if|continue-on-error):/m,
  "the falsifiability step carries a step-level if: or continue-on-error:");
assert.doesNotMatch(workflow.slice(0, workflow.indexOf("    steps:")),
  /continue-on-error/, "the test job is marked continue-on-error");
```

Better still, and what would actually close the class rather than two
more members of it: assert that the step block contains exactly the keys
`name` and `run` and nothing else. That is a whitelist, and a whitelist is
the only shape that does not need re-extending each time someone finds a
new YAML key.

---

### CR-682 (low): `workflowStep` takes the FIRST name match and never asserts uniqueness, so the test can validate a step other than the one CI runs

**Claim.** `workflowStep(nameFragment)` uses `lines.findIndex(...)`. If a
second step's name also contains "falsifiability guard", the test
extracts and validates that one, and the real step can be defanged
freely. This is not purely hypothetical: the work history contemplates a
full-mode falsifiability guard, and adding one above the existing step is
the natural way to get there.

**Evidence, constructed.** A copy of the step inserted immediately above
the real one, renamed `M1 exit test falsifiability guard (full mode,
added later)`, with the REAL step's `exit 1` changed to `exit 0`:

```
$ grep -n "name: M1 exit test falsifiability" gates.yml
43:      - name: M1 exit test falsifiability guard (full mode, added later)
78:      - name: M1 exit test falsifiability guard (the harness must be able to fail)
$ node --test --test-name-pattern "the gates falsifiability guard ..." test/exit-test-local.test.ts
test-exit=0   pass 1
```

The test is green while the step CI actually runs prints
`FALSIFIABILITY GUARD BROKEN` and then exits 0.

This also answers the "does extraction read the shipped YAML" question:
it does (`readFileSync(new URL("../.github/workflows/gates.yml", ...))`),
and I confirmed that a broken extraction is self-catching (an unsubstituted
`${{ ... }}` gives bash a bad substitution, which reddens probe 2). The
gap is not extraction, it is ambiguity of the selector.

**Fix.** Assert exactly one match before slicing:

```js
const hits = lines.filter((l) => /^ {6}- /.test(l) && l.toLowerCase().includes(nameFragment.toLowerCase()));
assert.equal(hits.length, 1, `${hits.length} workflow steps match ${nameFragment}`);
```

---

### CR-683 (low): the workflow guard still has one crash-not-decision path, and the test's stub always hides it

**Claim.** This is the generalising half of the implementer's own D3
lesson. The C2 arm was made total so an empty `failing` array is a
decision rather than a `TypeError`. But `fs.readdirSync(dir)` two lines
above it still throws when the harness exits nonzero without creating
`records/`, and the guard then "fires" by unhandled exception rather than
by its check. The test cannot see it because the `red-elsewhere` stub
does `mkdir -p "${evidence}/records"` unconditionally.

**Evidence, constructed.** Shipped step script, extracted and executed
against a stub that exits 1 and creates nothing:

```
$ ( cd lab && bash step.sh ); echo "step exit=$?"
node:fs:1884
  const result = binding.readdir(
step exit=1
```

The direction is safe (fail-closed, the job goes red), so this is low,
not medium. It is recorded because "a guard whose correctness depends on
a crash is not a guard" is this round's own sentence, and one instance of
it survives in the same twelve lines the sentence was written about.

**Fix.** `const dir = ...; if (!fs.existsSync(dir)) { console.error("the
harness left no records directory: " + dir); process.exit(1); }` before
the `readdirSync`, and a fifth stub in the test that creates no records
directory.

---

### CR-684 (low): the CR-644 derivation aborts arithmetic on a malformed `session.json`, prints bare bash errors, and silently skips its own disagreement note

**Claim.** `session_seq=$((10#${session_seq}))` at
`scripts/m1-exit-test.sh:1121` errors when `recordSeq` is missing or null
(`json_field` returns the empty string for both). Under `set -euo
pipefail` this does NOT abort, so the run continues with three bare bash
errors on stderr, no `m1-exit-test: FAILED:` framing and no evidence
pointer, and both `[ "${session_seq}" -gt ... ]` and
`[ "${session_seq}" -ne ... ]` then fail as tests, which means the CR-644
disagreement note is never written. This is the CR-641 shape (an
undiagnosed abort-ish path on an adversarial input) reappearing inside
the CR-644 fix.

**Evidence, constructed**, faithful extraction of the whole block with
the same `set -euo pipefail` and the same `json_field`, against a records
directory whose highest file is `037-A1.json`:

```
A: recordSeq missing entirely
   line 16: 10#: invalid integer constant (error token is "10#")
   line 18: [: : integer expression expected
   line 19: [: : integer expression expected
   RESULT record_seq=37     block exit=0     <- no C3 disagreement note written
B: recordSeq null            identical to A
C: recordSeq "5"             NOTE WRITTEN: session 5, disk 37, resuming from 37   record_seq=37
D: recordSeq "999"           NOTE WRITTEN: session 999, disk 37, resuming from 999 record_seq=999
```

**The mechanism itself is not defeated**, and that is the important half:
`record_seq="${disk_seq}"` is assigned unconditionally BEFORE the two
tests, so a failing test can only leave `record_seq` at the disk maximum,
never below it. Correctness here rests on an assignment, not on a crash.
What is lost is the diagnosis.

A second instance of the same class, from reading rather than
construction: `TIPHYS_HOLDER_ID=$(json_field ... holderId)` has no
emptiness check either, and an empty value collapses
`grep -q "^held holder ${TIPHYS_HOLDER_ID} "` to a pattern with two
spaces, which matches nothing and reports a FALSE lapse. Scope of that
claim: read from `scripts/m1-exit-test.sh:1106` and `:849`, not constructed.

**Fix.** `if [ -z "${session_seq}" ]; then session_seq=0; fi` immediately
after the `json_field` call, matching the guard `disk_seq` already has
one line below, plus a `die` if `holderId` comes back empty.

---

## Disposition of CR-640 to CR-647

Every one is fixed as scoped. CR-680 and CR-681 are NEW findings on the
new code, not reopenings.

| Finding | Sev | My verdict, by construction |
|---|---|---|
| CR-640 / CR-661 wiring test asserts text | med | **RESOLVED as scoped.** All five defangs redden, each on the right assertion (table above). Residual, new: CR-681, CR-682, CR-683. |
| CR-641 unguarded `cp` | low | **RESOLVED.** The guard is present at `:884-888` and precedes the `cp` at `:889`. Not re-constructed: the absent-README probe was walked in full last round and the delta is a literal `if [ ! -f ]` + `assert_step`. Scope stated. |
| CR-642 trap misses `watchdog_pid` | low | **RESOLVED by inspection.** `trap 'kill "${watch_pid:-}" "${watchdog_pid:-}" 2>/dev/null \|\| true' EXIT` at `:599`, cleared at `:740`; it is still the only EXIT trap installed in the file. Behaviourally, `ps` after my two real harness runs and one aborted stage C shows no surviving watcher and no orphan `sleep 30`. Not re-constructed with an injected `die`. |
| CR-643 B1 exemption not mode-conditional | low | **RESOLVED, constructed.** Shipped validator extracted verbatim, run standalone against a REAL local bundle (56 records) and a REAL full bundle (51 records). See table below. |
| CR-644 sequence MECHANISM | low | **RESOLVED, mechanism closed.** See below. Residual: CR-684 (diagnosis only). |
| CR-645 lease sized + observed | low | Half fixed, half broken: the sizing is real and verified; the observation's design premise is false. **CR-680.** |
| CR-646 stale `tests 153` | low | **RESOLVED.** The only surviving occurrence of `153` in `test/exit-test-local.test.ts` is line 48, inside the comment explaining why the number was REMOVED ("An earlier version cited 'tests 153' ..."). No live citation remains. I first drafted this row as "the grep returns nothing", which was false; I checked before shipping. |
| CR-647 A5 delayed blind emit | low | **RESOLVED as agreed.** The `note_step A5 observation` record is present at `:636-637` and I read it in my own bundle (`025-A5.json`). |

**CR-643, constructed** (shipped validator, extracted verbatim, run
standalone):

```
local bundle untouched,          mode=local   problems: []                                        exit 0
local bundle, 6 B1 outcomes stripped, mode=local   "step B1 has records but none carrying an outcome"  exit 1
local bundle, 3 C2 outcomes stripped, mode=local   "step C2 has records but none carrying an outcome"  exit 1   (control)
full bundle untouched,           mode=full    problems: []                                        exit 0
full bundle,                     mode=local   "step B1 has records but none carrying an outcome"  exit 1
```

The last row is the mode conditional doing exactly its job on the same
bytes: identical bundle, different mode, different verdict.

**CR-644, constructed, with a paired red witness.** Real full-mode stage A
(37 records, `recordSeq 37`), `session.json` hand-edited to claim `5`,
then stage C:

```
THIS HEAD (9b76639):
  stage C exit 0
  records 37 -> 51 files,  51 DISTINCT sequence numbers,  duplicates: NONE
  037-B1.json still kind "pending-owner-action", label unchanged
  038-C3.json: "session.json recordSeq 5, highest record on disk 37;
                resuming from 37 so no existing record is overwritten (CR-644)"
  bundle validation: recordsValidated 50, recordsInBundle 51,
                     tiphysInvocations 13, problems: []

ROUND-1 HARNESS (8954b05 script, same bundle, same edit):
  stage C exit 0
  records 37 -> 48 files,  37 distinct,  DUPLICATES: 006 007 008 009 010
                                          011 012 013 014 015 016  (11)
  e.g. seq 006 holds BOTH 006-A1.json and 006-B1.json
  bundle validation: problems: []          <- the corruption is SILENT
```

**Is the mechanism closed, or is this another instance?** For the record
sequence specifically: **CLOSED.** `record_seq` is now `max(disk, session)`
where `disk` is derived from the actual file names, so no value in
`session.json` can drive it below the highest record that exists. I
attacked it with four session values (missing, null, far too low, far too
high) and could not produce an overwrite. The residual (CR-684) is loss of
diagnosis, not loss of the property.

The instance-versus-mechanism PATTERN did recur this round, but in a
different component: CR-681, where one member of the YAML-defang class was
closed and the class was declared closed with it.

---

## The implementer's two self-corrections: both TRUE

**Self-correction 1, the TypeError.** Verified by A-B execution of the
extracted step script against a stub that exits 1 and leaves an empty
`records/`:

```
ROUND-1 workflow (8954b05), process.exit(1) DROPPED:
  step exit=1
  no C2 record showing a nonzero teardown exit with outcome fail
  [eval]:13  console.log("... " + failing[0].exitCode);      <- TypeError
ROUND-2 workflow (9b76639, shipped), process.exit(1) DROPPED:
  step exit=0
  falsifiability guard witnessed at C2: exitCode                <- now visible
```

Exactly as described: the explicit exit was not load-bearing, the guard
"worked" by crashing, and totalising the success line is what makes D3
reddenable. Confirmed.

**Self-correction 2, "the count goes UP, the corruption is in the
numbering".** Confirmed: 37 files became 48, not fewer, with 11 duplicated
sequence values at 006 through 016 and a real collision at `006-A1.json` /
`006-B1.json`. My absolute numbers are one higher than the work history's
(48/37 against its 47/36) because my stage A bundle came from the ROUND-2
harness, which writes one extra record (the new A5 `observation`). The
duplicate range, the count of duplicates, and the direction all reproduce.

---

## What the round broke, answered directly

- **Can `observe_step` ever become fatal?** Not through the command it
  runs. Constructed against the exact line
  `( cd "${cwd}" && "$@" ) >"${out_path}" 2>&1 || rc=$?` under
  `set -euo pipefail`: command absent -> `rc=127`, cwd absent -> `rc=1`,
  output path in a missing directory -> `rc=1` plus a bash message,
  command returns false -> `rc=1`. All four reached the next line. Scope:
  that line only. It shares the ordinary fatality of `write_record` (a
  failing `json_object` redirect aborts under `set -e`), which is not new
  and not specific to observations. The only new hazard around it is
  CR-680, which is not `observe_step` failing but the run failing
  afterwards.
- **Can the extracted-script test pass when the real workflow differs
  from what it extracted?** Yes: CR-682. The extraction does read the
  shipped YAML, and a broken extraction is self-catching, but the
  selector is not unique.
- **The widened trap:** still the only EXIT trap installed in the file.
  `grep -nE "^\s*trap " scripts/m1-exit-test.sh` returns exactly two
  lines, `:599` (the install, now covering both pids) and `:740`
  (`trap - EXIT`, the clear after the `wait` reaps the child). The four
  other `grep -c "trap "` hits are comment text, which is why the raw
  count is 6; I quoted that raw count as 1 in an earlier draft of this
  report and it was wrong. `${watchdog_pid:-}` handles the unset window.
  No orphans observed after three real runs.
- **The guarded `cp`:** the guard precedes the `cp` and uses `assert_step`,
  which records before it dies. No regression found.
- **The mode-conditional validator:** correct in both directions, table
  above. `kind === "observation"` was also added to the PR-102 tiphys
  invocation check, which is why `tiphysInvocations` is 13 in my bundles
  and 12 in the round-1 bundle. Both numbers reproduce.

---

## Regressions hunted and NOT found, with scope

1. **Does the A3 renew undo the DR-0015 sizing?** No. `lock renew
   --holder <id>` passes no `--duration`, which looked like it would
   reset to the kernel default of 900. It does not: acquire at 14:33:44
   gave `expires 18:33:44`, renew at 14:34:00 gave `expires 18:34:00`,
   and the lease file records `"durationSeconds": 14400`. Scope: one real
   full-mode stage A on Node 26. (`--take-over` is different and DOES
   revert to 900; see CR-680.)
2. **Can a `session.json` edit still cause an overwrite?** Not found.
   Scope: four hand-edited values (missing, null, 5, 999) against a
   37-record bundle, plus one full adversarial stage C run.
3. **Did the rewrite change the test count or the registry?** No. 155
   tests on both toolchains, 161 mappings, 0 unresolved, id preserved.
4. **Conventions.** `grep -cP '[^\x00-\x7F]'` returns 0 for each of the
   five changed files; the only repo-wide non-ASCII hit outside
   `node_modules`, `.git` and `dist` is the pre-existing
   `delivery/intake/orchestrated-delivery-process.md`. No em dash in any
   changed file. `git log 8954b05..9b76639` is one commit, author and
   committer `Tiphys Orchestration <orchestration@tiphys.invalid>`, no AI
   or tool name in subject or body.
5. **Scope audit.** Exactly five files changed:
   `.github/workflows/gates.yml`, `scripts/m1-exit-test.sh`,
   `test/exit-test-local.test.ts` (declared), `test/behaviors.json` and
   `delivery/work-history/m1-p6.md` (standing extras). Nothing else.

---

## Probes run

1. 8 defangs of `gates.yml` against the rewritten guard test (5 named + 3
   mine), each applied to an isolated copy and restored `diff`-identical.
2. 1 real full-mode stage A with a `gh` stand-in and a `file://` remote:
   exit 0, 37 records, A1 ran the real kernel suite (`003-A1.out` reports
   `duration_ms 82288`).
3. 3 stage C runs on byte copies of that bundle: adversarial `session.json`
   (exit 0), expired lease (exit 1 at C2), round-1 harness (exit 0, 11
   duplicates).
4. 1 real local-mode run: exit 0, 56 records, 56 distinct, `problems: []`.
5. 5 standalone runs of the shipped `validate_bundle`, extracted verbatim
   (4620 bytes) with an argv shim.
6. 2 A-B executions of the workflow step's extracted script (round-1 vs
   round-2, `process.exit(1)` dropped).
7. 1 execution of the shipped step against a stub leaving no `records/`.
8. 4 faithful extractions of the CR-644 derivation block and the
   `observe_step` runner line under adversarial input.
9. `lock` CLI probes: release on expired, teardown on expired, take-over
   with and without `--duration`, teardown with stale and fresh holder id.

## Honest failures

1. **My first decoy probe reddened for the wrong reason.** The insertion
   mangled the script and the step exited 127; I only noticed because I
   read the assertion text (`the guard rejected a harness that failed
   correctly at C2`) instead of the exit code. CR-682 rests solely on the
   corrected probe, where I printed the resulting YAML before running.
2. **My first validator extraction passed argv wrong** (`node file.js`
   makes `process.argv.slice(1)` start at the script path), producing
   five identical ENOTDIR crashes that I could easily have written up as
   validator failures. Fixed with a `process.argv.splice(1,1)` shim.
3. **D6 and D7 were not witnessed on a GitHub runner.** What I measured
   is that the guard-on-guard stays green, which is the half the finding
   is about. That a step with `if: false` does not run, and that a
   job-level `continue-on-error` reports `success` to `needs`, is
   GitHub Actions semantics I did not execute here.
4. **The lapse was triggered by editing `expiresAt`, not by waiting four
   hours.** `lock status` reports `expired holder ...` for that state,
   which is the branch condition, and teardown's refusal quotes the same
   timestamp. I did not observe a naturally expired lease.
5. **CR-641 and CR-642 were confirmed by inspection plus incidental
   observation, not re-constructed.** Both were fully constructed last
   round and the delta is literal; if the orchestrator wants them
   re-witnessed, they were not re-witnessed here.
6. **I did not re-walk the six acceptance criteria, re-derive the path
   inventory, or re-run the falsification (skip-stage-B) path.** All
   deliberate, per the delta dispatch.
7. **My own first draft carried six wrong line citations and one false
   grep claim** (`:598` for a trap at `:599`, `:872-876` for a guard at
   `:884-888`, `:634-635` for a note at `:636-637`, `:1119` for the
   arithmetic at `:1121`, `grep -c "trap "` reported as 1 when it is 6,
   and "no test count appears in the test file" when line 48 still
   mentions `tests 153` inside the comment explaining its removal). I
   caught them by re-executing every citation before shipping rather than
   trusting my notes. Recorded because this review's own findings are
   about claims written without the construction that settles them, and
   the reviewer is not exempt from that.
