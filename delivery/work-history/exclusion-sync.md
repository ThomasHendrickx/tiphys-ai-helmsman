# Work history: DR-0047 final sweep, batched fix round, exclusion and sync group

- branch: claude/sweep-fix-exclusion-sync, cut from origin/main at ad2428b76ef6f53f75b0d7f94c7db50463e077b7
- files owned by this round: src/lock.ts, src/exclusion.ts, src/brief.ts,
  src/commands/lock.ts, src/commands/sync.ts, src/fleet.ts, src/pool.ts,
  src/commands/brief.ts, src/roles.ts, bin/tiphys.ts, test/**, this document
- reviews read in full, from the evidence branch claude/stop-condition-m4-terminal:
  clean-room-final-exclusion-criteria.md, clean-room-final-exclusion-hazard.md,
  clean-room-final-cli-criteria.md, clean-room-final-cli-hazard.md
- two other implementers held disjoint file sets. Nothing outside the list above
  was edited. Everything that wanted an edit outside it is in ESCALATIONS at the
  end of this document, by name, with what the edit would be.

Written incrementally. Nothing below is softened.

## Read this section first: WHAT THE DERIVATIONS DID NOT COVER

The fix-round contract says the reviewer's first check is this item, so it is
first.

1. **Every enumeration below was run against `src/`, `bin/` and `plugin/src/`,
   with `src/gates/` and `src/witness/` excluded** from the open-site
   enumeration. Those two trees are the gate runner and the mutation harness;
   they read paths the gate registry names rather than fleet state, and they
   were out of this group's reach. A bare open there is not covered by this
   round and is not claimed to be absent.
2. **`test/` was not enumerated for the unguarded-open mechanism.** A test that
   reproduces a defect is not a defect. The one exception is that the tests
   this round added are themselves listed, because they are new code.
3. **The open-site classifier is a PROXIMITY HEURISTIC, not a proof.** It reads
   the fourteen lines before and the three after each call and looks for a
   classifier name or an `O_EXCL` flag. A guard further away than that reads as
   BARE, and a guard in the same window that governs a DIFFERENT path reads as
   GUARDED. Both directions were checked by hand for every site in the ten
   files this round owns; they were NOT checked by hand for the sites outside
   them, so the BARE rows outside this round's files are candidates to be
   examined, not findings.
4. **The register was exercised against LOCAL BARE REPOSITORIES only.** No real
   GitHub remote was used, so server-side ref-update ordering is inferred, in
   exactly the terms M4-P20 criterion 6 uses of its own probe.
5. **No CI arm was observed.** Every number in this document is from this
   container.
6. **One recommendation was stress-tested and one was not reachable.** Finding
   1's recommendation was examined and is implemented, with the examination
   written out below. The half of finding 6 that belongs in
   `src/commands/doctor.ts` could not be done, because that file is another
   implementer's, and it is escalated rather than left implied.
7. **The macOS arm was not run**, and two of the findings here touch path and
   pipe behaviour. It is the one genuinely CI-only surface this repository
   records.

## The mechanisms, one per finding

A fix round that closes the sites a reviewer named and no others has failed
this contract. Each row below names the MECHANISM the round fixed; the
enumeration for each is in the next section.

| finding | the mechanism, not the instance |
|---|---|
| 1 | an exclusion verdict derived from an artifact that TRAVELS through the fleet's own sync, rather than from one that cannot travel |
| 2 | a two-layer mutation where only ONE of three publishing paths undoes the local layer when the shared layer loses |
| 3 | a writer choosing a destination without establishing that destination's SYNC CLASS, in a fleet whose git exposure is a DENYLIST |
| 4 | a decision input the CALLER supplies reaching a shipped verdict without being declared and without the verdict saying so |
| 5 | an exit code that contradicts the state the command left behind |
| 6, 9 | a category empty BY CONSTRUCTION reported as empty BY OBSERVATION |
| 7 | a declared vocabulary wider than the artifacts the package actually places |
| 8 | reading or writing a path whose TYPE has not been established |
| LOW a | a command surface with no affordance for the first thing a consumer types |
| LOW b | a documented mechanism with no implementation |

## The derivations, in full

The commands and their complete output are committed beside this document at
delivery/work-history/exclusion-sync-derivation.txt:1 rather than pasted
inline, because one of them is a 41-row table and this document already runs
long. Nothing is summarised there: it is the captured stdout of the commands
named in it.

The headline numbers, so a reader knows what to look for in that file:

- **M1**: 12 hits. Two writers/readers of the environment identity
  (`ensureEnvironmentId` at src/exclusion.ts:296, `readEnvironmentId` at
  src/exclusion.ts:835), one comparison consuming it (src/exclusion.ts:973),
  and two callers of the guard (src/spawn.ts:1024, src/teardown.ts:452). The
  whole cross-environment half of the guard hung on that one comparison, and
  both callers inherited whatever it said.
- **M2**: 10 hits. THREE `sharedCommit` sites (src/lock.ts:748 acquire,
  src/lock.ts:869 renew, src/lock.ts:973 release) and FIVE
  `applyLeaseMutation` calls. Before this round exactly one of the three
  publishing paths undid its local mutation on a lost publish. There is no
  fourth mutator: `grep -rn "applyLeaseMutation" src/ bin/` returns hits in
  src/lock.ts only. A future module importing the exported primitive would not
  be caught by that grep, which is stated rather than assumed away.
- **M4**: 6 hits, of which 4 are the lock command's own seams and 2 are
  unrelated (`TIPHYS_HOLDER_ID`, which is the documented holder transport, and
  `TIPHYS_WATCH_TEST_HOLD`, which is src/watcher.ts's hold point and is another
  file). Of the lock seams, `TIPHYS_LOCK_TEST_NOW_MS` is the one that reaches a
  VERDICT; `TIPHYS_LOCK_TEST_HOLD` changes only WHEN a decision is applied, not
  what it decides.
- **M5**: the package publishes ONE binary (`{"tiphys":"dist/bin/tiphys.js"}`)
  serving a 20-entry dispatch table, so a handler installed once in
  bin/tiphys.ts covers every command rather than the one the reviewer measured.
- **M6/M9**: every `catch` in the ten owned files, with the three lines that
  follow it, so a reader can see which ones yield an empty or absent result.
- **M7**: the six declared role ids against the file each one is placed at,
  with an on-disk check per row.
- **M8**: 41 open sites. **20 GUARDED, 4 O_EXCL (which cannot block: the open
  either creates the entry or fails EEXIST), 17 BARE.** Of the 17 BARE, TWO are
  in this round's files by a measured decision (src/lock.ts:418 and
  src/lock.ts:458, the lease stage, explained below) and the other 15 are in
  files this round does not own.

### The finding-1 examination, which was asked for rather than obedience

The orchestrator's recommendation was to return `allowed` only when the
environment id matches AND a live local lease exists under `state/`. It was
stress-tested on four questions before being implemented.

**Does it actually close the hole, or only the measured instance?** It closes
the mechanism. `state/` is in the fleet ignore set (src/fleet.ts:29), so the
lease artifact is per environment BY CONSTRUCTION rather than by a rule anyone
has to remember. The two witnesses this round added are structurally different
in HOW the identity arrived (a `git clone` of a synced fleet, and a fleet home
whose own `state/` was lost with no clone anywhere), and a fix keyed on "is
this a clone" would have closed the first and left the second open.

**Can a clone walk around it by acquiring locally?** No path was found that
does. A clone's `tiphys lock acquire` goes through `sharedPreflight`, which
refuses while the register is held and not stale, so the clone cannot create
the lease the guard now wants. `tiphys resume` rebuilds `state/` as an empty
directory and writes no lease. This is stated as "no path was found", not as
"there is none": the search was over the commands in the dispatch table, and an
operator who copies a lease file between machines defeats it, as they would
defeat any file-based exclusion.

**Does it break either criterion's letter?** No. M4-P21 criterion 3 asks for
the identity to be tracked and to travel with the clone; the file is unchanged
and test/cross-environment-lock.test.ts:336 still passes unmodified. M4-P22
criteria 2 and 3 ask for a clone to be refused; it now is.

**What does it cost?** An environment whose `state/` is lost while its
container continues is refused here until the stale window lets it take the
register over. That is exactly the smoothing criterion 3's tracking was meant
to provide, and giving it up is a deliberate trade recorded in the source at
the comparison itself, not only here.

One further thing the examination turned up, which is why it was worth doing.
The reviewer's own suggested fix was to record the acquiring environment's
local `holderId` IN THE REGISTER DOCUMENT and require both to match. That is
strictly stronger and it was NOT implemented, for a reason a reviewer can
check: it changes the register document's shape, and a register written by an
earlier version carries no such field, so the guard would have had to choose
between refusing every pre-existing register (a migration this milestone has no
mechanism for) and falling back to the identity comparison (which is the hole).
Requiring the local ARTIFACT gets the same property with no schema change. If
the orchestrator wants the stronger form, it is a plan amendment with a
migration, not an implementer's call.

### The finding-8 enumeration, and the two rows in it that are NOT defects

`src/lock.ts:418` and `src/lock.ts:458` write `<lock>.stage` with an unguarded
`writeFileSync`, and open(2) for writing on a FIFO blocks exactly as reading
one does, so they read like members of this class. They are not reachable. The
claim-held sweep above them (CR-202) unlinks the stage UNCONDITIONALLY before
either branch writes it. Measured at this head with a real `mkfifo` at
`state/orchestrator.lock.stage`: `tiphys lock acquire` exits 0 in under a
second, the planted FIFO is gone, and the lease is taken. A guard there would
be code no witness could redden, so the guard was written, measured, and then
REMOVED, and the measurement is now a passing test rather than a sentence here.

Two members of this class were found by this round's own enumeration and are
in NEITHER review:

- `readPoolRecord` (src/pool.ts:259). `tiphys pool list` returns in the same
  second against a FIFO pool record because it reads only the NAME; `tiphys
  pool destroy --task t-0001` was killed at ten seconds by `timeout`. The two
  commands differ by whether the record is OPENED.
- the lock hold point's two marker writes (src/commands/lock.ts:84 and
  src/commands/lock.ts:116), whose paths are derived from one the caller
  supplies in `TIPHYS_LOCK_TEST_HOLD`.

### The finding-3 table: every path the kernel writes under a fleet home

Derived from the write enumeration in the derivation file and classified
against the fleet ignore set. This is the table the dispatch asked for in full.

| path under the fleet home | writer | sync class | intended? |
|---|---|---|---|
| `state/orchestrator.lock` | src/lock.ts | ephemeral | yes |
| `state/orchestrator.lock.stage` | src/lock.ts | ephemeral | yes |
| `state/orchestrator.lock.mutex` | src/lock.ts | ephemeral | yes |
| `state/shared-lease.observed.json` | src/exclusion.ts:552 | ephemeral | yes |
| `state/watcher.beacon` and its stage | src/watcher.ts:394 | ephemeral | yes |
| `state/last-wake.json` | src/watcher.ts:592 | ephemeral | yes |
| watcher claim and taken files | src/watcher.ts:672 | ephemeral | yes |
| `state/status/stream.jsonl` | src/status.ts:141 | ephemeral | yes |
| `worktrees/<id>` and `worktrees/<id>.pool.json` | src/pool.ts | ephemeral | yes |
| `projects/<name>` | src/spawn.ts | ephemeral | yes |
| `tasks/<id>/meta.json` | src/task.ts:445 | DURABLE | yes |
| `tasks/<id>/brief.md` | src/brief.ts:80 | DURABLE | yes |
| `tasks/<id>/turn-end-hook.mjs` | src/hooks.ts:105 | DURABLE | yes |
| `charter/`, `decisions/`, `backlog.md`, `package.json`, `.gitignore` | src/commands/init.ts | DURABLE | yes |
| `status/current.json` | src/status.ts:143 | DURABLE | yes, M4-D-13 |
| `cutover.json` | src/cutover.ts | DURABLE | yes |
| **`tiphys-environment.json`** | src/exclusion.ts:318 | **DURABLE and SYNCED** | yes by M4-P21 c3, and it is finding 1 |
| **`status/current.json.tmp`** | src/status.ts:142 | **DURABLE and SYNCED** | **NO** |
| **`.cutover.<random>.tmp`** | src/cutover.ts:287 | **DURABLE and SYNCED** | **NO** |

Paths a caller names with `--out` (`brief compose`, `plan`, `tuition`,
`cutover`, `gates`) are not fleet-home paths by construction and are not in the
table.

**The fleet ignore set is NOT widened, and nothing stops being synced.** That
constant also drives `EPHEMERAL_DIRS`, `DURABLE_DIRS` and the `.gitignore`
`tiphys init` writes, so a glob added to it would become a directory name
`tiphys resume` tried to rebuild. The new rule is a separately named constant
about SUFFIXES (src/fleet.ts:384), read by `tiphys sync` from src/fleet.ts
rather than copied into it, which is the property test/sync.test.ts:268 guards
by asserting that src/commands/sync.ts names no ignored prefix of its own.

**What DOES change for a consumer**: a `tiphys sync` that meets an untracked
path ending in `.tmp`, `.stage` or `.mutex` outside the ignored prefixes now
REFUSES, names the path and the suffix, and commits nothing, where it used to
commit and push it. A `tiphys sync` racing a live `tiphys status emit` now
fails with a named path and the operator re-runs. That is the cost of the
refusal and it is the same cost criterion 4 already accepts for a staged
ephemeral path.

## The red witnesses

Every witness was run against the UNMODIFIED tree at ad2428b first. Twenty
tests, NINETEEN red and ONE green, and the one green is the control that proves
the new sync rule is not a blanket refusal. The capture below is real output
from `node --test test/sweep-exclusion-sync.test.ts` at that head.

**TRANSLITERATION, DECLARED.** Node's test reporter prints U+2714 at the head
of a passing line and U+2716 at the head of a failing one, and this repository
requires authored files to be pure ASCII. In the block below U+2714 (1
occurrence) is rendered `PASS` and U+2716 (19 occurrences) is rendered `FAIL`.
The elapsed times are rendered `(...)` because they differ per run. Nothing
else in any captured output in this document was changed.

```
FAIL the shared guard refuses a second fleet home that carries the holder's tracked identity but no lease (...)
FAIL a shared release that cannot publish restores the local lease it removed (...)
FAIL a shared renew that cannot publish restores the local lease it extended (...)
FAIL sync refuses a kernel scratch artifact in a tracked subdirectory and commits nothing (...)
FAIL sync refuses a kernel scratch artifact at the fleet root (...)
PASS sync still commits an ordinary durable path, so the scratch rule is not a blanket refusal (...)
FAIL the decision-clock seam is refused unless the run declares it, and says so when it is used (...)
FAIL a lock command whose consumer closes the pipe early exits with its own code, not with EPIPE (...)
FAIL poolList reports an unlistable tasks directory instead of an empty pool (...)
FAIL poolList reports an open task whose record did not read instead of dropping the row (...)
FAIL every declared role resolves to a brief that ships, and composing it succeeds (...)
FAIL a role whose brief does not ship is refused by name before anything is read (...)
FAIL a named pipe at the lease path is refused in bounded time by every lock subcommand (...)
FAIL a named pipe at a lease stage path is refused in bounded time (...)
FAIL a named pipe at the environment identity path is refused in bounded time (...)
FAIL a named pipe at a brief input path is refused in bounded time and strands nothing (...)
FAIL a named pipe at a pool record is refused in bounded time by pool list (...)
FAIL the exclusion and lease modules open no path they have not classified (...)
FAIL --help and help print the usage line on stdout and exit 0 (...)
FAIL bin/tiphys.ts documents no error-marking mechanism that nothing sets (...)
```

Two of those twenty were REWRITTEN after the red run, and saying so is the
point of a work history. The `lease stage path` row became the measured control
described above, because the site turned out not to be reachable. The `pool
record` row moved from `pool list` to `pool destroy`. The version that reddened
was reddening on the wrong command, and the measurement that settles which
command opens the record is this one, run in a fleet whose only pool record is
a FIFO:

```
$ timeout 10 node bin/tiphys.ts pool list       -> prints "t-0001 missing", EXIT=0
$ timeout 10 node bin/tiphys.ts pool destroy --task t-0001   -> EXIT=124
```

The test now carries both arms so the asymmetry is visible.

### Where each class has two structurally different members

| class | member 1 | member 2 | why they are different in KIND |
|---|---|---|---|
| finding 1 | a `git clone` of a synced fleet | a fleet home whose own `state/` was lost | the identity arrived by travelling, versus never moved at all |
| finding 2 | a failed release, which DELETES the lease | a failed renew, which EXTENDS it | the local mutation is a removal, versus a rewrite |
| finding 3 | a fixed name in a TRACKED SUBDIRECTORY | a dot-prefixed RANDOM name at the fleet ROOT | a fix keyed on the filename closes one and not the other |
| finding 5 | `lock acquire`, two lines, consumer takes one | `lock status`, one line, consumer reads none | the write that raises EPIPE is a later line, versus the first |
| findings 6, 9 | the tasks DIRECTORY cannot be listed | one task's `meta.json` does not read | the whole reconstruction is dropped, versus one row |
| finding 8 | fleet state the kernel wrote, read | a caller-named argument, read | whose path it is |
| finding 8 | fleet content the kernel did not create, read | a pool record, read by a different command | which command reaches it |

## What each fix actually does

**Finding 1.** `guardSharedRegister` (src/exclusion.ts:952) still returns
`allowed` for a matching environment id, and now only when this filesystem also
carries a lease artifact with a holder. Expiry is deliberately NOT judged
there: `checkHoldership` (src/task.ts:518) runs before it in both callers and
already refuses an expired or wrongly-held lease, and a second expiry
comparison in a second place is the drift src/lock.ts:214 exists to prevent.

**Finding 2.** `restoreLocal` (src/lock.ts:619) is one helper used by both
paths that lacked a rollback. The bytes written back are the OBSERVED raw
bytes, and the token handed to the primitive is the restored lease's OWN token,
because the primitive confirms an application by re-reading the token in the
file it wrote and a fresh one would fail against bytes carrying the old one. A
rollback that itself loses is stated in the failure line rather than swallowed.

**Finding 3.** `tiphys sync` asks a second, separately declared question before
it stages anything, and refuses rather than excluding. See the table above.

**Finding 4.** `TIPHYS_LOCK_TEST_NOW_MS` now requires `TIPHYS_ALLOW_TEST_CLOCK=1`
in the same environment, and every verdict line the shared layer prints carries
`(injected-clock)` on the `signal=` token when the clock was injected. Both
halves are needed: an allowance alone would still let a measurement's capture
be quoted as an honest run's.

**Finding 5.** bin/tiphys.ts installs an EPIPE-only handler on both streams,
once, at the single entry point the package publishes. EPIPE only is
load-bearing: any other write error still surfaces.

**Findings 6 and 9.** `poolList`'s unlistable-`tasks/` `catch` is gone, so the
failure reaches the caller. That `tiphys next` already handles it rather than
crashing is a claim, and the command that settles it is:

```
$ grep -n "entries = poolList(fleet);" -B2 -A4 src/commands/next.ts
333:  let entries: ReturnType<typeof poolList>;
334:  try {
335:    entries = poolList(fleet);
336:  } catch (error) {
337:    report.unknown.push(`the pool could not be listed: ${singleLine(String(error))}`);
338:    return;
339:  }
``` A task whose `meta.json` is
PRESENT and did not read is now reported as an entry with `unresolved: ["meta"]`
rather than dropped as if it were closed.

**Finding 7.** `ROLE_BRIEF_FILES` (src/roles.ts:87) declares where each of the
six roles' briefs ships, the orchestrator's being `AGENTS.md` at the package
root. Includes now resolve against the BRIEF'S OWN directory rather than
against `roles/`, because every brief under `roles/` writes
`$include: _shared-dispatch-contract.md` and AGENTS.md writes
`$include: roles/_shared-dispatch-contract.md`, and both are correct relative
to the document they are in.

**Finding 8.** `classifyPathEntry`, `readRegularPathIfPresent` and
`refuseOpenPathForWrite` live in src/fleet.ts:268, which is the BOTTOM of the
`src/` import graph. That placement is forced and is worth a sentence: the
graph is a strict DAG at this head, `src/task.ts` imports `src/lock.ts` and
`src/lock.ts` imports `src/exclusion.ts`, so the two modules holding the
kernel's lease and register reads cannot reach src/task.ts:118's `classifyEntry`
without creating the first cycle in `src/`. The vocabulary, branch order and
refusal TEXT are kept identical to src/task.ts's on purpose, so doctor's
existing sentence and the new ones read as one condition.

**LOW a.** `--help`, `-h` and `help`, each alone, print `usageLine()` on stdout
and exit 0. M1-P1 criterion 4's contract is untouched: an unknown subcommand
still prints usage to STDERR with an EMPTY stdout and exit 64, and the round's
own test asserts both halves so the change cannot quietly widen.

**LOW b.** The `UsageMarkedError` interface and the docblock sentence promising
it are removed together. There is no behavioural red witness for this one and
that is stated rather than papered over: the branch was dead, so removing it
changes no observable behaviour. The witness is structural and it carries its
own negative control, which is a string containing a real marker that the same
grep does match.

## The duplication this round created, on purpose, and how it is bounded

src/fleet.ts now holds a second implementation of the question src/task.ts:118
already answers. Two implementations can drift. The end state is src/task.ts
re-exporting src/fleet.ts's, and that edit is NOT in this round's file set, so
it is escalated rather than made. Until then the two are kept identical in
vocabulary and in refusal text, and the refusal text is asserted by the tests
this round added, which match on the same sentence doctor already prints.

## Gates and suite

Every command below was run with `node --version` checked in the SHELL THAT RAN
IT, which printed `v26.6.0` from `/tmp/claude-0/n26/bin`.

**The complete suite sentence.** Interpreter node v26.6.0; `npm ci` exit 0;
`npm run build` exit 0 with `git status --porcelain` EMPTY afterwards, so
`dist/` was BUILT; invocation `npm test`, which is
`node --test "test/**/*.test.ts"` and is NOT the bare `node --test` of gate-list
step 3 (standing warning 12: the two differ by the tracked `sandbox/` fixture):

```
i tests 1362
i pass 1362
i fail 0
i cancelled 0
i skipped 0
i todo 0
i duration_ms 349567.399548
```

U+2139 (7 occurrences) is rendered `i` in that block. Nothing else was changed.

**Read the skipped count carefully, because this suite prints two kinds.**
Node's own `skipped` is 0. The run ALSO prints thirty `# skipped <case>.json:`
diagnostic lines from the vendored JSON-Schema test-suite runner, which are
data-driven sub-cases that runner declares unsupported, not node-level skips.
They are present at this head on `main` as well.

**The container trap was granted and restored explicitly.** test/gates.test.ts's
`runCliUnprivileged` family fails here when `/tmp/claude-0` is mode 700, which
is T-029. `chmod o+rx /tmp/claude-0` was run before each full-suite invocation
and `chmod 700 /tmp/claude-0` after it. With the grant in place that test
passes, which is why the count above carries no failure attributed to it.

## The witness obligations this round took, and the ones it moved

`red-witness` covers `src/`, `bin/` and `plugin/src/`, so editing ten files in
those trees is a coverage obligation and not a free change. The first bundle
run surfaced five separate red-witness problems, ALL of them caused by this
round's own edits, and they are recorded here because the fix for each is the
kind a later reader will otherwise re-derive.

1. **`source changed with no witness spec covering it: src/brief.ts`.** A new
   spec, witness/brief-input-entry-types-established.json:1, carries two
   structurally different members over that file: the CALLER-supplied read and
   the FLEET-CONTENT read, each defanged back to a bare open through
   `process.getBuiltinModule("node:fs")`, which restores the real block rather
   than only removing the diagnostic. Both were measured separately:

   ```
   member 0 -> tests 1, pass 0, fail 1
   member 1 -> tests 1, pass 0, fail 1
   unmutated -> tests 1, pass 1, fail 0
   ```

2. **`witness cli-top-level-error-handler` member 1 named a line this round
   deleted** (`process.exitCode = usage ? EX_USAGE : 1;`). The mechanism it
   guards is unchanged, so the member was re-aimed at the line that now carries
   the same decision rather than the witness being weakened.
3. **`witness shared-exclusion-unreachable-register-fails-closed` member 1
   named the verdict-printing line** this round wrapped in `labelClock`.
   Re-aimed the same way.
4. **`witness spawn-launch-failed-rolls-back-through-a-symlink` carries a PATCH
   whose first hunk is src/fleet.ts's import line**, which this round changed.
   The patch's context was updated and `git apply --check` now exits 0.
5. **`witness sync-staged-lease-refused` stopped guarding its behaviour, and
   this is the interesting one.** Its second member finds
   `    }\n    return 1;\n  }\n\n  const durable = [`, which anchors on
   whatever refusal block sits LAST before the durable set is computed. This
   round put its scratch refusal there, so the mutation removed the NEW block's
   `return 1` and left the staged-lease test green: member 0 red 2 of 2, member
   1 red 0 of 2. **A stored witness can be silently disarmed by an edit that
   only moves code**, which is a variant of the cannot-go-red shape this
   repository keeps paying for, and it went red loudly here only because
   `repeats: 2` measures the member rather than trusting it. The fix was to run
   the scratch refusal BEFORE the staged-ephemeral one, so the anchor points at
   its own block again; the ordering choice is stated in src/commands/sync.ts
   at the point it is made.

## The gate bundle

Run locally at the head this document is committed with, node v26.6.0, `dist/`
built, `--mode full --base origin/main`.

**`--phase` is required by three gates and the first run did not supply it**,
so `scope`, `gate-classes` and `merge-preconditions` all reported
`requires --phase, which was not supplied`. That is a property of the
invocation, not of the branch: `.github/workflows/gates.yml:233` derives the
value with a `sed` that leaves a non-phase branch name unchanged. Re-run with
`--phase claude/sweep-fix-exclusion-sync`, `scope` reports
`not-applicable: precondition scope-branch-is-a-phase-branch evaluated and
unmet: branch claude/sweep-fix-exclusion-sync does not match`, which is the
correct answer for a branch that is deliberately not a phase branch.

`citations` is `not-applicable` here: its precondition is a changed path under
`delivery/plan/`, `delivery/verification/`, `delivery/decisions/`,
`delivery/tuition/`, `delivery/requirements/` or `delivery/STATE.md`, and this
round changes none of those. The citations in this document were therefore
verified by hand instead, every one of them resolved against the tree at this
head, and the check is recorded in the derivation file.

## The claim grep

Both binding forms were run against this document. The line-based form and the
wrap-insensitive form report the SAME hits, so nothing is hidden by a wrap in
this file. Three hits were restated to carry an adjacent captured command. The
two that remain are in the members table and are DESCRIPTIONS OF TEST FIXTURES
(`a fleet home whose own state/ was lost`, `the tasks DIRECTORY cannot be
listed`), not claims about what the system can or cannot do: each names a state
the test itself constructs. Both forms and their output are in the derivation
file beside this one.

## ESCALATIONS: what wanted an edit outside this round's files

1. **`src/commands/doctor.ts`: `CHECK worktrees` should catch a throwing
   `poolList` and report FAIL rather than letting it abort the run.** `poolList`
   now throws on an unlistable `tasks/`. src/commands/next.ts:334 already
   handles that, as the capture in the findings-6-and-9 note above shows;
   doctor's `checkWorktrees`
   (src/commands/doctor.ts:1481) does not, so in that state doctor now ends with
   one diagnostic line and exit 1 instead of a false `PASS no pool worktrees`.
   That is better than the false PASS the review found and it is not the right
   end state.
2. **`src/task.ts` should re-export src/fleet.ts's classifier** so the kernel
   has one implementation of "may this path be opened" rather than two. See the
   duplication section above.
3. **`src/commands/doctor.ts` should report the injected-clock allowance as a
   FAIL**, which is the second half of the exclusion-criteria reviewer's
   suggested fix for finding 4. The seam is now gated and labelled; nothing
   tells an operator running `doctor` that a previous command used it.
4. **`src/commands/init.ts` should write the kernel scratch suffixes into the
   fleet `.gitignore`**, as the belt to this round's suspenders. That closes it
   for fleets created after the change and does nothing for existing ones,
   which is why the `sync` refusal is the load-bearing half and was done here.
5. **Fifteen BARE open sites outside this round's files**, listed by name in the
   derivation. The ones most worth a look are src/hooks.ts:105 (writes an
   executable hook into a task directory), src/task.ts:445 (writes `meta.json`),
   src/spawn.ts:641, src/watcher.ts's three barrier writes, and the three in
   `plugin/src/`. They are CANDIDATES from a proximity heuristic, not findings.
