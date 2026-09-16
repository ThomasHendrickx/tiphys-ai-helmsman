# Delta verification of the M4-P19 fix round

Reviewed delta: git diff abde402..641f055f40420a72778f00a2c71e14a1aedaea06
Prior reviews: delivery/review/clean-room-M4-P19-fable-evidence.md,
delivery/review/clean-room-M4-P19-opus5-correctness.md (both at abde402).
Started 2026-09-16. Working copy: a fresh --no-local clone, not the
orchestrator's tree.

## Plan (written before any row is checked)

1. First check: read the derivation command(s) in the round's own work
   history, run them, then widen in an excluded direction and report what
   the widened search returns.
2. For each of the five original findings (F-1 HIGH network hang, F-2
   MEDIUM section-6 false statement, F-3 HIGH red-witness gate red, F-4
   MEDIUM scope gate red, F-5 MEDIUM scout data loss): name the mechanism,
   reproduce the original failure at abde402, show it is gone (or not) at
   641f055.
3. Attack the round: red witnesses added, guards that cannot go red,
   pinned counts, the claim grep (both forms), the suite sentence (four
   axes), C-1/C-2/C-3.
4. DR-0027 reachability call on every HIGH/MEDIUM.

This section is being appended to as work proceeds; nothing below this
line existed in the first five minutes.

## A note on this document's own citations

`delivery/review/` is excluded from the citations gate's `documents` set
by design (`src/gates/citations.ts:232-241` reproduces the config;
DR-0015's rationale is quoted in that same file's header comment), so
this document is not linted for citation resolution at all. Every
`path:line` reference into a file this branch changes is still quoted in
backticks throughout, deliberately, in case that exclusion is ever
narrowed; references into files this branch does not touch are left
unquoted where they resolve.

## Setup

Fresh `--no-local` clone under the scratchpad, node v26.6.0 fetched to
scratch (the container default is v22.22.2, below the floor). The clone
sits under `/tmp/claude-0`, so the traversal trap in standing warning 1's
addendum is open for both the repo and the interpreter, matching the
condition under which prior reviewers measured.

## First check: derivation honesty

The round's own derivation (work history section 19.4, re-running section
12.1's grep) is:

```
grep -rnE '"(ls-remote|fetch|push|clone|pull)"|\["remote"\]' src/ bin/
```

Re-run by me, byte for byte, same output: seven hits, all in src/pool.ts,
src/teardown.ts and src/witness/run.ts (the witness harness, out of
scope).

**Widened, in the direction both reviews and the round itself excluded:
test/, scripts/, witness/ specs (not just src/witness/run.ts).**

```
grep -rnE '"(ls-remote|fetch|push|clone|pull)"|\["remote"\]' test/ scripts/ witness/
```

Result: many hits, all inside `test/*.test.ts` fixture helpers that build
scratch git repositories for OTHER phases' tests (spawn.test.ts,
watcher.test.ts, liveness.test.ts, credentials-gate.test.ts,
license-gate.test.ts, exit-test-local.test.ts, work-history.test.ts) or
inside this phase's own test files quoting the verbs as string literals
for the classification tests. None is a production call site this
phase's fix touches or should touch. No new finding here.

**Widened a second way: non-git network primitives (fetch(), http/https,
net.connect, exec family) across all of src/ and bin/**, not just the git
verb vocabulary the round's own classification uses:

```
grep -rnE 'node:https|node:http\b|fetch\(|undici|net\.connect|execFile|exec\(|spawn\(' src/ bin/ --include=*.ts
```

One real hit outside noise: `src/gates/adapters/http-json.ts:197`, a
`fetch()` call in a gate adapter. It is unrelated to pool/teardown/doctor
and is not reachable from any of the five files the round's
`pool-reconstruction-network-licence` test reads
(src/pool.ts, src/teardown.ts, src/commands/pool.ts,
src/commands/teardown.ts, src/commands/doctor.ts). No new finding.

**Conclusion of the first check: the round's own derivation, widened in
two directions it did not take, returns nothing it missed.** The
derivation is honest and its stated gaps (section 19.5, items 0-8) are
real but none of them is a live defect found by widening.

## The five original findings

| id | sev | mechanism | reproduced dangerous (abde402) | reproduced fixed (641f055) |
|---|---|---|---|---|
| F-1 | HIGH | a reporting path (`pool list`, `doctor`) reuses a resolver written for an interactive write, and inherits its unbounded network reach | YES, by me, independently | YES, by me, independently |
| F-2 | MEDIUM | a work-history prose claim about the whole-`worktrees/`-gone shape was never measured | N/A (paperwork) | corrected in work history section 15.1, matches my own read of `src/teardown.ts` |
| F-3 | HIGH | shipped guard code changed with no machine-executable witness spec covering it | YES (gate red, reproduced by the reviewers) | YES, my own red-witness gate run is green (9 own + 9 stored, all red-then-green); see below |
| F-4 | MEDIUM | branch cut from a non-`main` base carrying 27 unrelated paths, so `scope` cannot pass until that base and the phase declaration both land on `main` | YES, reproduced by me | STILL RED, reproduced by me; not fixable from this branch (see reachability) |
| F-5 | MEDIUM | a pre-existing scout-teardown code path (discard, no cleanliness probe) got a new caller (the reconstructed path) that inherited its licence without re-deriving it | YES, by me, independently | YES, by me, independently |

### F-1, reproduced directly

Fixture: fresh fleet, upstream repo, clone built by `git init` +
`git remote add` + `git fetch` (leaves `refs/remotes/origin/HEAD` unset,
which the round's own comment at `src/pool.ts:379-397` calls out as the
NORMAL shape rather than an edge case), a spawned ship task, its pool
record deleted, `origin` repointed at a TCP listener that accepts and
never speaks (`nc`/`socat`).

At abde402: `pool list` under `timeout 30`, exit 124 (killed). `doctor`
under a fresh listener (`socat ... fork`, so the connection killed by the
first probe does not silently kill the listener before the second
probe), exit 124 also. Both confirmed hanging past 30s where the base
(de9b386, per both reviews) returns in about a second.

At 641f055: `pool list` returns in 0.275s, `t1 ... unreconstructable
(unresolved: branch)`, no network reached. `doctor` returns in 0.336s,
`CHECK worktrees WARN ... (unreconstructable: branch)`. The destroying
path (`teardown --from-reconstructed`), which IS allowed to reach the
network, was probed separately with `TIPHYS_GIT_NETWORK_TIMEOUT_MS=1500`
against the same stalled listener: exit 1 in 1.767s, naming the field it
could not resolve and the exact wait ("did not answer within 1500ms and
was killed"). Matches the work history's own captures in section 14.1
exactly, independently reproduced rather than re-quoted.

**Mechanism-level, not instance-level.** The fix is a required
`{ network: boolean }` parameter on `reconstructPoolRecord` with no
default (so a fifth caller added later does not compile without
choosing), the same required boolean threaded through
`resolveDefaultBranch`, and a bound (`NETWORK_TIMEOUT_MS`, 20s,
overridable through `TIPHYS_GIT_NETWORK_TIMEOUT_MS`) on the one call that
transfers a ref advertisement rather than objects. `git fetch` and
`git push` in the same two files are deliberately left unbounded, with
the reasoning written down (object transfer has no legitimate upper
bound; a wall-clock cap on one aborts real work) rather than merely
asserted. I independently defanged the bound: removing the `timeout` arg
from the `ls-remote` call and re-running
`every socket-opening git call is classified, and the ref probe carries
its bound` reddened it, naming the exact call site
(`src/pool.ts:318 git ls-remote`), and the file restored byte-identical
afterward.

### F-2, corrected paperwork, not code

The original claim ("headSha missing") was never a code defect; it was a
wrong sentence in the work history about what the whole-`worktrees/`-gone
shape does. The round's section 15.1 replaces it with a measured
correction: `loadFleet` refuses first ("not a fleet home"), and nothing
in this phase's code runs in that shape at all. I read `src/fleet.ts`'s
`loadFleet` and confirm it refuses before any pool or doctor code is
reached when `worktrees/` is absent, consistent with that correction.
Non-blocking by construction: it never touched a shipped behavior, only a
sentence describing one.

### F-3, red-witness gate

Twelve witness specs now exist across both passes (six from the first
pass, three from the second, plus the three declaredExtras captures),
covering all four files the correctness reviewer named as changed with no
witness: `src/pool.ts`, `src/teardown.ts`, `src/commands/pool.ts`,
`src/commands/teardown.ts`. My own gate run is recorded below once it
completes; in the meantime I independently re-derived and re-ran two of
the members by hand (the `ls-remote` bound removal above, and see F-5
below), both reddening as claimed with the file restored byte-identical.

### F-4, scope gate: reproduced RED, and it is not this round's to fix

Reproduced on a clone with the branch checked out under its real name
(`claude/m4-p19-pool-record-reconstruction`), `--base origin/main --head
HEAD --phase m4-p19`:

```
gates: scope: red: branch claude/m4-p19-pool-record-reconstruction
  (phase m4-p19) matches the phase pattern but no phase declaration
  exists at delivery/plan/phase-declarations/m4-p19.json in the merge
  base 3b401182301361700ffa0fd4b2ae099993b3d733 ...
```

And `git diff --name-only origin/main...claude/m4-p19-pool-record-reconstruction`
confirms the round's own diagnosis in work-history section 19.8: the
branch carries 27+ paths that are not this phase's, including
`CLAUDE.md`, `delivery/STATE.md` and a dozen `DR-00xx` decision records,
because it was cut from `plan/pstack-borrow-review` rather than from
`main`. Landing the phase declaration on `main` is necessary but not
sufficient; the base branch's own content has to land too, and that is a
merge-order fact no implementer branch can resolve by itself.

**DR-0027 reachability call: TRACKED, not blocking.** The scope gate's
red is entirely about `delivery/`, `CLAUDE.md` and paperwork paths
carried in from the wrong cut point. It reaches no file under `src/`,
`bin/`, `schemas/`, `roles/` or `tuition/`, and no user-visible command
behaves differently because of it. It is squarely the
"changes confined to delivery/, CLAUDE.md or .claude/ do not block"
carve-out, and the round's own accounting (section 19.9) already flags it
for the orchestrator as a merge-order item rather than claiming it fixed.

### F-5, reproduced directly

Fixture: scout task, its report written (so the pre-existing
"scout has no report" refusal does not shadow the check under test), its
worktree dirtied (`readme.md` modified, `important.md` untracked), its
pool record deleted.

At abde402: `teardown --task s1 --from-reconstructed` exits 0,
`torn down s1`, worktree gone, `important.md` destroyed with it.

At 641f055: same fixture, same command, exits 1, naming the reason
("scout worktree ... has uncommitted changes or untracked files and its
pool record did not survive ... refuses to discard them: copy anything
worth keeping out of ..., then re-run once ... is empty"). Worktree and
`important.md` both survive.

**Mechanism-level.** The fix adds a dirty-worktree probe specifically on
the `context.reconstructed` arm of the scout branch in `teardownTask`
(src/teardown.ts), ahead of the pre-existing discard-without-probing
behavior, and is explicit that `--salvage` is deliberately NOT the
escape (a scout never pushes, so salvage has nothing to do). The
with-record scout policy is left unchanged by design, and the round adds
a control test asserting that it still discards, so the asymmetry is
measured rather than smoothed over. I independently defanged the guard
(reverting the dirty probe by editing the code back to the abde402
shape, which is exactly the reproduction above) and it behaves exactly as
predicted, both directions.

## Attacking the round

### A. Red witnesses added or changed

Nine new witness specs, all part of this delta (`git diff --stat
abde402..641f055` shows all nine as pure additions): six from the first
pass (`pool-list-reconstruction-is-network-free`,
`pool-list-marks-reconstructed`, `teardown-from-reconstructed-flag`,
`teardown-from-reconstructed-refuses-dirty-scout`,
`teardown-from-reconstructed-bounds-the-remote-probe`,
`teardown-network-timeout-override-is-validated`), three from the second
pass (`pool-network-call-classification`,
`pool-reconstruction-network-licence`,
`teardown-reconstructed-scout-salvage`). I read every one and every one
has two structurally different dangerous-state members, not two
instances of the same one (e.g. `pool-network-call-classification`'s two
members attack the BOUND and the BOUND'S OVERRIDE READ separately;
`teardown-reconstructed-scout-salvage`'s two members skip the refusal at
different points, one leaving the porcelain probe running and one
skipping it entirely).

I independently DEFANGED two of them, by hand, outside the gate, to check
the round's own captures rather than trust them:

1. Removed the `timeout` argument from the `ls-remote` call in
   `src/pool.ts` (the exact `pool-network-call-classification` member 1
   mutation) and ran
   `every socket-opening git call is classified, and the ref probe
   carries its bound`: RED, naming `src/pool.ts:318 git ls-remote`
   exactly as the spec's provenance describes. File restored
   byte-identical (`diff -q` after restore, confirmed).
2. Flipped `reconstructPoolRecord(fleet, taskId, { network: false })` to
   `{ network: true }` inside `poolList` (the exact
   `pool-reconstruction-network-licence` member 1 mutation) and ran
   `only the destroying caller holds the network licence for
   reconstruction`: RED, naming `src/pool.ts:775` as an unlicensed
   caller. File restored byte-identical.

Both reproduce the captured mutant output in the work history exactly,
not merely a similar-looking failure.

**The gate run itself also completed and is green, independently of the
work history's own quoted run.** Started on this clone, branch checked
out as `claude/m4-p19-pool-record-reconstruction`, `--base origin/main
--head HEAD --phase m4-p19`. The container was under sustained load
throughout this session (`/proc/loadavg` climbed from about 5 to over 11
while this gate ran, with other sessions' gate runs visibly competing for
CPU on `ps aux`), so the run took about 4.5 minutes wall-clock against the
work history's own recorded 58s for the same gate; the elapsed time the
gate itself reports is a fairer number, since it excludes queueing for
CPU:

```
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
gates: red-witness: green: 18 witness(es) evaluated (9 own, 9 stored
  re-evaluated in 71857ms); every witness red against every declared
  dangerous state and green at head
gates: every applicable gate is green
```

9 own matches the nine spec files counted from the diffstat above. 9
stored is smaller than the 165 pre-existing specs the correctness
reviewer counted at abde402; the most likely reading is that "stored" here
means pre-existing specs whose dangerous-state mutations target the two
files this round changed (`src/pool.ts`, `src/teardown.ts`), which is the
set that needs re-evaluation when those files move, not the whole
registry. I did not read the gate's own selection logic to confirm this
reading and flag it as inferred rather than established. **This closes F-3 with
independent confirmation at three levels: the gate itself (green, the
metric the finding was raised against), and two hand-defangs reproducing
two of its nine members outside the gate.**

**One arm is honestly under-witnessed, and the round says so itself
rather than concealing it.** Section 19.5 item 0 states that the
`pool-network-call-classification` test's second assertion (an
object-transfer call, i.e. `fetch`/`push`, gaining a wall-clock bound) is
demonstrated red only BY HAND, in section 19.6's "three more mutants...
not in any spec", because the red-witness gate's rule (d) forbids a
witness member from mutating a line the phase's own diff did not touch,
and every object-transfer call site is such a line. This is not a guard
that silently cannot go red: it is disclosed, and it is disclosed as
guarded by a test in the suite but not by a re-evaluable gate witness.
DR-0027 call: not blocking. It guards a property (do not put a wall-clock
cap on `fetch`/`push`) that this round did NOT change and that no
consumer of this round's code can reach differently than before; a
future phase that touches one of those call sites inherits the
obligation to close it, which the round states for the orchestrator
(section 19.9) rather than leaving to be discovered.

### B. Guards that cannot go red

Checked every new assertion in `test/pool.test.ts` and
`test/teardown.test.ts` for the T-008-postscript shape (a floor
assertion, not only an equality, so a rename or an empty scan does not
read as success). `every socket-opening git call is classified...` and
`only the destroying caller holds the network licence...` both assert
`bounded.length >= 1 && transfer.length >= 2` / `callers.length >= 2`
BEFORE asserting anything about the found set's shape, so an empty scan
(the rename-the-verb, rename-the-function failure mode) fails loud with
its own message rather than vacuously passing `deepEqual([], [])`. I
independently confirmed this reads correctly by inspection of
`test/pool.test.ts:1573-1578` and `test/pool.test.ts:1642-1645` (quoted,
not cited: these line numbers belong to a tree the citations gate does
not lint, since `delivery/review/` is outside its `documents` set per
`src/gates/citations.ts:232-241`, read directly, and I do not assert they
resolve identically on `main`). No guard found that passes for a reason
unrelated to its claimed property.

### C. Pinned counts over append-only registries

`test/behaviors.json` gained twelve entries, all by key
(`"id": "description"`), none of the round's new tests assert a total
count over the file. The two `this ... behaviors are registered in
test/behaviors.json` tests both iterate a fixed LIST of ids and assert
`Object.hasOwn`, never a length. Confirmed by reading both additions in
`test/pool.test.ts` and `test/teardown.test.ts` in full (quoted above).
`witness/` gained nine spec files; nothing in the suite or the round's own
claims asserts a total count of witness specs (the gate's own
`18 witness(es) evaluated (9 own, 9 stored...)` line is a report, not an
assertion baked into a test). No violation of binding convention 5 found.

### D. The claim grep, both forms, run by me independently

```
$ grep -cEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/m4-p19.md
43
$ grep -oEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/m4-p19.md | wc -l
82
$ tr '\n' ' ' < delivery/work-history/m4-p19.md | grep -oEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' | wc -l
82
```

Occurrence counts agree at 82/82 (line count is naturally lower at 43
because some lines carry more than one hit), matching the round's own
claim in section 18.2 exactly. I read a sample of hits outside the
round's own audit table (lines 19, 130, 262, 431, 662-665, 675, 962) and
every one is either a verbatim quotation from source, a captured mutant's
own stderr, a citation to a pre-pass document adjacent on the same line,
or the fixture's own description of a TCP listener's behavior (a true,
checkable statement about `nc`/`socat`, not a claim about this kernel's
code). No unsettled claim found.

### E. The suite sentence, established independently

> Interpreter: node v26.6.0 (fetched to scratch; the container default is
> v22.22.2, below the declared floor of `>=26`).
> Build state: `npm run build` exit 0, `git status --short` clean
> afterward.
> Invocation: `npm test` (`node --test "test/**/*.test.ts"`).
> Result: **878 tests, 878 pass, 0 fail, 0 cancelled, 0 skipped, exit 0.**
> `/proc/loadavg` before: `4.68 5.93 9.55`; after:
> `8.32 7.84 9.47` (moderately loaded box throughout, consistent with the
> gate-run slowness noted under A).

This is my own run, not a re-quote of the work history's number, though it
lands on the identical count the work history and both original clean-room
reviewers independently reported for abde402's 863 (878 minus 863 is 15,
matching the round's own accounting: 9 first-pass tests + 6 second-pass
tests). The base at abde402, also run independently by me for the F-1/F-5
fixture reproductions above (not a full-suite run), needed no re-attribution:
every failure I saw during this session was accounted for by the fixture
itself, not by the branch.

### F. C-1, C-2, C-3

`git diff abde402..641f055 -- src/pool.ts src/teardown.ts` has zero hits
for `process.pid`, `/proc/`, `process.kill`, or any signal name (grepped
directly, exit 1/no output). Nothing in the round reads current state
from the tail of an append-only log: `reconstructPoolRecord` reads
`meta.json` and git state fresh each call, never a log. Nothing
auto-backgrounds a long-running process; the round's own network bound
exists specifically so that a command TERMINATES rather than needing to
be backgrounded. No C-1/C-2/C-3 violation found.

## Widened derivation, one more direction

`src/commands/pool.ts`, `src/commands/teardown.ts` and
`src/commands/doctor.ts` are unchanged by this round
(`git diff abde402..641f055 -- src/commands/pool.ts
src/commands/teardown.ts src/commands/doctor.ts` is empty, confirmed by
me), so the fix is confined to the two resolver modules, which is where
both original findings' mechanisms live. No command-layer regression
surface was opened by this round.

## Summary against the five original findings

| id | sev | closed at the mechanism? | DR-0027 reachability | blocking |
|---|---|---|---|---|
| F-1 | HIGH | YES, independently reproduced both dangerous (abde402) and fixed (641f055) | src/pool.ts, the `tiphys pool list` / `tiphys doctor` user paths | no longer applicable (fixed) |
| F-2 | MEDIUM | YES, a work-history prose correction, never a code defect | delivery/ only | not blocking, and never was code |
| F-3 | HIGH | YES, gate green (my own run) plus two independent hand-defangs | src/pool.ts, src/teardown.ts, src/commands/{pool,teardown}.ts | no longer applicable (fixed) |
| F-4 | MEDIUM | NO, still red, and not fixable from this branch | delivery/, CLAUDE.md only; no src/ path | tracked, not blocking |
| F-5 | MEDIUM | YES, independently reproduced both dangerous (abde402) and fixed (641f055) | src/teardown.ts, the `tiphys teardown --from-reconstructed` user path on a scout task | no longer applicable (fixed) |

## New findings from the round itself

None found that reach a shipped artifact. One honest gap disclosed by the
round and confirmed by me rather than found independently: the
`pool-network-call-classification` witness's second assertion (an
object-transfer call gaining a wall-clock bound) has no gate-carried
witness member, only a by-hand demonstration and a suite-level test,
because red-witness rule (d) forbids a member from mutating a line this
phase's diff did not touch. This is TRACKED (see section A above),
because it guards a property this round did not change and does not make
worse; it is the same shape as the gate's own rule working as designed,
not a gap the round introduced by neglect.

## Verdict

**APPROVE.**

Both HIGH findings (F-1, F-3) and both blocking-reachable MEDIUM findings
are closed at the mechanism, not the instance: the fix is a required,
no-default `{ network: boolean }` parameter threaded through the one
resolver that was reused across callers with incompatible licences, plus
a bound specifically on the one call class (ref advertisement) where a
bound is safe, with the reasoning for NOT bounding fetch/push written
down rather than merely avoided by luck. I reproduced both original
dangerous states independently, against a fresh fixture I built myself
rather than by re-running the work history's own script, and confirmed
both are gone at 641f055. I hand-defanged two of the round's nine new
witnesses against their exact claimed mutations and both reddened as
claimed; the red-witness gate itself, run independently by me on this
clone, reports green with all 18 witnesses (9 own, 9 stored
re-evaluated) red against every declared dangerous state.

F-4 (scope gate red) and F-2 (a work-history prose correction) remain
exactly as the round itself characterizes them: real, reproduced by me,
and not blocking under DR-0027 because neither reaches src/, bin/,
schemas/, roles/ or tuition/. F-4 in particular is a merge-order fact
(the branch was cut from plan/pstack-borrow-review rather than main, so
it carries 27+ unrelated paths including CLAUDE.md) that no implementer
branch can fix; it needs the phase declaration AND the base branch's own
content landed on main first, which is an orchestrator action, not a
code round.

Widening the round's own derivation in two directions it excluded
(test/scripts/witness for the git-verb vocabulary; non-git network
primitives across all of src/ and bin/) found nothing the round missed.
The claim grep (both forms, run independently) agrees with the round's
own count at 82/82 occurrences with no wrap-hidden hit. The suite,
reproduced independently rather than re-quoted, matches the round's own
number exactly (878 pass, 0 fail, 0 skipped) under the complete four-axis
sentence (node v26.6.0, dist/ built, npm test, from a real git
repository, not an archive extraction).

No blocking finding survives. This round closed both mechanisms it was
opened to fix and did not introduce a new one reaching a shipped
artifact.
