# Clean-room review: M4-P19, head abde402, base de9b386

Reviewer lens: CORRECTNESS AND DATA LOSS.
Started: reading CLAUDE.md, plan section 2826, work history, pre-pass.

## Running notes

- Declared files (plan:2831) omit `src/commands/pool.ts` and `test/doctor.test.ts`.
  Both are in the branch declaration's `declaredExtras`.
- CONTRADICTION SPOTTED: work history section 7 says "`test/doctor.test.ts` is
  deliberately NOT touched: it is M4-P17's file." Section 3.3 and section 9 both
  say it IS touched. The diff changes it (52 lines).
- Declaration file itself is ADDED on the branch, so it does not exist at the
  merge base de9b386. Scope gate reads declaration from MERGE BASE (CLAUDE.md).
  Need to check whether M3-P11's both-declarations read shipped.

## CONFIRMED F-1 (HIGH): doctor and pool list now hang forever on a network call

Fixture: fleet + task, pool record deleted, clone's `refs/remotes/origin/HEAD`
deleted, `origin` repointed at a TCP listener that accepts and never speaks
(`git://127.0.0.1:48311/nope.git`).

| interpreter / tree | `pool list` | `doctor` |
|---|---|---|
| base de9b386 | exit 0, 0s | exit 0, 1s |
| branch abde402 | killed by `timeout 25`, exit 124, no output | killed by `timeout 25`, exit 124 |

Cause: poolList -> reconstructPoolRecord -> resolveDefaultBranch ->
`git ls-remote --symref <remote> HEAD` (src/pool.ts:221), through runGit
(src/pool.ts:79) which passes NO `timeout` to spawnSync. Reached whenever the
clone has no local `refs/remotes/origin/HEAD`, which is the normal state of a
`git init` + `git remote add` + `git fetch` clone.

## CONFIRMED F-2 (MEDIUM): section 6's statement about the real reclaim shape is false

Measured with `worktrees/` removed entirely (what a rehydrated fleet clone
actually looks like, since the dir is gitignored and git creates no empty dirs):
- `pool list` -> exit 1, "not a fleet home ... missing worktrees/". It does NOT
  "report the entry with headSha missing".
- `CHECK worktrees` -> WARN "is not a fleet home, so there is no worktree pool
  to report". Inert in the scenario its own header says it exists for.
- `teardown --from-reconstructed` -> exit 1 at loadFleet, NOT at
  "no pool worktree for task id <id>".
- `tiphys init <fleet>` refuses: "already initialized". No kernel command
  repairs the missing dir.
After a manual `mkdir worktrees`: pool list prints `t1 missing reconstructed`,
teardown refuses at "cannot verify worktree cleanliness", still not the message
section 6 names.

## CONFIRMED F-3 (HIGH): the required `red-witness` gate is RED

Run in a clean clone at abde402, `--base origin/main --phase m4-p19`:

  gates: red-witness: red: 9 witness(es) evaluated (0 own, 9 stored re-evaluated
  in 72610ms); source changed with no witness spec covering it:
  src/commands/pool.ts, src/commands/teardown.ts, src/pool.ts, src/teardown.ts

`witness/` holds 165 machine-executable specs. This phase added none. Control:
`git diff --name-only 3b401182...de9b386 -- src/ bin/ witness/` is EMPTY, so the
red is entirely this branch's. The four mutants D1 to D4 were run by hand in
/tmp/n26-m4p19 and are not re-evaluable by anyone.

## CONFIRMED F-4 (MEDIUM): the `scope` gate is RED

  gates: scope: red: branch claude/m4-p19-pool-record-reconstruction (phase
  m4-p19) matches the phase pattern but no phase declaration exists at
  delivery/plan/phase-declarations/m4-p19.json in the merge base 3b401182...

Also: the branch is cut from `plan/pstack-borrow-review`, so against origin/main
it carries 28 commits and 38 files including CLAUDE.md, delivery/STATE.md and
12 decision records. The pre-pass reserves CLAUDE.md for M4-P23.

Green gates re-run by me: citations, clause-map, coverage, agent-rules-drift,
brief-drift, check-agents-references, manifest-self-check, license.

## CONFIRMED F-5 (MEDIUM): --from-reconstructed DESTROYS uncommitted work in a scout worktree

  $ tiphys teardown --task s1 --from-reconstructed
  torn down s1                                       EXIT 0
  $ ls fleet/worktrees/s1   -> No such file or directory
(precondition: ` M readme.md` and `?? important.md`)

Base control at de9b386, same fixture: exit 1, worktree intact.
With a record present (pre-existing scout semantics): also torn down, so the
POLICY is not new, but the branch newly makes it reachable, plan criterion 4
states the refusal unconditionally, and the FROM-RECONSTRUCTED header at
src/teardown.ts says "a dirty worktree is refused without --salvage, as ever".
Work history section 6 flags the scout shape only for baseSha, not for discard.

## SUITE, reproduced

| tree | interpreter | build | invocation | result |
|---|---|---|---|---|
| abde402 | node v26.6.0 | `npm run build` exit 0, clean status | `npm test` | 863 tests, 863 pass, 0 fail, 0 skipped, exit 0 |
| de9b386 | node v26.6.0 | same | `npm test` | 849 tests, 848 pass, 1 fail, 0 skipped, exit 1 |

Both match the work history's numbers exactly. Delta 14, as claimed. My base
failure was a different flake (gates.test.ts module-not-found under a chmod
test) than the coverage-gate one it names; both environmental.

## CITATIONS: 34 of 34 verified by reading the line

All 21 source and 13 document citations resolve and say what is claimed.
`src/pool.ts:39` appears once and is correctly QUOTED as the counterexample the
implementer names. Hit rate 100 percent.

## ATTACKS THAT HELD

- Cross-task destruction via a meta.json whose `id` differs from its directory:
  refused at the branch-checked-out gate, nothing removed, both branches intact.
- `--salvage --from-reconstructed` on a dirty landed ship task: the WIP commit
  reached the upstream `task/sv1`, `leftover.md` preserved. No loss.
- meta.baseSha == record.baseSha, meta.branch == record.branchName,
  meta.project == record.project, meta.baseOffline == record.offline, measured.
  Only `createdAt` differs (by 266ms). Settles the work history's untested belief.
- Derivation 4.1 reproduces byte for byte; widening it to any `.remote`/`.branch`
  member access finds no missed consumer.
- No pinned count over an append-only registry: behaviors asserted BY NAME,
  CHECK_NAMES is containment, the equality half derives from runChecks.
- The prototype-probes doc has zero hits for pool/teardown/worktree/doctor,
  confirming section 3.4.
