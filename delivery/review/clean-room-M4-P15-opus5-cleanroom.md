# Clean-room review: M4-P15 (kernel charter)

- Branch: claude/m4-p15-kernel-charter
- Head: 427aa49
- Base: 3b40118
- Reviewer framing: EVIDENCE INTEGRITY AND DATA LOSS COMBINED. Sole reviewer.
- Started: (in progress, appended incrementally)

## 0. Orientation

Diff touches 42 files, 13422 insertions. Files modified (not added):
.claude/orchestrator-next.mjs, .gitignore, CLAUDE.md, delivery/STATE.md,
delivery/decisions/DR-0010-harness-orchestration-primitive.md,
test/behaviors.json.
New code-adjacent files: charter.yaml (repository ROOT), test/kernel-charter.test.ts.

Open question 1 to settle: is charter.yaml SHIPPED? The dispatch brief asserts
no shipped artifact changes because nothing is under src/ bin/ schemas/ roles/
tuition/. charter.yaml is at the repository root, so the npm `files` field
decides, not the directory.

## 1. Work history item 3 (what the derivation did NOT cover) -- my first check

The work history states not-covered in FIVE separate places, not one:

- after the CI-path derivation (`grep -rn 'validate --type charter|"charter"'`
  over `.github/workflows/`, registry, manifest, `scripts/`): names `src/` and
  `.claude/` and the M3 exit-test shell scripts as unsearched, and names the
  run-time-composed-string case as invisible to a text search.
- after the repository-wide `grep -rn "charter" src/ scripts/`: says the plain
  `-r` form walks `dist/` once built and gives a different number than the
  tracked-files form, which is a real and unusual admission.
- after `git grep -l "charter\.yaml|charter\.yml"`: names `.github/` (searched
  separately, exit 1), the exit-test shell scripts, and dependencies.
- a six-item "What this phase did NOT do" section.
- the suite section: "I did NOT establish the base's result for this symptom".

VERDICT ON HONESTY: the statement is unusually good, and one thing it admits IS
worse than it sounds, but not in the direction a reader would guess. Item 4,
"it did not establish what the scope gate will say", is stated as a prediction
and then CONTRADICTED by the branch's own last commit: 427aa49's message says
the scope gate IS red today. The work history text was not updated. The result
is that the phase's own paperwork carries a stale "not established" beside a
commit message that establishes it. That is the smaller half. The larger half is
in section 5 below: the suite number was never re-measured after the commit that
added a test.

## 2. Red witnesses: re-run, and I added a fourth member

Environment for every run below: node **v26.6.0** from
`/home/user/node26-scratch/node-v26.6.0-linux-x64/bin` (NOT under /tmp/claude-0),
`dist/` BUILT (`npm ci` exit 0, `npm run build` exit 0, `git status --porcelain`
empty after build), a fresh `git clone --local --no-hardlinks` of the repository
at 427aa49 (a real git checkout, `git rev-parse --is-inside-work-tree` = true),
invocation `node --test test/kernel-charter.test.ts`.

| state | tests | pass | fail | which failed |
|---|---|---|---|---|
| the charter as authored (BASELINE) | 7 | 7 | 0 | none |
| root charter ABSENT | 7 | 1 | 6 | 1,2,3,4,5,6 |
| `delivery-mode: direct-pr` (MY OWN, fail-open direction) | 7 | 6 | 1 | 2 only |
| schema-invalid (whole `retention` block deleted) | 7 | 6 | 1 | 5 only |

The charter was restored byte for byte after each arm (`cmp -s` clean,
`git status --porcelain charter.yaml` empty).

The fourth row is mine, not the implementer's, and it is the one I expected to
find a hole in. The work history argues that declaring `direct-pr` or
`local-only` is "the fail-open direction, reachable by a one-word edit", and the
obvious reading is that test 6 ("the mode resolves by name") is the guard, which
would be worthless because `direct-pr` IS a declared mode. It is not the guard.
Test 2 is: it stages the REAL root charter and asserts `are distinct on` is
present AND `is not a delegated grant` is absent, so a one-word downgrade of the
regime reddens it. Measured, one variable, red. The guard holds against the
hazard the phase names.

DISCRIMINATION: the arms do not all redden together. A schema-invalid charter
leaves tests 1, 2, 3, 4 and 6 green and reddens only 5. A fail-open mode leaves
5 and 6 green and reddens only 2. That is the property a class of guards needs
and it is rarer here than the work history's own table suggests, because the
table stops at three arms.

CLASS COUNT for "present but unusable" (test 4): TWO members, and they are
genuinely different. Member 1 never decodes (`delivery-mode: [unclosed`),
member 2 decodes perfectly and names `not-a-declared-mode`. They travel
different branches and the test asserts they print DIFFERENT sentences
(`could not be read` is asserted ABSENT in member 2). That is not the same
defect twice.

## 3. The phase's central finding reproduces exactly

Not taken on trust. Measured in a bare lab built from the branch's own files:

- zero verdicts, NO charter: `node scripts/check-dual-review.mjs <dir>` exits
  **21**, "does not exist, so the declared mode's merge-authority is unknown".
  So the regime check genuinely precedes the verdict count, which is what makes
  test 1 a live guard today rather than a description of a future state.
- zero verdicts, charter present: exits **20**, not-applicable.
- ONE file, whole `retention` block deleted, two decorrelated verdicts staged:
  `node bin/tiphys.ts validate --type charter` exits **1**
  (`INVALID #/retention required property retention is missing`) and
  `node scripts/check-dual-review.mjs` on the SAME file exits **0 green**.
  The silent-acceptance finding is real.
- the real root charter: `validate --type charter charter.yaml` exits **0**.

## 4. Guards that cannot go red: two found, both in `.claude/orchestrator-next.mjs`

The new test file is clean on this axis (section 2 shows four arms that
discriminate). The two instances are in the unpushed-work guard the branch adds
to the orchestrator's stop-condition script, which is the guard T-027 exists
behind.

### 4a. Only the FIRST local branch of a phase is examined

`const localBranch = git(["branch","--list",`${branch}*`])...filter(Boolean)[0]`.
Lab, a fresh git repository built from the branch's own copy of the script,
node v26.6.0:

| arm | truth | script says |
|---|---|---|
| `claude/m4-p8-solo` alone, 1 commit on no remote | `git rev-list --count ... --not --remotes` = 1 | `m4-p8 not started [UNPUSHED 1 commit(s)]`, exit **6** |
| `claude/m4-p7-alpha` (pushed) AND `claude/m4-p7-beta` (1 commit on no remote) | alpha 0, beta **1** | `m4-p7 pushed, 1 commit(s) ahead, NOT merged`, NO marker, exit **2** |

The second row is the dangerous state and the guard is green against it. This is
not hypothetical for this phase: `delivery/plan/kernel-plan-m4.md` section 3.4
declares M4-P15's branch as `claude/m4-p15-fleet-bringup`, and the moment that
branch exists `git branch --list 'claude/m4-p15-*'` returns two names of which
`fleet-bringup` sorts FIRST, so the branch under review becomes the unwatched
one. The same `[0]` truncates `WORKTREES.get(localBranch)`, so a live agent on
the second branch is absent from the watch set WITHOUT triggering the script's
own "WORKTREE WATCH SET IS EMPTY" warning, which fires only at zero. That is
T-014's recorded shape (a watchdog over a subset reads quiet at full speed).

### 4b. A failed git call is read as "nothing unpushed"

`git()` returns `""` on any failure, and `Number.parseInt("") || 0` is `0`. One
forcing case, measured, same repository, one config changed:

```
$ git config color.branch always
$ git branch --list 'claude/m4-p8-*' | cat -v
  claude/m4-p8-solo^[[m
$ node .claude/orchestrator-next.mjs
usage: git rev-list [<options>] <commit>... [--] [<path>...]
... exit=2          (was exit=6 with [UNPUSHED 1 commit(s)] one command earlier)
```

CLAUDE.md's own fix-round contract names "a usage error read as a clean result"
as one of the three times this project has been bitten by exactly this. Stated
fairly: `color.branch` is unset globally and in this repository today, so the
trigger I used is not live here; the swallowing arm is, and it covers every
failure of that one call. The error does reach stderr, so it is not wholly
silent, but the script's exit code (the half CLAUDE.md calls "a fact that cannot
be reported around") says 2, meaning drive-to-merge, when the truth is 6.

## 5. Counts pinned over an append-only registry: none found

- `test/behaviors.json`: six rows appended at the end, nothing else touched.
- `test/kernel-charter.test.ts`: no numeric assertion anywhere. The schema arm
  iterates `required` read out of `schemas/charter.schema.json` at run time; the
  mode arm builds its set from `assurance-modes.yaml` at run time; the behaviour
  arm asserts six ids BY NAME.
- I checked the round-trip CONTROL is present and first (it is), which is what
  stops a schema rejection being an artifact of YAML re-serialisation.

## 6. The claim greps

Against `delivery/work-history/m4-p15.md`, occurrences not matching lines:

| form | occurrences |
|---|---|
| line-based binding command | 18 |
| wrap-insensitive `tr` form | 18 |
| passive forms (brief item 10) | 1 |

Zero missed by hard wrapping. The work history reports NINE and says its own
disposal table's rows are hits too and must be subtracted. That arithmetic is
exact and I checked it rather than accepting it: 16 `never` + 2 `needs a` = 18,
and the disposal table contributes 8 `never` + 1 `needs a`. 18 - 9 = 9.

All 18 audited. Every one is either inside a verbatim capture of a program's own
output, a quotation of a cited document (each of which I resolved, section 7),
or a disposal-table row. The single passive hit is
"nothing deleted is validated first and must exit 0", which describes the
round-trip control and is settled by the test source and by my own run. NO
over-claim survived.

## 7. Citations: 24 sampled, 24 resolve, hit rate 24/24

Every one read at 427aa49 and compared with what the citing sentence claims.
Spot results: `schemas/charter.schema.json:34` is the `$comment` saying "An
exact version, never a range"; `scripts/check-dual-review.mjs:198` is
`const REGIME_DOCUMENTS = ["charter.yaml", "assurance-modes.yaml"]`;
`src/checks.ts:2903` is `export const DELEGATED_MERGE_AUTHORITY =
"delegated-under-conditions"`; `src/gates/suite.ts:1042` is the
`behavior ... does not resolve` message; `src/gates/scope.ts:875` is the
declaration-at-merge-base refusal; `delivery/decisions/DR-0012...:34` is the
two-fix-round limit; `src/commands/doctor.ts:50` is the comment explaining why
`retention-not-applicable` is not promoted. The `citations` gate on my own run
reports `524 citation(s) resolved, 0 self-citation, 0 unverifiable-external`
across 24 changed documents.

The backticking convention is correct and deliberate: every path this branch
changes is quoted and therefore non-resolving, per rule 3b and T-019's
collision, and the changed set was measured with
`git diff --name-only origin/main...HEAD` rather than assumed.

## 8. The suite sentence, and the one number that is wrong

The work history's sentence is the most complete one I have seen in this
repository: interpreter, build state, invocation, TREE KIND (a git checkout, not
an archive copy, which is the fourth qualifier measured 2026-09-16), pass count
and skipped count. It also records the FIRST run's anomaly (788 tests, 2 files
cancelled, exit 1) instead of dropping it, and refuses to claim 788 + 76 = 864
is an identity.

I re-ran it independently. node **v26.6.0** from
`/home/user/node26-scratch/node-v26.6.0-linux-x64/bin`, `dist/` built,
`npm test`, fresh `git clone --local --no-hardlinks` at 427aa49, load average
0.06 at start:

```
npm ci exit=0        npm run build exit=0        git status --porcelain: empty
tests 856  pass 856  fail 0  cancelled 0  skipped 0  todo 0   exit=0
```

**856, not 855.** Independently corroborated by the `suite` gate in my own local
bundle run at the same head: `reported 856 test(s) from 46 file(s) (pass 856,
fail 0, skipped 0, todo 0, did-not-run 0)`.

CAUSE ESTABLISHED, not guessed. The 855 was measured at c04d961, where
`test/kernel-charter.test.ts` had **6** top-level tests. Commit d3a173d split the
staged-pair test in two (the work history says so itself, and prints a 7-test TAP
capture two sections later), giving **7**. Between c04d961 and 427aa49 the only
files touched under `test/`, `src/`, `bin/` or `scripts/` are
`test/behaviors.json` and `test/kernel-charter.test.ts`. 855 + 1 = 856.

So the branch is green and the number is stale. What it costs: DR-0031's "local
green before opening" was never established AT THE HEAD that opens the pull
request, and a later reader joining on 855 starts an investigation this project
has already paid for three times. Recorded as CR-001.

Was the BASE established before a failure was attributed to the change? For the
cancelled-file symptom, NO, and the work history says so in those words ("That
is an inference, not a measurement of the base"). For the two `coverage-gate`
failures inside the bundle, also no, and it says so again. Both admissions are
correct and both are the honest form. My own bundle run at this head had
`coverage` green and the suite green at load 0.06, which is consistent with the
load-dependence explanation but does not close it either.

Default-toolchain arm, which the work history did not run for the full suite: I
ran the phase's own file on `/opt/node22/bin/node` v22.22.2 and got 7 tests, 7
pass, 0 fail, 0 skipped. The new test is NOT floor-dependent.

## 9. Scope

Reproduced on a branch carrying the real name (my first bundle run was on a
detached HEAD, where `scope` reports not-applicable because the branch does not
match the phase pattern; that is worth knowing before anyone quotes a
not-applicable as a pass):

```
gates: scope: red: branch claude/m4-p15-kernel-charter (phase m4-p15) matches the
phase pattern but no phase declaration exists at
delivery/plan/phase-declarations/m4-p15.json in the merge base 3b40118...
```

The implementer names this; the verification document closes it by simulating
the landed plan branch. I checked the half the simulation depends on rather than
trusting it: `delivery/plan/phase-declarations/m4-p15.json` on
`plan/pstack-borrow-review` at its tip is **byte identical** (`diff` clean) to
the branch's own, so the merge-base read will find a matching declaration and
the scope gate's field-by-field comparison has nothing to diverge on. Recorded
as CR-004: it bars the merge until the plan branch lands, and it is a merge
ORDER precondition, not a code defect.

Against `delivery/plan/m4-conflict-pre-pass.md` wave 3: the pre-pass names three
files, the branch touches five of its own (the two extras are
`test/kernel-charter.test.ts`, a path no other unit names, and
`test/behaviors.json`, a standing pre-authorized extra). The pre-pass's sentence
"the `agent-rules-drift` chain runs `gate-registry.yaml` to `CLAUDE.md` and
neither is touched here" is falsified by the branch's content (CLAUDE.md is +119
lines), but only through the inherited merge of `plan/pstack-borrow-review`, and
I verified `d0f245d` IS an ancestor of that branch's current tip, so merging this
branch after the plan branch cannot revert anything. No collision with the nine
concurrent units.

## 10. C-1, C-2, C-3

Greped the diff of every changed executable and data file. No `process.kill`, no
`/proc`, no pid, no signal, no `spawn` with `detached`, no `unref`, no
`appendFile`, no read of a log tail. The only hits are the charter DECLARING the
constraints and the script's prose saying a stale mtime is not a death
certificate. The script's liveness signal is mtime freshness, which is the
lease-freshness form C-2 requires. Clean.

## 11. DR-0027 reachability: measured, and the answer is no

The decisive measurement rather than an argument from directory names:

```
$ npm pack --dry-run | grep -c 'charter.yaml'
0
```

`charter.yaml` at the repository root is NOT in `package.json`'s `files`, so it
does not ship. What ships and is named "charter" is
`schemas/charter.schema.json` and `templates/charter.example.yaml`, and this
branch changes neither. Nothing under `src/`, `bin/`, `schemas/`, `roles/` or
`tuition/` is touched. `.claude/` is harness configuration and is absent from the
pack listing too.

One follow-on I checked because it would have been the way a root file reaches
shipped behaviour: `src/commands/init.ts:83` builds its fleet-marker set from
`FLEET_DIRS` plus `backlog.md` and `.git`, and `src/fleet.ts:12` lists `charter`
as a DIRECTORY. A root `charter.yaml` is not a marker, so it cannot make this
repository look like an initialized fleet home.

Byte hygiene: `node scripts/check-authored-bytes.mjs` exit 0; no control
characters and no non-ASCII in any of the phase's own files; zero `Bin` entries
in the diffstat.

## 12. What I tried to break, and how it held

Required even on APPROVE, so here is the list in the order I attacked it.

1. **I assumed the charter SHIPS and the dispatch was wrong about it.** It does
   not. `npm pack --dry-run | grep -c 'charter.yaml'` is 0. The two shipped
   charter artifacts are the schema and the template and neither is touched.
2. **I assumed test 6, the mode-resolves-by-name arm, was the fail-open guard,
   in which case it would be worthless**, because `direct-pr` IS a declared
   mode and would pass it. It is not the guard. Test 2 is, and I proved it:
   editing the root charter's one word `full` to `direct-pr` reddens test 2 and
   nothing else. The hazard the phase names is genuinely covered.
3. **I assumed test 4's two members were the same defect twice.** They are not:
   one never decodes, the other decodes and names an undeclared mode, they take
   different branches of the check, and the test asserts the second does NOT
   print the first's sentence.
4. **I assumed the schema arm would pass for the wrong reason**, because
   re-serialising YAML drops comments and could reject on its own. The test runs
   the round trip with nothing deleted as a control, first, and asserts exit 0.
   I then deleted a required block from the real charter and got exactly one
   failing test out of seven.
5. **I assumed the suite number was fine.** It is not; it is one short. I found
   the cause rather than averaging (CR-001).
6. **I assumed the new unpushed-commit guard covered its class.** It does not
   (CR-002), and I built a lab that shows the covered member red and the
   uncovered member green, which is the two-members rule applied to the guard
   itself. I then broke it a second, structurally different way (CR-003) by
   making the git call fail.
7. **I assumed the citations were decorative.** 24 of 24 resolve and say what
   the citing sentence claims.
8. **I assumed the claim grep count of nine was wrong.** It is right, and the
   arithmetic that makes 18 into 9 is exact.
9. **I assumed a root file could make this repository look like a fleet home.**
   It cannot: the marker is a `charter` DIRECTORY, not `charter.yaml`.
10. **I assumed C-1/C-2/C-3 had slipped in somewhere.** No pid, no process
    liveness, no signals, no `/proc`, no detached spawn, no log-tail read.

One out-of-scope observation, recorded because I hit it and it touches a SHIPPED
file this branch does not change: `node bin/tiphys.ts validate --type verdict`
with no `--context` exits **1** on a document that is schema-valid, including the
shipped fixture `witness/fixtures/dual-review/decorrelated-criteria.yaml`, and
prints only SKIPPED lines. So its exit code does not distinguish "invalid" from
"derived checks could not run". That may be deliberate fail-closed design, and I
cannot show it is wrong, so it is recorded rather than filed. My own verdict
document was confirmed valid by compiling `schemas/verdict.schema.json` with ajv
8.20.0 under `strict: true` and running it directly: `valid: true`. The control
holds too: flipping one finding to `high` while keeping APPROVE is refused with
`#/verdict value "APPROVE" is not one of the permitted values "FIX-ROUND-NEEDED"`.

## 13. Findings

| id | severity | what | reaches shipped? |
|---|---|---|---|
| CR-001 | medium | the suite sentence quotes 855 at a head that reports 856; cause established (a test split in d3a173d, never re-measured) | no, tracked |
| CR-002 | medium | the new unpushed-commit guard examines only the FIRST local branch of a phase, and truncates the worktree watch set the same way without firing its own empty-set warning | no, tracked |
| CR-003 | medium | the same guard reports zero when its git call fails, because `git()` swallows the error and `parseInt("") \|\| 0` is 0 | no, tracked |
| CR-004 | medium | the `scope` gate is RED and bars the merge until the plan branch lands; the declaration on that branch is byte-identical, so the ordering fix is verified | no, but it is a hard merge precondition |
| CR-005 | medium | one phase id, two subjects, two branch names; the plan's own criterion 5 (a change to shipped `src/commands/doctor.ts`) is left with no owner | indirectly, tracked |
| CR-006 | low | the work history's item-4 not-covered statement is contradicted by the branch's own last commit and by the verification document it carries | no, tracked |

No HIGH. No CRITICAL. Nothing on this branch makes a shipped artifact wrong.

## 14. Verdict

**APPROVE**, with one hard merge precondition that is not mine to waive.

Under DR-0027 this phase changes no shipped artifact (measured, section 11), so
these findings are RECORDED rather than blocking, and this is one round. The
work is good: the phase names a real mechanism (a conditional gate whose
precondition defers its firing to the moment it becomes load-bearing for every
merge), proves it in both directions, finds a SECOND defect while doing so (the
silent acceptance of a schema-invalid charter, which I reproduced exactly), and
puts the guard on a path that does not depend on the dormant gate. The red
witnesses are red against the dangerous state rather than against the absent
feature, and I broke the charter a fourth way they had not tried and the guard
still held.

The precondition: `scope` is red until `plan/pstack-borrow-review` lands on
`main` (CR-004). Do not open a declaration-only pull request for it; the
byte-identical declaration already rides that branch.

The two findings I would most like fixed anyway, because they are in the
data-loss guard rather than in the charter, are CR-002 and CR-003.
