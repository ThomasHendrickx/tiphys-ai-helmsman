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

## Dispatch B

### 8. Lease check, first, rather than trusting the brief's arithmetic

Happened: at 2026-08-15T09:06:44Z, `tiphys lock status` in the fleet home
reported held, holder `93ef52e9-9707-48cc-bf3c-0ae1a5f579d3`, acquired
2026-08-15T08:44:27.515Z, expires 2026-08-15T14:44:27.515Z, exit 0. Live, with
five hours and thirty-seven minutes remaining. No re-acquisition needed and
none performed.

### 9. The orchestrator's ruling on E1.4, recorded as an intervention

Happened: `delivery/evidence/m3-exit-test/interventions.md` written. It carries
I-1 (the ruling), F-1 (the residue, unfixed, with the consumer-reachability
argument), I-2 (the decision not to re-run E1.5, with the bound it leaves) and
F-2 (`--type finding-set` does not exist). The line-274 premise was checked
against the plan in the tree and it says what the ruling quotes. The E1.4
measurement was not altered.

### 10. E1.6

About to: read E1.6 in full, then cut the subject branch from origin/main and
run the implementer through `tiphys spawn` into a pool worktree.

### 11. E1.6 ran, and it is NOT satisfied

Happened: the implementer brief composed (exit 0) and names
`tuition/mechanism-index.yaml`; `tiphys spawn` created the pool worktree at the
fetched base d5d87f7 (exit 0); the check, its eleven-criteria test set, four
durable witness specs with two members each, and a real three-case CLI capture
were built; `npm test` on node v26.6.0 with `dist/` built reported 836 tests,
836 pass, 0 fail, 0 skipped, exit 0.

The full-mode bundle at the subject head reports 9 green, 1 red, 6
not-applicable, 0 error, 0 vacuous, recomputed equal to `summary.json`. The red
is `red-witness`, which is the one gate this stage says must be green here, and
the cause is that two M3-P8 witness specs quote the source line the designated
subject must edit. Both arms measured. Recorded at
`delivery/evidence/m3-exit-test/e1-6.md`.

Also happened: the orchestrator's branch ruling (I-3), the second spawn under a
task id that is not phase-shaped, the deletion of the m3-p13 declaration and the
renaming of the work history off the phase-shaped filename. Deleting the old
remote branch is refused by the proxy with HTTP 403 on all three routes tried,
and is recorded as needing access this agent does not hold.

## Dispatch C, paperwork only

### 12. The E1.6 disposition, A-8, and the ref-deletion finding

About to: record I-4, allocate A-8 in STATE.md, record F-3. No stages, no gates,
no pull request.

Happened:

- I-4 written in `delivery/evidence/m3-exit-test/interventions.md`: E1.6 is
  UNSATISFIED and BLOCKED rather than abandoned; the mechanism in the
  orchestrator's file-granular-ownership form with its four citations, each
  re-verified against the tree at this head; the fix dispatched on a branch this
  runner has not touched; and why re-designating the subject was refused.
- A-8 allocated in `delivery/STATE.md`, which is the sole allocator. Checked
  free with `git log --all -S'A-8'`, whose only hits are the two commits that
  added `delivery/work-history/m3-p4.md`, where A-8 is a local test-arm label
  rather than an owner action. The allocation says so, so a grep does not
  mislead.
- F-3 recorded. The id was ALLOCATED rather than added to: the dispatch referred
  to an existing F-3 and the bundle carried only F-1 and F-2, which was checked
  before writing.
- Nine citations added across the two files, every one resolved against the tree
  at this head before committing; one was moved from
  delivery/plan/kernel-plan-m3.md:5104 to :5107 because 5104 is not the sentence
  it was cited for, and one claim ("was never planned") was replaced by the
  `git ls-tree` measurement that settles it.

## Dispatch D

### 13. The lease had lapsed, as expected, and takeover is explicit

Happened: at 17:25:18Z `tiphys lock status` reported EXPIRED (holder
93ef52e9..., expired 14:44:27.515Z), exit 0. A plain
`tiphys lock acquire --duration 21600` then exited 1 and refused:
"lease expired ...; acquire refused, takeover is explicit: lock acquire
--take-over". `lock acquire --take-over --duration 21600` exited 0 and issued
holder 5dbafe47-04c8-407c-b137-82133d505b0d, expiring 2026-08-15T23:25:43Z.
The lapse is recorded rather than silently repaired, which is what E2.2 asks
for, and the refusal of a bare acquire over an expired lease is the fail-closed
behaviour rather than a nuisance.

### 14. E1.6 re-run at the new base

Happened: the project clone's remote was repointed at the real GitHub origin so
the pool would fetch the true default branch (it had been the orchestrator's
local clone, whose `main` was still at d5d87f7). `tiphys spawn --task
exit-subject-r2` exited 0 with `baseSha` 7b18144. The subject commits rebased on
top, with `test/behaviors.json` resolved as a union twice.

Re-measured rather than taken on report: arm A (repaired specs) is now GREEN,
arm B (stale specs) still errors, and the second is correct rather than a gap.
Full bundle: 10 green, 0 red, 6 not-applicable, 0 error, 0 vacuous, recomputed
equal to `summary.json`, `red-witness` GREEN with 7 units. Runner exit 20 for
two required-and-explained not-applicables, `citations` and `scope`.

Subject branch pushed (force, because it was rebased) at
eb13da6b96137967d4a5b8311f0f044e75758b42.

### 15. E1.7 brief composition

About to: resolve the clean-room checklist with an injected per-phase probe and
compose both review contracts through the kernel, then hand back. The two
reviews themselves are the orchestrator's to dispatch, not this runner's.

Happened (E1.7, the runner's half): the per-phase probe file was authored and
validates exit 0 under `--context`; `checklist resolve --checklist clean-room
--extra <file> --framing criteria-contract` exit 0 with 27 probes, all four
injected probes present by id; `checklist resolve --checklist hazard-review`
exit 0 with 9 probes; `brief compose --role clean-room-reviewer
--review-contract criteria` and `--review-contract hazard` both exit 0, 313
lines each, differing in the contract clause and not only in a label. The pack
handed to the orchestrator is
`delivery/evidence/m3-exit-test/e1-7-dispatch-pack.md`.

### 16. Dispatch D ends here

E1.6 re-run and E1.7's composition are done. The two reviews are the
orchestrator's to dispatch. Nothing published, nothing merged, nothing pushed to
`main`.
