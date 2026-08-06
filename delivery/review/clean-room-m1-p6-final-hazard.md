# Clean-room review: M1-P6 fix round 4 (HAZARD-CONTRACT lens, round 5)

- PR: #9, branch `claude/m1-p6-toy-sandbox-exit`
- Head reviewed: `c24fb86`
- Lens: HAZARD-CONTRACT
- Reviewer isolation: detached worktree at
  `/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/p6f-hazard`
- Date: 2026-08-06
- Finding IDs allocated from CR-760.

## Verdict

**APPROVE.**

3 findings, **0 high, 0 medium, 3 low** (CR-760, CR-761, CR-762). None blocks
the merge. CR-760 and CR-761 are satisfiable by editing the work history's
residual list and need no code change. CR-762 is an unidentified single test
failure I saw once on Node 22 under heavy contention and could not reproduce;
it is recorded as a pointer for whoever watches CI on this head, not as a
defect I can name.

Direct answers:

- **Does the harness work?** YES. Local mode exits 0 with `problems: []`;
  the falsification path exits 1 AND fails at C2 with a recorded failing C2
  record. No high was available.
- **Is the fail-closed reader sound?** YES on all five probes: three shapes it
  should reject all redden with the offending line quoted, two it should accept
  (including double- and single-quoted keys) stay green.
- **Is the D8 correction right?** YES, in both halves. `timeout-minutes: 1` is
  measured GREEN on this head, and the reasoning is sound: a timed-out step is
  a FAILED step, so it reddens the required check and was never a member of the
  class. Round 3's D8 claim should NOT be repeated to the owner.
- **Is R6 acceptable as a named residual?** YES. It is real (measured green at
  the job level, red at the step level), and I could not construct an exploit
  of it that was not a large committed diff. But it is stated one level too
  narrow; see CR-761.
- **Is anything from CR-720 to CR-725 still open?** NO. All six closed,
  independently reproduced here rather than taken from the work history.
- **Do the gates reproduce?** Node 26 and the registry, yes, exactly. Node 22,
  on the second run only; the first run had one failure I could not identify.
  See CR-762.

## Scope of this pass

Fifth review pass. Prior four dual reviews are not re-walked. This pass covers,
in priority order: (1) does the exit-test harness itself still work, (2) is the
fail-closed workflow reader sound, (3) spot-check of the derived key walk,
(4) the D8 correction, (5) residual R6. Acceptance criteria and settled
inventories are NOT re-derived.

## 1. Does the harness itself still work? YES

Run in the detached worktree on the floor toolchain (`node --version` echoed
into the log by the same shell that ran the harness).

```
$ node --version
v26.6.0
$ scripts/m1-exit-test.sh --mode local <ev>
... m1-exit-test: C3 ok (evidence bundle validated)
    m1-exit-test: local mode complete, evidence in .../HZ6-ev-local
LOCAL_EXIT=0
$ cat <ev>/output/bundle-validation.out
{
  "recordsValidated": 55,
  "recordsInBundle": 56,
  "tiphysInvocations": 13,
  "problems": []
}
$ ls <ev>/records | wc -l
56
```

Exit 0, `problems: []`. Every stage reported ok/recorded: A1 gates, A3 lease
survived stage B, B1 stub squash merge, C1 payload on the sandbox default
branch, C2 teardown, C3 lease release plus bundle validation.

### 1b. The falsification path

```
$ node --version
v26.6.0
$ TIPHYS_EXIT_TEST_SKIP_STAGE_B=1 scripts/m1-exit-test.sh --mode local <ev>
... m1-exit-test: C1 recorded (skipped-override: the payload's change is not on
      the sandbox default branch)
    --- captured output of the failing step ---
    tiphys teardown: branch task/m1-exit is not landed on origin/main;
      land it before tearing the task down
    --- end captured output ---
    m1-exit-test: FAILED: step C2 (tiphys teardown after the squash merge):
      expected exit zero, got 1
FALSIFY_EXIT=nonzero(1)
```

Re-running the workflow step's own node check over that evidence dir:

```
C2 executed records: 1 failing: 1 1
[{"step":"C2","label":"tiphys teardown after the squash merge",
  "exitCode":1,"outcome":"fail"}]
```

Nonzero, AND nonzero at C2 with a recorded failing C2 record, which is the
stronger property the workflow step asserts. **The harness works and it can
fail.** No HIGH is available from this section.

## 2. Is the fail-closed reader sound? YES, on five probes

Probe lab: `.../scratchpad/HZ6-lab` (a `cp -a` copy of the worktree; `gates.yml`
snapshotted to `gates.yml.PRISTINE` md5 `98dca2fe1b985f50a8fde9be55273d61` and
restored with `cp` after every probe, md5 re-verified each time; `git checkout --`
never used). Command each time, pattern before path:
`node --test --test-name-pattern='falsifiability guard' test/exit-test-local.test.ts`.

Three inputs it should reject:

| probe | edit | result |
|---|---|---|
| RJ1 | YAML explicit-key syntax at the guard step's key indent (`        ? if` / `        : false`) | RED 2/2, "gates.yml has a line at the key indent that this test cannot read as a single \"key: value\" entry: \"        ? if\"" |
| RJ2 | a tab-indented key inside the guard step (`\t\tif: false`) | RED 2/2 |
| RJ3 | explicit-key syntax at the `test` JOB's key indent (`    ? continue-on-error` / `    : true`) | RED 2/2, same fail-closed message scoped `job test` |

Two inputs it should accept:

| probe | edit | result |
|---|---|---|
| AC1 | a DOUBLE-QUOTED benign key on the guard step, `"env":` plus a nested value | GREEN 2/2 |
| AC2 | a comment at the job key indent, a SINGLE-QUOTED `'permissions':` block, and `timeout-minutes: 45` on the `test` job | GREEN 2/2 |

The reader reads quoted and unquoted keys as the same key (AC1/AC2 green,
and D15/D18/D21 in the work history red), and reddens with the line quoted on
any shape it does not know. One note, not a finding: RJ2 reddens via
"step falsifiability guard has no \"run: |\" block" rather than via the reader's
own tab assertion, because the tab line has zero leading spaces and so
terminates the step slice before the tab check sees it. It still fails closed.

## 3. Spot-check of the derived key walk: ONE wrong row

I did NOT re-derive the walk. I checked five rows and found one wrong.

Correct rows checked: step `timeout-minutes` ("a timeout makes the step FAIL,
which is the safe direction") is right and is the same reasoning as D8;
step `uses` is safe by a different route than the row gives, since
`workflowStep` asserts a `run: |` block exists and reddens without it;
job `strategy` is right, including the empty-matrix case, since a job with
zero legs reports `skipped`, and `skipped != "success"` reddens the fan-in;
job `environment` is right, since an approval gate leaves the required check
incomplete rather than successful.

**Scope of this spot-check, stated.** Five rows of thirty-two, chosen because
they are the rows whose answer is "no" for a reason that could plausibly be
wrong. I did not check the other twenty-seven and I did not re-derive the walk,
so this section establishes "one wrong row found", not "one wrong row exists".
Four of the five judgements above are reasoning over Actions' documented
semantics with no runner available to me; only the `uses` row's outcome was
measured, indirectly, by the RJ probes showing `workflowStep` reddens when the
`run: |` block is absent.

**Wrong row: job key `defaults`.** The table says
*"YES, via `defaults.run.shell`, the same hole one level up. Covered by the
file-wide shell rule"*. `defaults.run` also carries `working-directory`, which
the step table on the same page REFUSES for a reason that does not change one
level up ("runs against another tree, so it can certify a harness that is not
this repository's"). The file-wide rule is over `shell:` only, so the
`defaults` row asserts a coverage it does not have. This is the row that
generates R6, and the row does not cross-reference R6. See CR-761.

## 4. Is the D8 correction right? YES

Measured on this head, in the probe lab:

```
=== D8 EXIT=0   tests 2  pass 2  fail 0
    (edit: "        timeout-minutes: 1" added to the guard step)
```

So `timeout-minutes: 1` is GREEN, exactly as the implementer states, and
round 3's table entry "caught" no longer holds on this head.

The reasoning is also right. The class under test is "a GREEN required check
with the guard neutered". In Actions' documented semantics a step that exceeds
`timeout-minutes` is a FAILED step; the job then fails, the fan-in sees
`needs.test.result != "success"` and exits 1, and the required check goes RED.
A red check is the safe direction, so `timeout-minutes: 1` was never a member
of the class and reddening it was never evidence for the whitelist. Round 3
offered it as the proof that the whitelist closed a class; it was in fact an
instance of the whitelist's false-positive bug (CR-724), which round 3's own
table already contained and read as a win. **The orchestrator should not
repeat round 3's D8 claim to the owner.**

**Scope of this negative result, stated.** I have no GitHub runner and did not
measure Actions' step-timeout semantics on one. The statement "a timed-out step
is a failed step" is read from the documented workflow syntax, which is the
same scope caveat the implementer states (their "did NOT cover" item 5). What I
DID measure is the half that decides the correction: that the test is green on
this head under that edit.

## 5. Is R6 acceptable as a named residual? YES, but it is understated

Measured, all four in the probe lab:

```
=== R6step  EXIT=1  pass 1 fail 1   working-directory on the guard STEP
            "the falsifiability guard step declares working-directory: \"./vendor\""
=== R6job   EXIT=0  pass 2 fail 0   test job defaults.run.working-directory
=== R6wf    EXIT=0  pass 2 fail 0   WORKFLOW defaults.run.working-directory
```

R6 is real: the job-level form is green, the step-level control is red.

It is acceptable as a residual, and the implementer's reason holds under
measurement. `defaults.run.working-directory: ./vendor` redirects EVERY `run`
step in the job, including `npm ci`, `npm run build` and `npm test`. To get a
green check out of it an attacker must commit a whole second tree at that path
carrying a package manifest, the three gate scripts and a `scripts/m1-exit-test.sh`
that exits 0. That is a very loud diff, enforced by the pull-request review in
the same way as residuals R1 and R2. The one-line key alone turns the workflow
RED, not green.

What is understated is the level. See CR-761.

## 6. Are CR-720 to CR-725 still open? NO, all closed

Independently reproduced in my own lab rather than taken from the work
history's matrix.

| finding | edit re-run here | result |
|---|---|---|
| CR-720 | the guard step lifted verbatim into a new `falsify:` job the fan-in does not name | RED 2/2, "the \"falsifiability guard\" step is not inside the job this test was asked about (step lines 47-93, job lines 14-42)" |
| CR-721 | `if: false` on the `gates` fan-in step | RED, "the gates fan-in step declares if: \"false\"" |
| CR-722 | double-quoted JOB key `"continue-on-error": true` on `test` | RED, "the test job declares continue-on-error: \"true\"" |
| CR-723 | `paths-ignore: ['**']` under `pull_request:` | RED, "the pull_request: trigger is filtered by \"    paths-ignore: ['**']\"" |
| CR-724 | F3 `needs: [test, lint]` with a `lint` job added; F3b block-sequence `needs:` | GREEN 2/2 each (the round-3 false positives are repaid) |
| CR-724 | F1/F2 quoted `'permissions':` block and `timeout-minutes: 45` on the `test` job (probe AC2) | GREEN 2/2 |
| CR-725 | `scripts/m1-exit-test.sh` lines 900-936 | closed: the branch now classifies SIX lock states from the `lock status` first line, each with its own label and state sentence, has a catch-all "NOT RECOGNISED" arm, and the record words the take-over as an ATTEMPT ("The NEXT step ATTEMPTS a take-over. It is an attempt, not a result ... Whether the attempt succeeded is that step's own record, not this one's claim.") |

## Findings

Two, both LOW. No high, no medium.

### CR-760 (LOW): the `gates` fan-in's own script is asserted only as text, so two ordinary edits defang the required check while both assertions match

**Claim.** Tier 1's stated mechanism is that you cannot decide what another
program will do by pattern-matching text, so the GUARD step's `run:` script is
extracted and EXECUTED against stub harnesses. That mechanism is not applied to
the FAN-IN step's script, which is checked by two regexes over the job block
text: `/needs\.test\.result\s*\}\}"\s*!=\s*"success"/` and `/exit 1/`
(`test/exit-test-local.test.ts`, the 5b block). Both survive edits that make
the script always exit 0. `gates` is the job DR-0004 nominates as the required
check ("the protection rule requiring a pull request plus a passing check named
\"gates\"", DR-0004-elevated-permissions.md line 18), so this is a wider lever
than the guard step: it lets a FAILING `test` job, i.e. a failing
`npm ci`/`npm run build`/`npm test`, reach a green `gates` job. I did not read
the live branch-protection settings and cannot from here (residual R1), so
"required" rests on DR-0004, not on an observation. The
implementer names this construction honestly in the comment ("assertions about
a shell script's text"), but it is not in the "What REMAINS UNGUARDED" list,
which is the list whose whole purpose is that residuals are named.

**Evidence.** Two structurally different members (CLAUDE.md, "one witness is
not a class"), both in `.../scratchpad/HZ6-lab`, `gates.yml` restored and md5
re-verified after each:

```
FI1  96c96
     <           if [ "${{ needs.test.result }}" != "success" ]; then
     >           if false && [ "${{ needs.test.result }}" != "success" ]; then
     === FI1 EXIT=0   tests 2  pass 2  fail 0

FI2  95a96
     >           exit 0            (inserted above the if, making exit 1 unreachable)
     === FI2 EXIT=0   tests 2  pass 2  fail 0
```

Baseline on the pristine file is EXIT=0 pass 2, and the RED controls in section
6 above show the harness under the same command does redden, so these greens
are not a broken invocation.

**Scope of this negative result, stated.** The claim "no other test executes the
fan-in script" needs a derivation, so here it is in full, with a self-correction
first. My first attempt was `grep -n "needs.test.result" test/*.ts`, which
returned EMPTY, and the empty result was a usage error, not an absence: the
source text is `needs\.test\.result` with literal backslashes, so an unescaped
`.` cannot match across them. That is CLAUDE.md's own "a usage error read as a
clean result", and it is why the correct commands and their full output are
below rather than a summary.

```
$ grep -rn -F 'fail unless every matrix leg succeeded' test/ scripts/
test/exit-test-local.test.ts:914:  const fanIn = workflowStep(gatesJob, "fail unless every matrix leg succeeded");

$ grep -rn -E 'needs\\?\.test\\?\.result' test/
test/exit-test-local.test.ts:900:    /needs\.test\.result\s*\}\}"\s*!=\s*"success"/,

$ grep -rn -E 'gates\.yml|WORKFLOW_PATH|workflows' test/     (first 10 of 10)
test/exit-test-local.test.ts:287, 293, 385, 386, 393, 431, 442, 459, 813, 828
```

So exactly one test file reads `gates.yml` at all, exactly one site names the
fan-in step, and exactly one site asserts on `needs.test.result`. What the
searches do NOT cover: `test/` and `scripts/` only, so a guard living in
`src/`, `bin/` or `.github/` itself would not appear (I checked no such guard
is expected to exist and found none while reading `gates.yml`, which contains
no self-check); and they are text searches over the tree at `c24fb86`, so a
dynamically constructed step name would evade them. I also did not run either
mutant on a GitHub runner, so "the required check goes green" is from
documented Actions semantics; what is MEASURED here is only that the test stays
green under both edits.

**Severity, argued.** This is graded LOW deliberately. It meets the letter of
"lets a broken milestone certify green", but the lever is an edit to
`gates.yml`, which is the same lever as R2's "the test file can be deleted in
one commit", and R2's answer, the pull-request diff, applies unchanged here. It
is the one finding in this review I would accept an argument for grading MEDIUM.

**Fix, cheapest acceptable.** Do NOT build another tier. Add R7 to the "What
REMAINS UNGUARDED" list, naming the fan-in script body, saying it is asserted
textually and enforced by the pull-request diff. **Fix, if the phase is being
touched anyway** (about eight lines, reusing machinery that already exists):
`workflowStep(gatesJob, "fail unless every matrix leg succeeded")` already
returns `.script`; substitute `${{ needs.test.result }}` with `success` and
then with `failure` and execute it as tier 1 does, asserting exit 0 and exit
nonzero respectively. Both mutants above redden under that.

### CR-761 (LOW): R6 is stated one level too narrow, and the walk's `defaults` row claims a coverage it does not have

**Claim.** R6 reads "`working-directory` at the JOB's `defaults.run`". The
identical hole exists at the WORKFLOW's `defaults.run`, where it redirects both
jobs rather than one. The implementer applied "one witness is not a class"
correctly to the neighbouring key, `shell`, asserting it file-wide at any
indent and witnessing D30 (job level) and D30b (workflow level) precisely
because "a rule attached to two nodes is how CR-720 and CR-721 happened". The
same reasoning was not carried to `working-directory`. The walk's job-key
`defaults` row compounds it by answering "Covered by the file-wide shell rule",
which is true of `shell` and false of `working-directory`.

**Evidence.**

```
=== R6wf EXIT=0   tests 2  pass 2  fail 0
    (inserted before "jobs:")
    defaults:
      run:
        working-directory: ./vendor
```

with the job-level control `R6job` also EXIT=0 and the step-level control
`R6step` EXIT=1.

**Scope of this negative result, stated.** I probed `working-directory` at
three levels only: guard step, `test` job `defaults.run`, workflow
`defaults.run`. I did NOT probe it on the fan-in step (the code path there is
`test/exit-test-local.test.ts:915`,
`refuseKeys(fanIn.keys, REFUSED_STEP_KEYS, "the gates fan-in step");`, which
passes the same `REFUSED_STEP_KEYS` array that reddened probe R6step, so I
inferred coverage from the shared array rather than measuring that arm), and I did not walk the rest of the
step or job vocabulary for a third key with this shape; that walk is the
implementer's, published, and I spot-checked five of its rows rather than
re-deriving it (section 3).

**Fix.** Documentation only, no code needed for the merge: restate R6 as
"`working-directory` at a `defaults.run`, at EITHER the job or the workflow
level", and correct the `defaults` row of the job-key table to say the
file-wide rule covers `shell` only. If code is preferred, the one-line form is
to add a second file-wide sweep beside the existing `shell:` sweep, refusing
any `working-directory:` at any indent outside the `run:` block scalars, which
is the same shape as the rule already there.

## Gates and scope

Floor toolchain first on PATH, `node --version` echoed into each log by the
same shell that ran the command.

```
node v26.6.0 (floor)
  npm ci    exit 0
  npm test  exit 0: tests 156, pass 156, fail 0, skipped 0, 105.9s

node v22.22.2 (container default, via bash -lc; version echoed inside the
  login shell, CLAUDE.md environment warning 1)
  npm test  run 1: tests 156, pass 153, FAIL 1, skipped 2, 180.9s
            (reported: 156/154/0 fail/2 skip; see CR-762)
            run 2: tests 156, pass 154, fail 0, skipped 2, exit 0
                   (matches the report exactly; 0 lines matching '^not ok')

behavior registry (test/behaviors.json)
  162 mappings, 156 distinct test titles, 0 unresolved, 0 duplicate keys
```

The Node 26 and registry rows are mine and reproduce exactly. The Node 22 row
does NOT: see CR-762 below, which is the only finding in this review raised
against the gates rather than against the workflow-wiring test.

Scope: four files as declared, `scripts/m1-exit-test.sh`,
`test/exit-test-local.test.ts`, `test/behaviors.json` and
`delivery/work-history/m1-p6.md`. `.github/workflows/gates.yml` is untouched:

```
$ git diff --stat 5e3fd38 c24fb86 -- .github/workflows/gates.yml
(no output)
```

So every one of CR-720 to CR-724 was indeed a defect in the TEST, not in the
workflow, and the implementer's framing of the round is accurate.

## Isolation (T-004)

All work in the detached worktree
`.../scratchpad/p6f-hazard` at `c24fb86`, plus my own scratch lab
`.../scratchpad/HZ6-lab` (a `cp -a` copy of that worktree, used for every
`gates.yml` mutation) and the harness's own `mktemp` work dirs
`/tmp/tiphys-m1-exit-y9M51T` and `/tmp/tiphys-m1-exit-HoBmfq`.

- `/home/user/tiphys-ai-helmsman` was only read; its HEAD is `e2021b3` and it
  was never written.
- `.../scratchpad/p6f-criteria`, the concurrent reviewer, was never touched.
- `git status --porcelain` in `p6f-hazard` shows only my own untracked review
  artifacts (`REVIEW-OUT.md`, `HZ6-*.log`, `HZ6-ev-*`, `npm-ci.log`); no
  tracked file is modified.
- **Nothing was written to the real sandbox repository.** Both harness runs
  used the harness's own `file://` remote inside its `mktemp` work dir;
  `ThomasHendrickx/tiphys-ai-helmsman-sandbox` was never referenced.
- `git checkout --` was never used. Every mutation restored `gates.yml` from
  `HZ6-lab/gates.yml.PRISTINE` with `cp`, and the md5
  `98dca2fe1b985f50a8fde9be55273d61` was re-verified after each of the
  fifteen probes.
- `gh` was never invoked; no full-mode work was attempted.

## Note, not a finding

Probe RJ2 (a tab-indented key inside the guard step) reddens via
"step falsifiability guard has no \"run: |\" block" rather than via
`declaredKeys`' own tab assertion, because a line whose indentation is tabs has
zero leading SPACES, so it terminates the step slice before the tab check sees
it. The reader still fails closed, which is the property; the tab assertion is
simply not the arm that fires. Worth knowing only if someone later reasons
about that assertion's coverage.

### CR-762 (LOW): one unidentified Node 22 test failure, seen once under heavy contention, not reproduced

**Claim.** The reported Node 22 column is 156 tests, 154 pass, 0 fail, 2
documented floor skips. My first Node 22 run produced **153 pass and 1 FAIL**.
My second, run when the machine was quiet, matched the report exactly. I cannot
name the failing test, so I am recording the observation rather than a defect.

**Evidence.**

```
run 1  (HZ6-n22.log)   # tests 156 / # pass 153 / # fail 1 / # skipped 2
                       # duration_ms 180879.05929
run 2  (HZ6-n22b.log)  # tests 156 / # pass 154 / # fail 0 / # skipped 2
                       # duration_ms 104018.244441
                       N22B_EXIT=0 ; grep -c '^not ok' -> 0
node 26 (HZ6-suite.log) tests 156 / pass 156 / fail 0 / skipped 0, exit 0
```

**What I did NOT capture, stated plainly.** Run 1 was piped through `tail -20`,
so the TAP body was discarded and the `not ok` line with it. I have the counts
and nothing else. That is my error and it is why this finding names no test.

**What was true at the time.** `ps` during run 1 showed two other `npm test`
invocations live (`etime` 02:08 and 02:22) plus a floor-toolchain
`node --test test/watcher.test.ts`, i.e. the concurrent reviewer's suite. The
plausible mechanism is CLAUDE.md environment warning 11, that suite wall time
grows with real-clock lease waits, so a lease-freshness assertion can miss its
window under CPU contention. The wall times are consistent with that: the same
156 tests took **181s in run 1 and 104s in run 2**, a 74 percent stretch.
**That is still a hypothesis, not a measurement**: I did
not force contention deliberately, and with the failing test unknown I cannot
show that this mechanism is the one that fired.

**Fix.** Nothing to change in this PR. Two things for the merge: watch the
Node 26 CI run on this exact head, which is the authority, and if a flake
appears on Node 22 later, this is the earliest sighting and it was on the
`main`-plus-four-files tree, so it is not evidence against this phase's diff
specifically. If anyone reruns the Node 22 column, capture the full TAP rather
than a tail.
