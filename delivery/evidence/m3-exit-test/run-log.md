# M3 exit test: run log (dispatch A, stages E0 and E1.1 to E1.5)

Append-only. Written incrementally per the dispatch contract in CLAUDE.md:423,
so that a death leaves a partial result rather than nothing. Each entry says
what is about to be done, then what happened.

- runner: exit-test runner, dispatch A
- date: 2026-08-15
- branch: `claude/m3-exit-test`, cut from origin/main at d5d87f7
- worktree: `/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/exit-run/wt`
- toolchain: node v26.6.0 from the scratchpad prefix, quoted at every command

Scope of this dispatch: stage E0 in full, then E1.1 to E1.5. E1.6 onward,
stage E2, stage E3, stage E4 and the three falsification controls are NOT run
here. The controls are DEFINED here, before any E1 evidence exists, which is
the ordering constraint at delivery/plan/kernel-plan-m3.md:5177.

## Entries

### 1. Setup

About to: verify the floor toolchain, cut the branch, create the worktree.

Happened:

- `node --version` printed v26.6.0 from the scratchpad prefix.
- `npm --version` printed 11.18.0.
- branch name checked against the scope auditor's phase pattern:
  `node -e '...' claude/m3-exit-test` printed `branch-pattern-matches: false`,
  so the branch cannot be misread as a phase branch (CLAUDE.md:599).
- worktree created at the absolute path above; HEAD is
  d5d87f7baf4ad31ab77ab074a5f0b588da189217, matching origin/main.

### 2. Supervision rules (E0.2, E0.3, E0.5)

About to: write `delivery/evidence/m3-exit-test/supervision-rules.md` and
commit it BEFORE any E1 evidence record exists.

Happened: `delivery/evidence/m3-exit-test/supervision-rules.md` and
`delivery/evidence/m3-exit-test/e0-4-subject-designation.md` were committed at
bb85fea and pushed. That commit is the ordering anchor: no E1 evidence record
exists in this branch's history before it.

### 3. E0.1

About to: probe REST reachability, then assemble the merged-phase table and run
the clause-map check.

Happened: probe green with a red witness on two different failure shapes;
twelve merged phase pull requests found by head-ref pattern plus `merged_at`;
twelve matching `push`-event `gates` runs on `main`, all completed and success,
all one job `gates` concluding success; `node scripts/check-clause-map.mjs`
exit 0 reporting 74 rows, with Appendix A and `clause-map.json` counted as two
separate sources and set-equal in both directions. Record at
`delivery/evidence/m3-exit-test/e0-1-preconditions.md`. One deviation recorded:
M3-P3 landed as a two-parent merge commit rather than a squash.

### 4. E1.1 charter

About to: build, run the suite, then author a charter and validate it, with the
negative half.
