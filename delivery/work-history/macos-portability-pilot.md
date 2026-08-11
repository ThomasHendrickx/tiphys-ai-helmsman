# Work history: macOS portability pilot

- task: `macos-portability-pilot`
- plan: delivery/plan/macos-portability-pilot.md:1
- base SHA: `37577e6b83b60b9b6b381d748ef328dc51f30cd8`
- task branch: `task/macos-portability-pilot`
- fleet: `/Users/thomashendrickx/Projects/private-ai-harnesses/tiphys-pilot-fleet`
- implementation commit: `50bec41feabac000c5c798df34e530762247e610`
- review-fix commits: `637bb37143c39ba9afe6e4c329c5d8b3b96bbed4`,
  `b3dd7c20cacdff090297bc6e01340df0a24ad6ba`, and
  `f3621d03154ad396c7f082f2ea22f155fee53229`
- fix authority on main: `0e1cec7e88040e1ea85cc3ebc9a07f2b73de76e1`

## Lifecycle evidence by authority

### Tiphys

The persisted task metadata records task creation at
`2026-08-11T15:04:53.833Z`, the task id and branch above, the absolute task
worktree, `baseOffline: false`, and status `open`. The persisted executor
record names the `subprocess` adapter, launch time `2026-08-11T15:04:53.834Z`,
and deadline `2026-08-11T16:34:53.834Z`. Tiphys created the worktree and task
records and launched the adapter. The executor exit and turn-end record do not
exist while this implementer process is running. The current process must
capture them after this turn ends; this record does not invent future values.

### Temporary adapter

The temporary adapter launched this local implementation process in the task
worktree and returned control only after the process ends. Its source path and
sha256 were not supplied in the persisted brief or task records visible to the
implementer. Those values and the eventual executor exit are current-process
pilot evidence, not implementation evidence.

### Current process

The current process authorized the pilot through DR-0025 and the binding plan,
prepared the persistent fleet, acquired authority outside this brief, and
arranged the temporary adapter before dispatch. The watcher was observed from
persisted fleet state during implementation: `state/watcher.beacon` contained
`writtenAt: 2026-08-11T15:17:37.000Z`, `backoffStreak: 65`, and
`intervalMs: 10000`; `state/watcher.cadence.json` carried the same heartbeat
time and streak. Final watcher observation, executor exit, turn-end record,
external audit, delivery branch, PR, CI, review, merge, and teardown remain
current-process actions after this local implementation turn.

## Implementation

One shared `realpathSync` identity comparison now guards the scope,
credential, and suite direct entries. The spawn and credential assertions
compare filesystem identity while preserving the supplied absolute metadata
paths. Child construction fixes `GIT_CONFIG_NOSYSTEM=1` after allowlist copying
and after all five existing store redirections. The tracked-byte checker reads
raw bytes from `git ls-files` and applies only the owner-input file and vendored
JSON Schema fixture tree exemptions. A compact macOS smoke workflow builds,
runs the five focused test files, and runs the checker.

## Red witnesses and focused iteration

The first prepared `npm test` baseline reproduced the two logical
`/var/folders` versus physical `/private/var/folders` assertions and the
credential scrub failure. The initial attempt before `npm ci` was invalid
because dependencies were absent; it is recorded as an environment-preparation
deviation rather than macOS evidence.

After the first implementation, the focused command reported 70 tests, 68
pass, 2 fail, 0 skipped, exit 1. The remaining failures were the spawn and
credential path-spelling assertions. After identity-based assertions, the same
focused command reported 70 tests, 70 pass, 0 fail, 0 skipped, exit 0.

The deliberate credential defang removed the fixed assignment and ran:

`node --test --test-name-pattern='credential-scrub is green with units equal to sources probed while staged credential stores are redirected away' test/credentials-gate.test.ts`

It reported 1 test, 0 pass, 1 fail, exit 1 against Apple Git's prefix-system
`osxkeychain` configuration. Restoring the assignment made the same command
report 1 test, 1 pass, 0 fail, exit 0. The staged fake global helper and parent
token in that test were unchanged.

## Acceptance command evidence

- `npm ci`: exit 0, 14 packages added, 15 audited, 0 vulnerabilities.
- `npm run build`: exit 0.
- `node --test test/scope-gate.test.ts test/credentials-gate.test.ts test/suite-gate.test.ts test/spawn.test.ts test/authored-bytes.test.ts`: exit 0, 70 tests, 70 pass, 0 fail, 0 skipped.
- `node scripts/check-authored-bytes.mjs`: exit 0 over the tracked working-tree
  files. Git staging was then blocked, so the new files could not enter the
  `git ls-files` set in this implementer environment.
- `npm pack --dry-run --json`: exit 1 after its prepack build because npm tried
  to write logs beneath the controlled child's non-writable redirected HOME.
- `npm_config_cache=/tmp/macos-pilot-npm-cache npm pack --dry-run --json`: exit
  0, package `@tiphys/kernel` version `0.0.0`, 125 files.
- `npm test`: exit 1, 513 tests, 506 pass, 7 fail, 0 skipped. Six failures are
  the `test/deploy-gate.test.ts` stub server failing before it reports a port
  because this execution sandbox rejects `listen` on `127.0.0.1` with `EPERM`.
  The seventh is the nested npm pack test encountering the same non-writable
  redirected HOME described above. The complete log is local at
  `/tmp/macos-pilot-final-npm-test.log`.
- macOS workflow YAML parse through the pinned `yaml` dependency: exit 0.
- exact-title behavior lookup: exit 0, 519 registry entries, with all six new
  registrations resolved by their complete test titles.

No Node reporter output is pasted into this authored file. Counts and failure
details above are ASCII summaries of the captured local logs, so no reporter
glyph was transliterated.

## Deferred criteria, deviations, and risks

- Full `npm test` acceptance is not green in this restricted execution
  sandbox for the seven environment failures stated above. The portability
  focus is green with no skip.
- Linux CI, macOS CI, external audit, clean-room review, executor completion,
  turn-end capture, delivery PR, merge, watcher close observation, and teardown
  are outside implementer authority and remain for the current process.
- The exact package command is red only because npm cannot write beneath the
  redirected HOME. Redirecting npm's cache to writable `/tmp` makes the same
  dry run and prepack build green.
- `git add` failed before changing the index because Git could not create
  `/Users/thomashendrickx/Projects/private-ai-harnesses/tiphys-pilot-fleet/projects/tiphys-ai-helmsman/.git/worktrees/macos-portability-pilot/index.lock`:
  `Operation not permitted`. The common Git directory is outside this
  process's writable roots. No local commit was created; all source and
  evidence changes remain recoverable in the task worktree.
- A commit cannot contain its own object id as literal content because adding
  that id changes the object. This record identifies its containing commit
  mechanically; the final implementer response supplies the resolved SHA.
- No source outside the plan's declared file scope was edited. No PR, remote,
  M3-P4 artifact, decision record, governing plan, or pilot plan was changed.

## Current-process audit and recovery addendum

Tiphys recorded the subprocess exit in `turn-end` at
`2026-08-11T15:23:11.162Z` with exit code 0. The watcher then wrote a fresh
beacon at `2026-08-11T15:23:11.174Z`, reset its backoff streak to 0, and used a
5000 ms interval. The persisted executor record still identifies the
`subprocess` adapter and its original launch and deadline.

The adapter wrapper sha256 was
`fce3854a937845eb98470319f96d523aa42732a3d2b66e29d9ba2ce14081364e`.
The exact persisted source brief sha256 was
`631613d551c102bbdd08dea6bf20d451182378ce660bd3e95a6d40454b10e917`.
Both files lived outside the project and task worktree.

The implementation process could edit the worktree but could not create the
shared Git worktree index lock because that path was outside its writable
sandbox. It therefore returned the complete unstaged diff instead of forcing a
commit. Under the retained recovery authority, the current process audited the
scope and diff, staged only the declared feature files, reran the byte checker
and `git diff --cached --check`, and created the implementation commit named at
the top of this record. This work-history addendum is a second local commit so
it can name that immutable implementation SHA.

Outside the implementation sandbox, the current process ran the complete
macOS suite: `npm test` exited 0 with 513 tests, 513 pass, 0 fail, and 0
skipped. Exact `npm pack --dry-run --json` exited 0 after its prepack build and
reported 125 files. The workflow parsed through the pinned YAML dependency,
contained no secret reference, and left the existing `gates` workflow
untouched. The current-process scope and code audit found no blocking issue.

Recorded pilot deviations are: an initial dependency-free test attempt before
`npm ci`; one transient npm DNS failure followed by a successful retry; the
expected sandbox denial of localhost listeners and npm log writes; the shared
Git index-lock boundary above; and an accidental `tiphys init --help` creating
an isolated fleet named `--help`, because that command has no help flag. The
accidental fleet was inspected and moved recoverably to
`/tmp/tiphys-accidental-init.FvSvhV/fleet`; no project data was lost. The Codex
workspace sandbox also allowed broader host reads than the temporary adapter's
GitHub credential scrubbing alone implies. No GitHub credential or parent Git
configuration was exposed to the implementation environment, but the broad
read boundary remains a pilot finding for adapter hardening.

## Owner-authorized current-process fix round

After PR 89 received three independent review findings, the owner explicitly
authorized the current delivery process to resolve those feature findings
without launching another Tiphys subprocess. The authorization states that
this remains fix-round and recovery work inside the existing pilot, does not
expand Tiphys authority, does not constitute M4 cutover, and does not accept
the unfinished adapter. It also authorizes independent Codex clean-room
reviews if the Claude-family reviewer remains unavailable.

The current process added the explicit scope direct-entry witness required by
criterion 3. On macOS it proves that the invoked `/var/...` spelling differs
from the canonical `/private/var/...` spelling, then verifies exit 21 and the
written error record. On other platforms the same behavior is exercised
through a controlled symlink alias. The credential witness now first proves on
macOS that the selected Apple Git resolves the prefix-system `osxkeychain`
helper while `GIT_CONFIG_NOSYSTEM=0`; the scrubbed child must still resolve no
helper with the fixed value. The authored-byte checker now reads indexed Git
blobs in one `git cat-file --batch` operation, so tracked symlink text is
checked without following a target inside or outside the repository. A test
uses both an external target containing NUL and a broken non-ASCII link.

After these edits, `npm run build` exited 0 and the focused portability command
exited 0 with 72 tests, 72 pass, 0 fail, and 0 skipped. Full host verification,
then exited 0 with 515 tests, 515 pass, 0 fail, and 0 skipped. The staged
repository-wide byte check and `git diff --cached --check` also exited 0.
Package verification, clean-room review, CI, merge, watcher close observation,
and teardown remain current-process steps after this record is committed.

## Current-process CI recovery and final local verification

PR 90 merged the owner's exact fix-round authorization, DR-0026, the amended
pilot scope, and its two current-head clean-room review reports at `0e1cec7`.
No second Tiphys subprocess ran. The authorization adds only the standing-CI
witness specifications and real Apple Git capture needed to verify the already
authorized source changes; it does not accept the adapter or claim M4 cutover.

The first CI run of fix commit `637bb37` exposed two additional verification
defects. On macOS the prefix-helper precondition set
`GIT_CONFIG_SYSTEM=/dev/null`, hiding the Apple prefix-system file it was meant
to prove. On Linux the red-witness gate correctly rejected the five changed
source files because the original pilot scope had omitted witness artifacts.
The test now leaves the system-config path unmodified, reads the committed
capture `macos-apple-git-prefix-helper.txt`, and requires the selected Apple Git
to reproduce `osxkeychain` before the scrubbed-child assertion. Five separate
mutation specifications cover path identity, the three direct entries, and the
fixed `GIT_CONFIG_NOSYSTEM` assignment. The red-witness gate evaluated all five
green at head and red against every declared dangerous state.

The authored-byte test now also creates a genuine three-stage unmerged index
and proves the checker fails closed with exit 2 and the unsupported-index
diagnostic. This discharges the clean-room review's missing fail-closed witness
without broadening the checker behavior.

At final local fix state, the focused portability command exited 0 with 73
tests, 73 pass, 0 fail, and 0 skipped. `npm run build` exited 0. Full
`npm test` exited 0 with 516 tests, 516 pass, 0 fail, and 0 skipped. The five
red witnesses exited green, the repository-wide authored-byte check exited 0,
`git diff --check` was clean, and exact `npm pack --dry-run --json` exited 0
with 125 files. PR 89's fresh clean-room reviews, exact-head Linux and macOS
CI, merge, watcher close observation, and teardown remain current-process
steps.
