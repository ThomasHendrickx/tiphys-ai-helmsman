# Clean-room criteria review, M5-P6 kernel half

Reviewer: clean-room criteria reviewer (did not write this code).
Subject: branch claude/m5-p6-scale-out-proof at head 520ba00dbe2da1ed47b9ff698928968aadcd1183 (did not move from the dispatched head).
Base: origin/main at 1eb41bf4468e1ae675322f723657ad1ca149c13b.
Toolchain: node v26.6.0 (scratch prefix).

Status: COMPLETE (verdict at the end)

## 1. Setup evidence

- `rev-parse origin/claude/m5-p6-scale-out-proof` = 520ba00dbe2da1ed47b9ff698928968aadcd1183, checked out detached.
- node v26.6.0; `npm ci` exit 0; `npm run build` exit 0; `status --short` after build printed nothing.
- `node --test test/init.test.ts test/conflicts.test.ts`: tests 30, pass 30, fail 0, skipped 0 (dist built, Node 26).

## 2. Red witnesses re-run by this reviewer (init.ts mutated in a scratch copy)

Lab: a tar copy of the worktree (no .git, no dist) under scratchpad/m5p6-review/mut.
Script: scratchpad/m5p6-review/mutate.mjs. Each mutation is my own choice,
applied by string replace, run with `--test-name-pattern` against
test/init.test.ts, then restored.

| mutation | tests run | result |
|---|---|---|
| M1 differing-copy byte comparison replaced by `false` | 1 | RED: refuses a differing assurance-modes.yaml |
| M2 top-level check keeps only `status !== 0` (subdir accepted) | 1 | RED: refuses a directory that is not the top level |
| M3 `lstatSync(target)` -> `statSync(target)` (link followed; identical target reads as present) | 1 | RED: refuses a symbolic link |
| M4 copy truncated by its last byte | 2 | RED: byte-identical copy; satisfies the merge regime from the commit |
| M5 charter hint printed at fleet root instead of charter/ | 1 | RED: prints the next steps |
| M6 init writes gate-registry.yaml from the template | 1 | RED: never writes them |
| control, file restored | 18 | exit 0, 18 pass, 0 fail |

M3 is a dangerous state the implementer's witness does not list in that form
(theirs: link followed through realpathSync; branch disabled). It reddens, so
the symlink test also guards the most likely real regression.

Conflicts, same lab, script scratchpad/m5p6-review/mutate-conflicts.mjs, whole
test/conflicts.test.ts (12 tests) each time:

| mutation | result |
|---|---|
| C1 directory-prefix match removed | exit 1, 1 fail: exits 1 and names every overlapping path |
| C2 stdout silenced from the first overlap on (obligation lost) | exit 1, 3 fail |
| C3 every shared entry treated as append-only | exit 1, 3 fail |
| control, restored | exit 0, 12 pass, 0 fail |

## 3. Criterion walk

### p6-prepass: PASS

Run by me on this head, node v26.6.0, `node bin/tiphys.ts conflicts ...`:

| input | exit | output |
|---|---|---|
| fixtures a (src/a.ts, docs/, x.md) vs c (docs/guide.md, src/a.ts, x.md) | 1 | three OVERLAP lines: `docs/ and docs/guide.md (directory contains path)`, `src/a.ts`, `x.md`; summary `1 overlapping pair(s) ... 3 overlapping path(s)` |
| fixtures a vs b (src/b.ts, test/behaviors.json) | 0 | `DISJOINT M9-P1 M9-P2`; `0 overlapping path(s)` |
| real m5-p5.json vs m5-p6.json | 1 | `APPEND-ONLY ... test/behaviors.json`, `OVERLAP M5-P5 M5-P6 delivery/STATE.md` |
| one declaration only (usage) | 64 | usage on stderr |
| same declaration twice | 2 | `NO VERDICT` |

The `semantic coupling: NOT CHECKED ... zero overlap is not proof of
independence` line was printed on ALL five runs, including usage error and
no-verdict. The matching semantics (exact, or trailing-slash directory prefix)
equal the scope auditor's at src/gates/scope.ts:519, and the declaration
schema's own description of filesToTouch says the same, so there is no glob
form the command could silently miss. Hazard false-disjointness is addressed:
the disjoint arm still prints the obligation.

### p6-suite: see section 5.

## 4. Scope audit and the 25 declaration additions

The scope gate needs the phase branch checked out by name, and that name is
checked out in the implementer's worktree, so I ran it in a scratch clone at
the same sha with the branch name and origin/main set to 1eb41bf:

```
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
gates: scope: green: 31 changed path(s) audited against declaration delivery/plan/phase-declarations/m5-p6.json at merge base 1eb41bf... (2 declared path(s) not touched: delivery/STATE.md, delivery/verification/m5-scale-out-exit.md) DECLARATION AMENDED AT HEAD: 25 entry/entries ADDED ...
exit=0
```

The 25 are: 1 citation (DR-0058), 2 declaredExtras (DR-0058 record, the plan
file), 3 filesToTouch granted by DR-0058 (src/commands/init.ts,
test/init.test.ts, templates/gate-registry.example.yaml), and 19 witness paths
(9 conflicts witnesses, 9 init witnesses, 1 capture). Every one of the 22 path
entries appears in `diff --stat origin/main...HEAD`, so none is a speculative
grant. No entry was removed. The three src/test/template entries match the plan
amendment in delivery/plan/value-delivery-plan.yaml (files-to-touch lines
428 to 430) and DR-0058 "What changes". The witness grants are the standing
shape DR-0058 names ("granted by name as they are written"). I SIGN OFF all 25.

Observation, not a finding: the conflicts witnesses predate DR-0058 and are
granted on the same amendment mechanism; the plan's files-to-touch does not
list witness/ paths at all. This is how every phase with witnesses works under
src/gates/scope.ts:110 and is not specific to this phase.

## 5. DR-0058 walk

| DR-0058 item | evidence | result |
|---|---|---|
| files-to-touch gains init.ts, init.test.ts, the template; declaration grants them plus DR record and plan | plan lines 428 to 430 and 436 to 438; scope gate names all five | MET |
| witness files granted by name as written | 19 witness grants, each a changed file | MET |
| acceptance unchanged | plan acceptance block for M5-P6 has the same five ids; the 5-line plan diff touches files-to-touch and extras only | MET |
| hazard hidden-bootstrap-handwork: init produces every item the intake named (I-7 to I-10), none moved into an undocumented manual step | I-7: produced by `init --project` into the PROJECT, measured below. I-8 and I-10: shown NOT CONSUMED rather than produced (my derivation, section 6, agrees). I-9: replaced by templates/gate-registry.example.yaml, reported by init. BUT the dispositions are documented only in delivery/work-history/m5-p6.md; the intake still classes all four as KERNEL-HANDWORK (CR-001) | MET in code, NOT reflected in the criterion document |

End-to-end probe by me (scratchpad/m5p6-review/e2e/probe.sh), node v26.6.0:

- fresh repo, `init --project .`: exit 0, `wrote assurance-modes.yaml: a copy of kernel 0.2.1's ...`, then reports charter.yaml absent and gate-registry.yaml absent naming the template path; re-run exit 0 `present assurance-modes.yaml: identical`.
- `init <fleet>`: exit 0 and the two `next:` lines. Fleet tree: .git .gitignore backlog.md charter decisions package.json projects state status tasks worktrees (no kernel file).
- in that fleet with charter/probe.yaml from the template: `validate --type charter --context .` exit 0; `doctor` exit 1 with the only FAIL `retention` (a project path in the template charter); `next` exit 0.

## 6. The claim "the fleet home needs no kernel files", derived independently

Where the claim lives: delivery/work-history/m5-p6.md:379 ("the fleet home
consumes none of I-7, I-8, I-9 or I-10"), and src/commands/init.ts:240 in a
comment. It is NOT in the intake (see CR-001).

My derivation, two searches:

1. Every literal kernel artifact name in `src/**/*.ts`, non-comment lines:
   `grep -rnE '"(assurance-modes\.yaml|gate-registry\.yaml|gates\.manifest\.json|role-model-config\.yaml|AGENTS\.md|schemas|roles|checklists|templates|tuition)"|MODES_FILENAME|\.schema\.json' src`
   Classified by resolution:
   - install-relative walks (never an operator directory): src/modes.ts:106 (`packageRoot()`), src/commands/validate.ts:223 (`schemasDirectory()`), src/roles.ts:378 (`kernelRoot()`), src/cutover.ts:1396, src/commands/doctor.ts:970 (resolved install root), and every `new URL(..., import.meta.url)` schema read in src/gates/.
   - context-directory reads, only under an explicit `--context` or a document's own directory: src/checks.ts:668, src/checks.ts:748, src/checks.ts:2110 (and `mode show --file`, src/commands/mode.ts:126).
   - cwd-of-the-GATE reads, i.e. the PROJECT repository when a gate runs: src/gates/red-witness.ts:205 (`gates.manifest.json`), src/gates/red-witness.ts:217 (`test/behaviors.json` at head), src/gates/scope.ts:979 (standing extras), src/gates/suite.ts:560, and the regime read src/checks.ts:4799.
   - src/commands/tuition.ts:85 `<cwd>/tuition`: the tuition feed command, operator-directed by `--dir`, not a fleet prerequisite.
2. Every `process.cwd()` resolution in src (29 hits). The fleet-scoped ones
   are `loadFleet(process.cwd())` (next, spawn, watch, sync, status, lock,
   pool, teardown, doctor); loadFleet's paths (src/fleet.ts:93 to
   src/fleet.ts:103) are exactly the layout init writes plus charter/ content.

Conclusion: SUPPORTED for the fleet home. No fleet-scoped command reads a
kernel-owned file from the fleet directory. The kernel files that ARE
consumed from an operator tree are consumed in the PROJECT repository, and
there are more of them than the intake lists (CR-002).

What my search did NOT cover: paths assembled from runtime configuration or
non-literal arrays; `scripts/`, `.claude/`, `bin/` beyond the entry; `dist/`
(compiled from src, assumed equivalent); fleet commands not executed by me
(spawn, pool, watch, teardown, sync, cutover, brief compose) beyond the
static reading; any behaviour of an npm-installed kernel as opposed to this
source tree.

## 7. Suite (p6-suite): PASS

Invocation: bare `node --test` from the repository root, node v26.6.0,
`dist/` built by `npm run build` (exit 0, clean status after). Result:
exit 0, tests 1510, pass 1510, fail 0, cancelled 0, skipped 0. Matches the
implementer's count. `node scripts/check-authored-bytes.mjs` exit 0.

## 8. Criteria summary

| criterion | status |
|---|---|
| p6-prepass | PASS (section 3) |
| p6-charter-only | NOT-YET (step 3 not run). Kernel precondition met in code; the criterion document needs CR-001 and CR-002 |
| p6-parallel-value | NOT-YET (exit report not written) |
| p6-attribution | NOT-YET (exit report not written) |
| p6-suite | PASS (section 7) |

## 9. The implementer's open questions

1. Upgrade drift of the copied assurance-modes.yaml. Real, and wider than
   stated: nothing after init (doctor, the merge gate) compares the project's
   committed copy with the kernel's, and the merge regime takes the mode's
   merge-authority from that copy (src/checks.ts:4799). A stale or edited copy
   changes the regime silently. Does NOT block p6-charter-only, which is about
   bootstrap. The regime's read-from-commit design predates this phase. CR-003.
2. `validate --type assurance-modes --context .` exits 1 in a project.
   Reproduced (exit 1, three INVALID lines). `mode show --mode full --file
   assurance-modes.yaml` in the project also exits 1, while `mode show` from
   the install exits 0. The regime reader does not run those context checks
   (src/checks.ts:4799 to src/checks.ts:4840, read by me). Does NOT block. CR-005.
3. No shipped adapter. Adapters are project-owned predicates, which the
   criterion admits; the template header documents the step. Does NOT block,
   but the intake should list the adapter scripts as PREDICATE inputs (folded
   into CR-001).
4. Project registry pointing at kernel gates. CONDITIONALLY BLOCKS
   p6-charter-only: if hemma's registry opts into any kernel contract gate
   (I-6 and I-13 anticipate it), that gate reads kernel-format files at
   kernel-imposed paths in hemma (CR-002), and there is no way named to invoke
   the kernel script from hemma except through an operator's install, which is
   the machine dependency init --project rejected for assurance-modes. Step 3
   must either decide not to opt in, or enumerate these inputs before
   bootstrap.

## 10. Findings

CR-001 (low). The intake, which is the document p6-charter-only names, is
stale against the branch. It was last changed at cb262fb, before DR-0058.
Section 4d still says "NOT sufficient today" (delivery/verification/m5-hemma-intake.md:215),
I-7 to I-10 are still classed KERNEL-HANDWORK
(delivery/verification/m5-hemma-intake.md:203 to delivery/verification/m5-hemma-intake.md:206),
and I-6 still says no template ships (delivery/verification/m5-hemma-intake.md:202).
The dispositions (I-7 produced by `init --project` into the project, I-8 and
I-10 not consumed, I-9 replaced by the template, Q-4 resolved as two charter
locations) exist only in delivery/work-history/m5-p6.md:379 and following.
The new post-init steps (commit the copy; write the charter in the fleet AND
as project charter.yaml; write adapter scripts) are not in the inventory.
Action: an addendum to section 4 before step 3 relies on it. Low because the
snapshot was accurate when written and step 3 will revisit it.

CR-002 (medium). The intake inventory omits kernel-format files that kernel
contract gates read at hard-coded paths in the PROJECT repository:
`gates.manifest.json` at the root (src/gates/red-witness.ts:205, an error if
absent), `test/behaviors.json` at head (src/gates/red-witness.ts:217,
src/gates/suite.ts:560), and the scope gate's standing extras
`test/behaviors.json` and `delivery/work-history/<phase>.md`
(src/gates/scope.ts:979). I-13 names red-witness specs and I-6 names "the
kernel-contract gates hemma opts into", so the intake anticipates these gates
without listing their inputs. `gates.manifest.json` in particular is kernel
configuration that neither init nor any template produces. That is the
hidden-bootstrap-handwork hazard for step 3. Action: enumerate them (or record
that hemma opts into none) in the intake.

CR-003 (low). No conformance check of the project's assurance-modes.yaml
after init. It is identity-checked only when `init --project` runs. Nothing
detects drift after a kernel upgrade or a local edit, and the merge regime
reads merge-authority from it. Track as a follow-on; not introduced by this
phase's regime design, and not a p6-charter-only blocker.

CR-004 (low). The charter must now exist twice: `<fleet>/charter/<project>.yaml`
(doctor, brief compose) and `<project>/charter.yaml` (merge regime). Init
names both, but nothing checks that they agree. Same drift shape as CR-003.
Record it in the intake inventory (part of CR-001) and as an open question.

CR-005 (low). The one kernel file init places in a project cannot be
validated or displayed in place: measured `validate --type assurance-modes
--context .` exit 1 and `mode show --file assurance-modes.yaml` exit 1 right
after `init --project`. It is harmless to the merge path, but an operator who
checks the file they were told to commit gets a red result. The init output
could say so, or the question can go to the orchestrator as the implementer
proposes.

No findings against src/commands/conflicts.ts, src/cli.ts,
src/commands/init.ts, templates/gate-registry.example.yaml or the tests.
Nine mutations (six on init.ts, three on conflicts.ts) all went red. Both
controls were green. The scope gate is green, and I sign off all 25
declaration additions.

## Verdict: FIX-ROUND-NEEDED (kernel half)

The round is DOCUMENTATION ONLY: CR-002 (medium) and CR-001 in
delivery/verification/m5-hemma-intake.md. The kernel code, tests, witnesses
and template are approvable as they stand. A change limited to delivery/
would not invalidate this review of the code.

Status: COMPLETE

# Re-verification at 45a0d54

Head: 45a0d549d420b67a41770ae99d7d76eb36971d7c (`rev-parse
origin/claude/m5-p6-scale-out-proof` after fetch), checked out detached.
Base unchanged: origin/main 1eb41bf. Delta 520ba00..45a0d54 is 7 commits, 19
files: src/commands/conflicts.ts, src/commands/init.ts, their tests,
test/behaviors.json, 5 new and 5 re-pointed witnesses, the declaration, the
intake, the work history and the DR-0058 addendum.

Status: COMPLETE (verdict at the end of this section)

## R1. First check: what the round's derivation did NOT cover

Source: delivery/work-history/m5-p6.md, section "KERNEL HALF FIX ROUND 1".
The stated exclusions, and my judgment of each:

| exclusion stated by the round | tested by me | judgment |
|---|---|---|
| case (`src/A.ts` vs `src/a.ts`) compared as different | live: exit 0 `DISJOINT` | ACCEPTED. The scope gate is case-sensitive too (src/gates/scope.ts:518), so a phase declaring the wrong case cannot touch the other file without a red scope. The failure is caught later, by the scope gate. |
| directory without trailing slash (`src`) is a file entry | live: exit 0 `DISJOINT` against `src/a.ts` | ACCEPTED. This is the declared grammar the scope gate shares. A phase declaring `src` gets a red scope on any `src/x` file. |
| trailing slash on a file (`src/a.ts/`) | live: exit 0 `DISJOINT` | ACCEPTED on the same reasoning: `src/a.ts/` does not match `src/a.ts` in the scope gate either. |
| symlinked path inside a repository | not tested | ACCEPTED as out of reach for a declaration-only command. It is stated. |
| src/gates/scope.ts has the same string-comparison shape | read the three cited sites | ACCEPTED as a follow-up. The round reasons that each site fails closed, and I agree. It is recorded, not fixed, and it is outside the declaration. |
| init fleet arm and `packageRoot()` not re-derived | read the diff | ACCEPTED: neither changed. |
| CR-KH-003: O_NOFOLLOW and O_EXCL act on the last path component only; Windows has no O_NOFOLLOW; the race was not forced | not forced by me either | ACCEPTED as stated residue. |

One exclusion the round did NOT state. `readProjectCopy` turns ANY read
failure into an empty buffer, so an unreadable copy is reported as "differs
from kernel". That fails safe (it refuses and writes nothing), but the message
names the wrong cause. I could not test it because this container runs as uid
0 (`id -u` = 0): a chmod 000 identical copy still read back as `present`.
Recorded as CR-006 (low).

Every exclusion is either measured by me or reasoned to fail closed at the scope
gate. None is a false-green path that survives to merge.

## R2. Findings, disposition at 45a0d54

| finding | disposition | evidence |
|---|---|---|
| CR-001 (low), intake out of date | FIXED | the I-5 to I-10 rows now name their post-DR-0058 class; 4d is marked SUPERSEDED and kept as written; the new section 4e at delivery/verification/m5-hemma-intake.md:244 gives the four dispositions with evidence, answers Q-4 (two charter locations), and lists the five post-init steps (copy committed, charter twice, registry plus adapters, declarations). Q-8 is marked answered. |
| CR-002 (medium), kernel gates read project files at fixed paths | FIXED | the 4e table covers red-witness, suite, scope, merge-preconditions, citations, coverage and gate-classes. It gives each gate's fixed paths with src line citations, a per-gate step-3 recommendation, and how hemma supplies each input. The open invocation question is raised as Q-9 and blocks step 3. I spot-checked red-witness.ts:205 and :217 and scope.ts:979; they match my derivation from the first review. |
| CR-003 (low), no drift check of the project copy | RESIDUE ACCEPTED | recorded in 4e and in the DR-0058 addendum. It needs a new check outside this declaration. Not a p6-charter-only blocker. |
| CR-004 (low), charter in two places | RESIDUE ACCEPTED | recorded in 4e (Q-4 answer and residue list) and in the DR-0058 addendum. |
| CR-005 (low), the copy cannot be validated in a project | RESIDUE ACCEPTED | recorded in 4e. The work history restates it as an open question (where the modes context checks apply). |
| CR-KH-001 (high), spelling variants read DISJOINT | FIXED | live probe (scratchpad/m5p6-review/e2e/probe2.sh): `./src/a.ts`, `src//a.ts`, `src/./a.ts`, `src/b/../a.ts`, `/src/a.ts` against `src/a.ts` each give exit 2, 0 DISJOINT lines, NO VERDICT, and the obligation as the last line. Real input is not disturbed: `conflicts` over all 57 declarations gives exit 1, 0 non-canonical refusals, and 807 overlapping plus 789 disjoint = 1596 = C(57,2) pairs. Mutations N1, N2 and N3 go red (R4). |
| CR-KH-002 (medium), a symlinked root falsely refused | FIXED | live: `init --project <link-to-repo>` exits 0 and writes a regular file at the real path (`-rw-r--r--`). A dangling link exits 1 with `could not be resolved (ENOENT)`, not "is not a directory". Mutation N4 goes red. |
| CR-KH-003 (low-medium), TOCTOU window | FIXED FOR THE LAST PATH COMPONENT, RESIDUE ACCEPTED | `wx` exclusive create plus an O_NOFOLLOW open with fstat. The residue (parent directory components, Windows) is stated. Mutations N6 and N7 go red. |
| CR-KH-004 (low), uncaught kernel read | FIXED | an attributed line and exit 1. The test stages a kernel whose assurance-modes.yaml is a directory. Mutation N5 (rethrow) goes red. The round also found and fixed a sixth instance: the root stat after realpath is now inside the same try. |
| CR-KH-005 (medium-high), DR-0058 promised three items, code produces one | FIXED | the orchestrator's DR-0058 addendum, "what the implementation found", records per item that I-7 is produced, I-8 and I-10 are not needed, and I-9 is the template. It keeps the decision unchanged, points at intake 4e, and names the residue. That matches my independent derivation (first review, section 6). |

## R3. Criteria re-walk

- p6-prepass: PASS. The overlap, disjoint and usage arms are unchanged in
  code, and the full conflicts file passes (14 of 14 in the lab control). The
  non-canonical arm is new and prints NO VERDICT with the obligation as the
  last line (R2 row CR-KH-001).
- p6-suite: see R5.
- p6-charter-only, p6-parallel-value, p6-attribution: NOT-YET (step 3 and the
  exit report). The intake now shows the kernel precondition. Step 3 is
  blocked on Q-9 and the owner action, as the intake says.

## R4. Red witnesses re-run by me on the fix round's code

Lab: a fresh tar copy of 45a0d54 (scratchpad/m5p6-review/mut2); script
scratchpad/m5p6-review/mutate2.mjs; each run uses `--test-name-pattern` on the new test.

| mutation | result |
|---|---|
| N1 declared-entry canonical guard removed | 1 test, 1 fail |
| N2 dot-segment check alone disabled | 1 test, 1 fail |
| N3 `--append-only` canonical guard removed | 1 test, 1 fail |
| N4 root taken by `lstatSync(root)` again | 1 test, 1 fail |
| N5 kernel read failure rethrown | 1 test, 1 fail |
| N6 `wx` changed to `w` | 1 test, 1 fail |
| N7 O_NOFOLLOW dropped from the read | 1 test, 1 fail |
| controls restored | init 21 of 21 pass; conflicts 14 of 14 pass |

Red-witness gate at 45a0d54 (scratch clone on the branch name):
`green: 36 witness(es) evaluated (23 own, 13 stored re-evaluated in 117619ms); every witness red against every declared dangerous state and green at head`.

## R5. Suite, gates, bytes

- `npm ci` exit 0; `npm run build` exit 0; `status --short` empty after build.
- Scope gate: green, 36 changed paths audited, `30 entry/entries ADDED at head 45a0d54`. Both untouched declared paths are unchanged (STATE.md, the exit report).
- Citations gate: green, `58 citation(s) resolved, 0 self-citation(s), 0 unverifiable-external`.
- `node scripts/check-authored-bytes.mjs`: exit 0.
- Suite (p6-suite): PASS. Bare `node --test` from the repository root, node v26.6.0, `dist/` built: exit 0, tests 1515, pass 1515, fail 0, cancelled 0, skipped 0. That is 5 more than 1510 at 520ba00, one per new test, and matches the implementer's count.

## R6. The 30 declaration additions

These are the 25 I signed off at 520ba00, unchanged, plus 5 new witness files:
witness/conflicts-non-canonical-path-no-verdict.json,
witness/conflicts-append-only-non-canonical-usage.json,
witness/init-project-accepts-symlinked-root.json,
witness/init-project-kernel-read-attributed.json and
witness/init-project-copy-exclusive-nofollow.json. Each is a file added in
520ba00..45a0d54 (diff stat), and each belongs to a new test that I made red
(R4). Nothing was removed. I SIGN OFF all 30.

## R7. New finding

CR-006 (low). `readProjectCopy` (src/commands/init.ts) maps every read failure
(EACCES, EIO, ELOOP) to an empty buffer, which is then reported as "differs
from kernel ... was not overwritten". The outcome is safe: it refuses and
writes nothing. The diagnostic names the wrong cause, though, and an operator
would go looking for a content difference that is not there. Not measured,
because the container runs as root. Not blocking.

## Verdict at 45a0d54: APPROVE (kernel half)

Every high and medium finding from both reviews is fixed, with evidence:
CR-002, CR-KH-001, CR-KH-002 and CR-KH-005. The remaining lows are fixed or
recorded as accepted residue, and one new low, CR-006, is non-blocking. The
suite has 1515 tests, 1515 pass and 0 skipped. The scope, citations and
red-witness gates are green. Seven new mutations went red. I sign off all 30
declaration additions. p6-charter-only, p6-parallel-value and p6-attribution
stay NOT-YET until step 3 and the exit report exist. Step 3 must settle Q-9
before hemma's registry is written.

Re-verification status: COMPLETE
