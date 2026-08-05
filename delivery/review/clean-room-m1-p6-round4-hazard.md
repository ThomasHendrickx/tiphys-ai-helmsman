# Clean-room DELTA review of PR #9 (M1-P6) FIX ROUND 3, HAZARD contract

- head reviewed: `5e3fd3898c611f6d1dc3d9320db073211ae40a12`
- previous reviewed head: `9b766397291f7374b42bd94469a26c9de18bc3c9`
- branch: `claude/m1-p6-toy-sandbox-exit`
- contract: hazard (T-007), DELTA scope. Acceptance criteria were NOT
  re-walked, inventories were NOT re-derived, RESOLVED findings were NOT
  re-established. A criteria reviewer ran concurrently on the same head.
- verdict: **FIX-ROUND-NEEDED**
- findings: 6 total, **0 high, 3 medium (CR-720, CR-721, CR-722), 3 low**
- headline: **a fourteenth defang exists, and so do a fifteenth and a
  sixteenth.** The whitelist closes the class of keys ON the two nodes it
  inspects. It does not close the class, because it never asserts that
  the guard step is IN the job the fan-in consumes, never inspects the
  fan-in job's own step, and matches keys as raw text rather than as
  parsed YAML.

## Isolation (T-004)

All work in the detached worktree
`/tmp/claude-0/.../scratchpad/p6d-hazard` at `5e3fd38`, plus my own
scratch dirs `.../scratchpad/HZ4-lab` (workflow sabotage) and
`.../scratchpad/HZ4-run` (full-mode bundle, gh stand-in, snapshots), plus
the harness's own `mktemp` work dir `/tmp/tiphys-m1-exit-Oht8eH`.
Nothing in `/home/user/tiphys-ai-helmsman` was written (its
`git status --porcelain` is empty and its HEAD is `3e5a4ca`, untouched).
The sibling worktree `p6d-criteria` was never touched; the tiphys
processes visible in `ps` at the end of this review resolve through
`/proc/<pid>/cwd` to `.../scratchpad/p6d-criteria`, i.e. the concurrent
reviewer, not to me. `git status --porcelain` in my worktree is empty and
`.github/workflows/gates.yml` md5 matches my pristine copy
(`98dca2fe1b985f50a8fde9be55273d61`).

**Nothing was written to the real sandbox repository.** Every run used a
`file://` remote: `file:///tmp/claude-0/.../scratchpad/HZ4-run/sandbox.git`.
`ThomasHendrickx/tiphys-ai-helmsman-sandbox` was never referenced, not
even to read. `gh` was a reviewer-written stand-in at
`.../HZ4-run/bin/gh` answering only `--version`, `pr create`, `pr view`,
`pr merge`.

Never used `git checkout --`. The harness was sabotaged by copying
`scripts/m1-exit-test.sh` to `.../HZ4-run/m1-exit-test.sh.PRISTINE`
before any edit and restoring with `cp`; same for `gates.yml`.

## Gates

```
node v26.6.0 / npm 11.18.0 (floor toolchain, node --version checked in the running shell)
  npm ci         exit 0, 0 EBADENGINE lines
  npm run build  exit 0, git status --porcelain after build: 0 lines
  npm test       exit 0: tests 156, pass 156, fail 0, skipped 0, 88.8s

node v22.22.2 / npm 10.9.7 (container default, via bash -lc, node --version echoed inside it)
  npm run build  exit 0
  npm test       exit 0: tests 156, pass 154, fail 0, skipped 2
                 (both skips carry the floor reason on the TAP line)

behavior registry: 162 mappings, 156 distinct test titles, 0 unresolved, 0 duplicate keys
non-ASCII scan of the five changed files: 0 matches in each
em dash scan of the five changed files: 0 matches
git log 9b76639..5e3fd38: 1 commit, author "Tiphys Orchestration
  <orchestration@tiphys.invalid>", 0 matches for claude|anthropic|gpt|
  copilot|opus|sonnet|codex|gemini|llm|\bai\b in author or body
```

All reported numbers reproduce exactly.

## Scope

Five files, as declared: `.github/workflows/gates.yml`,
`scripts/m1-exit-test.sh`, `test/exit-test-local.test.ts` (declared),
`test/behaviors.json` and `delivery/work-history/m1-p6.md` (standing
pre-authorized extras). Nothing else.

## Findings

### CR-720 (MEDIUM): the guard step can be moved out of the job the fan-in consumes, and both tests stay green

**Claim.** The new test asserts the `test` job's keys and the `gates`
job's `needs: test`, but never asserts that the falsifiability step is
INSIDE the `test` job. `workflowStep` scans the whole file. Move the step
verbatim into a new job that `gates` does not need, and link 5 is broken
for that step while every assertion passes. This is a natural edit
("extract the expensive guard into its own job to parallelise"), it needs
no exotic YAML, and it defeats the entire round's mechanism.

**Evidence.** `.../HZ4-lab/D14.yml`: the step block, comments and all,
cut from `test:` and pasted into a new `falsify:` job with its own
checkout/setup/ci/build; `gates` still `needs: test` only.

```
$ python3 -c "...yaml.safe_load..."   jobs: ['test','falsify','gates']   gates needs: test
$ node --test --test-name-pattern='falsifiability guard' test/exit-test-local.test.ts
EXIT=0
ok - the gates falsifiability guard fails the job when the harness cannot fail
ok - a failure of the falsifiability guard reaches the required check
pass 2  fail 0
```

A failing `falsify` job now reddens the workflow run but not the `gates`
check, which is the check links 4 and 5 exist to protect.

**Fix.** Assert containment. `workflowJob("test")` already returns the
job block; find the step within THAT block instead of within the file, or
add `assert.ok(testJob.block.includes(stepBlock))`. One line closes it.

### CR-721 (MEDIUM): the fan-in job's own step is not whitelisted, so `if: false` there turns the required check green unconditionally

**Claim.** Links 2 and 3 were whitelisted for the guard step and link 4
for the `test` job, but the `gates` job's single step is checked only by
four `match`/`doesNotMatch` probes on the block text. Adding a step-level
`if: false` to it satisfies all four: `needs: test` is still there, the
`!= "success"` comparison is still there, `exit 1` is still there, and
`continue-on-error` is still absent. The required check then passes with
zero executed steps no matter what `test` did. This is strictly worse
than the guard-step defang: it defangs every gate in the workflow.

**Evidence.** `.../HZ4-lab/D16.yml`, one added line
`        if: false` under `- name: fail unless every matrix leg succeeded`.
Parsed: `gates step -> {'name': 'fail unless every matrix leg succeeded', 'if': False}`.

```
$ node --test --test-name-pattern='falsifiability guard' test/exit-test-local.test.ts
EXIT=0   pass 2   fail 0
```

Compare D6 (`if: false` on the guard step), which the round caught: the
same key, one job over, is not caught.

**Fix.** Apply the same whitelist to the `gates` job's step keys (exactly
`name` and `run`) and to the `gates` job's own keys (`needs`, `if`,
`runs-on`, `steps`).

### CR-722 (MEDIUM): the whitelist matches raw text, not parsed keys, so a quoted key re-opens D2 and D7

**Claim.** Step keys are collected with `/^ {8}([\w-]+):/` and job keys
with `/^ {4}([\w-]+):/`. A YAML-quoted key is not matched by `[\w-]+`, so
it is invisible to the whitelist while being the same key to any YAML
parser. The two members the round explicitly claims to catch, D2
(step-level `continue-on-error`) and D7 (job-level `continue-on-error`),
both come back under quotes. A whitelist that can be bypassed by
re-spelling the very key it names is not a class closure.

**Evidence.** `.../HZ4-lab/D15.yml` (step) and `D18.yml` (job), each one
added line, `"continue-on-error": true`.

```
PyYAML 6.0.1 parse of D15: step keys -> ['continue-on-error', 'name', 'run']
PyYAML 6.0.1 parse of D18: test job keys -> ['continue-on-error','runs-on','steps','strategy'] coe= True
$ node --test --test-name-pattern='falsifiability guard' ...   D15: EXIT=0 pass 2 fail 0
                                                               D18: EXIT=0 pass 2 fail 0
```

**Scope of this one, stated.** That GitHub's own YAML parser accepts
quoted mapping keys is standard YAML and is how PyYAML reads it here; it
was NOT measured on a GitHub runner, and I have no runner. CR-720 and
CR-721 need no such assumption.

**Fix.** Stop parsing keys with a name regex. Either collect every line
of the block and require each to match an exact allowed shape
(`^ {6}- name: `, `^ {8}run: \|`, `^ {10}`), or assert the step and job
blocks equal a stored expected text, so any added line at all is red.

### CR-723 (LOW): link 1 asserts the presence of `pull_request:`, not that it fires on a pull request

**Claim.** The regex only requires the token to appear under `on:`.
`paths-ignore: ['**']` (or a `types:` filter) leaves it present while no
PR event produces a run.

**Evidence.** `.../HZ4-lab/D17.yml`; parsed
`on -> {'pull_request': {'paths-ignore': ['**']}, 'push': {...}}`; test
EXIT=0, pass 2, fail 0. (For contrast, D19, replacing the trigger with a
comment mentioning it, IS caught: EXIT=1, fail 1. The regex is anchored
per line and resists that.)

**Fix.** Assert the `pull_request:` mapping is empty, e.g. that the line
following it is not more-indented.

### CR-724 (LOW): the whitelist reddens ordinary, and sometimes safety-increasing, workflow edits, and this is stated nowhere

**Claim.** Question 2's failure mode is real and undocumented. The
"what remains open" list in the work history names three residues, none
of them this. Four edits a maintainer would make without thinking all
fail the test now:

```
F1  job-level permissions: contents: read   RED  "the test job declares keys beyond runs-on, strategy and steps (permissions, ...)"
F2  job-level timeout-minutes: 45           RED  same assertion
F3  add a lint job, needs: [test, lint]     RED  "the gates job no longer needs the test job"
F4  step-level env: on the guard step       RED  "the falsifiability step declares keys beyond name and run (name, env, run)"
```

F3 is the sharp one: making the fan-in consume MORE jobs, which
strengthens exactly the property link 5 protects, is rejected because
`/^\s{4}needs: test$/m` only accepts the scalar spelling. The message
sent to the next maintainer is "the guard is wrong", and the cheap way
out of a red gate is to delete the assertion.

**Fix.** Accept the list form of `needs`; add the residue to the work
history's open list, saying which keys are refused on purpose and that
adding one is a decision, not an accident.

### CR-725 (LOW): the lapse record still pre-announces an outcome the run can contradict

**Claim.** CR-680's lesson was "do not record a reassurance the run then
contradicts". The new note is written BEFORE the take-over is attempted
and states it as fact ("Recovering by taking the lease over"), and the
branch it sits in fires on four distinct lock states, three of which it
misdescribes: expired-and-mine (a real lapse), held-by-another-live-holder
(not a lapse), free (not a lapse), corrupt (not a lapse). In the
foreign-holder case the bundle carries "THE LEASE DID NOT SURVIVE STAGE
B ... Recovering by taking the lease over" immediately followed by the
run dying. It is one record away this time rather than sixteen, which is
why this is low and not a repeat of CR-680.

**Evidence.** ARM D below.

**Fix.** Branch the note on the observed `lock status` line
(`expired|held|free|corrupt`), and word it as an attempt.

## CR-680: both arms, my own bundle

Full mode, gh stand-in, `file://` sandbox remote. Stage A run once
(`EXIT=0`, 37 records, holder `e1cbe76f-...`), the owner's squash merge
performed by hand against the remote, then the whole state (work dir,
evidence dir, sandbox remote, gh state) snapshotted with `cp -a` and
restored to the SAME paths before each arm, so both arms start byte
identical. Lease expired by editing only `expiresAt`.

```
ARM A, code as committed
  039-A3.out  expired holder e1cbe76f-... acquired 2026-08-05T18:16:32.763Z expires 2026-08-05T00:00:00.000Z
  A3 recorded (observation: THE LEASE DID NOT SURVIVE STAGE B)
  A3 ok (reclaim the lease by take-over after the stage B lapse)
  041-A3.out  acquired bd6e9479-50bd-4e01-9fb7-b830d574b759 expires 2026-08-05T22:17:47.150Z
              (acquired 18:17:47, so 14400s propagated, not 900)
  A3 ok (the reclaimed lease is held by this run)
  C2 ok (tiphys teardown after the squash merge) / C3 ok (evidence bundle validated)
  STAGE C EXIT=0
  bundle-validation.out: {"recordsValidated":52,"recordsInBundle":53,"tiphysInvocations":14,"problems":[]}
  53 records, 53 distinct sequence numbers; session.json holderId rewritten to bd6e9479-...

ARM B, identical state restored, take-over block deleted (23 lines), nothing else
  A3 recorded (observation: THE LEASE DID NOT SURVIVE STAGE B)
  tiphys teardown: lease /tmp/tiphys-m1-exit-Oht8eH/fleet/state/orchestrator.lock expired
    2026-08-05T00:00:00.000Z (holder e1cbe76f-...); re-acquire or take over before mutating tasks
  FAILED: step C2 (tiphys teardown after the squash merge): expected exit zero, got 1
  STAGE C EXIT=1
  bundle-validation.out: absent (ls: No such file or directory), 45 records
```

Both directions confirmed, and ARM A's four bundle numbers are identical
to the four the work history reports.

### Attacking the recovery

```
ARM C  lease live and held by THIS run (control)
       A3 recorded (observation: the lease survived stage B); no take-over; STAGE C EXIT=0
       (incidentally: a third party CANNOT create the foreign-live-holder state through the
        CLI, `lock acquire --take-over` printed "takeover refused: lock held by e1cbe76f-...,
        unexpired until ..." and exit nonzero)

ARM D  orchestrator.lock rewritten to a foreign holder, expiry in the future
       A3 recorded (observation: THE LEASE DID NOT SURVIVE STAGE B ... Recovering ...)
       tiphys lock: takeover refused: lock held by aaaaaaaa-...-eeeeeeeeeeee,
         unexpired until 2026-08-05T23:59:00.000Z
       FAILED: step A3 (reclaim the lease by take-over ...): expected exit zero, got 1
       STAGE C EXIT=1; the foreign lease is intact; the worktree is intact

CLI probes on the same fleet
       lock file removed  -> status "free",    take-over exit 0, lease acquired for 4h
       lock file corrupt  -> status "corrupt", take-over exit 1
                             "lease file ... is corrupt; inspect it manually"
```

So: the take-over CAN fire when the lease was not lost (the predicate is
"not held by me", not "expired"), but it cannot succeed against a live
foreign holder, because the kernel refuses; the harness then dies loudly
at A3 with the holder named, and leaves the fleet inspectable and
unmutated. **The recovery is sound in both directions.** The only residue
is the wording, CR-725. Nothing here leaves the fleet in a state a later
run cannot use: on the success path C3 releases the lease (the lock file
is gone afterwards), and `write_session` persists the NEW holder id, so a
re-run of `--stage c` resumes with the id that is actually held.

Empty holder id: fatal before anything is touched, as claimed.

## CR-682, CR-683, CR-684: re-executed, not taken on trust

```
CR-682  D13 decoy step above the real one:      test EXIT=1, pass 0, fail 2   (as claimed)
CR-683  existsSync guard deleted from gates.yml: test EXIT=1,
        "AssertionError: the guard crashed on a missing records directory instead of deciding"
        -> the fifth stub is red against the DANGEROUS state, not merely the absent feature
CR-684A recordSeq deleted from session.json:    stage C EXIT=0, 0 bare bash errors,
        note "the highest record on disk is 37 and the run resumes from 37",
        51 records / 51 distinct sequence numbers
CR-684B holderId set to "":                     stage C EXIT=1,
        "FAILED: stage C: .../session.json carries no holderId; stage A did not complete,
         or the session file has been edited", 0 lapse records
```

The claimed round-3 defangs I re-ran all behave as reported:
D6 (step `if: false`) fail 1, D7 (job `continue-on-error`) fail 1,
D8 (step `timeout-minutes: 1`) fail 1, D13 fail 2.

## T-006 sample of the fix-round-3 work history

Sampled seven claims and executed all seven: the ARM A/ARM B bundle
numbers (exact match), the 4-hour take-over duration (match), the CR-684
A and B outputs including "the highest record on disk is 37" and "51 for
51" (exact match), D6/D7/D8/D13 (match), the two gate columns (match),
the registry counts (match). No unexecuted claim found in the sample. The
two self-flagged items (the `git checkout --` loss, the Node 22 column
first measured on the wrong toolchain) are both recorded against the
implementer and neither inflates a result. **The re-measured CR-680
numbers are real:** my independently produced bundle lands on
52/53/14/`problems: []`, and my stage A independently produced 37
records, which is the number the CR-684 diagnostic quotes.

The one place the history overstates is the CR-681 headline, "13 of 13
defangs now caught", read together with "a whitelist fails on any key
nobody thought of, which is the only shape that closes a class". Both
sentences are true of the two nodes inspected; the conclusion drawn from
them, that the class is closed, is not (CR-720, CR-721, CR-722).

## Probes run

23 constructions, workflow restored and md5-compared between each:
D14 relocation, D15 quoted step key, D16 fan-in step `if`, D17
`paths-ignore`, D18 quoted job key, D19 comment-only trigger, D20
existsSync guard removed, D6/D7/D8/D13 re-runs, F1-F4 legitimate edits,
plus the harness arms A/B/C/D, the CR-684 A/B session edits, and the
free/corrupt CLI probes. Baseline green before and after every one.

## Honest failures

- I could not measure any of this on a GitHub runner. CR-721's and
  CR-722's CI consequences rest on Actions semantics as documented
  (`if: false` skips a step; quoted keys are keys), the same limitation
  the round records for D7. CR-720's does not: it follows from the file
  alone, since a job the fan-in does not name cannot contribute to it.
- I did not find a way to defeat the step-key whitelist with an UNQUOTED
  key, nor to defeat link 1 with a comment, nor to make the parser
  silently mis-slice a well-formed block. Within `gates.yml` as shaped,
  the key whitelist does what it claims for the two nodes it reads.
- The `workflowJob`/`workflowStep` parsers can still crash rather than
  decide (a deleted `gates.yml` throws ENOENT out of `readFileSync`), but
  the crash reddens the same test with a legible cause, so unlike CR-683
  it hides nothing. Not raised as a finding.
- Branch protection, i.e. which check is actually required, remains
  unassertable from the tree, as the round says.
- I did not re-walk the six acceptance criteria or re-derive the path
  inventory; that was the criteria reviewer's lane this round.

## Verdict

**FIX-ROUND-NEEDED.** CR-680, CR-682, CR-683, CR-684 are closed and were
verified by construction. **CR-681 is not closed**: the class it names is
still open along three axes, two of which need no assumption about
GitHub's parser. The three medium fixes are small (a containment
assertion, the same whitelist applied to the fan-in job's step, and a
line-shape check instead of a key-name regex) and all three are testable
locally with the constructions in `.../scratchpad/HZ4-lab`.
