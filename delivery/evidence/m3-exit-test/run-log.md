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

Happened (E1.1): charter authored at `delivery/evidence/m3-exit-test/e1/charter.yaml`,
`tiphys validate --type charter` exit 0 with empty output; the copy with
`escalation-contract` removed exit 1 naming the missing required property.

Happened (E1.2): `tiphys init` exit 0 into a fresh directory;
`tiphys doctor --for full` exit 1 on the fleet as init leaves it (gh absent,
no remote), then exit 0 with zero FAIL lines after gh was installed from the
release tarball, a push target was configured, the charter was placed and the
project clone was realized; `tiphys lock acquire --duration 21600` exit 0.

Happened (E1.3): `tiphys mode show --mode full` exit 0, twelve pipeline stage
ids captured.

Happened (E1.4): seed plan validates exit 0 and reports dispatchable false;
`tiphys brief compose --role plan-writer` exit 0; the delivered plan validates
exit 0 and reports dispatchable true.

Happened (E1.5): the plan-review checklist resolved seven probes;
`tiphys brief compose --role adversarial-plan-reviewer` exit 0; a five-finding
set (one high, two medium, two low) validates under `--type finding` exit 0,
and under the plan's own wording `--type finding-set` exits 64 unknown type;
the findings were applied to the plan and the amended plan revalidates exit 0.

### 5. Gates over the branch

About to: commit and push, then run the citations and coverage gates through
the kernel's own runner as the registry selects them.

Happened: the coverage gate ran green (115 units, exit 0). The citations gate
reported NOT-APPLICABLE with its precondition reason and the runner exited 21,
because a YAML plan instance under `delivery/evidence/` matches none of the
gate's document globs. Recorded as an unmet criterion rather than repaired,
because repairing it here would be a human running a gate the registry did not
select, which E0.3 names as an exit-test failure.

### 6. Closing this dispatch

About to: run the local gate bundle over the branch, then hand back.

Happened: the local full-mode registry bundle over this branch reported nine
green, zero red, zero error, zero vacuous, and three required gates
not-applicable (citations, scope, red-witness), so the runner exited 20. The
comparable CI arm, the `pull_request` bundle, is green on documentation-only
branches; run 31871644955 is the measured instance.

### 7. Dispatch A ends here

Stages E0 (all), E1.1, E1.2, E1.3, E1.4 and E1.5 ran. E1.6 onward, stage E2,
stage E3, stage E4 and the three falsification controls were NOT run and were
not in this dispatch. One criterion is reported UNMET rather than passed: the
M2-P5 citation linter over the plan instance, which the registry does not
select.
