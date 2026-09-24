# Hazard review: harness-verdict-head-window

Started 2026-09-24. Branch origin/claude/harness-verdict-head-window head f20f2e9.

## Build and suite
npm ci exit 0
build exit 0
verdict-head exit 0
(verdict-head.test.ts, Node v26.6.0, dist built, git status clean: 41 tests, 41 pass, 0 fail, 0 skipped, exit 0)

## Scope of this review

Diff origin/main...f20f2e9: test/verdict-head.test.ts (+10 -2, one line of code changed:
`git(["rev-list", "--max-count=200", "HEAD"])` -> `git(["rev-list", "HEAD"])`) and the work
history delivery/work-history/harness-verdict-head-window.md (+474). Worktree at
/tmp/claude-0/-home-user/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/vh-review/wt.

Item 3 of the fix-round contract read first: the work history states that `.slice(`/`split`
truncation sites and variable-built git args were NOT swept. Both are swept below (CR-004).

## CR-001 (low) Uncapped walk with the target ABSENT is bounded and loud, not a hang

Evidence, git-only loop over the whole branch history, exactly the two spawns per commit
the test makes (`git show <sha>:schemas/verdict.schema.json`, `git cat-file -e`):

    $ git rev-list --count HEAD            -> 496   (61 merges)
    496 commits: 3495 ms

Shallow-clone arm (the "history without the old schema" case), `git clone --depth 50`:

    == depth 50: rev-list count 177, shallow=true
    exit 1 wall 20s   tests 41 pass 38 fail 3 skipped 0
    == depth 300: rev-list count 496, shallow=false
    exit 0 wall 20s   tests 41 pass 41 fail 0 skipped 0

So an absent target costs a few seconds of git spawns and then reddens three tests with
"git is available but no pre-head commit was found" (test/verdict-head.test.ts:531), the
same shape the cap produced. No hang: `git rev-list HEAD` stops at the shallow graft.
Every historical schema parses (`JSON.parse` over all 496 commits: `unparseable=0`), so the
walk reaching older commits cannot throw out of the loop.

Who runs this test shallow: nobody. `.github/workflows/gates.yml:58` and
`.github/workflows/release.yml:140` set `fetch-depth: 0` and run `npm test`;
`.github/workflows/macos-smoke.yml:22` runs five named test files and
`test/verdict-head.test.ts` is not among them (default checkout depth 1 there, so it would
fail if added; note for whoever adds it).

Fix: none required. Optional: append "(shallow clone or history predating M4-P10?)" to the
assertion message at line 531 so the red names its likely cause.

## CR-002 (low) The walk cannot now return a WRONG commit the cap used to hide

Reasoning plus measurement. The loop returns at the FIRST match, so for a target within
the first 200 ancestors the answer is byte-identical to the capped one; beyond it the old
answer was `undefined` (a red), so no correct result is replaced. Ordering sensitivity was
measured, since the default `rev-list` order is commit-date based and the branch has 61
merges:

    mode[]              pos 195 b4dd6ff919c7b0b851caceeb7fd4ebd65ff6c5b8
    mode[--topo-order]  pos 195 b4dd6ff...
    mode[--date-order]  pos 195 b4dd6ff...
    mode[--first-parent] pos 68 b4dd6ff...

Same commit under every ordering; b4dd6ff is the first parent of 0330964 "M4-P10: a review
document that cannot be read is named, not silently dropped (#158)", which is the M4-P10
merge, so the found commit is the pre-M4-P10 tree by construction. The staging assertions
at test/verdict-head.test.ts:318-326 (no `headGroupFor`, no `verdictPairApproves`) remain
the guard against a wrong tree in any case.

Observation, not a finding: `--first-parent` reaches the same commit in 68 spawns instead
of 195 (about 3x cheaper) on main, but on a side branch cut before a merge its answer can
differ from "newest ancestor whose tree lacks the field", so leaving it out is the right
call for a witness.

## CR-003 (low) Fix-round contract items 1 to 3 are present and item 3 is honest

Mechanism named (fixed window over a growing history), derivation published with full grep
output, uncovered regions listed. The line-based and wrap-insensitive claim greps both
report 4 hits, all four inside quoted derivation output (grep lines from
test/scope-gate.test.ts, test/behaviors.json, test/suite-gate.test.ts, src/gates/suite.ts),
none an authored claim. `node scripts/check-authored-bytes.mjs` exit 0. Citations gate on
this head: not-applicable (no changed path under the gate's precondition trees); the work
history nonetheless carries resolving `path:line` citations (e.g. test/verdict-head.test.ts:260).

## CR-004 (informational) The two gaps item 3 declares are swept here and are empty

    $ grep -rnE 'max-count|"-n[0-9]*"|"-[0-9]+"|--max-|\.slice\(0, ?[0-9]+\)|head -n ?[0-9]+|head -[0-9]+' test scripts src bin .claude .github ...

Every `.slice(0, N)` hit truncates a message, a sha to 7 chars, a fixture id list or an argv
prefix; none truncates git history output. Every `log -1` / `rev-list --count` runs on a
scratch repository the test built, where the tip IS the wanted commit (test/sync.test.ts:458,
test/init.test.ts:60, test/teardown.test.ts:268, test/doctor.test.ts:1757,
src/commands/doctor.ts:439). Variable-built git args (`["-C", dir, ...args]` helpers in 20
test files, scripts/check-id-collisions.mjs:93) all pass literal subcommands at the call
sites; none walks the kernel repository's own history with a bound. "HEAD~1" in
test/payload-credentials.test.ts appears in comments only. No sibling of the mechanism exists.

## Summary

No medium or above. The change removes exactly the wrong property (a constant bound) and
keeps the first-match semantics; the absent-target cost is about 3.5 s and reddens loudly;
no CI workflow runs this test on a shallow clone; no other site shares the mechanism.

VERDICT: APPROVE
