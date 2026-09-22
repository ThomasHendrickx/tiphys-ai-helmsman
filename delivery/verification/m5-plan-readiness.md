# M5 plan readiness check, 2026-09-22

Subject: the approved M5 plan, delivery/plan/value-delivery-plan.yaml:1, at
`main` head `f7b7d8e`. Question: can its first phase be dispatched as written?

## What passes

| check | command | result |
|---|---|---|
| plan is well formed | `node bin/tiphys.ts validate --type plan delivery/plan/value-delivery-plan.yaml` | `dispatchable: true`, exit 0 |
| each phase projects | `node bin/tiphys.ts plan project --phase-id M5-Pn --plan ... --stdout`, n = 1..6 | exit 0 for all six |
| declarations on main | `ls delivery/plan/phase-declarations/m5-p*.json` | six files, M5-P1 to M5-P6 |
| branch names derive their phase | the CLAUDE.md branch-name check, per declaration | `true` for all six |
| no phase branch pushed yet | `git ls-remote --heads origin 'claude/m5-*'` | empty |

Toolchain: node v22.22.2 (container default), after `npm ci`. A first
`validate` run before `npm ci` failed with "Cannot find module 'yaml'"; that is
the missing install, not the plan.

## What blocks M5-P1 as written

M5-P1 must pass acceptance `p1-trigger` (delivery/plan/value-delivery-plan.yaml:63):
`node scripts/check-cutover-entry.mjs` exits 0 with all four arms satisfied.
The phase says it runs "without changing kernel code"
(delivery/plan/value-delivery-plan.yaml:31) and its files-to-touch are three
documents only. Its grounding says the checks "already ship"
(delivery/plan/value-delivery-plan.yaml:39).

Measured on a full (unshallowed) clone at `f7b7d8e`:

```
ARM a drain not-yet -- cutover status: the cutover command is not delivered (exit 64)
ARM b exclusion not-yet -- behaviors.json does not yet register: exclusion-second-clone-refused, exclusion-unreachable-register-fails-closed, exclusion-identity-no-process-probing, doctor-shared-lock-four-statuses, spawn-refused-under-foreign-shared-lease, teardown-refused-under-foreign-shared-lease
ARM c retirement unreachable -- the retirement report carries a line its contract does not fix, so the report cannot be read in full: PORT claude-md:tiphys-kernel-repository-rules ported negative witness exits 1 under the new artifact
ARM d pre-freeze-ruleset satisfied -- delivery/plan/cutover/pre-freeze-ruleset.json is present and is newer than delivery/plan/cutover/retirement-inventory.json by commit order (1789726959 against 1789717584)
```

On a shallow clone arm d reads `unreachable` instead; `git fetch --unshallow`
turns it satisfied. That one is environment, not a defect.

The other three are defects in shipped code or data, not "not yet":

- **Arm a.** The trigger calls `tiphys cutover status` with no `--fleet`
  (scripts/check-cutover-entry.mjs:431). The CLI requires `--fleet` and exits
  64 with "--fleet is required" (src/commands/cutover.ts:63). The script reads
  that usage error as "the cutover command is not delivered". The command is
  delivered. This is the "usage error read as a clean result" shape the
  fix-round contract names, in the opposite direction.
- **Arm b.** None of the six behavior names the arm requires exists in
  test/behaviors.json (a `grep -c` for three of them returns 0 each). Related
  names exist, for example `shared-exclusion-captured-cas-contract`, so either
  the behaviors were registered under other names or they were never written.
  Not settled here.
- **Arm c.** `tiphys cutover status --retirement --json` exits 0 and reports
  rows with verdict `ported`. The text form prints `PORT <id> ported <reason>`,
  which the trigger's parser does not accept
  (scripts/check-cutover-entry.mjs:710). Producer and reader disagree on the
  line format.

M4 closed with the cutover sweep group not run (delivery/STATE.md:2660), which
is consistent with these surviving.

## Consequence

M5-P1 cannot meet `p1-trigger` inside its declared files. Fixing arms a, b and
c touches `scripts/`, `src/` or `test/`, which M5-P1 does not declare and its
intent excludes. The plan's binding rule forbids making what is not written, so
this needs a plan revision before dispatch, not an implementer's judgment.

Recommendation: add one small repair phase ahead of M5-P1 (for example
`M5-P0`, branch `claude/m5-p0-cutover-trigger-repair`) that fixes the three
arms, with a red-then-green witness for each against the real CLI output, and
leaves M5-P1 unchanged. M5-P2 to M5-P6 are not affected by this finding.

Not covered by this check: the pulse probe (M5-P1 step 2, needs the pilot
reachable), and whether each later phase's file list is complete. Only
existence of the listed paths was checked; the missing ones are all files a
phase is meant to create.

## The repair, 2026-09-22 (owner decision DR-0049)

The owner chose a pre-M5 change outside the plan over a new plan phase
(delivery/decisions/DR-0049-pre-m5-cutover-trigger-repair-outside-the-plan.md:1).
The repair found a FOURTH defect the first reading did not: once arm a asked
the question correctly, a fleet made by `tiphys init` reported `DRAIN 1 in
flight`, because src/cutover.ts:559 read init's own `tasks/.gitkeep` as a task.

### The mechanism, not the findings

Two mechanisms, stated separately because they fix in different places.

1. **The checker was validated against the shape the plan QUOTED, never
   against the command that SHIPPED.** Every witness in
   test/cutover-entry.test.ts ran a stub CLI printing the quoted shape. The
   real command needs `--fleet`, prints BRANCHES, IN-FLIGHT, PRE-FREEZE and
   CANNOT-SEE rows, adds a reason after each PORT verdict, and ends the
   retirement report with a RETIREMENT summary. The behavior ids of arm b were
   guessed before M4-P21 and M4-P22 landed, and the header said so. All four
   drifts are one mechanism: no test read the real program's output. That is
   the red-witness rule's "real captured output" clause, broken.
2. **A reader of `tasks/` treated an entry as a task without establishing its
   type.** src/liveness.ts states the rule (a task is a DIRECTORY, checked by
   type, never by name) and every other reader follows it.

### The derivation

Mechanism 1, every place the checker consumes another program's output:

```
$ grep -n "runCli(root" scripts/check-cutover-entry.mjs
294:export function runCli(root, cliArgs, options = {}) {
431:  const run = runCli(root, ["cutover", "status"]);
700:  const run = runCli(root, ["cutover", "status", "--retirement"]);
```

Plus arm b's `REQUIRED_EXCLUSION_BEHAVIORS`, which consumes the registry, and
arm b's `node --test` run, which already parses real TAP output. Arm d consumes
`git`, whose output it already reads for real in its own witnesses. So the
sites are: arm a (line 431), arm c (line 700), arm b's name list. All three are
fixed, and each now has a test that runs the REAL `bin/tiphys.ts` or reads the
REAL `test/behaviors.json`.

Mechanism 2, every reader of `tasks/`:

```
$ grep -rn "tasksDir\|join([a-zA-Z.]*, \"tasks\")" src/
src/fleet.ts:47 and :96    type and constructor, no read
src/task.ts:341            path builder for one known id, no enumeration
src/liveness.ts:362        enumerates; skips non-directories by stat (line 379)
src/cutover.ts:548         enumerates; DID NOT check type (the defect)
src/pool.ts:791            enumerates; skips names failing TASK_ID_PATTERN
src/watcher.ts:958         watch registration, no read
src/commands/next.ts:297   enumerates; skips files by type
src/commands/doctor.ts:1198 enumerates; skips files by type
```

One site broken of five that enumerate. Fixed the way src/liveness.ts does it:
stat the entry, skip a non-directory, report one that cannot be examined.

### What the derivation did NOT cover

- `scripts/probe-pilot-readonly.mjs`, the step-2 probe. It reads the network,
  not the kernel CLI, and was not re-checked here.
- Readers of `worktrees/` were not re-derived. The drain loop's worktree half
  already probes by type (src/cutover.ts:538), and that was read, not searched.
- Arm b runs only the two cross-environment test files. The doctor, spawn and
  teardown behaviors it requires are checked BY NAME only; their test files
  are not run by the arm. On the default node v22.22.2 toolchain doctor's file
  has a known floor failure (CLAUDE.md standing warning 12), so adding it would
  make the arm toolchain-dependent. Left as is and stated.
- `REFUSED` rows from `cutover status` stay unmodelled on purpose, so a report
  with a switch on `kernel` and no pre-freeze capture still reads `unreachable`.

### Witnesses, red on `main`, green on the fix

Seven new tests, registered in test/behaviors.json. Red run: a worktree at
`origin/main` with only the two new test files copied in, node v22.22.2,
`--test-name-pattern` over the seven names: 7 of 7 `not ok`. Same command on
the fix: 7 of 7 `ok`. With ONLY the checker fixed and src/cutover.ts left at
`main`, arm a against a fresh fleet read `not-yet -- cutover status reports
DRAIN 1 in flight`, so the two defects are independent and each has its own
witness.

The pre-existing checker tests ran the checker without `--fleet`; the harness
now passes one, and the two stubs printing `DRAIN <n> in flight` now print the
IN-FLIGHT rows the real command prints.

### Result

```
$ node scripts/check-cutover-entry.mjs --fleet <a fresh tiphys init fleet>
ARM a drain satisfied -- cutover status reports DRAIN clean
ARM b exclusion satisfied -- all 6 required behavior name(s) resolve and 2 exclusion test file(s) pass with a nonzero pass count
ARM c retirement satisfied -- all 199 retirement row(s) are ported
ARM d pre-freeze-ruleset satisfied -- ... (1789726959 against 1789717584)
STEP 1 preconditions: preconditions-satisfied-owner-action-pending
exit 0
```

**This is NOT M5-P1's `p1-trigger`.** That criterion now names the kernel's
fleet home, and a scratch fleet drains clean by construction. M5-P1 runs it
against the real fleet home, which this container has not cloned. The repair
makes the check ABLE to report satisfied; whether the kernel fleet IS drained
is M5-P1's question.
