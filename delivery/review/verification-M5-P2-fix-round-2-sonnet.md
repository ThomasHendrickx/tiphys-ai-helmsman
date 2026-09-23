# Delta verification: M5-P2 fix round 2

Date: 2026-09-23
PR: #207
Branch: claude/m5-p2-intent-to-outcome
Head verified: 115e177
Prior head (round 1 delta verification): b86b2eb
Model family: Sonnet
Method: fetched the branch and checked out 115e177 detached in an isolated
worktree; identified the round's own commits (1d34f46, bf1a06e, 115e177,
against a merge base with main of 8558dca) separately from two intervening
merges of main, since a two-head diff otherwise mixes in M5-P4's landed work.
Read the work history's "Fix round 2" section as the implementer's own
account and independently re-derived each of its claims. Hazard-attacked the
five listing-failure states named in the dispatch (ENOTDIR via a plain file,
ELOOP via a self-referential symlink, a dangling symlink AT `charter`,
EACCES on the directory, EACCES on one entry beside a valid charter) through
the real CLI against real `tiphys init` fleets, forcing true EACCES with an
unprivileged child process (uid 65534) since this container runs commands as
root otherwise. Mutation-tested all six `dangerousStates` members across the
three new witness specs directly against the shipped files, confirming each
RED, restoring each to byte-identical bytes. Independently investigated the
work history's own flagged intermittent red-witness run by reproducing its
member's mutation three times directly in an isolated lab copy. Built a
floor-satisfying node v26.6.0 toolchain and ran the full suite with `dist/`
built.

## Scope of the delta

The two-head diff (`git diff b86b2eb 115e177 --stat`) shows 36 files because
`main` advanced (M5-P4 landed) and was merged into this branch twice during
the round (b2858ac, 076ace5); most of that diff is M5-P4's own work, not this
round's. The round's own commits, isolated with `git log --oneline
b86b2eb..115e177`, are 1d34f46 (the fix and its three new witnesses),
bf1a06e (work history) and 115e177 (work history addendum after the gate
run). Their own diffs touch only: delivery/plan/phase-declarations/m5-p2.json,
roles/README.md, src/charter.ts, src/commands/doctor.ts, test/behaviors.json,
test/brief-compose.test.ts, witness/p2-charter-bad-entry-refused.json,
witness/p2-charter-unlistable-refused.json, witness/p2-charter-yml-suffix.json,
delivery/work-history/m5-p2.md. All are declared entries or standing extras.

The declaration (delivery/plan/phase-declarations/m5-p2.json) narrows a
`"witness/"` wildcard entry to six exact filenames (the three round-1 ones
plus the three new ones). This reads as a removal on a two-head diff, but the
scope gate compares HEAD against the MERGE BASE
(`delivery/plan/phase-declarations/m5-p2.json` at 8558dca on `main`), and I
read that file directly: it is still the ROUND-0 declaration (`filesToTouch`
has none of src/charter.ts, src/commands/doctor.ts, roles/README.md,
AGENTS.md or any witness path), because M5-P2 has not merged to `main` yet
and round 1's additions live only on this branch. So relative to the merge
base, every one of these paths, including the narrowed witness set, is a pure
ADDITION, not a removal. This matches the work history's own account
(delivery/work-history/m5-p2.md:641-649) and I confirmed it independently by
reading the merge-base file rather than trusting the claim.

I could not run the `scope` gate itself: my checkout is detached at 115e177,
and another worktree already holds `claude/m5-p2-intent-to-outcome` checked
out, so I cannot take the branch name here either (git refuses a second
checkout of the same branch). This is the same limitation as round 1's
verification; see Honest failures.

## Item 1: hazard-attacking the fail-closed charter walker

Round 2's fix (src/charter.ts:79-92, src/charter.ts:170-172,
src/commands/doctor.ts:753-757): only `ENOENT` on `readdirSync(charter/)`
means "no charter directory" (`no-directory`, undeclared). Every other
listing error becomes a new `unlistable` reading, which `locateCharters`
turns into a hard error for `brief compose` and which doctor's retention
check turns into FAIL (previously both silently read as "no charter
declared" / WARN not-applicable). Built each of the five states the dispatch
named, by hand, against real `tiphys init` fleets:

| state | mechanism | brief compose | doctor --for full |
|---|---|---|---|
| `charter` is a plain file | ENOTDIR | refused, exit 1, "charter: .../charter could not be listed: Error: ENOTDIR..." | FAIL, same reason |
| `charter` -> `charter` (self-symlink) | ELOOP | refused, exit 1, "...could not be listed: Error: ELOOP...", under a 10s timeout, no hang | FAIL, same reason, no hang |
| `charter` -> nonexistent target (dangling symlink AT `charter` itself) | ENOENT | composes, exit 0, "no charter declared" | WARN under generic (exit 0), FAIL under `--for full` (exit 1) via the PRE-EXISTING not-applicable promotion, not the new `unlistable` path |
| `charter/` chmod 000 (real EACCES, forced via an unprivileged child, uid 65534) | EACCES on the directory | refused, exit 1, "...could not be listed: Error: EACCES..." | FAIL, same reason |
| a valid charter (`alpha.yaml`) beside one chmod-000 entry (`unreadable.yaml`), listable directory, unprivileged child | EACCES on one entry, not the directory | refused, exit 1, "charter: .../unreadable.yaml could not be read: Error: EACCES..." | FAIL (on a different, earlier-sorted issue in this particular fixture; see below) |

None of the five hang. None reach "no charter declared" except the dangling
symlink AT `charter`, and that one is the SAME mechanism the round's own
mechanism section states is deliberate: `readdirSync` on a dangling symlink
throws ENOENT, and the fix's rule is that ENOENT alone means absent. This
matches the work history's open question 4's framing exactly
(delivery/work-history/m5-p2.md:727-728, "a dangling symbolic link ... is
classed absent by the shared reader"), and I independently reproduced it at
the `charter` path itself (the work history's open question is about a
dangling link INSIDE `charter/`, a narrower case; mine is the directory link
itself, and the same ENOENT mechanism explains both).

On the fifth row, doctor's FAIL text names `alpha.yaml declares no retention
paths` rather than the unreadable entry's error, because doctor iterates
`readCharterDirectory`'s entries in sorted filename order and `alpha.yaml`
sorts before `unreadable.yaml`; `alpha.yaml`'s own missing `retention` field
(a pre-existing, unrelated FAIL condition) fires first. This is not a defect
in round 2's mechanism, since `brief compose`, which reads the SAME entries
list, correctly stopped on the unreadable entry (its refusal-checking loop in
`locateCharters` runs unconditionally over every entry, not gated by
ordering the way doctor's retention-path check is). I did not chase whether
doctor eventually reports the unreadable entry too once `alpha.yaml`'s own
issue is fixed, since it is outside round 2's own scope and both readers
refuse rather than silently accepting either way.

EACCES needed forcing: this container runs every command as root by default,
and root bypasses permission bits, so a plain `chmod 000` composed
successfully anyway (exit 0) exactly as it did in round 1's verification. I
forced a real EACCES this round by spawning the CLI as an unprivileged child
(`uid: 65534, gid: 65534` via `child_process.spawnSync`), which round 1 did
not attempt. Both the directory-level and entry-level EACCES cases are now
directly confirmed rather than left as an unforceable open question.

## Item 2: could the new doctor FAIL fire on a healthy fleet?

No. I built a fresh `tiphys init` fleet and read `readCharterDirectory`
directly against its `charter/`: `{"kind":"listed","directory":".../charter",
"candidates":0,"entries":[]}`. This is the `listed` arm, not `unlistable`, so
the new FAIL (src/commands/doctor.ts:753) never fires for an empty,
freshly-initialized `charter/`. Confirmed through the real CLI too: under the
default (generic) profile, `doctor` reports `CHECK retention WARN ... so
retention is not applicable`, exit 0.

Under `--for full`, the SAME fresh fleet DOES fail doctor (`CHECK retention
FAIL ... (required for profile full)`, exit 1), but this is the
retention-not-applicable-promoted-under-full behavior, which predates this
round: I read src/commands/doctor.ts at b86b2eb (before round 2) and the
identical promotion is already there, attributed in its own comment to
"M4-P30". Confirmed by attribution search: `git log --oneline -- src/commands/doctor.ts`
shows no commit in this round touching that promotion logic, and the M4-P30
comment at src/commands/doctor.ts:61 is unchanged by the round's diff. So a
fresh init fleet failing `doctor --for full` is a known, pre-existing,
profile-gated fact, not something round 2 introduced or worsened.

## Item 3: the three new witness spec files, mutation-tested directly

Applied each of the six `dangerousStates` mutations by hand (not through the
gate runner) to the actual shipped src/charter.ts, one at a time, restoring
byte-identical bytes (diffed against a saved copy) after each:

| spec | member | result |
|---|---|---|
| p2-charter-unlistable-refused | `code === "ENOENT"` -> `if (true)` | RED: assertion failure on the composed brief |
| p2-charter-unlistable-refused | `unlistable` arm -> `if (false)` | RED: assertion failure on the composed brief |
| p2-charter-yml-suffix | drop `.yml` from the suffix check | RED: assertion failure, `.yml` charter not found |
| p2-charter-yml-suffix | `found.push(entry.path)` -> `void entry` | RED: assertion failure, charter not found |
| p2-charter-bad-entry-refused | undecodable classed as `not-charter` | RED: assertion failure |
| p2-charter-bad-entry-refused | refused classed as `absent` | RED: assertion failure |

All six reproduced RED independently. `git status --porcelain -- src/`
confirmed clean after each restore. The declaration narrowing from
round 1's `"witness/"` wildcard to six exact files was audited in "Scope of
the delta" above; it is additive against the merge base.

Green baseline: `node --test --test-name-pattern "in a fleet|tiphys init
fleet" test/brief-compose.test.ts` (the same pattern the work history uses):
5 tests, 5 pass, 0 fail, matching the work history's own "five fleet tests"
count exactly (delivery/work-history/m5-p2.md:653).

## Item 4: the intermittent red-witness run

The work history reports (delivery/work-history/m5-p2.md:693-711) that the
FIRST of two PR-bundle runs at this head reddened on an EXISTING spec,
`witness/doctor-retention-not-applicable-and-undeclared-stay-distinct.json`,
with its member-1 HEAD run reporting the named test in `missingNamedTests`
(neither passed nor failed), while running that same test directly, three
times, gave pass 1 fail 0 each time, and a second bundle run at the same head
was fully green. The implementer records this as an OPEN intermittent rather
than dismissing it, and does not claim a cause.

I independently reproduced the member-1 mutation (the one that reddened
intermittently) in an isolated lab copy of the worktree, so as not to disturb
my own concurrently-running full-suite run, and ran the named test directly
three times: RED all three times, with the expected assertion failure
(`retention-undeclared`'s message where `retention-not-applicable`'s was
wanted). This matches the implementer's own direct-run result and my own
round-1 spot-check of a DIFFERENT member of the SAME spec file, which was
also reliably red when run directly. I did not reproduce the intermittent
IN-BUNDLE failure itself; doing so would need the gate runner's own
concurrency, which is outside what I built for this attack. I am not
establishing a cause, the same honest position the work history takes, but I
can say the test and this mutation are reliable in isolation, which narrows
the candidate causes toward the bundle's concurrent-execution environment
(this repository's own standing warnings 10 and 11 name exactly that family:
concurrent git operations against one clone, and real-clock lease waits,
and this spec's own `consumesExternalOutput` block documents that its test
spawns `git check-ignore` as a real subprocess) rather than toward the
mutation or the test itself.

## Suite (full, node v26.6.0, built, `npm test` invocation)

Built with `npm run build` on the fetched node v26.6.0 toolchain: exit 0,
`git status --porcelain` empty afterwards. Ran `npm test` (the same
invocation the `suite` gate runs), backgrounded without a `timeout` wrapper
or a `tail` pipe (the timeout-plus-pipe combination silently produced no
output during round 1's verification of this phase and was avoided again
here), and blocked on the real `node --test` process (pid 6729, confirmed
mine by `cwd`) exiting via `tail --pid=6729 -f /dev/null` rather than
trusting a quiet log:

```
$ node --version
v26.6.0
$ npm test
...
tests 1413
suites 0
pass 1413
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 771347.43218
```

1413 tests, 1413 pass, 0 fail, 0 cancelled, 0 skipped. This matches the work
history's own claimed count exactly
(delivery/work-history/m5-p2.md:688: "tests 1413, pass 1413, fail 0, skipped
0"). Toolchain: node v26.6.0. Build state: `dist/` built. Invocation:
`npm test`. Duration about 13 minutes wall clock. I did not append a
separate `npm test exit=$?` line to the log this run (I did in round 1's
verification); the node test reporter's own `fail 0` and `cancelled 0`
determine the process's exit code, and `npm test`'s script is exactly
`node --test "test/**/*.test.ts"` with nothing chained after it, so `fail 0`
is what "exit 0" is derived from here. I am stating this as a derived fact
rather than a directly captured exit code, which the "Honest failures"
section below also notes.

## Honest failures (what this delta verification could not cover)

- The `scope` gate itself could not be run from my checkout: it is detached,
  and another worktree already holds `claude/m5-p2-intent-to-outcome`
  checked out, so git refuses a second checkout of the same branch here. I
  audited the declaration grant by hand instead (Scope of the delta above).
- I did not reproduce the intermittent red-witness bundle failure itself,
  only confirmed the named test and its mutation are reliable outside the
  bundle. The cause remains unestablished, matching the work history's own
  position.
- I did not chase why doctor's FAIL message on the fifth EACCES-entry
  fixture names a different, earlier-sorted issue than the unreadable entry;
  I traced it to entry-sort order and an unrelated pre-existing check, and
  confirmed `brief compose` on the same fixture correctly refuses on the
  unreadable entry, so I did not pursue it further as it is outside this
  round's scope.
- I did not independently verify EVERY line of src/commands/doctor.ts's
  6-line diff beyond reading it directly and testing its consequence
  (Item 2); it is a small, additive change (one new `if` arm) and I read it
  in full.
- The full-suite run's exit code is a derived fact (0 fail, 0 cancelled
  implies `node --test` exit 0, which is `npm test`'s exit code since
  nothing chains after it), not a directly captured `$?`. I appended an
  explicit `npm test exit=$?` line in round 1's verification of this phase
  and did not repeat that step this round; the derivation is sound but is
  weaker than a captured exit code, and is stated as such above.

## Verdict: APPROVE

| severity | count |
|---|---|
| high | 0 |
| medium | 0 |
| low | 0 |

All five listing-failure states the dispatch named (ENOTDIR, ELOOP, a
dangling symlink at `charter`, EACCES on the directory, EACCES on one entry)
refuse cleanly through both `brief compose` and `doctor --for full`, with no
hang and no silent fallback to "no charter declared" except the one case
(ENOENT via the dangling symlink) that the round's own mechanism explicitly
and correctly treats as absence. A healthy, freshly-initialized fleet's empty
`charter/` reads as `listed` with zero candidates, never `unlistable`, so the
new FAIL cannot fire on it; the only way a fresh fleet fails `doctor` is the
pre-existing, unrelated `--for full` promotion of `retention-not-applicable`,
confirmed present before this round. All six mutations across the three new
witness specs independently reproduce RED, and the declaration's narrowing
of the `witness/` wildcard to six exact names is additive against the merge
base, confirmed by reading that file directly rather than trusting the
two-head diff. The work history's own flagged intermittent red-witness run
is an honestly-recorded open item, not a defect I could confirm or refute
beyond adding one more data point (three direct runs, all red as expected)
that narrows it away from the mutation or the test itself. The full suite
is green: 1413 tests, 1413 pass, 0 fail, 0 skipped, matching the work
history's own count exactly.
