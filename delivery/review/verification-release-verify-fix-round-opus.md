# Delta verification: PR 211 fix round 1 (opus)

- date: 2026-09-23
- PR: 211, branch `claude/release-verify-waits-for-registry`
- head verified: 5de114c (code head 90e7b7e; 3f9f2fc and 5de114c after the
  merge are work history only). Previously reviewed head: 90f09fc.
- scope: the fix round for the two clean-room reviews of 90f09fc, my own
  CR-001 to CR-004 in particular, plus the five questions in the coordinator's
  dispatch
- model family: opus
- method: detached checkout of 5de114c; `git diff 90f09fc 90e7b7e --
  scripts/release-verify.sh` read in full; every claim below re-executed on
  node v26.6.0 / npm 11.18.0. Mutations ran in a byte copy of the worktree
  (`mutlab2`), so the full suite in the real worktree was never disturbed. A
  logging proxy recorded the exact registry requests of `npm install`,
  `npm cache add` and `npm view`. A local TCP server that accepts and never
  answers measured the real bound. No `pkill` or `killall` was used; the only
  processes killed were three leftovers my own mutation runs created, each
  checked by PID and command line first.

## Verdict

APPROVE. No high, no medium, three low.

All four of my findings are closed and each one is witnessed by a mutation.
The new `bounded_run` kills the whole process group on Linux (measured). Its
10s floor adds a bounded amount, about 13s at worst, never an unbounded one
(computed and measured). The one thing I must correct is MY OWN CR-001: its
statement that `npm install` reads the abbreviated ("corgi") packument is
wrong for npm 11.18.0, and the fix round's script comment carries that error
forward. The fix is still right, because `npm cache add` fetches a superset of
what install fetches for this package. That is DV-001, a comment-only low.

## Findings

### DV-001 (low): the script comment says install reads the abbreviated packument; for npm 11.18.0 it reads the full one

This is my error from CR-001, carried into "scripts/release-verify.sh" at
the `WHAT "SERVED" MEANS HERE` block (branch lines 346 to 363) and into the
work history's mechanism table ("the full packument, which install does not
read").

Evidence, a logging registry proxy (all requests npm made, filtered to this
package, npm 11.18.0, fresh cache each):

```
=== install   (npm install --prefix inst @tiphys/kernel@0.2.0)
GET /@tiphys%2fkernel accept=application/json
GET /@tiphys/kernel/-/kernel-0.2.0.tgz accept=*/*
=== cache     (npm cache add @tiphys/kernel@0.2.0 --prefer-online --fetch-retries=0)
GET /@tiphys%2fkernel accept=application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*
GET /@tiphys/kernel/-/kernel-0.2.0.tgz accept=*/*
GET /@tiphys%2fkernel accept=application/json
=== view      (npm view @tiphys/kernel@0.2.0 version --prefer-online)
GET /@tiphys%2fkernel accept=application/json
```

The source agrees: arborist `build-ideal-tree.js` line 1334, in
`#fetchManifest` (the path that resolves a spec named on the command line),
sets `fullMetadata: true`. The `fullMetadata: false` at line 799 is the
lockfile-inflate path, which this install does not take.

So what my CR-001 got right is the TARBALL: `npm view` never fetches it, and
install does. What it got wrong is the packument. `npm cache add` fetches the
abbreviated packument, the tarball and the full packument. That covers
install's two requests for this package and adds one more, so the fix CLOSES
the gap. The comment, though, explains it with a false reason.

Fix (comment and work history only): say that `npm cache add` fetches the
tarball, which `npm view` never does, plus both packument forms, and that
install on npm 11.18.0 reads the full packument and the tarball. Cite
`build-ideal-tree.js` line 1334 or the proxy log. No behaviour change.

### DV-002 (low): the process-group kill is not witnessed, and it can be

The work history says that killing only the direct child "would leave the
hang test green" and that no test observes the group kill. Both statements
are confirmed. Mutation N (`process.kill(child.pid` instead of
`process.kill(-child.pid`): all 12 tests green, and an orphaned
`sleep 100000` with PPID 1 was left behind. Before that run there were zero.

It is observable, though, so "no test observes it" is a gap and not a limit.
The stub's `hang` could write its sleeper's pid to a file. The hang test could
then assert, after the run, that `ps -o stat= -p <pid>` shows the process gone
or a zombie. That turns mutation N red. In production this is defence only:
npm on Linux runners is a node script started directly, with no wrapper
grandchild. So it is low.

### DV-003 (low): on a real stalled socket the NOT SERVED line says `last npm error: none`

With an accepting and never-answering registry, `bounded_run` always fires
first. The reason is that `--fetch-timeout` is set to the SAME number of
seconds as the wrapper's bound, and npm's own timer starts later (after node
startup). So the line reads `last poll: npm cache add timed out and was
killed; last npm error: none`. That is accurate, and it is still
distinguishable from ETARGET and ECONNREFUSED. But npm's own `ETIMEDOUT`
would say more. Optional fix: pass `--fetch-timeout` a few seconds under
`limit`, so npm reports first in the ordinary stall and `bounded_run` stays
the backstop.

## The five questions

### 1. CR-001 closed; is `cache add` install's fetch path; do production dependencies matter?

CLOSED. The served test is now `npm cache add` and then the exact `npm view`,
in that order (branch lines 467 to 482). The proxy log above shows that
`cache add` fetches the same tarball URL install fetches, plus both packument
forms. So it is a superset of install's requests for THIS package (DV-001 for
the wording).

Mutation L (`cache add` replaced by `true`) reddens three tests: waits,
never-served, and polls-the-install-path.

Real registry, fixed script, from an empty scratch directory:

- `@tiphys/kernel 0.2.0`: exit 0, `registry-served` attempts 1,
  `lastStdout 0.2.0`, all five steps exit 0.
- `9.9.9 --wait-seconds 10 --poll-seconds 3`: exit 75 after 8s, 3 polls, and
  `last poll: npm cache add exited 1; last npm error: npm error code ETARGET`.

Production dependencies: install ALSO fetched 10 packuments and 10 tarballs
for `ajv`, `yaml`, `commonmark` and their dependencies (same proxy log).
`cache add` fetches none of them. That does NOT matter for this incident
class. The class is propagation lag of the version JUST published. The
dependencies are third-party versions, pinned exactly in `package.json`
(`ajv 8.20.0`, `commonmark 0.31.2`, `yaml 2.9.0`) and long published, so they
have no lag window from this publish. If a dependency were unfetchable, that
would be a registry outage or an unpublish, and it would fail at `install` as
a step failure, which is the correct classification. The one case where it
WOULD matter is a release that publishes a dependency together with the
kernel (a monorepo release). This repository does not do that.

### 2. CR-002 to CR-004 closed

| my finding | mutation | before (90f09fc) | now (5de114c) |
|---|---|---|---|
| CR-002 exact version | A: served means exit 0 only | 0 red of 8 | red: `does not count npm view exiting 0 with a different or empty version as served` |
| CR-003 busy loop | G: `sleep` replaced by `:` | 0 red of 8 | red: `times out with NOT SERVED and exit 75 ...` |
| CR-004 npm error in line | K: `last npm error: none` hard-coded | (not a member) | red: `times out with NOT SERVED and exit 75 ...` |

On the real registry, the NOT SERVED line quotes `npm error code ETARGET` (not
served) and `npm error code ECONNREFUSED` (refused port). For a stall it says
`timed out and was killed` (DV-003). So a cause can now be read off the CI log.

### 3. `bounded_run`: group kill, macOS, and the worst case over `--wait-seconds`

Group kill, Linux, MEASURED. I extracted `bounded_run` verbatim from the
branch script with `awk` and ran it on a wrapper that starts a grandchild
`sleep`. After a 2s bound: exit 124, the `.timed-out` marker present, the
direct child gone, and the grandchild gone. The same wrapper with only the
direct child killed: the grandchild survives
(`S  9852 sleep 777771`), so the probe can tell the two apart. On the normal
path the child's exit code comes through unchanged (`exit 3`, stdout `hi`).

macOS, IN PRINCIPLE, not executed. Node's `detached: true` on non-Windows
makes libuv call `setsid()` in the child, so the child leads a new session
and process group whose id is its pid. `process.kill(-pid, sig)` is `kill(2)`
with a negative pid, which POSIX defines as "every process in that group".
Both hold on Darwin. The limits are the same on both platforms:

- a descendant that calls `setsid()` or `setpgid()` itself escapes (npm does
  not);
- if the script's own process is killed first (for example on job
  cancellation), the detached group is NOT in the step's process group and
  outlives it, until npm's own `--fetch-timeout` fires. On an ephemeral
  runner that is harmless.

Worst case over `--wait-seconds W`, COMPUTED. A new poll starts only after a
check of `now + POLL <= deadline`, where `now` is `date +%s` (truncated, so up
to 1s early). So the last poll starts at most about 1s after the deadline. That
poll's own deadline is `max(deadline, start + 10)`, so at most
`deadline + 11`. Inside it, `cache add` is killed at that poll deadline, plus
up to 1s of truncation, plus node startup. If `cache add` succeeds right at
the edge, `npm view` is given a floor of 1s (`[ "$limit" -ge 1 ] || limit=1`),
which adds at most 1s more plus node startup. Then the record is written, one
more node start. Total: about `W + 13s` at worst, and a FIXED constant.
Nothing in the loop can extend it further: the 10s floor applies once per
poll, and no poll starts after the deadline. For the default 900s, that is
about 913s, far inside the 360-minute job default.

MEASURED against a real socket that accepts and never answers
(`npm_config_registry=http://127.0.0.1:48733/`; 6 connections accepted, all
three runs ended by `bounded_run`, `lastPollTimedOut: true`):

| `--wait-seconds` / `--poll-seconds` | exit | wall time | over W |
|---|---|---|---|
| 0 / 1 | 75 | 10.4s | 10.4s (the floor) |
| 3 / 1 | 75 | 11.0s | 8.0s |
| 12 / 5 | 75 | 12.9s | 0.9s |

This also CLOSES the work history's open residue that "a truly stalled
socket was not produced on a real network". It was produced here, and the
bound held.

Mutations over the bound: M (`cache add` run without `bounded_run`) reddens
the never-served and bounds-each-registry-poll tests; O (floor set to 0)
reddens never-served. So the floor is witnessed. N (direct child only) is
DV-002.

### 4. The open item: registry-mode `npm install` has no wall-clock bound

Rating: LOW, and I would accept it as a stated open item rather than ask for
it in this round.

- It runs only after `cache add` has fetched this exact tarball through the
  same URL, seconds earlier. So the incident class (not served yet) cannot
  reach it except through a CDN edge that flaps between two requests. That
  would fail as a step failure, not hang.
- A hang needs a registry that accepts and never answers. npm's own
  per-request `fetch-timeout` (default 5 minutes) and `fetch-retries`
  (default 2) still apply to install, because the script does not override
  them there. So a stall ends by npm's own error within a small multiple of
  5 minutes, far inside the 360-minute job default. That is a bound,
  just not this script's.
- The pre-publish tarball install and the whole M3 release path have run the
  same way since M3-P10.

If it is ever closed, the cheap form is to run the registry install through
`bounded_run` with its own ceiling (for example 600s) and record a timeout as
the step's exit 124. That keeps "install failed" and "install hung" distinct.

### 5. Suite, PR bundle, behaviors.json union

behaviors.json, by script over the parsed file and its raw text: 1284 keys at
head, 1284 key lines in the text, 0 duplicates. origin/main and the merge base
both have 1275. The union of main and head is 1284, 0 main keys are missing
from head, and 0 values changed. The 9 added keys each resolve to exactly one
`test("<title>"` across `test/**/*.test.ts`: the five from round 0 and the
four new ones (`bounds-each-registry-poll`, `polls-the-install-path`,
`served-means-the-exact-version`, `rejects-bounds-above-a-day`).

Suite and bundle: see "Green" below.

## Mutation table (mutlab2, node v26.6.0, `--test-name-pattern release-verify`, 12 tests)

| id | mutation | exit | red tests | leftover sleeps |
|---|---|---|---|---|
| 0 | none (control) | 0 | none, 12 pass | 0 |
| A | served means exit 0 only | 1 | exact-version | 0 |
| G | no sleep between polls | 1 | never-served | 0 |
| K | NOT SERVED drops npm error | 1 | never-served | 0 |
| L | `cache add` skipped | 1 | waits, never-served, polls-install-path | 0 |
| M | `cache add` not under `bounded_run` | 1 | never-served, bounds-each-poll | 1 (mine, killed by pid) |
| N | kill direct child only | **0** | **none (DV-002)** | 1 more (mine, killed by pid) |
| O | poll floor 0 | 1 | never-served | 0 new |

The lab script was restored and compared byte-identical afterwards
(`restored, identical: true`). The three processes left by M and N (a stub
`bash .../tiphys-rv-hang-S3ASXH/stub/bin/npm cache add ...` and two
`sleep 100000`) were identified with `ps -o pid=,ppid=,args= -p` before
`kill <pid>`. There were none before the lab started.

## Green

All on node v26.6.0, npm 11.18.0, head 5de114c, in this worktree.

- `npm ci` exit 0. `npm run build` exit 0. `git status --porcelain` afterwards
  shows only this untracked report.
- `npm test` (invocation `node --test "test/**/*.test.ts"` via the package
  script, `dist/` built): exit 0; 1409 tests, 1409 pass, 0 fail, 0 cancelled,
  0 skipped, 0 todo.
- Local PR bundle,
  `./scripts/m2-exit-test.sh --no-build --bundle pr --base origin/main --head HEAD --phase claude/release-verify-waits-for-registry <scratch>`,
  exit 0:
  `gates: declared 15 applicable 8 verdict 8 green 8 red 0 not-applicable 7 error 0 vacuous 0`;
  suite `reported 1409 test(s) from 69 file(s) (pass 1409, fail 0, skipped 0, todo 0, did-not-run 0) ... 1284 behavior(s) resolve; merge base 8558dca9e8d2`;
  citations `linted 3 changed document(s) at 5de114c... 3 citation(s) resolved`;
  `required gate(s) not applicable: scope, red-witness, gate-classes` (not a
  phase branch, and no path under src/, bin/ or plugin/);
  `m2-assert (PR bundle): OK ... zero red`; `m2-green: OK`; `m2-exit-test: OK`.
  So this bundle is not evidence that scope, red-witness or gate-classes
  asserted anything about the change. The five new witness specs are
  evaluated by no gate on this branch; my mutation table is the hand
  substitute.
- `node scripts/check-authored-bytes.mjs` exit 0 (tracked files). This report
  has 0 bytes outside printable ASCII, tab and newline.
- The 12 release-verify tests alone in the lab, unmutated: 12 pass, 0 fail.

## Probes run that found nothing

- Bound validation: 86401, nineteen nines and a leading zero go through
  `checked_seconds` before any arithmetic (branch lines 121 to 139); the
  round's own rejects-bounds test is green at head.
- D1 to D4 in the work history re-read against the branch script: the two
  polls are the only network calls under `bounded_run`; the two
  `run_step install` lines are the only other network calls.
- `check-authored-bytes` and the citation convention: see "Green".
- Leftover processes after the real-socket and real-registry runs: none.

## Honest failures

- macOS: reasoned from libuv and POSIX, not executed. The macOS smoke
  workflow does not run test/license-gate.test.ts.
- A real propagation window was not observed; no publish is possible here.
- The implementer's `pkill -f` incident (recorded in their work history) is
  outside this verification. I did not re-run the M5-P2 bundle it may have
  disturbed.

Citation into a file byte-identical on main and this branch: the red-witness
rule this verification applies is CLAUDE.md:345.
