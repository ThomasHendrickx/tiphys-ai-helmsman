# Clean-room hazard review: group `cli` (CLI surface and commands), final state of M4

- review-contract: hazard
- framing: evidence-integrity
- produced-by: Claude Sonnet 5 (Anthropic)
- head: ad2428b76ef6f53f75b0d7f94c7db50463e077b7
- phases covered: M1-P1, M1-P2, M3-P5, M3-P6, M4-P16, M4-P18, M4-P24 (declared
  as touching this group), plus reachability findings in src/commands/doctor.ts
  and src/pool.ts that M4-P17 and M4-P19 shipped and that are not in the
  declared phase list for this group. Flagged anyway because the files are in
  the group's own PATHS (src/commands/**) and a composition defect does not
  respect phase boundaries: the hazard contract asks for what I tried to break
  at THIS head, not only within the seven named phases.
- paths reviewed: src/cli.ts, src/commands/**, bin/**, src/status.ts, src/brief.ts
- size: src/cli.ts 74, src/status.ts 187, src/brief.ts 70, bin/tiphys.ts 41,
  src/commands/*.ts 6750 lines total (about 7.1k, matches the brief)
- verdict: FIX-ROUND-NEEDED (one HIGH finding, one MEDIUM finding, one LOW)

## Setup

```
git clone --no-local /home/user/tiphys-ai-helmsman clone
git checkout --detach ad2428b76ef6f53f75b0d7f94c7db50463e077b7
export PATH=/tmp/claude-0/n26/bin:$PATH
node --version   # v26.6.0
```

`npm ci` exit 0 (16 packages). `npm run build` exit 0 (`tsc -b tsconfig.src.json
tsconfig.test.json plugin/tsconfig.json` plus schema/runtime-dep copy steps);
`git status --porcelain` empty afterward (D-17/D-18 satisfied).

## A shared-container caveat that governs how the suite evidence below is read

This sandbox is shared by every concurrent reviewer of this sweep (five groups
x two contracts). `ps aux` during this review showed a live `tiphys lock
acquire` and several `stub-api.mjs` processes running from sibling scratch
directories (`scratch/.../sweep-cli-criteria`, others), and
`/tmp/claude-0/final-sweep/` already held eight other groups' `clean-room-*`
and `verdict-*` files before this one was written. The root filesystem hit
**98% full, 1.1GB free**, mid-review, and one `npm test` attempt actually
aborted with `ENOSPC` from a shared `tasks/` directory outside my own
scratchpad. A second full-suite attempt, on a freshly reduced disk (freed by
deleting my own throwaway fixtures), produced a long list of FAILING tests in
files that have nothing to do with this group (adapter-registry tests,
AGENTS.md checks) and ended in a truncated, mid-UTF8-byte line, which is the
signature of a process killed mid-write, not a code defect.

**Conclusion, stated so a later reader does not re-litigate it:** a bare
"N pass, N fail" from a full `npm test` run in this specific session is NOT
trustworthy evidence of anything in `src/commands/**` UNLESS taken at a moment
of low contention, because the run is contending for disk and CPU with roughly
ten sibling review sessions on one host. Where I needed a suite result under
contention, I used *targeted per-file `node --test test/<file>.test.ts` runs*,
each completed to a clean exit with no other `npm`/`node --test` process alive
at the time I read `ps aux`, and I quote each one individually below rather
than trusting a suite-wide count taken mid-contention (CLAUDE.md standing
warning 12's "complete sentence" extended to a fourth axis this container
adds: *contention*, not just toolchain, build state and invocation).

A clean full-suite run was attempted three times. The first aborted with
`ENOSPC` from a *different* session's shared `tasks/` output directory
(nothing to do with this repository). The second produced dozens of failures
in files unrelated to any change here (adapter-registry tests, AGENTS.md
checks, cross-environment lock tests) and ended mid-write on a truncated,
invalid-UTF8 byte -- the signature of a process killed for resources, not a
code defect; I freed disk by deleting my own throwaway fixtures and re-ran.
**The third attempt completed successfully**: `node --version` v26.6.0,
`dist/` built, invocation `npm test` (`node --test "test/**/*.test.ts"`).

```
1341 tests, 1340 pass, 1 fail, 0 cancelled, 0 skipped, 0 todo
```

The one failure, `a precondition command exiting nonzero is error, not a skip,
whenever a path-shaped argv element cannot be opened...` in
`test/gates.test.ts`, is OUTSIDE this group: its subject is
`src/gates/run.ts` (grep-confirmed: `path-shaped`, `NOT READABLE by this
process` and the surrounding precondition-attribution logic all live there,
not in `src/commands/gates.ts`, which is this group's only file with `gates`
in its name and is a thin CLI wrapper). Reading the test itself, it
`chmodSync`s a file to `0o000` and asserts on the resulting "unreadable"
behavior, which is exactly CLAUDE.md standing warning 1's documented trap:
this container runs as uid 0, and root is not blocked by permission bits, so
a chmod-based unreadability fixture behaves differently here than the test's
author could rely on. I did not chase this further because the underlying
module is not in this group's PATHS; noted here only so the "1 fail" in the
total above is not read as silently dropped.

## Targeted suite results (node v26.6.0, `dist/` built, `node --test
test/<file>.test.ts` invocation, no concurrent npm/node process observed)

| file | tests | pass | fail | skipped |
|---|---|---|---|---|
| test/brief-compose.test.ts | 9 | 9 | 0 | 0 |
| test/resume.test.ts | 14 | 14 | 0 | 0 |
| test/next.test.ts | 16 | 16 | 0 | 0 |
| test/teardown.test.ts | 31 | 31 | 0 | 0 |
| test/cutover-entry.test.ts | 61 | 61 | 0 | 0 |

(`test/cutover-entry.test.ts` is listed because it was the file the first
suite attempt appeared to hang on for 8+ minutes; run alone it takes 15s and
passes cleanly, which is further evidence the hang was contention, not a
defect in that file or in this group.)

## What I tried to break

### 1. `tiphys sync` (M4-P18) can commit its own atomic-rename scratch file into the fleet's durable git history -- REPRODUCED, HIGH

`src/commands/sync.ts` derives its durable/ephemeral split *purely* from
`git check-ignore --no-index` against the fleet's `.gitignore`
(`FLEET_IGNORED = ["state/", "worktrees/", "projects/"]`,
src/fleet.ts:29). The module's own docblock (src/commands/sync.ts:17-24)
argues this derivation is *safer* than a hand-maintained list because it
cannot drift from the ignore rules. That argument is correct for everything
the ignore rules were written to cover, and blind to a class of path the
ignore rules were never asked to cover: a legitimate, transient write-then-
rename scratch file that lives in a *tracked* directory beside the file it
becomes.

`src/status.ts`'s M4-D-13 split creates exactly that shape.
`DURABLE_STATUS_DIR` (`status/`) is tracked, and `emitStatus`
(src/status.ts:120-135) writes `status/current.json.tmp`, then
`renameSync`s it to `status/current.json`. Nothing in `.gitignore` names
`*.tmp`, so `git check-ignore --no-index` answers "not ephemeral" for that
path whenever it is asked, which makes it DURABLE by `sync`'s own definition.
If the temp file exists on disk at the moment `tiphys sync` runs (either a
narrow race against a concurrent `status emit`, or -- more importantly --
`status emit`'s process was killed between the `writeFileSync` and the
`renameSync`, which this project's own tuition describes as the *ordinary*
failure mode, not an edge case: "a process killed mid-write is the ordinary
failure this repository keeps meeting" is quoted verbatim in
src/commands/next.ts:281 about the T-036 mechanism), `sync` adds it, commits
it, and pushes it.

Reproduced end to end against a real fleet and a real bare remote:

```
$ node bin/tiphys.ts init fleet && cd fleet
$ git remote add origin <bare remote>
$ echo '{"kind":"status-line"}' > status/current.json.tmp
$ git status --porcelain=v1 -z --untracked-files=all | tr '\0' '\n'
?? status/current.json.tmp
$ node bin/tiphys.ts sync
COMMITTED status/current.json.tmp
PUSHED origin
$ echo exit=$?
exit=0
$ git show --stat HEAD
commit 894c4eef...
Author: Tiphys Fleet <fleet@tiphys.invalid>
    tiphys sync: 1 durable path(s)
 status/current.json.tmp | 1 +
```

The follow-on effect is worse than a one-time stray commit: once
`status/current.json.tmp` is tracked, it is tracked *forever* by ordinary git
semantics -- I verified that a subsequent real `emitStatus()` call (which
renames the tmp file away) then shows as `D status/current.json.tmp` /
`?? status/current.json` in `git status`, so every future legitimate status
emission leaves a trace `sync` will want to commit again, until an operator
notices and removes the file from the index by hand. A committed scratch file
cannot be cleanly removed in this environment either: CLAUDE.md standing
warning 14 records that this container cannot delete tags, notes or other
non-`refs/heads/*` remote refs and that branch deletion is an owner action;
while this is a file inside a branch rather than a ref, undoing a bad push
still requires a follow-up commit, not a rewrite, on a fleet remote other
clones may already have fetched.

**Which criterion this reddens against, and why the phase's own criteria did
not catch it.** M4-P18's criteria 3 and 4 are RED WITNESSES for exactly this
shape ("a lease or scratch file that got tracked once... from then on every
`git add -A` re-commits it") but both witnesses start from a file that is
*already tracked before `sync` runs* (`state/orchestrator.lock`, staged or
unstaged). Neither witness covers a file `sync` tracks for the FIRST TIME
itself. `test/sync.test.ts` has no `.tmp`, `temporaryPath` or `emitStatus`
reference at all (`grep` confirmed zero hits), so this is not a known,
tracked gap -- it is new.

**Mechanism, per the fix-round contract's own standard, so a fix does not
re-target the instance.** The guard's condition is "is this path *not*
covered by an existing ignore rule", which the module's docblock reads as "is
this path meant to be committed". Those are the same question only for paths
someone thought to declare. Any file this codebase creates as a write-then-
rename scratch artifact *beside* a tracked target, without a matching
`.gitignore` entry, is the same hole. I grepped for the pattern:

```
$ grep -rn "\.tmp\b" src/*.ts src/commands/*.ts
src/status.ts: const temporaryPath = `${currentPath}.tmp`;
```

One call site today (src/status.ts's `emitStatus`); I did not find a second
inside `src/commands/**` or `src/status.ts`/`src/brief.ts`. I did not search
outside this group's PATHS (`src/pool.ts`'s lock/pool-record writes,
`src/lock.ts`'s lease writes, `src/watcher.ts`'s cadence writes), so this
derivation's scope is exactly this group and no wider; a sibling atomic-write
pattern elsewhere in the kernel could have the same exposure if it, too,
writes its temp file inside a tracked directory, and I have not checked.

**Concrete fix, two independent layers (belt and suspenders, because either
alone leaves a gap):** (1) add `*.tmp` (or the specific temp-file name) to
`FLEET_IGNORED`/the fleet `.gitignore` written by `tiphys init`, which closes
it for every existing fleet created after the fix and does nothing for a
fleet already initialized; (2) make `sync`'s classification ask a narrower
question than "not covered by `.gitignore`" -- for instance, refuse (not
silently exclude, per the same reasoning criterion 4 already uses for a
staged ephemeral path) any *untracked* durable-looking path whose name ends
in a documented scratch suffix (`.tmp`, matching the one `writeFileSync`
temp-file convention this codebase actually uses), so a newly appearing
temp file is reported rather than silently swept into the commit.

Severity: HIGH under DR-0027. It reaches a shipped command
(`tiphys sync`) on the path every fleet operator runs routinely (that is the
whole point of M4-P18: replacing manual `git add`/`git commit`/`git push`
discipline with a mechanism), it pollutes the fleet's *durable, pushed* git
history irreversibly in this environment, and the trigger condition (a
process dying mid-write) is the single most common failure shape this
project's own tuition log describes.

### 2. `src/pool.ts:759` (M4-P24's site 14, explicitly left open) -- SETTLED: reachable for `pool list` and `doctor`, not for `next`

M4-P24's fix round enumerated fourteen sites where a candidate could leave
`tiphys next`'s in-flight walk unrecorded, fixed four, justified three (a
status read that establishes what it reports), and left
`src/pool.ts:759` -- the `catch { taskIds = []; }` inside `poolList` around an
unreadable `fleet.tasksDir` -- "NOT FIXED and NOT PROVEN UNREACHABLE... an
OPEN QUESTION" (delivery/work-history/m4-p24.md:1072, :913-921), because the
round could not force the arm from inside this container (root cannot be
`chmod`-blocked, and replacing `tasks/` with a file trips `loadFleet`'s own
validation before `poolList` runs at all).

I settled it by calling the exported functions directly rather than only
through the CLI, which sidesteps the "how do I force the OS-level failure"
problem: a `Fleet` is a plain object of paths, and nothing requires it to
have come from a `loadFleet` call that just finished validating. I built one
whose `tasksDir` points at a path that does not exist and passed it straight
to `poolList`:

```
control (tasksDir readable): poolList -> [{taskId:"t-orphan-0001",
  headSha:"missing", origin:"unreconstructable", unresolved:["remote","branch"]}]
defect arm (tasksDir vanished after being validated):
  threw: false
  result: []
```

No throw, no partial result, no signal of any kind -- the orphaned-open-task
reconstruction this exact function exists to perform (M4-P19's whole point,
per its own docblock at src/pool.ts:722-731: "the second group is what a
reclaim leaves behind... reporting only the first group makes those tasks
invisible... the state the plan calls a defect") silently returns as if there
were nothing to reconstruct.

**Is this reachable, and by what?** `loadFleet` validates `tasksDir` with
`statSync` at call time (src/fleet.ts:66,83-90); `poolList`'s own
`readdirSync(fleet.tasksDir)` runs moments later in the same synchronous call.
That is a narrow TOCTOU window for a single invocation, but the codebase's
*own other code* treats "the directory vanished after the fleet was loaded"
as a real, non-hypothetical condition worth a named report: `src/cutover.ts`
around line 548-555 has a comment reading almost verbatim "`fleet.tasksDir` is
gone, and the fleet had it when it was loaded", and `src/liveness.ts:362-371`
and `doctor`'s own `CHECK tasks` (which I exercised live below) both report an
unreadable `tasks/` by name rather than swallowing it. So four call sites in
this same codebase read `fleet.tasksDir` and three report a read failure by
name; `poolList` is the fourth and the only one that does not.

**Consequence for `tiphys pool list` (a real, direct CLI command, not an
internal helper):** I confirmed `src/commands/pool.ts:112`'s `list` case
calls `poolList(fleet)` with nothing else reading `tasksDir` in that path, so
the swallow is *not* masked here: a real invocation of `tiphys pool list`
during the TOCTOU window (or, as with finding 1, after any process dies
mid-operation leaving `tasksDir` briefly or permanently unreadable, e.g. a
disk hiccup) prints fewer lines than actually exist and exits 0, silently.

**Consequence for `tiphys doctor`'s `CHECK worktrees` -- worse, a false PASS,
matching T-043's exact shape.** `checkWorktrees`
(src/commands/doctor.ts:1468-1513) calls `poolList` and, when
`entries.length === 0`, prints `PASS "no pool worktrees"`
(doctor.ts:1482-1487). Quoted verbatim from source because it is the
concrete falsification: the same `poolList([])` result that means "genuinely
nothing in the pool" ALSO means "tasksDir could not be read", and the two are
not distinguished before the status word is chosen. Applying this project's
own T-043 test ("if every check behind this field were removed except the
cheapest one, would this value change?"): remove the `tasksDir` scan and
`entries` is still often `[]` (no `.pool.json` records at all is common), so
the same PASS fires either way -- the word asserts more than the check behind
it establishes, which is precisely the tuition entry this repository already
paid to learn (delivery/tuition/T-043...).

**Consequence for `tiphys next` (M4-P24's own command) -- NOT vulnerable to
this specific site, and I want to be precise about why rather than just
assert it.** I called `collectInFlight` (exported from
`src/commands/next.ts`) against the same broken `Fleet`:

```
control:  items: [task t-orphan-0001 (open), worktree t-orphan-0001
  (unreconstructable, head missing)], unknown: [], exit 3
defect (tasksDir vanished): items: [], unknown: ["tasks/ could not be
  listed: Error: ENOENT..."], exit 3
```

`next`'s own `openTasks` function (src/commands/next.ts:294-329) reads
`fleet.tasksDir` *independently* of `poolEntries`/`poolList`, and its own
`try`/`catch` around `readdirSync` reports the same ENOENT to `report.unknown`
and holds `EXIT_WORK_REMAINS` (3). Both functions read the identical
directory in the same `collectInFlight` call, so `openTasks`'s correct
handling arrives regardless of what `poolEntries` does with the same failure.
The mechanism this class exists to catch (T-036: an unreadable source
silently read as empty, printing a finished milestone) does NOT fire for
`next` here, because a sibling function happens to cover the same ground.
That is worth stating plainly as a settled non-finding rather than leaving it
implied by omission, per this sweep's own instruction not to report only bad
news.

**Verdict on the open question:** REACHABLE, but only through `tiphys pool
list` and `tiphys doctor`, not through `tiphys next`. Severity MEDIUM under
DR-0027 -- it reaches two shipped, real user-facing commands (`pool list`,
`doctor`), the failure is silent (no error, no exit-code change, and for
`doctor` an affirmatively wrong PASS rather than an omission), but the
trigger condition is narrower than finding 1 (a TOCTOU race or an external
disk/filesystem failure on `tasks/` specifically, not "any process dies
mid-write," and I could not force it via permissions or a replaced path in
this root-privileged container, only via direct function construction).

Concrete fix: make the second `readdirSync` inside `poolList`
(src/pool.ts:757-763) match the pattern every other reader of `tasksDir` in
this codebase already uses -- report the failure into the same channel the
caller already threads through (`poolList` currently has no such channel; the
cheapest fix is to let it throw on this specific readdirSync rather than
swallowing to `[]`, matching the FIRST `readdirSync` in the same function
(`fleet.worktreesDir`, line 747) which is unguarded and already propagates to
callers correctly) -- and add a regression test at the `poolList`/`pool list`
/`doctor` level, since `next`'s own test suite cannot see this site.

### 3. Dispatch table and `--help` -- held, checked by running it, not reading it

`src/cli.ts`'s `commands` Map has 20 unique keys (`version`, `brief`,
`checklist`, `cutover`, `init`, `doctor`, `gates`, `lock`, `mode`, `next`,
`plan`, `pool`, `resume`, `spawn`, `status`, `sync`, `teardown`, `tuition`,
`validate`, `watch`); I read the literal for duplicate keys (none) and ran
every one of them with no arguments to confirm each resolves to its own
handler rather than falling through to usage:

```
$ for cmd in brief checklist cutover init doctor gates lock mode next plan \
    pool resume spawn status sync teardown tuition validate watch version; do
  node bin/tiphys.ts "$cmd" ...
done
```

All 20 produced a command-specific line (a usage message naming that
subcommand, or in `doctor`'s and `next`'s and `sync`'s case a real
first-class error), never the top-level "usage: tiphys <...>" line. `--help`,
bare `help`, and no-args all resolve to the SAME top-level usage line and exit
64 -- there is no dedicated `--help` handling anywhere in `src/cli.ts` or
`bin/tiphys.ts` (confirmed by grep: no `--help` string appears in either
file). `usageLine()` (src/cli.ts:56-59) is *derived* from `[...commands.keys()]`
rather than hand-listed, so it cannot drift out of step with the dispatch
table by construction -- there is no separate list to shadow, reorder or drop
an entry from. DR-0046's serialization of `src/cli.ts` through the four M4
phases that touch it (M4-P16, M4-P18, M4-P24, and the earlier `cutover`
registration for M4-P25/M4-P26/M4-P27) held: I read `src/cli.ts`'s history
comment at line 34-36 ("M4-P25... the rollback handlers M4-P26 shipped were
reachable only by import until this row existed") and the map itself is
consistent with all four phases' commands present exactly once.

### 4. `bin/tiphys.ts`'s documented `usage: true` error-marking mechanism has zero call sites -- LOW, observational

`bin/tiphys.ts`'s own docblock (lines 24-27) documents that "a usage error
(an `Error` carrying `usage: true`) exits 64" and defines
`UsageMarkedError`. I grepped the entire shipped surface for any code that
actually sets this:

```
$ grep -rn "\.usage\s*=\s*true\|usage:\s*true" src/ bin/
bin/tiphys.ts:17:  (the docblock sentence itself)
```

Zero real call sites. Every command in `src/commands/**` reaches EX_USAGE
(64) by directly `return`ing it from its own handler, never by throwing a
marked Error -- verified above (`resume` with an extra operand exits 64,
`spawn` without required flags exits 64, all via direct returns I read in
each file). This means the top-level handler's `usage` branch is dead code:
it is never exercised by anything currently shipped, and nothing tests it
(the two `bin/tiphys.ts`-adjacent tests I found, `test/cli.test.ts`, only
cover `version` and an unknown subcommand, both of which resolve inside
`run()`, before the try/catch's `usage` branch could ever matter). This is
not a reachable wrong-behavior finding -- the branch, if it fired, would
correctly exit 64 -- so I report it as LOW/observational rather than ranked:
a docblock describing a contract nothing implements risks a future
implementer trusting the comment over the actual pattern (`return EX_USAGE`
inline) and reaching for a mechanism that silently does nothing.

## Hazard-table walk for the seven declared phases

| phase | hazard / criterion | reddens against | held at this head? |
|---|---|---|---|
| M1-P1 | criterion 3/4: version prints exact package.json version; unknown subcommand exits 64 with usage on stderr | a dispatcher that does not agree with package.json, or that crashes on bad input | HELD. `node bin/tiphys.ts version` -> `0.1.0` matching `package.json`; `node bin/tiphys.ts no-such-command` -> exit 64, `usage: tiphys <...>` on stderr, nothing on stdout (test/cli.test.ts, run clean) |
| M1-P2 | criterion 4/6: doctor exits 0 healthy with one CHECK line per check; exits nonzero outside a fleet home | a doctor that reports healthy on a broken fleet, or crashes outside one | HELD, and doctor is MORE thorough than the M1-P2 text alone describes by now (M4-P17 added CHECK tasks/worktrees/branches/remote): ran `doctor` inside a non-fleet directory, got `CHECK layout FAIL` plus ten other lines and exit 1, no crash |
| M3-P5 | D-M3-27 / criterion 6c: a named pipe at a mandated-reading path is refused in bounded time, naming the path and the entry type, never hung | `readFileSync` bare on an unestablished path type (the CR-560 class already open in src/brief.ts, src/hooks.ts, src/pool.ts) | HELD for `brief compose`'s own new code: test/brief-compose.test.ts's mkfifo criterion passes; `composeBrief` routes every path it did not create through `classifyEntry`/`refuseOpenForWrite` per its own docblock, which I read and which the test exercises with a real `mkfifo` |
| M3-P6 | T-007 criterion 10: `--review-contract` is refused for any role but `clean-room-reviewer` rather than silently ignored | a dispatch believing it selected a contract for a role that has none | HELD by reading `src/commands/brief.ts:180-185`; covered indirectly by the brief-compose suite above (same module) |
| M4-P16 | criteria 4/5: RED WITNESS, `resume` leaves a live worktree file and an unexpired lease byte-identical; a half-rebuilt fleet is completed incrementally, not all-or-nothing | a `resume` that is `rm -rf` + `mkdir` in disguise | HELD, both via the 14/14 test run and a manual end-to-end repro: sha256 of a scratch file and a lease file identical before/after `resume`, exit 0 |
| M4-P18 | criteria 3/4: RED WITNESS, an unstaged AND a staged ephemeral path (`state/orchestrator.lock`) are both refused/excluded correctly, never committed | a `sync` that commits a lease it was never told about | The NAMED witnesses HELD (not independently re-run beyond reading the source and test file structure, given the finding below made the file's actual gap clear), but the phase's own hazard class (H-B, "the already-staged arm is the one a path-list implementation cannot see") is TRUE ONE LEVEL DEEPER than the phase anticipated: the derived-from-.gitignore approach the phase chose specifically to avoid a hand-maintained path list has its own blind spot (finding 1 above), invisible to both of the phase's own witnesses because both start from an already-committed-once file |
| M4-P24 | criteria 1/4: `next` exits 3 while in-flight work exists and 0 only when every category is empty; the cannot-see block prints unconditionally including when the network is unreachable | a stop condition that silently degrades or exits 0 with work outstanding | HELD via 16/16 test pass and direct `collectInFlight`/`exitCodeFor` calls (shown in finding 2); the phase's own explicitly-left-open question (site 14, src/pool.ts:759) is SETTLED above as not reaching `next` specifically |

## Tuition attack list, applied to this group

Went through all 43 entries in `delivery/tuition/` and checked each against
this group. The ten that name a `cli.ts`/`src/commands`/`status.ts`/`brief.ts`
path or a directly matching mechanism:

- T-002 (agent death mid fix round): procedural, not a CLI code shape; N/A here.
- T-007 (criteria cannot contain the defect): the whole reason this sweep runs
  BOTH a criteria and a hazard contract on this group; my finding 1 and 2 are
  exactly the shape T-007 names -- correct against their own phase's stated
  criteria, wrong against the mechanism.
- T-009 (green on the wrong CI event): not reproducible from inside this
  review (no CI access here); noted as out of reach rather than assumed clear.
- T-017 (the beacon instruction asks for a habit): applies to ME as the
  reviewer, not to the shipped code; addressed by the progress.md beacon this
  review wrote incrementally.
- T-029 (a precondition test flakes only here): I hit an analogous shape with
  the shared-container full-suite runs (see the caveat above), though the
  specific test T-029 names is outside this group.
- T-031 / T-033 (patch witness / inventory coupling): about `delivery/`
  paperwork and gate scripts, not `src/commands/**`; N/A.
- T-037 (the absent arm of the push watcher returned success): a distinct
  mechanism from finding 2, but the SAME SHAPE (an absent/failed read folded
  into a success value) -- I looked for it deliberately given the family
  resemblance and it is what led me to check `poolList`'s two `readdirSync`
  calls asymmetrically rather than stopping at the one M4-P24 already flagged.
- T-038 (the plugin package had no red-witness gate): plugin package is not
  in this group's PATHS; N/A.
- T-041 (sixteen phases merged with no clean-room review): this sweep IS the
  discharge of that debt for this group, per DR-0047.

No new instance of T-010 (control-character check blindness), T-018 (two
checks unwitnessable to each other), or T-025 (the one path that cannot be
rehearsed is the one that failed) turned up in this group specifically,
stated rather than left unmentioned.

## Composition findings (across phases, not visible to any single phase review)

1. **Finding 1** is a composition defect in the truest sense: M4-P18's `sync`
   and the M4-D-13 split inside `src/status.ts` (also M4-P18, but a different
   file with a different author's-eye-view within the same phase) each pass
   their own phase's criteria; the gap exists only where the two meet, in a
   directory `status.ts` treats as "the tracked half" and `sync.ts` treats as
   "whatever `.gitignore` does not name."
2. **Finding 2** is a composition defect across FOUR phases spanning two
   milestones: `src/pool.ts`'s `poolList` (M1-P3, extended M4-P19),
   `src/commands/doctor.ts`'s `checkWorktrees` (M1-P2, extended M4-P17/M4-P19),
   `src/commands/next.ts`'s stop condition (M4-P24), and `src/commands/pool.ts`
   itself (M1-P3). No single phase's plan section could have caught it: M4-P24
   found and correctly LEFT OPEN exactly this site for its own command, but
   its files-to-touch list did not include `src/pool.ts`, so it could not fix
   the shared function, and neither M1-P2/M1-P3/M4-P17/M4-P19 (whose
   files-to-touch DOES include `src/pool.ts` and `src/commands/doctor.ts`) had
   M4-P24's derivation in hand to know the site mattered for a THIRD caller.
3. No instance found of a criterion that was satisfied when its phase landed
   and has since been broken by a *later*, unrelated phase (the other
   canonical composition shape this sweep was asked to look for). The closest
   candidate I checked was whether M4-P17's new `doctor` checks (`CHECK
   tasks`, `CHECK branches`, `CHECK remote`) could have re-broken M1-P2's
   original doctor contract (exit 0 only when no check FAILs, one line per
   check); they have not -- `CHECK branches` is explicitly WARN-only and never
   promoted (M4-P17's own H-D reasoning, which I read and did not need to
   re-derive), and I ran `doctor` live above without a spurious FAIL.

## Escalations

None. All three findings have a stated concrete fix that does not require an
owner decision (they are code-level guard corrections inside phases already
delivered, not new product questions), per DR-0016's standard: I would defend
the recommendation above without a comparably-good alternative, so there is
nothing to ask.

## Verdict JSON: schema validation and negative control

```
$ node bin/tiphys.ts validate --type auto verdict-final-cli-hazard.json
SKIPPED dual-review-decorrelation no context
SKIPPED verdict-criteria-complete no context
SKIPPED verdict-deviations-judged no context
SKIPPED verdict-hazard-classes-addressed no context
SKIPPED verdict-pair-approves no context
exit=1
```

Zero `INVALID` lines were printed, which is how this validator reports a
schema violation (`src/commands/validate.ts:469-474`: diagnostics are printed
and it returns 1 *before* `runChecks` is ever called) -- so the document is
schema-valid. Exit 1 here comes entirely from the five Kind B checks, which
are cross-document completeness checks that need `--context <dir>` (the
plan, the work history, sibling verdicts) and this document deliberately does
not have one canonical directory to point at, because it spans seven phases
under one pinned `phase: "M1-P1"` field, per this sweep's own instructions.
Those checks reporting SKIPPED-not-PASS without a context is this validator
doing exactly what a guard should (CLAUDE.md's own repeated lesson: a check
that goes green by omission is worthless), not a defect in this document.

**Negative control**, to confirm the validator can go red rather than only
ever printing SKIPPED lines: flipped `verdict` to `"APPROVE"` in a scratch
copy, leaving the HIGH and MEDIUM findings in place.

```
$ node bin/tiphys.ts validate --type auto negctrl.json
INVALID # value does not satisfy the requirements its own shape triggers here
INVALID #/verdict value "APPROVE" is not one of the permitted values "FIX-ROUND-NEEDED"
exit=1
```

The `if`/`then` rule (schemas/verdict.schema.json:90-116, widened to `medium`
by M4-P10) fired correctly and named the field. The instrument can go red.

## Not reached

- I did not walk M1-P1's remaining acceptance criteria (1, 5-12): the CI
  workflow shape, the npm-pack/install round trip, the deliberate type-error
  demonstrations, `test/behaviors.json` bookkeeping. These are either not
  CLI-surface concerns or would need a real GitHub Actions run I cannot
  observe from here (CLAUDE.md standing warning 6's REST-reachability
  caveat, unconfirmed this session).
- I did not walk M1-P2's, M3-P6's, M4-P16's remaining acceptance criteria
  individually against the schema's `criteria[]` array, because `phase` is
  pinned to M1-P1 and a criterion id from a different phase cannot resolve
  against it; I covered their substance in the hazard-table walk and the
  hazard-classes-addressed array instead, and said so there.
- I did not extend the `*.tmp`-scratch-file grep (finding 1's derivation)
  outside this group's own PATHS (`src/pool.ts`'s lock/pool-record writes,
  `src/lock.ts`'s lease writes, `src/watcher.ts`'s cadence writes might share
  the same exposure) -- stated as an explicit boundary of the derivation
  rather than implied coverage.
- I did not investigate the one `test/gates.test.ts` failure beyond
  confirming its subject module (`src/gates/run.ts`) is outside this group's
  PATHS and identifying the likely cause (the root-uid chmod trap CLAUDE.md
  standing warning 1 already documents for a sibling test in the same file).
- CI-only surfaces (the macOS smoke job, `gh`/GitHub Actions observation)
  were not reachable from this review; DR-0027's "reaches a real user path"
  test was applied using local CLI invocation as the user path, which is the
  applicable one for this group.

## The JSON verdict, embedded rather than landed

This verdict reads FIX-ROUND-NEEDED, so nothing from this group is landed at the TOP
LEVEL of `delivery/review/`, where `check-dual-review` reads its corpus.

```json
{
  "kind": "verdict",
  "phase": "M1-P1",
  "head": "ad2428b76ef6f53f75b0d7f94c7db50463e077b7",
  "verdict": "FIX-ROUND-NEEDED",
  "produced-by": "Claude Sonnet 5",
  "framing": "evidence-integrity",
  "review-contract": "hazard",
  "findings": [
    {
      "id": "F-1",
      "severity": "high",
      "evidence": [
        "src/commands/sync.ts derives its durable/ephemeral split purely from `git check-ignore --no-index` against FLEET_IGNORED (src/fleet.ts:29, state/ worktrees/ projects/ only); *.tmp is not covered",
        "src/status.ts:120-135 emitStatus writes status/current.json.tmp (inside the TRACKED status/ directory) and renameSync's it to status/current.json",
        "reproduced end to end against a real fleet + bare remote: `echo x > status/current.json.tmp; node bin/tiphys.ts sync` printed `COMMITTED status/current.json.tmp` then `PUSHED origin`, exit 0",
        "git show --stat HEAD after the repro: `status/current.json.tmp | 1 +` in a real commit authored by the fleet bootstrap identity, already pushed to the bare remote",
        "follow-on reproduced: a subsequent real emitStatus() call (which renames the tmp file away) then reports ` D status/current.json.tmp` / `?? status/current.json` in git status, so the tracked scratch file recurs on every later emit until an operator removes it from the index by hand",
        "grep -rn '\\.tmp\\b' src/*.ts src/commands/*.ts finds exactly one write-then-rename temp-file call site in this group's scope (src/status.ts's emitStatus); I did not extend this grep outside src/commands/**, src/status.ts, src/brief.ts",
        "test/sync.test.ts carries zero references to .tmp, temporaryPath, or emitStatus (grep, zero hits), so this is not a known/tracked gap in that phase's own test file",
        "src/commands/next.ts:281's own docblock quotes this project's tuition verbatim: 'a process killed mid-write is the ordinary failure this repository keeps meeting', which is the trigger condition that leaves the .tmp file behind permanently rather than only in a race window"
      ],
      "concrete-fix": "Two layers: (1) add the temp-file suffix (*.tmp, or the specific current.json.tmp name) to the fleet .gitignore FLEET_IGNORED / the gitignore tiphys init writes, so a fresh fleet is covered; (2) narrow sync's classify() so an UNTRACKED path is never silently treated as durable-by-default -- report/refuse (per the same reasoning criterion 4 already applies to a staged ephemeral path) any untracked path matching the one write-then-rename scratch convention this codebase actually uses, rather than trusting 'not matched by .gitignore' as a proxy for 'intended to be committed'. Add a regression test to test/sync.test.ts exercising status/current.json.tmp specifically, since the phase's own two red witnesses (already-tracked lease, staged vs unstaged) do not cover a file sync tracks for the first time itself."
    },
    {
      "id": "F-2",
      "severity": "medium",
      "evidence": [
        "src/pool.ts:756-763 (poolList): `try { taskIds = readdirSync(fleet.tasksDir).sort(); } catch { taskIds = []; }` -- silently drops the whole orphaned-open-task reconstruction pass on any readdirSync failure",
        "delivery/work-history/m4-p24.md:1072 records this exact site as 'NOT FIXED and NOT PROVEN UNREACHABLE... an OPEN QUESTION', and :913-921 records two failed attempts to force the arm inside this container (chmod 000 is a no-op as root; replacing tasks/ with a file trips loadFleet's own validation first)",
        "settled by direct function construction rather than an OS-level permission attack: built a Fleet object whose tasksDir points at a path that does not exist and called the exported poolList(fleet) directly -- control (tasksDir readable) returned the expected reconstructed/unreconstructable entry; defect arm (tasksDir absent) returned `[]` with no throw, no partial result, no signal",
        "src/cutover.ts around line 548-555 carries a comment reading 'fleet.tasksDir is gone, and the fleet had it when it was loaded', i.e. the SAME codebase already treats this exact TOCTOU condition as real and reportable in a sibling module",
        "src/liveness.ts:362-371 and doctor's own CHECK tasks (exercised live: `CHECK tasks WARN tasks/... could not be listed (Error: ENOENT...)`) both report an unreadable tasks/ by name; poolList is the one reader of fleet.tasksDir in this codebase that does not",
        "src/commands/pool.ts:112 (`tiphys pool list`) calls poolList(fleet) with nothing else in that command path re-reading tasksDir, so the swallow is UNMASKED there: a real `tiphys pool list` invocation during the TOCTOU window (or after any process leaves tasksDir unreadable) prints fewer lines than exist and exits 0, silently",
        "src/commands/doctor.ts:1468-1513 checkWorktrees calls poolList and, when entries.length === 0, prints PASS 'no pool worktrees' (doctor.ts:1482-1487, quoted from source) -- the T-043 shape verbatim: the same empty result means either 'genuinely nothing in the pool' or 'tasksDir could not be read', and the status word does not distinguish them",
        "settled the opposite arm too: called collectInFlight (exported from src/commands/next.ts) against the same broken Fleet -- next's OWN openTasks function (src/commands/next.ts:294-329) independently re-reads fleet.tasksDir in the same collectInFlight call and correctly reports the ENOENT into report.unknown, holding EXIT_WORK_REMAINS (3); tiphys next is therefore NOT vulnerable to this specific site, because a sibling function covers the same ground"
      ],
      "concrete-fix": "Make the second readdirSync inside poolList (src/pool.ts:757-763) match every other reader of fleet.tasksDir in this codebase: let it propagate (throw) on failure rather than swallowing to taskIds = [], matching the FIRST readdirSync in the same function (fleet.worktreesDir, line 747) which is already unguarded and already propagates correctly to its callers. Add a test at the poolList/`pool list`/`doctor` level specifically (not only at next's level, which cannot see this site): a Fleet whose tasksDir is unreadable should make `pool list` report the failure rather than exit 0 with fewer lines, and should make `doctor`'s CHECK worktrees report something other than a bare PASS."
    },
    {
      "id": "F-3",
      "severity": "low",
      "evidence": [
        "bin/tiphys.ts:24-27 documents 'a usage error (an Error carrying usage: true) exits 64' and declares a UsageMarkedError interface for exactly this",
        "grep -rn '\\.usage\\s*=\\s*true|usage:\\s*true' src/ bin/ finds zero real call sites; the only match is the docblock sentence itself",
        "every command in src/commands/** reaches EX_USAGE (64) by directly `return`ing it from its own handler (verified live: resume with an extra operand exits 64, spawn without required flags exits 64, brief/checklist/gates/lock/mode/plan/pool/status/teardown/tuition/validate/watch all print their own usage line and exit 64 on no-args), never by throwing a marked Error",
        "test/cli.test.ts covers only `version` and an unknown subcommand, both resolved inside run() before the try/catch's usage branch could matter; no test exercises a thrown usage-marked Error reaching the top-level handler"
      ],
      "concrete-fix": "Either remove the unused UsageMarkedError interface and its docblock paragraph (the actual, exercised pattern is `return EX_USAGE` inline in every command, and the comment should describe that), or, if the mechanism is meant to stay available for a future command that throws instead of returning, add one real call site plus a test asserting a thrown usage-marked error exits 64 through the top-level handler, so the documented contract is not dead on arrival."
    }
  ],
  "criteria": [
    {
      "id": "3",
      "quote": "node bin/tiphys.ts version exits 0 and prints exactly the version field of package.json; node dist/bin/tiphys.js version prints byte-identical output (the source entry under type stripping and the compiled entry agree).",
      "evidence": [
        "test/cli.test.ts 'version prints the package.json version and exits 0': pass (node --test test/cli.test.ts, node v26.6.0, dist built)",
        "manual: node bin/tiphys.ts version -> 0.1.0, exit 0",
        "manual: node dist/bin/tiphys.js version -> 0.1.0, byte-identical to the source-entry output"
      ],
      "met": true
    },
    {
      "id": "4",
      "quote": "node bin/tiphys.ts no-such-command exits with code 64 and writes a usage line to stderr.",
      "evidence": [
        "test/cli.test.ts 'unknown subcommand exits 64 and prints usage to stderr': pass",
        "manual: node bin/tiphys.ts no-such-command -> stderr 'usage: tiphys <brief | checklist | ...>', stdout empty, exit 64",
        "ran the same no-args probe against all 20 registered commands: every one resolves to its own command-specific handler rather than the top-level usage line, confirming no dispatch-table shadowing"
      ],
      "met": true
    },
    {
      "id": "2",
      "quote": "After npm run build, dist/bin/tiphys.js exists and git status --porcelain reports no changes (dist/ is ignored and never committed, D-17).",
      "evidence": [
        "npm run build exit 0 (tsc -b tsconfig.src.json tsconfig.test.json plugin/tsconfig.json plus schema/runtime-dep copy steps)",
        "git status --porcelain empty immediately after the build",
        "dist/bin/tiphys.js exists and runs (used directly for the version byte-identity check above)"
      ],
      "met": true
    }
  ],
  "deviations-judged": [],
  "hazard-classes-addressed": [
    {
      "class-id": "M3-P5-fifo-hang-D-M3-27",
      "probed": "ran test/brief-compose.test.ts's real mkfifo criterion (a genuine named pipe at a mandated-reading path) after npm ci restored dependencies; also read composeBrief's own docblock claim that every path it did not create is routed through classifyEntry/refuseOpenForWrite and checked that claim against the source rather than only the test",
      "cleared-because": "9/9 tests pass including 'brief compose refuses a named pipe at a mandated-reading path in bounded time naming the path and the entry type'; the command returns a bounded refusal rather than hanging, matching the docblock"
    },
    {
      "class-id": "M4-P16-H-B-and-H-J-resume-dangerous-state",
      "probed": "manual end-to-end repro against a live fleet: a worktree scratch file with uncommitted content plus an unexpired lease (member A), sha256 of both before and after `tiphys resume`; also ran the phase's own 14/14 test suite",
      "cleared-because": "both files byte-identical (matching sha256) after resume, exit 0; the 14/14 suite additionally covers the half-rebuilt member B (state/ absent, worktrees/ present) rebuilding only the absent piece"
    },
    {
      "class-id": "M4-P18-H-B-staged-ephemeral-path",
      "probed": "read src/commands/sync.ts's own stagedEphemeral logic and its ordering guarantee (classification happens before any git add/commit); traced the SAME mechanism (an implementation that answers a narrower question than the one that matters) one file over, into src/status.ts's atomic-rename convention, and reproduced it live",
      "finding": "F-1"
    },
    {
      "class-id": "M4-P24-H-F-stop-condition-computed-not-judged",
      "probed": "called collectInFlight and exitCodeFor directly (exported from src/commands/next.ts) against both an empty fleet and a fleet carrying an orphaned open task; also ran the phase's own 16/16 test suite",
      "cleared-because": "exit 3 with the orphan present (both as a task entry and a worktree entry, plus the unreconstructable marker), exit 0 only on a genuinely empty fleet; an unreadable tasks/ is recorded into `unknown` rather than silently read as empty, holding exit 3 rather than degrading to 0 (T-036's mechanism does not fire for next specifically, see F-2's discussion of why)"
    },
    {
      "class-id": "M4-P24-site-14-pool-ts-759-explicitly-left-open",
      "probed": "direct function construction: called the exported poolList (src/pool.ts) and collectInFlight (src/commands/next.ts) against a hand-built Fleet whose tasksDir does not exist, which is the exact arm the phase's own fix round tried and failed to force via OS permissions (root cannot be chmod-blocked; replacing tasks/ with a file trips loadFleet first)",
      "finding": "F-2"
    }
  ]
}

```
