# Clean-room review: claude/harness-verdict-head-window

Head: f20f2e924a2b3e1c313c7cb75b0639f847d54bc2
Reviewer: subagent clean-room review
Started: (see git log timestamp)

## Plan
1. Fetch main and branch into scratch clone
2. Check toolchain (node v26)
3. npm ci, npm run build
4. Read the diff, the test file change, work history
5. Verify claim grep
6. Reproduce red witness (old code vs new code) against M5-P1 history
7. Run full suite on branch

## Progress log

- Fetched origin main / harness-verdict-head-window / m5-p1-pulse-value-proof.
- Worktree at f20f2e9 (repo/), node v26.6.0, npm ci exit 0, npm run build exit 0,
  git status clean after build.
- Diff is minimal: test/verdict-head.test.ts, removes --max-count=200 from the
  rev-list call at line 260 (was 252). Only code change besides the work
  history doc. Matches the stated fix.
- Verified pre-fix grep claim on origin/main: exact match, test/verdict-head.test.ts:252.
- Verified claim grep on work history: exact match, 4 hits at lines 127, 138,
  147, 184, all quoted source text, wrap-insensitive same 4. Confirmed no
  overclaim slipped through.
- Reproduced red witness member one (M5-P1 branch 02cb01e) myself:
  old code (as committed on M5-P1, unfixed): 41 tests, 38 pass, 3 fail.
  same tree with fix patch applied: 41 tests, 41 pass, 0 fail.
  Matches work history exactly.
- Full suite (npm test) running in background on the reviewed branch, node v26.

- Reproduced red witness member two (merge second-parent scenario) myself:
  built a fresh merge on top of origin/main (10 empty commits merged --no-ff),
  target b4dd6ff landed at rev-list position 205 (work history claims 205,
  exact match). Old code: 41 tests, 38 pass, 3 fail. Fix applied: 41 tests,
  41 pass, 0 fail. Matches work history exactly.
- check-authored-bytes.mjs on the branch tree: exit 0, no output (ASCII/control
  char check clean).
- Citations: many real path:line citations outside backticks present in the
  work history (e.g. test/verdict-head.test.ts:260, .claude/orchestrator-next.mjs
  lines, scripts/*.sh lines), satisfying the citationRequired floor.
- Full suite (npm test) launched in background on the reviewed branch tree,
  waiting for completion via Monitor.

## Full suite result (verified independently)

npm test on the reviewed branch f20f2e9, node v26.6.0, dist/ built:
1512 tests, 1512 pass, 0 fail, 0 skipped, duration_ms 507251 (my run).
Work history claims 1512/1512/0/0, duration_ms 461068 (its run). Test counts
match exactly; duration differs (container load variance), which is expected
and immaterial.

## Scope check

git diff origin/main...origin/claude/harness-verdict-head-window --name-only:
  delivery/work-history/harness-verdict-head-window.md
  test/verdict-head.test.ts
Single commit f20f2e9. Matches the declared scope exactly (one harness fix
file plus its work history). Branch name claude/harness-verdict-head-window
does not match ^claude/m[0-9]+-p[0-9]+- pattern, correctly avoiding the
branch-name trap in CLAUDE.md (this is a harness fix, not a phase).

## Findings

None. Every independently-checked claim in the work history matched:
- the pre-fix defect site and line number
- the position measurements (194 on main, 210 on M5-P1, 205 on the
  constructed merge scenario)
- red-witness member one (M5-P1 branch): old 38/3, fixed 41/0
- red-witness member two (merge via second parent): old 38/3, fixed 41/0
- claim grep line numbers and hit count (4, all quoted source text, not
  overclaims)
- full suite count (1512/1512/0/0)
- check-authored-bytes.mjs clean (ASCII/control-char floor)
- citations present (real path:line tokens outside backticks)
- scope: exactly the two files claimed, single commit

The fix itself: minimal one-line change (drop --max-count=200), mechanism
correctly named (fixed-size window over an unbounded-growing history),
alternative approach considered and correctly rejected with reasoning, no
behavioral change to the loop's early-return semantics. Fix-round contract
satisfied: mechanism named, derivation published with full output, what the
derivation did not cover is stated (data-encoded windows, non-literal git
invocations, unswept trees, other growing quantities, pinned shas).

Red-witness rule satisfied with TWO structurally different members (linear
history vs merge second-parent), both independently reproduced red-then-green
by this reviewer, satisfying the "one witness is not a class" rule.

VERDICT: APPROVE
