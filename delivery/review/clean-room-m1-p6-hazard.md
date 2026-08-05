# Clean-room review of PR #9 (M1-P6), HAZARD contract

- phase: M1-P6, toy sandbox project and exit-test harness
- branch: `claude/m1-p6-toy-sandbox-exit`
- head reviewed: `79604ecd36cea50e0d4e8fcb0f7b574887eeb9d2`
- contract: hazard (T-007). A criteria reviewer ran concurrently; this
  report walks criteria only where a regression spot-check was needed.
- verdict: **FIX-ROUND-NEEDED**
- findings: 10 total, 0 high, 4 medium (CR-600, CR-601, CR-602, CR-605),
  6 low (CR-603, CR-604, CR-606, CR-607, CR-608, CR-609)
- reviewer isolation: all work in the detached worktree
  `/tmp/claude-0/.../scratchpad/cr-p6-hazard` at `79604ec`. Nothing in
  `/home/user/tiphys-ai-helmsman` was written. No sibling scratchpad
  worktree was touched. **Nothing was pushed to
  `ThomasHendrickx/tiphys-ai-helmsman-sandbox`**: it was cloned read-only
  once, and `git ls-remote` at the start and the end of this review both
  returned `27c882f521694e8ba72969a4257aaa31e1d58adb`, unchanged. The
  full-mode walkthrough below used a `file://` remote only.

## Starting question, answered first

**Can this harness pass while the milestone is actually broken?**

**No green-when-broken state was found while the harness is intact.** That
is a positive result and it was established by construction, not by
reading, in three ways:

1. **The documented falsification path, re-derived rather than re-read.**
   `TIPHYS_EXIT_TEST_SKIP_STAGE_B=1 scripts/m1-exit-test.sh --mode local
   HZ-ev-falsify` on Node v26.6.0: **exit 1**, failing at C2 with
   `m1-exit-test: FAILED: step C2 (tiphys teardown after the squash
   merge): expected exit zero, got 1`, 41 records, last record
   `041-C2.json` carrying `"exitCode": 1, "outcome": "fail"`. The run did
   not stop at C1, so teardown's refusal of unlanded work is what failed
   it, which is the point of the guard. This reproduces the implementer's
   numbers exactly.
2. **A break the harness's own stages catch, that the implementer did not
   claim.** Running the unmodified harness on the container's Node
   v22.22.2 (below the declared `>=26` floor): **exit 1** at A2, captured
   output `CHECK node FAIL v22.22.2 does not satisfy kernel engines
   ">=26"`. The harness cannot certify M1 from a below-floor toolchain.
3. **A break the end-to-end stages CANNOT catch, and where the assurance
   actually lives.** I patched `src/commands/watch.ts` so the resident
   watcher writes its beacon and then emits `signal m1-exit turn-end`
   unconditionally at startup, with no turn-end signal in existence and
   before any task is spawned. The milestone condition "the watcher wakes
   on completion" is false in that build. With A1's three kernel gates
   stubbed out, **the harness ran to completion and exited 0** with a
   validated 51-record bundle whose A8 records are indistinguishable from
   an honest run (`"exitCode": 0, "outcome": "pass"`, `expected` and
   `observed` both `signal m1-exit turn-end`). The control: with A1
   intact, the same mutation drives `npm test` to **exit 1, 153 tests,
   149 pass, 4 fail** (`a resident watcher wakes on a turn-end file with
   one signal line` among them), so the real harness dies at A1. See
   CR-603: the harness catches this, but through A1's unit suite and not
   through the end-to-end witness the evidence bundle presents as the
   proof.

Nothing else I constructed produced a false green. The vacuous-assertion
sweep, the substitution and skip enumeration, and the bundle audit did
produce four medium findings, three of which degrade the evidence bundle
or the run itself rather than the pass/fail verdict.

## Method

Node 26 toolchain first on PATH throughout, except where a Node 22 result
is explicitly reported.

```
node v26.6.0 / npm 11.18.0
npm ci          exit 0, 0 EBADENGINE lines
npm run build   exit 0
git status --porcelain after build: clean (tracked tree)
npm test        exit 0: 153 tests, 153 pass, 0 fail, 0 skipped, 96.3s
```

```
node v22.22.2 (container default)
npm ci          exit 0
npm run build   exit 0
git status --porcelain after build: clean (tracked tree)
npm test        exit 0: 153 tests, 151 pass, 0 fail, 2 skipped
                (both skips the pre-existing M1-P2 floor gates, each
                 carrying its reason in the TAP output)
```

Both toolchains match the reported numbers. Seven harness runs were
executed (baseline local, falsification, full-mode stage A, full-mode
stage C, three instrumented probes) plus one Node 22 run; every mutation
was reverted and the tracked tree is clean at the end of this review.

## Findings

### CR-600 (medium): full-mode stage C silently destroys stage A's `pending-owner-action` evidence record

**Claim.** In full mode the record that proves stage B was NOT scripted is
overwritten by stage C, and the final bundle contains no trace of it.

**Why it is dangerous.** Section 4 makes stage B "a recorded human
authorization and is not pretended to be a script step", and the evidence
bundle is committed to `main` as the milestone's proof (section 4,
"Evidence recording"; M2 may not start before that commit lands). The one
record asserting that the harness stopped and handed over to the owner is
destroyed by the harness itself, and nothing notices: `validate_bundle`
passes. It is also the general shape of the defect, since record
filenames are `NNN-STEP.json` and `NNN` is restored from `session.json`
across invocations.

**Evidence, constructed.** I walked the entire full-mode path with a
reviewer-built `gh` stand-in and a `file://` sandbox remote (this path was
previously unexecuted by anything; see the work history's own "What this
pass did NOT execute", item 1).

```
scripts/m1-exit-test.sh --mode full --stage a \
    --sandbox-remote file:///tmp/HZ-full-remote.git HZ-ev-full
  -> exit 0, ending with
     "B1 recorded (pending-owner-action: stage B is an owner
      authorization and is not scripted)"
HZ-ev-full/session.json: "recordSeq": "33"
# stage B performed by hand as the owner would (squash merge + push)
scripts/m1-exit-test.sh --mode full --stage c \
    --approval /tmp/HZ-approval.txt HZ-ev-full
  -> exit 0
grep -l "pending-owner-action" HZ-ev-full/records/*.json  -> no match
HZ-ev-full/records/034-B1.json is now
  { "kind": "assertion", "label": "stage B owner authorization artifact
    supplied", ... }
kinds in the final full bundle: { executed: 27, assertion: 17 }
```

The mechanism is at `scripts/m1-exit-test.sh:618-632` and `:876-878`:
`stage_a` writes `session.json` with `recordSeq=33` and returns; only then
does main call `stage_b_full_pending`, which writes record 034. On
`--stage c`, `scripts/m1-exit-test.sh:867` restores `record_seq=33` and
the first `note_step` at `:868` rewrites `034-B1.json`.

**Fix.** Move the `session.json` write so it happens after
`stage_b_full_pending` (or have `stage_b_full_pending` rewrite
`recordSeq`), and add a `validate_bundle` rule that a full-mode bundle
must contain a B1 record of kind `pending-owner-action`, exactly as it
already requires the approval artifact.

### CR-601 (medium): a step failure between A5 and A8 leaks the harness-owned resident watcher, permanently

**Claim.** The `die` paths in A6 and A7 do not kill the backgrounded
`tiphys watch` child. Those are precisely the milestone-failure paths.

**Why it is dangerous.** The plan is explicit that "the harness, not the
kernel, owns the process (C-3)", and `scripts/m1-exit-test.sh:473-474`
records exactly that claim into the evidence. Owning a process means
owning its termination. The A5 beacon timeout (`:480`) and the A8 wake
timeout (`:577`) both `kill "${watch_pid}"`; `die` (`:258-262`) does not,
and neither does any trap. So a full-mode stage A that fails at A6 or A7
on the owner's machine, which is the milestone certification run, leaves a
resident watcher polling a `/tmp` fleet with no supervisor and no
termination condition.

**Evidence, constructed twice.** Two copies of the harness with a single
injected `die` (and A1's gates stubbed for speed only; the watcher
lifecycle is untouched):

```
probe 1, die injected immediately after the A6 spawn step:
  PROBE_EXIT=1
  3s after the harness exited:
  719  00:03  node .../dist/bin/tiphys.js watch     <- still running

probe 2, die injected BEFORE the A6 spawn step, so no turn-end can ever
exist and the watcher has nothing to wake on:
  PROBE2_EXIT=1
  3830  00:23  node .../dist/bin/tiphys.js watch
  and, checked again later in the session:
  3830  02:29  node .../dist/bin/tiphys.js watch    <- still running
```

Probe 1's watcher did eventually exit on its own, because spawn had
already produced a turn-end. Probe 2's could not, and did not.

**Fix.** One line: immediately after `watch_pid=$!` at
`scripts/m1-exit-test.sh:472`, install
`trap 'kill "${watch_pid:-}" 2>/dev/null || true' EXIT`, and clear it
after the `wait` at `:588`. Killing inside `die` would work too but misses
the `set -e` abort paths.

### CR-602 (medium): three bundle records carry a hand-written `observed` value, and one of them cannot be re-derived from the bundle at all

**Claim.** `assert_step` is called three times with an `observed` argument
that is a literal chosen to equal `expected`, so the record asserts its
own conclusion. For C1 there is no captured output anywhere in the bundle
from which a reader could check it.

**Why it is dangerous.** The bundle is the artifact a later reader trusts
in place of having watched the run, and this project's standing rule is
that a claim with no verifiable artifact behind it is treated as unknown.
A reader of the bundle cannot distinguish a measured assertion from a
declared one, and this is exactly the T-006 pattern one representation
layer down.

**Evidence.** `scripts/m1-exit-test.sh:385`, `:423`, `:693-695`. From my
baseline run:

```
HZ-ev-base/records/045-C1.json
  "label":    "the payload's change is on the sandbox default branch",
  "expected": "the exit-test line present at main head d28003eb...",
  "observed": "the exit-test line present at main head d28003eb...",
  "outcome":  "pass"

HZ-ev-base/output/044-C1.out   -> 0 bytes (git clone --quiet is silent)
```

The `README.md` that `:692` actually greps is never copied into
`${evidence}/output/`. Contrast `:556-558`, where A7 puts 300 bytes of
real captured output into `observed`; that is the pattern that works.

**Fix.** For C1, copy the cloned `README.md` (or the matching line) into
`${evidence}/output/` and put the real matched text in `observed`. For
A1's "compiled CLI entry present" and A2's "doctor printed no FAIL line",
put the observed fact in (`ls -l` result, `grep -c " FAIL "` count)
instead of restating the expectation.

### CR-603 (low): A8 never establishes that the wake was caused by the task

**Claim.** The harness starts the resident watcher at A5, before the task
exists, and at A8 asserts only that `watch.out` eventually contains
exactly `signal m1-exit turn-end` and that the process exited 0. It never
asserts that `watch.out` was empty before the spawn.

**Why it is dangerous.** The A8 records are what the work history's
criterion 3 walk and the evidence bundle present as the witness for the
blueprint's third exit condition, "the watcher wakes on completion". They
witness a line, not a wake. The mitigation is real but indirect: the
property is guarded by the M1-P5 unit suite that A1 runs, and the
workflow comment at `.github/workflows/gates.yml:29-32` shows the author
already anticipated pressure to remove that duplicated run.

**Evidence, constructed** (full detail under "Starting question", item 3).
With the resident watcher patched to emit the wake line unconditionally at
startup and A1's kernel gates stubbed, the harness exits 0 and the A8
records are byte-indistinguishable from the honest run. Control with A1
intact: `npm test` exit 1, 4 failures.

**Fix.** One line at `scripts/m1-exit-test.sh:487`, where the A5 beacon
assertion passes: assert `[ ! -s "${watch_out}" ]` and record it. That
converts A8 from "the line appeared" to "the line appeared only after the
task ran".

### CR-604 (low): harness step A1's seeded-project `npm test` is exit-code-only, so it passes on a sandbox with zero tests

**Claim.** `scripts/m1-exit-test.sh:402` runs `run_step A1 zero
"${seed_clone}" "seeded project npm test" -- npm test`, which reads only
the exit code. Criterion 1 requires "with at least 1 test".

**Why it is dangerous.** Same transitive-coverage shape as CR-603: the
count is checked only by the kernel unit test
`sandbox-clone-npm-ci-and-test`, against a scratch `file://` seed, not
against the repository the full-mode run actually clones.

**Evidence, constructed.** A copy of `sandbox/` with its only test file
removed:

```
npm ci   exit 0
npm test exit 0     <- what run_step A1 zero sees
         "tests 0 / pass 0 / fail 0"
```

and separately, on Node v26.6.0 with the pin,
`node --test "test/**/*.nomatch.js"` gives exit 0 with `1..0`, `# tests
0`, `# pass 0`, `# fail 0`. Both halves of the implementer's claim about
the vacuous case reproduce.

**Fix.** Parse the pinned count in A1 as well, or state the coupling in
the harness header so nobody later "optimises away" the A1 kernel `npm
test` and silently removes the only guard.

### CR-605 (medium): the falsifiability guard has no automated regression witness anywhere

**Claim.** `TIPHYS_EXIT_TEST_SKIP_STAGE_B` is referenced only inside
`scripts/m1-exit-test.sh` itself. Nothing in `test/` and nothing in
`.github/` ever exercises the red path.

**Why it is dangerous.** This is the harness that certifies M1 and gates
every kernel PR from this phase on. Its single most important property is
that it can fail. That property is currently discharged by one manual run
recorded in a work history, plus my re-derivation. A future edit that
makes the harness unconditionally green would turn nothing red: CI runs
only the green path, and the suite does not run the harness end to end at
all. "A harness that cannot fail is worse than no harness" is the reason
criterion 5 exists, and criterion 5 has no guard of its own.

**Evidence.**

```
grep -rn "SKIP_STAGE_B" .github/ test/      -> no match
grep -rn "SKIP_STAGE_B" (whole tree, excluding delivery/, node_modules,
                         dist, .git and my scratch dirs)
  -> scripts/m1-exit-test.sh:52, :640, :641, :696, :701 only
```

Scope of that negative: the checkout at `79604ec`, all tracked trees
except `delivery/`, which is paperwork and cannot execute anything.

**Fix.** Cheapest sufficient version: a registered behavior in
`test/exit-test-local.test.ts` that runs the harness with
`TIPHYS_EXIT_TEST_SKIP_STAGE_B=1` and asserts a nonzero exit and a C2
record with `"outcome": "fail"`. If the ~90s cost is unacceptable in the
suite, add it as a second CI step instead, so at least one automated
witness exists that the harness is falsifiable.

### CR-606 (low): `validate_bundle` under-reports its own record count

**Claim.** The bundle-validation output reports one fewer record than the
bundle contains, because `records.length` is computed before the
validation's own record is written.

**Evidence.** Baseline local run: `ls HZ-ev-base/records | wc -l` = 51,
while `HZ-ev-base/output/bundle-validation.out` says `"records": 50`.
Full-mode bundle: 44 files, `"records": 43`. `scripts/m1-exit-test.sh:801`
and `:810-822`.

**Why it matters at all.** It is a number inside the milestone's evidence
that disagrees with the same bundle's file count, and the work history's
"51 JSON records" claim is checked against the directory, not against this
line. Cosmetic, but it is the kind of small disagreement that costs a
later reader an hour.

**Fix.** Report `records.length + 1`, or write the validation record first
and validate afterwards.

### CR-607 (low): step coverage in `validate_bundle` can be satisfied by records that assert nothing, and one note is labelled `executed`

**Claim.** `validate_bundle` requires only that each registry step id
appears on some record. Records written by `note_step` carry no `outcome`
and are therefore exempt from the outcome check at
`scripts/m1-exit-test.sh:778`.

**Evidence.** In the baseline 51-record bundle, 8 records have no
`outcome` field: `005-A1`, `019-A3`, `023-A5`, `026-A6`, `029-A6`,
`042-B1`, `043-C1`, `046-C1`. Of these, `023-A5.json` carries
`"kind": "executed"` with no `command`, no `exitCode`, no `outputFile` and
no `outcome`:

```
{ "step": "A5", "kind": "executed",
  "label": "harness-owned resident watcher started",
  "note": "the harness owns this process, ..." }
```

In the normal run every step also has real executed or assertion records,
so this is latent rather than active. It becomes active the moment a step
loses its executing record, which is what CR-600 demonstrates is possible.

**Fix.** Require at least one record with an `outcome` per step, and give
the watcher-start note a kind that is not `executed` (`started`, or
`assertion`).

### CR-608 (low): the A3 lease renewal buys 900 seconds for a wait the plan says is unbounded

**Claim.** `scripts/m1-exit-test.sh:615-616` renews once at the end of
stage A, and stage C never renews before `lock release` at `:727-728`.
The plan (PR-203, section 4 B1) says stage B "has no timing requirement;
the lease renewal from A3 covers the wait". It covers 15 minutes.

**Why it matters.** Not a false green: I read `src/lock.ts:559-562`,
"Expiry does not block a release", so C3 still exits 0 on an expired
lease. The exposure is that during any owner approval longer than the
default 900s lease, the fleet lease is expired and takeover-able in the
middle of the milestone-certification run, and a takeover would make C3
fail spuriously.

**Fix.** Renew at the top of `stage_c` before C1, and state the bound in
the harness header instead of inheriting the plan's "no timing
requirement" phrasing.

### CR-609 (low): stale header comment in the phase's test file

`test/exit-test-local.test.ts:12-19` still reads "Until those merge, the
end-to-end local-mode run cannot execute, and the criteria that depend on
it are recorded as deferred in delivery/work-history/m1-p6.md rather than
asserted here." M1-P4 and M1-P5 are merged on this branch (merge commit
present in `git log origin/main..HEAD`) and all four deferred criteria are
discharged in the work history. The comment now misdescribes the state of
the world to the next reader.

**Fix.** Rewrite the paragraph to say what is still true: the suite covers
the harness's own surface, and the end-to-end run is covered by CI's
local-mode step (and, if CR-605 is taken, by the falsification test).

## Substitutions and skips, enumerated

Every local-mode substitution and skip in the registry, with the question
"does the local substitute test the property the full step tests?".

| Step | Disposition | Local substitute | Verdict |
|---|---|---|---|
| A1 | local-substitute | scratch bare repo stands in for owner action A-1; `seed-sandbox.sh` then runs against it identically | Adequate. The seeder is the same code path; the only untested half is the real remote's default-branch resolution, and the work history discharges that against the real repository (verified below). |
| A6 | local-substitute | pushed branch ref via `git ls-remote`, compared to the payload's commit sha; `gh pr view OPEN` recorded as `skipped-full-only` | Adequate and honest. The record `029-A6.json` states the skip in its own text. The PR-opening code path itself (`stub-payload.sh:114-119`) is never executed by CI or the suite; I executed it once with a stand-in `gh` (see CR-600's walkthrough) and it works. |
| B1 | local-substitute | harness stub squash merge into the scratch remote, then a real `assert_commit_identity` on the squash commit | Adequate. The squash path is genuinely witnessed. C1 checks only that the README line landed, not that it landed via a squash, so a plain merge would also satisfy C1; low value to tighten. |
| C1 | local-substitute | squash commit observed on the sandbox default branch; `gh pr view MERGED` recorded as `skipped-full-only` | The skip is honest, but the substitute's own record is not falsifiable from the bundle: CR-602. |

**No skip reads as a pass.** Both `skipped-full-only` records
(`029-A6.json`, `043-C1.json`) carry `kind: skipped-full-only` and note
text naming the substitution, and neither carries an `outcome` field, so
neither can be mistaken for an assertion that succeeded. In full mode the
harness writes zero `skipped-full-only` and zero `substituted` records
(measured on my full-mode bundle: `{ executed: 27, assertion: 17 }`),
which is the correct behavior and had not previously been executed.

## Vacuous-assertion sweep

Every place a stage's success depends on a grep or a parse, with what
happens when it matches nothing:

- `:420` `grep -q " FAIL "` on doctor output, used as a `die` trigger.
  Not vacuous: `src/commands/doctor.ts:391` emits
  `CHECK ${name} ${status} ${detail}\n`, so a FAIL line always carries a
  space on both sides of `FAIL`, including when `detail` is empty.
- `:439-442` `grep -c " FAIL "` and `grep -c "^CHECK gh FAIL"` in the
  gh-absent branch. `|| true` makes a no-match yield `0`, and the
  assertion requires exactly `1`, so a no-match fails rather than passes.
- `:450` holder-id parse. Empty result reaches an explicit `die` at `:451`.
- `:517-521` payload branch and commit parse. Empty reaches `die` at `:519`.
- `:525-530` `git ls-remote` for the pushed branch. A failed `ls-remote`
  yields an empty `remote_sha` which cannot equal the non-empty
  `payload_commit`, so the assertion fails.
- `:555` `grep -q "${task_branch}"` in the teardown refusal. `task_branch`
  is `task/m1-exit`, no regex metacharacters. A no-match fails.
- `:692` `grep -q "exit-test ${TASK_ID} landed a trivial change"` on the
  merged README. A no-match fails (or, under the falsification override,
  records and defers the failure to C2, which I re-derived).
- `:402` seeded-project `npm test`: **exit code only**, and a vacuous
  suite exits 0. This is CR-604.

## Reporter pin

Scoped and correct.

- `grep -rn "NODE_OPTIONS"` and `grep -rn "test-reporter"` over the whole
  tree excluding `delivery/`, `node_modules`, `dist` and `.git`: exactly
  one occurrence each, `test/exit-test-local.test.ts:294`, inside a
  per-call `{ ...env, NODE_OPTIONS: ... }` object. It does not reach the
  kernel's own suite, `package.json`, the workflow, or the harness's other
  children.
- **Pin refused exits 7, constructed on both toolchains.**
  `NODE_OPTIONS=--test-reporter=no-such-reporter npm test` in `sandbox/`:
  exit **7** on Node v26.6.0 and exit **7** on Node v22.22.2, with
  `code: 'ERR_MODULE_NOT_FOUND'`. The `npm test` exit-code assertion at
  `:296` fires first, so the failure is loud.
- **Pin accepted on both toolchains**: TAP output, exit 0, `# tests 2`,
  `# pass 2`, `# fail 0` on both.
- **The count parse guards the vacuous case, constructed.** With the pin,
  `node --test "test/**/*.nomatch.js"` on Node v26.6.0 exits 0 and prints
  `1..0`, `# tests 0`, `# pass 0`, `# fail 0`. Exit code alone is blind;
  the `# pass (\d+)` parse is what is load-bearing.

## Red witnesses re-derived (not re-read)

All on Node v26.6.0, single-test runs with `--test-name-pattern` preceding
the positional path. Baseline unmutated: `ok 1`, pass 1 fail 0, exit 0.

1. **Sandbox suite genuinely fails** (`greet.js` returns `HELLO, ${name}`):
   `not ok 1`, error `npm test failed:`, pass 0 fail 1, exit 1.
2. **Sandbox ships no test at all** (only test file moved aside):
   `not ok 1`, error `expected at least one passing test, got 0`,
   pass 0 fail 1, exit 1.
3. **Reporter pin removed** (the pre-fix state, `env` instead of
   `{ ...env, NODE_OPTIONS }`): `not ok 1`, error `no pass count in npm
   test output:`, pass 0 fail 1, exit 1 on Node 26.

All three mutations reverted; `git status --porcelain` clean for
`sandbox/` and `test/` after each.

For the three `exit-test-*` behaviors, the concurrent criteria reviewer
owns the walk; I spot-checked by construction that the registry test is
sensitive (the step registry is read out of the script by `--list-steps`,
and `SECTION_4_STEPS` in the test is an independent literal list, so a
registry row deleted from the script would break the index comparison at
`test/exit-test-local.test.ts:171-182`).

## False-claim sweep (T-006)

Every sampled claim from the work history's validation-pass section was
re-executed rather than read. All sampled claims held.

| Claim | How I checked | Result |
|---|---|---|
| Node 26 gates: 153/153/0 skip, exit 0 | ran them | confirmed exactly |
| Node 22 gates: 153/151/2 skip, exit 0 | ran them | confirmed exactly; both skip reasons present in TAP |
| clean `git status` after build, both toolchains | ran both | confirmed |
| 159 behavior mappings, 0 unresolved | independent script over my own Node 26 run's titles | confirmed: 153 distinct titles, 159 mappings, 0 unresolved, and 0 titles with no mapping |
| criterion 5 falsification exits 1 at C2, 41 records | ran it | confirmed exactly, including record count and the `041-C2.json` contents |
| criterion 2 local run exits 0 with 51 records, 12 steps, kinds 30/17/2/2 | ran it | confirmed exactly (`executed: 30, assertion: 17, substituted: 2, skipped-full-only: 2`; per-step counts A1=10 A2=7 A3=4 A4=1 A5=3 A6=5 A7=3 A8=2 B1=7 C1=4 C2=3 C3=2) |
| 12 recorded CLI invocations, all `dist/bin/tiphys.js` | bundle validation output `"tiphysInvocations": 12`, problems `[]` | confirmed |
| "pin refused exits 7 on both toolchains" | constructed on both | confirmed |
| "`node --test` over an empty glob exits 0 with `# pass 0`" | constructed on Node 26 | confirmed |
| "this container carries a global git identity `Claude <noreply@anthropic.com>`" | `git config --global --get user.name/email` | confirmed (and it also sets `commit.gpgsign=true`, which is why the identity-less test env matters) |
| real sandbox repo seeded, commit `7211d71` carries the harness identity, drift probe disclosed | cloned read-only and read the log | confirmed: 3 commits, `7211d71` and `27c882f` both `Tiphys Exit Test <exit-test@tiphys.invalid>` as author and committer, `7e514e1` is the disclosed `Drift Probe` commit; the repo tree at HEAD is byte-identical to `sandbox/` at `79604ec` (`diff -r --exclude=.git`) |
| "the full-mode path was not executed by anything here" | I executed it | confirmed it was unexecuted, and it works; that is how CR-600 was found |

One claim I want to flag as accurate but easy to over-read: the work
history's "Defects in earlier phases' code: **None found**, and that is a
statement about what this pass exercised". That hedge is correct and I
found no P1 to P5 defect either; my scope was the harness's own driving of
those commands plus one deliberate mutation of `watch.ts` that the suite
caught.

## Scope audit

`git diff --name-only origin/main...HEAD`:

```
.github/workflows/gates.yml      declared
delivery/work-history/m1-p6.md   standing extra
sandbox/README.md                declared (sandbox/)
sandbox/package-lock.json        declared
sandbox/package.json             declared
sandbox/src/greet.js             declared
sandbox/test/greet.test.js       declared
scripts/m1-exit-test.sh          declared
scripts/seed-sandbox.sh          declared
scripts/stub-payload.sh          declared
test/behaviors.json              standing extra
test/exit-test-local.test.ts     declared
```

**Scope audit passes.** 12 files, all on the declared files-to-touch list
or one of the two standing pre-authorized extras. No `src/`, no `bin/`, no
`delivery/` file other than the work history.

## Registry

- 159 mappings in `test/behaviors.json`, 7 added by this phase, none
  removed or modified (diff is append-only).
- Resolved by name against my own Node 26 run: **159 resolved, 0
  unresolved**. 153 distinct test titles observed; 0 observed titles lack
  a mapping.
- The seven new names map to the seven tests in
  `test/exit-test-local.test.ts`, all present and passing in the run.

## Conventions

- Pure ASCII: `grep -rP '[^\x00-\x7F]'` over `sandbox/`, `scripts/`,
  `test/exit-test-local.test.ts`, `delivery/work-history/m1-p6.md` and
  `.github/`: no matches. No em dashes in the same scope.
- English only: confirmed by reading.
- npm only: `grep -rn "pnpm\|yarn"` over `sandbox/`, `scripts/`, the
  changed test and `.github/`: no matches.
- No AI or model names in `git log origin/main..HEAD` (11 commits read in
  full, subjects and bodies).
- Shell: all three scripts declare `#!/usr/bin/env bash` and use bash
  features deliberately (`local`, `[[`-free but `$'\x1f'` and arrays of
  arguments), so bashisms are in contract. `bash -n` exit 0 on all three.
  `git ls-files -s scripts/` shows mode `100755` on all three, so the CI
  step's bare invocation works on a fresh checkout.
- C-1: nothing reads current state from a log tail. C-2: no pid, process
  liveness, signal or `/proc` use for identity or exclusion; the only pid
  use is `scripts/m1-exit-test.sh:472,480,577,585-589`, which is the
  harness managing its OWN child (`wait`, a wake timeout kill, and a
  30-second watchdog), explicitly sanctioned by the plan's "the harness,
  not the kernel, owns the process". CR-601 is that it does not own it
  thoroughly enough. C-3: the kernel never backgrounds anything here; the
  harness does, which is the required arrangement.

## Destructive paths

Checked and clean, with one note.

- Every write is confined to `$(mktemp -d)` work directories, the
  user-supplied evidence directory, and `${repo_root}` (where A1's
  `npm ci` and `npm run build` touch only `node_modules/`, `dist/` and
  `*.tsbuildinfo`, all gitignored).
- The only `rm -rf` calls are `scripts/m1-exit-test.sh:689`
  (`${work}/merged-check`, inside mktemp) and `scripts/seed-sandbox.sh:105`
  (an `EXIT` trap on its own mktemp dir).
- No `--force`, no force push, no `reset --hard`, no `git clean`. The
  seeder's push is a plain fast-forward push; a fetch failure sends it
  down the unborn-branch path where the push is rejected rather than
  overwriting anything.
- **Can a failed run make the next run pass spuriously?** No path found.
  The work directory, the fleet, and both scratch bare repos are fresh per
  run. The evidence directory is reused rather than cleared, and record
  filenames collide on `NNN-STEP.json`, but the harness dies at its first
  failure, so the stale record is always the last one and is overwritten
  by any subsequent run that gets at least as far. The asymmetric case
  (a later run producing fewer records than an earlier failed one, which
  the gh-present/gh-absent branch at `:431-446` makes possible by one
  record) leaves a stale `outcome: fail` that `validate_bundle` would
  catch, so it fails safe. The one collision that is not fail-safe is
  CR-600, which loses a record rather than a verdict.

## Probes run, including the empty-handed ones

Negative results with their scope, because a negative result without its
scope is not evidence.

1. **Falsification path.** Executed. Exit 1 at C2. Positive.
2. **Node 22 harness run.** Executed. Exit 1 at A2 on `CHECK node FAIL`.
   Positive (the harness refuses to certify below the floor).
3. **Full-mode stage A and stage C with a reviewer-built `gh` stand-in and
   a `file://` remote.** Executed, both exit 0. Found CR-600.
4. **Phantom watcher wake.** Constructed in `src/commands/watch.ts`. Found
   CR-603; control established that A1's unit suite catches it.
5. **Watcher leak on a mid-run failure.** Constructed twice. Found CR-601.
6. **Vacuous sandbox suite at harness level.** Constructed. Found CR-604.
7. **Reporter pin: refused, accepted, and silently-ignored cases.**
   Constructed on both toolchains. No defect.
8. **Empty-glob `node --test` exit code.** Constructed. No defect.
9. **Grep-vacuity walk of every parse in the harness.** Read plus the
   doctor output-format check in `src/commands/doctor.ts:391`. Only CR-604
   found; **negative for the other eight parse sites**, scope: every
   `grep`, `awk` and parameter parse in `scripts/m1-exit-test.sh` at
   `79604ec`, enumerated in the sweep section above. Empty-handed
   otherwise.
10. **Bundle trustworthiness: can a record claim an exit code the command
    did not return?** **Negative.** Every `exitCode` in the bundle is
    written from `$?` captured by `run_step:280` or by the two inline
    `json_object` calls at `:592-604` and `:810-822`; there is no code path
    that writes a literal exit code. Scope: all 51 records of my baseline
    bundle plus all four record-writing sites in the script. The related
    but different problem, a literal `observed`, is CR-602.
11. **Destructive-path scan.** `grep -n "rm -rf|rm -r |--force|push -f|
    push --force|checkout --|reset --hard|clean -"` over `scripts/*.sh`.
    Three hits, all safe (listed above). **Negative for anything reaching
    outside a scratch area.** Scope: the three shell scripts at `79604ec`;
    I did not audit `src/` for destructive behavior, that being M1-P3 to
    M1-P5 territory.
12. **C-1, C-2, C-3 scan.** `grep -n "\$!|kill |pgrep|/proc|pidof|ps -|
    SIGTERM|SIGKILL|process.pid"` over `scripts/`, `sandbox/` and
    `test/exit-test-local.test.ts`. Six hits, all the harness's own child.
    **Negative for pid-as-identity and pid-as-exclusion.** Scope: those
    three trees; `src/` was not re-audited, the M1-P5 reviews own it.
13. **Reporter-pin leakage.** `grep -rn "NODE_OPTIONS"` and
    `"test-reporter"` over the whole checkout excluding `delivery/`,
    `node_modules/`, `dist/`, `.git/` and my own scratch directories.
    **Exactly one occurrence each**, both at
    `test/exit-test-local.test.ts:294`. Negative for leakage.
14. **Falsification guard coverage.** `grep -rn "SKIP_STAGE_B"` over the
    same scope. **Negative**: no occurrence in `test/` or `.github/`.
    That negative IS the finding, CR-605.
15. **Evidence-directory reuse / stale-record spurious pass.** Reasoned
    through the seq mechanism and demonstrated one real instance of the
    collision class (CR-600). **Empty-handed for a spurious pass**: every
    reuse ordering I could construct fails safe. Scope: local mode's two
    gh branches and full mode's two-invocation flow; I did not test a
    hand-crafted adversarial evidence directory.
16. **Real sandbox repository claims.** Read-only clone and log inspection.
    All claims confirmed. **I pushed nothing**; the remote SHA is
    unchanged from the start of this review.
17. **Lease behavior across stage B.** Read `src/lock.ts:559-562`.
    Empty-handed for a false green (release survives expiry); produced
    CR-608 as an exposure note. **I did not wait out a real 900-second
    expiry**, so the takeover-during-stage-B scenario is reasoned from the
    lease code, not constructed. Stated as such.
18. **`--stage c` resume path.** Executed once, end to end. Works. It had
    never been executed by anything before this review.

## Honest failure

Things I did not do, or could not do, stated so nobody mistakes silence
for coverage.

1. **I did not use a real `gh`.** `gh` is absent from this container. My
   full-mode walkthrough used a 20-line stand-in that answers exactly
   `--version`, `pr create`, `pr view --json ...` and `pr merge`. It
   proves the harness's full-mode control flow, the `--stage c` resume,
   the approval-artifact capture and full-mode bundle validation all work.
   It proves nothing about real `gh` output shapes: in particular
   `stub-payload.sh:115-118` assumes `gh pr create` prints a bare URL on
   stdout, and `scripts/m1-exit-test.sh:542,679` assume the substrings
   `OPEN` and `MERGED` appear in `gh pr view --json` output. Those two
   assumptions remain untested against the real tool. CI has `gh` but
   never runs full mode, so nothing in this project will test them before
   the milestone run itself.
2. **I did not observe the `gates` check on the PR** (criterion 4). That
   is the orchestrator's observation, as the work history says.
3. **I did not wait out a real lease expiry** for CR-608; that finding is
   reasoned from `src/lock.ts`, and I labelled it low partly for that
   reason.
4. **The phantom-wake probe required stubbing A1's kernel gates.** That is
   a deliberate isolation and I have reported the control result, but it
   means CR-603 is a statement about where assurance lives, not a
   green-when-broken defect of the shipped harness.
5. **I did not audit `src/` for new defects.** My scope was the phase diff
   plus whatever the harness drives. The one `src/` mutation I made was a
   probe, reverted, and the tracked tree is clean.
6. **I did not re-walk the acceptance criteria.** That is the concurrent
   reviewer's contract; I only spot-checked criteria 1, 2, 3, 5 and 6
   where they intersected a hazard.
7. **Timing.** My baseline local run took `real 1m47.6s` on Node 26,
   comparable to the implementer's `1m29.1s`. Neither the 120s beacon
   bound nor the 180s wake bound was approached in any of my seven runs,
   but I did not stress the machine to find where they would be.

## Bottom line

The harness is falsifiable, refuses to run below the floor, subsumes the
kernel gates at A1, records its substitutions and skips honestly, and its
full-mode path (previously unexecuted by anything) works end to end. I
could not construct a state where the milestone is broken and the harness
reports green.

What I did find is that the harness damages its own evidence in full mode
(CR-600), leaks its watcher on exactly the failure paths that matter
(CR-601), writes three records that assert their own conclusion (CR-602),
and has no automated guard that it remains falsifiable at all (CR-605).
All four are small, local, script-only fixes. None touches `src/`. Under
DR-0012 the mediums have to clear before merge, which is why this is
FIX-ROUND-NEEDED rather than APPROVE.
