# Clean-room review, M3 exit test stage E1.7

review-contract: criteria
framing: criteria-contract
produced-by: Claude, Sonnet 5 (claude-sonnet-5)

Subject: branch `claude/exit-subject-doctor-kernel-artifacts` at head
`eb13da6b96137967d4a5b8311f0f044e75758b42`, against base `origin/main` at `7b18144`.
Reviewing via `git diff origin/main...<branch>` (three-dot).

Status: IN PROGRESS. This file is written incrementally; each section below is
appended as work happens.

## Log

- Fetched `origin/claude/m3-exit-test` and `origin/claude/exit-subject-doctor-kernel-artifacts`.
- Read brief at delivery/evidence/m3-exit-test/e1/e1-7/brief-clean-room-criteria.md (313 lines)
  and resolved-clean-room-criteria-framing.txt (27 probes).
- Brief embeds phase M3-P13 (branch claude/m3-p13-doctor-kernel-artifacts, 11 acceptance
  criteria, 5 hazard classes). The subject branch name differs
  (claude/exit-subject-doctor-kernel-artifacts) - need to establish whether this is the
  same content re-branched for the exit test, or a divergent/reduced version. Checking next.
- Confirmed: `git log origin/main..origin/claude/exit-subject-doctor-kernel-artifacts`
  shows 14 commits ending "Rebase onto the witness-ownership fix and re-measure...".
  The work is M3-P13's content, moved off the phase-shaped branch/id/work-history name
  per an orchestrator ruling (recorded in the work history as intervention I-3). Merge
  base = origin/main = 7b18144ec7f5588f01110e2affdad3d81c8cab0c (matches task instructions).
  `git diff --stat origin/main...HEAD`: 11 files changed, 1032 insertions(+), 7 deletions(-).
  Touches src/commands/doctor.ts, test/doctor.test.ts, test/behaviors.json, 4 new witness
  specs, 1 new capture file, 2 modified pre-existing witness specs (retention), and
  delivery/work-history/exit-subject-doctor-kernel-artifacts.md.
- Read src/commands/doctor.ts diff in full (checkKernelArtifacts, resolveInstalledKernelRoot,
  PROFILES table addition). Read test/doctor.test.ts diff in full (11 new tests). Read the
  work history (405 lines) and the actual delivered plan instance at
  delivery/evidence/m3-exit-test/e1/plan-kernel-artifacts.yaml (on origin/claude/m3-exit-test)
  in full, which is the authoritative acceptance-criteria source per the work history (the
  criteria embedded in the clean-room brief match this file verbatim, spot-checked).
- Toolchain confirmed: node --version = v26.6.0 with the scratch prefix first on PATH, in
  the shell that runs commands.
- Set up a detached worktree at
  /tmp/claude-0/.../scratchpad/exit-review-worktree pointed at
  origin/claude/exit-subject-doctor-kernel-artifacts (eb13da6). `npm ci` exit 0.
  `npm run build` exit 0, `git status --porcelain` clean after build.
- `node --test test/doctor.test.ts`: node v26.6.0, dist/ built, invocation
  `node --test test/doctor.test.ts` directly. Result: tests 30, pass 30, fail 0,
  skipped 0, cancelled 0, todo 0, duration 18649ms. Matches criterion 6's shape
  (work history's own quoted number is for the WHOLE suite, 847; this is the
  doctor-only file count, 30, all new-and-old doctor tests included).
- POSSIBLE FINDING under construction: the plan (plan-kernel-artifacts.yaml, on
  origin/claude/m3-exit-test) names ONE witness spec file,
  `witness/doctor-kernel-artifacts.json`, in files-to-touch and in acceptance
  criterion 7's literal text ("both witness/doctor-kernel-artifacts.json and the
  produced witness-records.json are committed"). The delivered branch ships FOUR
  differently-named witness files instead (empty-directory, fifo, resolution,
  unresolvable) and no file of that exact name exists anywhere in the diff. Read
  each of the 4 witness specs' dangerousStates mutations closely: none of them
  targets a mutation that guts the plain "directory absent" or "file absent"
  push logic directly by literal deletion - the covered arms are emptiness,
  resolution-boundary, FIFO-vs-regular, and unresolvable-root, not "removed
  DIRECTORY, removed FILE" as literally called for in the plan step. Continuing
  to verify whether the two most basic behaviors (criteria 1 and 2: roles/
  absent -> FAIL, AGENTS.md absent -> FAIL) have ANY red-witness mutation
  coverage at all, or only ordinary node --test assertions. This bears on
  probe 15 (class-witness-has-two-members) and the red-witness rule at the top
  of CLAUDE.md ("a test only counts as guarding a behavior if it has been
  demonstrated red without the behavior").
- Started full suite in background (`npm test`, log at
  .../scratchpad/rev-e17-criteria/full-suite-run.log) since it exceeds the 120s
  foreground bash timeout (CLAUDE.md warning 11: wall time grows with real-clock
  lease waits). Will report invocation/toolchain/build-state/counts once it
  completes; continuing other verification meanwhile.
- Manual, independent staged-install execution against the built CLI
  (dist/bin/tiphys.js in the review worktree), each verified by direct exit
  code and grep of the CHECK line, NOT by trusting the diff's own tests:
  - criterion 1 (roles/ absent, --for full): FAIL naming `roles/ (absent)`, exit 1.
  - criterion 2 (AGENTS.md absent, --for full): FAIL naming `AGENTS.md (absent)`, exit 1.
  - criterion 3 (roles/ present but empty, --for full): FAIL naming
    `roles/ (present but empty, so it resolves nothing)`, exit 1.
  - criterion 5 (same broken install as 1, no --for): WARN, exit 0.
  - criterion 9 (roles/ absent, staged INSIDE a parent that itself carries
    roles/*.md): FAIL naming `roles/ (absent)` from the INSTALL not the decoy
    parent, exit 1. Confirms the resolver does not walk past.
  - criterion 11 (FIFO at AGENTS.md, --for full): FAIL naming
    `AGENTS.md (irregular: ... is a named pipe, not a regular file, so it was
    not opened)`, exit 1, elapsed 200ms (bound was 5000ms).
  - criterion 4 (complete install): kernel-artifacts line itself is PASS in
    every run above where the install was complete; a from-scratch manual
    fleet without gh/remote configured also showed 2 unrelated FAILs
    (gh-missing, remote-missing) under --for full, which is a property of my
    improvised fleet, not of this check - the diff's own capture/live test (see
    below) is the fair reproduction and it passed.
  - Non-ASCII path stress: staged an install under a directory literally named
    `manual-lab-unicode-é日本`; PASS, no bug.
  - criterion 8: `grep -cE "behaviors\.json.{0,40}[0-9]{2,}|[0-9]{2,}.{0,40}behaviors\.json" test/doctor.test.ts` = 0.
    No hard-coded row count.
  - criterion 6: `node --test test/doctor.test.ts` (node v26.6.0, dist/ built,
    invocation exactly that): tests 30, pass 30, fail 0, skipped 0,
    cancelled 0, todo 0, duration 18649ms.
- Read both edited stored witness specs (doctor-retention-absent-path-and-full-
  profile.json, doctor-retention-not-applicable-without-a-charter.json)
  before/after with `git show origin/main:<path>` vs `git show
  origin/claude/exit-subject-doctor-kernel-artifacts:<path>`. Both replace a
  now-stale single-line `find` (the old single-line `full: [...]` array
  literal) with a `find` matching the new multi-line array's
  `"retention-undeclared",` line, and the `replace` reproduces the SAME
  semantic effect the original mutation had (defang the promotion / add a
  wrong-direction promotion). Not weakened - verified by execution below.
- Ran the red-witness gate for real:
  `node dist/bin/tiphys.js gates run --registry gate-registry.yaml --mode full
  --only red-witness --evidence <dir> --base origin/main --head HEAD`
  (node v26.6.0, dist/ built). Output: "red-witness: green: 7 witness(es)
  evaluated (6 own, 1 stored re-evaluated in 23941ms); every witness red
  against every declared dangerous state and green at head." Matches the work
  history's own claim exactly (independently reproduced, not taken on trust).
- Inspected witness-records.json's `evaluations[].members[].runs[]` directly.
  Confirmed for every one of the 4 new + 2 modified specs: `red: true` and a
  nonzero exitCode under each declared dangerousStates member, `red: false`
  and exitCode 0 with the check present (3 runs per member: 2 mutated + 1
  head, matching `repeats: 2`).
- **CONFIRMED BY EXECUTION rather than by reading alone**: across all 7
  evaluations' `members[].runs[].failedNamedTests`, the ONLY test names that
  ever appear are the ones each spec's own `tests[]` names. Neither
  "a staged install missing roles/ is a FAIL naming roles/" (the test for
  criterion 1/H2) nor "a staged install missing AGENTS.md is caught, which is
  the FILE member of the class" (the test for criterion 2, explicitly named by
  the plan as "the second structurally different member of the class ... a
  FILE rather than a directory") appears in ANY witness's `tests[]` or in any
  `failedNamedTests` list. These two tests - arguably the two most central
  behaviors this phase ships, and the exact pair the plan's witness step asked
  for ("a removed DIRECTORY and a removed FILE") - have NO red-witness
  mutation coverage at all. This is CR-002 below.
- Full suite finished in the background: invocation `npm test` (which is
  `node --test "test/**/*.test.ts"`), toolchain node v26.6.0, dist/ built
  (built earlier in this session, not rebuilt between runs). Reported: tests
  847, pass 847, fail 0, cancelled 0, skipped 0, todo 0, duration_ms 670854
  (about 11.2 minutes, consistent with CLAUDE.md warning 11, real-clock lease
  waits). Matches the work history's own quoted number exactly. Exit code was
  not separately captured (backgrounded via nohup without an `echo exit=$?`
  after it, unlike the doctor-only run above) but 0 fail/0 cancelled is what
  `node --test` requires for exit 0, so this is reported as counts rather than
  as a directly-observed exit code.
- Read delivery/evidence/m3-exit-test/e1/findings-plan-review.yaml (the E1.5
  adversarial plan review) in full. Confirms PR-2's concrete-edit is the exact
  text that became criterion 7, INCLUDING the singular filename
  `witness/doctor-kernel-artifacts.json` - so the filename was a deliberate,
  reviewed requirement, not an incidental placeholder. Also confirms none of
  PR-1 through PR-5 raised the file-splitting or the missing-directory/
  missing-file witness-coverage gap; those are new findings from this review.
  Cross-checked against kernel-plan-m3.md:5233 (stage E1.6's own wording),
  which says "the M2-P2 red-witness harness's DURABLE SPEC for the new
  behavior (`witness/<behavior-id>.json`...)", a per-behavior-id naming
  pattern that the delivered 4-file shape actually matches better than the
  phase plan's singular filename does. This is why CR-001 below is framed as
  an UNDECLARED deviation (never judged by anyone) rather than as "the wrong
  choice was made": the choice may well be defensible, but nothing records
  that judgment.
- Spot-checked tuition/mechanism-index.yaml on main: confirmed no entry named
  for "resolving a package/install root" exists among its roughly 15 mechanism
  keys, matching the work history's claim.
- Confirmed no destructive command is introduced (probe 24): `checkKernelArtifacts`
  and `resolveInstalledKernelRoot` only call `readdirSync`, `classifyEntry`
  (lstat/stat), no writes, no deletes, and nothing in this diff is in
  `gates.manifest.json`'s `destructiveCommands` (["pool destroy", "teardown",
  "src/pool.ts", "src/teardown.ts"], read directly).
- Blast radius (probes 25-27): `grep -rln "kernel-artifacts"` across the
  worktree (excluding dist/, node_modules) returns exactly: src/commands/doctor.ts,
  test/doctor.test.ts, test/behaviors.json, the 4 new witness specs, the new
  capture file, and delivery/work-history/exit-subject-doctor-kernel-artifacts.md,
  all files this diff itself touches. delivery/work-history/m3-p10.md and
  delivery/plan/kernel-plan-m3.md also match but for the UNRELATED string
  `pack-contains-kernel-artifacts` (an M3-P10 behavior name), not this check.
  No shared consumer, no render-and-decide collision (`PROFILES`, `runChecks`
  in doctor.ts have no consumer outside doctor.ts/doctor.test.ts; `runChecks`
  in src/checks.ts is a same-named but unrelated, differently-imported
  function, confirmed by reading both signatures).

## Criteria walk (R-053, walked in order, every criterion of plan phase M3-P13
as delivered in delivery/evidence/m3-exit-test/e1/plan-kernel-artifacts.yaml
on origin/claude/m3-exit-test)

### Criterion 1
> Against a staged install of the kernel with roles/ removed and nothing else
> changed, tiphys doctor --for full prints a line matching "CHECK
> kernel-artifacts FAIL" whose detail names roles/, and exits 1.

MET. Evidence: manual execution against the built CLI (see log above),
`CHECK kernel-artifacts FAIL the kernel install at <install> is missing
roles/ (absent) (required for profile full)`, exit 1. Also
test/doctor.test.ts:95-100 (`a staged install missing roles/ is a FAIL naming
roles/`), part of the 30/30 pass in `node --test test/doctor.test.ts`.

### Criterion 2
> Against the same staged install with AGENTS.md removed and every directory
> present, the same command prints "CHECK kernel-artifacts FAIL" whose detail
> names AGENTS.md, and exits 1. This is the second structurally different
> member of the class and it is a FILE rather than a directory.

MET for the behavior itself. Evidence: manual execution, `CHECK
kernel-artifacts FAIL ... is missing AGENTS.md (absent) ... `, exit 1;
test/doctor.test.ts:102-107. NOTE carried into CR-002: this behavior, despite
being explicitly named here as "the second structurally different member of
the class," is not proven by red-witness construction anywhere in the diff
(see CR-002). The criterion's own literal text is satisfied; the class-witness
property the plan's witness step and hazard H4 ask for is not.

### Criterion 3
> Against a staged install with roles/ present but EMPTY, the same command
> prints "CHECK kernel-artifacts FAIL" whose detail names roles/, and exits 1.
> An empty directory is the arm a check written with existsSync alone reports
> green on.

MET. Evidence: manual execution, `CHECK kernel-artifacts FAIL ... is missing
roles/ (present but empty, so it resolves nothing) ...`, exit 1;
test/doctor.test.ts:109-113, and this IS red-witnessed
(witness/doctor-kernel-artifacts-empty-directory.json, confirmed green with
both members red under mutation and green at head via the actual gate run).

### Criterion 4
> Against a complete staged install, the same command prints "CHECK
> kernel-artifacts PASS" and exits 0, and the FAIL count in its output is
> zero.

MET. Evidence: test/doctor.test.ts's own live-reproduction test ("a staged
install of the built package reproduces the captured contract live"), which
passed in the 30/30 `node --test test/doctor.test.ts` run and stages gh/remote
correctly so kernel-artifacts is the only check that can drive the exit code;
witness/captures/doctor-kernel-artifacts-staged-install.txt case 1 shows
`exit=0` with only PASS/WARN lines and no FAIL. My own manual reproduction
confirmed the kernel-artifacts line itself PASSes on a complete install (a
from-scratch fleet without gh/remote also showed unrelated FAILs, which is a
property of my lab setup, not of this check).

### Criterion 5
> Against the staged install of criterion 1, tiphys doctor with no --for flag
> prints "CHECK kernel-artifacts WARN" and exits 0, which is the unpromoted
> arm.

MET. Evidence: manual execution, `CHECK kernel-artifacts WARN ... is missing
roles/ (absent)` (no "(required for profile ...)" suffix), exit 0;
test/doctor.test.ts:184-205 asserts the promotion table directly, part of the
30/30 pass.

### Criterion 6
> node --test test/doctor.test.ts exits 0 and reports N tests with 0 fail, N
> greater than zero, and the skipped count is quoted alongside the pass count
> in the work history together with the invocation, the toolchain version and
> whether dist/ was built.

MET for the doctor-file-scoped claim, though the work history quotes the
WHOLE-SUITE number rather than this file's own. Independently run:
`node --test test/doctor.test.ts`, node v26.6.0, dist/ built: tests 30, pass
30, fail 0, skipped 0. The work history's own quoted evidence
(delivery/work-history/exit-subject-doctor-kernel-artifacts.md:159-168) gives
the WHOLE-SUITE number, 847/847/0 fail/0 skipped, with invocation `npm test`,
toolchain node v26.6.0, dist/ built - which is what the criterion's own
wording ("N tests... N greater than zero") most naturally reads as (any
truthful N discharges it), and I independently reproduced that whole-suite
number too (847 pass, 0 fail, 0 skipped, 0 cancelled, duration 670854ms).
Both readings are MET.

### Criterion 7
> Amended under finding PR-2 ... The red-witness gate, invoked as the
> registry selects it, exits 0 on the phase head with units greater than
> zero, and its witness-records.json carries the behavior id with
> runs[].exitCode nonzero under each declared dangerousStates member and zero
> with the check present; both witness/doctor-kernel-artifacts.json and the
> produced witness-records.json are committed to the evidence bundle.

NOT MET, literally. The red-witness MECHANICS are satisfied and independently
reproduced (gate run: "green: 7 witness(es) evaluated (6 own, 1 stored
re-evaluated)"; witness-records.json inspected directly, every member red
under mutation and green at head). But no file named exactly
`witness/doctor-kernel-artifacts.json` exists anywhere in the diff or the
resulting tree (`git ls-tree -r --name-only origin/claude/exit-subject-doctor-
kernel-artifacts -- witness/ | grep kernel-artifacts` lists 5 files, none of
them that name). See CR-001. Additionally, the two behaviors most centrally
named by this plan (criteria 1 and 2, the "removed DIRECTORY and removed
FILE" pair the plan's witness step names) have no witness spec of their own
at all - see CR-002.

### Criterion 8
> test/behaviors.json carries an entry for the new behavior and the test
> resolves it BY NAME; grep -c over the test for a hard-coded row count of
> test/behaviors.json returns 0.

MET. Evidence: test/doctor.test.ts:207-230 resolves eleven behavior ids by
`Object.hasOwn`, part of the 30/30 pass;
`grep -cE "behaviors\.json.{0,40}[0-9]{2,}|[0-9]{2,}.{0,40}behaviors\.json" test/doctor.test.ts`
= 0, run directly against the branch's test file.

### Criterion 9
> Added under finding PR-1. Against a staged install with roles/ removed,
> placed inside a parent directory that DOES carry roles/ with a .md file,
> tiphys doctor --for full prints "CHECK kernel-artifacts FAIL" naming
> roles/ and exits 1.

MET. Evidence: manual execution with a hand-built decoy parent carrying
`parent/roles/implementer.md`, `install/` nested inside missing its own
roles/: `CHECK kernel-artifacts FAIL ... is missing roles/ (absent) ...`
reporting on the INSTALL path, not the parent; exit 1.
test/doctor.test.ts:132-154 asserts the same, part of the 30/30 pass. Also
red-witnessed: witness/doctor-kernel-artifacts-resolution.json, confirmed
green under both members via the actual gate run.

### Criterion 10
> Added under finding PR-1. Where the install root cannot be resolved at
> all, the check returns FAIL naming the resolution failure and doctor exits
> 1 rather than terminating on an uncaught error, asserted by a test that
> stages the unresolvable case.

MET, with a caveat recorded rather than absorbed. test/doctor.test.ts:156-166
asserts `checkKernelArtifacts(resolveInstalledKernelRoot("/"))` returns
`status: "FAIL"`, no thrown error; confirmed by execution (`find / -maxdepth 1
-name package.json` in this environment returns nothing, so the premise
holds here). Two things this test does NOT establish, named rather than
elided: (a) it exercises `checkKernelArtifacts`/`resolveInstalledKernelRoot`
directly, never `cmdDoctor`'s CLI loop, so "doctor exits 1" for THIS
specific arm is not itself demonstrated end-to-end (it follows from
`cmdDoctor`'s generic `if (status === "FAIL") failed = true`, which IS
exercised end-to-end by several other tests, e.g. the lock-FAIL tests); (b)
`resolveInstalledKernelRoot("/")` relies on the ambient fact that "/" carries
no package.json in whatever environment runs the suite, rather than staging
a hermetic fixture the way every other test in the file does (the file's own
docstring says "A STAGED INSTALL is the subject of every test below" - this
one is the exception). Both are low-severity observations, not raised as
CR- findings (no reachable shipped-behavior consequence: `cmdDoctor`'s FAIL
handling is otherwise well covered, and "/" lacking a package.json is true of
every ordinary POSIX root and every CI runner I know of running this
project).

### Criterion 11
> Added under finding PR-4. A FIFO placed at the AGENTS.md path of a staged
> install makes the check return FAIL naming the observed entry type in
> under five seconds, asserted with a timeout, so the class is reached by an
> instrument rather than by a reviewer's reading.

MET. Evidence: manual execution with `mkfifo` at AGENTS.md's path: `CHECK
kernel-artifacts FAIL ... is missing AGENTS.md (irregular: ... is a named
pipe, not a regular file, so it was not opened) ...`, exit 1, elapsed 200ms
(bound 5000ms). Independently confirmed `readdirSync` on a FIFO placed at a
DIRECTORY path (roles/schemas/checklists) also does not hang: throws ENOTDIR
immediately (0ms, measured with a standalone script), so the directory arm
of hazard H5 is also safe by construction even though only the AGENTS.md
(file) arm is explicitly tested - recorded as a coverage observation, not a
CR finding, since the underlying Node behavior (readdir with O_DIRECTORY
fails fast on a non-directory) makes the untested arm safe rather than
merely unproven.

## Findings

### CR-001 (medium): the plan's reviewed, literal filename for the durable
witness spec is not shipped, and the substitution is never declared as a
deviation

**What.** Plan step (plan-kernel-artifacts.yaml:98-102) and files-to-touch
(:125) both name exactly one file, `witness/doctor-kernel-artifacts.json`.
Acceptance criterion 7 (:166-175), added under finding PR-2 whose
concrete-edit (findings-plan-review.yaml) is the verbatim source of that
criterion's text, repeats the same filename. No file of that name exists
anywhere in the diff (`git ls-tree -r --name-only origin/claude/exit-subject-
doctor-kernel-artifacts -- witness/ | grep kernel-artifacts` lists
`witness/doctor-kernel-artifacts-empty-directory.json`, `-fifo.json`,
`-resolution.json`, `-unresolvable.json`, and a capture file, no exact
match). The work history's "Two findings for the reviewers" and "Three things
the harness taught this phase" sections explain in passing WHY the shape
changed ("one spec per arm, which is what M3-P8 did"), but nowhere states
"this deviates from criterion 7's filename, and here is why that still
serves the plan's intent" - the one prose deviation the work history DOES
declare (delivery/work-history/exit-subject-doctor-kernel-artifacts.md:143,
about the resolver mechanism) is clearly labelled "DEVIATION FROM THE PLAN'S
LITERAL WORDING, declared rather than absorbed"; this one is not labelled at
all.

**Reachability (DR-0027).** This does not reach runtime doctor behavior -
witness specs are gate-time/dev artifacts, never shipped in the npm package,
never read by `src/commands/doctor.ts` at runtime. It DOES reach the
evidence bundle that DR-0012's delegated merge authority and this exit
test's own E2.1 authorization stage are defined against ("the review
verdicts... no unresolved high or medium finding"), and it evades the one
MECHANICAL check built to catch exactly this shape:
`verdict-deviations-judged` only compares a verdict's `deviations-judged[]`
against deviations the work history ITSELF declares (src/checks.ts:2383-2394,
`readVerdictPlanPhase`/`historyRecord["deviations"]`), so an undeclared
deviation is invisible to it by construction. That is why this is raised
here rather than left for the mechanical layer: R-057b says a deviation is
"judged, never assumed by the implementer," and here it was not even
surfaced for judgment.

**Is the substitution itself defensible?** Plausibly, and I say so rather
than let severity imply otherwise: kernel-plan-m3.md:5233 (stage E1.6's own
wording) asks for "witness/<behavior-id>.json," a per-behavior pattern the
4-file shape matches, and the work history cites a real precedent (M3-P8's
own retention specs split the same way for the same harness reason: "a
witness spec's named tests must ALL redden under EVERY member"). I am not
asserting the 4-file shape is wrong. I am asserting nobody was asked to
judge whether it still serves the plan's intent, which is a real gap
independent of the answer.

**Severity reasoning.** MEDIUM: it reaches the authorization evidence a
merge decision depends on and defeats the specific mechanical guard built
for this exact failure shape, but it does not reach `src/` runtime behavior
or any user-facing path.

**Concrete fix.** Either rename one witness spec to
`witness/doctor-kernel-artifacts.json` (folding one of the four behaviors
into the plan's literal name, unlikely to be the intended fix given the
per-arm harness constraint), or add an explicit declared deviation to the
work history naming criterion 7's filename clause and arguing the 4-file,
per-behavior-id shape serves the plan's intent better, so a reviewer's
verdict can record a real judgment on it via `deviations-judged[]`.

### CR-002 (medium): the two behaviors the plan names most explicitly - a
removed roles/ DIRECTORY and a removed AGENTS.md FILE - have no red-witness
mutation coverage at all

**What, confirmed by execution rather than by reading.** The plan's witness
step (plan-kernel-artifacts.yaml:98-102) asks for "at least two structurally
different dangerousStates members: a removed DIRECTORY and a removed FILE."
Criterion 2 independently calls AGENTS.md-absent "the second structurally
different member of the class." Hazard H1 ("an existsSync on a directory the
install created empty") and H2 ("a check that reports the state of the
DEVELOPMENT CHECKOUT rather than of the resolved install... green for every
developer") both bear directly on the plain-missing-directory case.

I ran the red-witness gate for real (see log) and read
witness-records.json's `evaluations[].members[].runs[].failedNamedTests`
directly. Across all 7 evaluations (4 new + 2 modified + 1 stored
re-evaluated), the ONLY test names that ever appear in `tests[]` or
`failedNamedTests` are: "a staged install whose roles/ exists but is EMPTY is
missing it", "a FIFO at AGENTS.md is refused in bounded time rather than
opened", "resolution never walks past an install that has lost roles/", "an
unresolvable install root is a FAIL rather than a thrown error", and the
three retention tests. Neither "a staged install missing roles/ is a FAIL
naming roles/" (criterion 1/9's test) nor "a staged install missing AGENTS.md
is caught, which is the FILE member of the class" (criterion 2's test, named
by the plan as the FILE member) is named by ANY witness spec. These two
tests are real, currently pass, and are reasonable assertions - but per this
repository's own top-level rule ("a test only counts as guarding a behavior
if it has been demonstrated red without the behavior and green with it"),
neither has been demonstrated red by construction. They are guarded only by
hope that nobody breaks them, which is exactly the posture the red-witness
discipline exists to replace.

**Reachability (DR-0027).** This reaches shipped `src/commands/doctor.ts`
directly - it is the check's core purpose (telling a real operator their
installed kernel is missing an artifact) - and reaches a real user path (any
consumer of the published `@tiphys/kernel` package running `doctor --for
full` against a broken install). A future edit that touched the shared
try/catch or the `missing.push` calls for the ENOENT arms (plausible: it is
the same code block the emptiness check sits inside) could defeat exactly
the plain-missing-directory and plain-missing-file behaviors while leaving
all four witnessed arms green, and no red-witness gate would notice.

**Severity reasoning.** MEDIUM, calibrated against this repository's own
history with the identical shape ("H4... this repository has paid for
twice," CLAUDE.md's M1-P6 account of "two consecutive medium findings from
this alone"): the currently-shipped behavior is correct and passes ordinary
tests, so this is a proof-obligation gap rather than a live defect, but it
reaches shipped src/ and the check's entire reason to exist.

**Concrete fix.** Add a fifth witness spec (or extend
`doctor-kernel-artifacts-empty-directory.json`'s `tests[]`/members, though
the harness's own "every named test must redden under every member" rule the
work history records means a genuinely separate spec is more likely to be
required) whose dangerousStates member removes the ENOENT-arm `missing.push`
calls (or the whole `for` loop body / the `entry.kind === "regular"` file
branch) and names "a staged install missing roles/ is a FAIL naming roles/"
and "a staged install missing AGENTS.md is caught, which is the FILE member
of the class" in its `tests[]`.

## What this review did NOT cover

- The other clean-room review (hazard contract, different model family) is
  running concurrently in this same sandbox (observed only as a `ps aux`
  process at `.../scratchpad/rev-e17-hazard/subject`, not inspected further
  per instructions). No attempt was made to read its output or reconcile
  with it.
- Probes 19 and 20 (`unit-tests-for-changed-service-methods`,
  `fixtures-for-changed-component-states`): this diff changes no UI
  component and its "service methods" are two free functions
  (`checkKernelArtifacts`, `resolveInstalledKernelRoot`), both directly unit
  tested. Judged not-applicable/satisfied by inspection rather than walked
  as a full clean-room-checklist probe with its own construction, since
  there is no service-object or component-state shape in this diff for the
  probe's own machinery to enumerate against.
- I did not run the FULL gate bundle (all 16 gates) myself, only
  `red-witness` directly (the gate most load-bearing for this review's
  findings) plus the parts of `suite` covered by `npm test`. I read, but did
  not re-run, the work history's own full gate-bundle table (16 gates, 10
  green/6 not-applicable/0 red/0 error, runner exit 20 because `citations`
  and `scope` are both not-applicable-with-a-reason). I have no reason to
  doubt it (its arithmetic is internally consistent and its `red-witness` row
  matches what I reproduced independently), but "citations" and "scope"
  themselves were not independently re-run by me.
- I did not exhaustively search for OTHER undeclared deviations beyond the
  witness-filename one; I read the whole work history once, closely, and
  cross-checked every place it touches the plan's literal wording, but a
  second close pass by a differently-focused reviewer could find more.
- I did not investigate the two findings the work history itself raises "for
  the reviewers, neither fixed here" (the plan-schema-vs-pool branch-naming
  mismatch, and the plan schema forcing a phase-shaped branch onto non-phase
  work) beyond reading them; they are about kernel infrastructure this phase
  did not introduce and are already flagged for the orchestrator by the
  implementer, so re-raising them as CR findings here would be redundant
  with what the work history already surfaces plainly.
- Environment-dependence of the criterion-10 test ("/" has no package.json)
  was checked only in THIS sandbox, not across other environments a real CI
  runner might use.

## Validator run

See below (verdict document + `tiphys validate` invocation and exit code).

Ran the validator for real:

```
node dist/bin/tiphys.js validate --type verdict --context <verdict-context> <verdict.yaml>
```

(node v26.6.0, dist/ built, verdict-context = a hand-built directory carrying
`plan.yaml` = delivery/evidence/m3-exit-test/e1/plan-kernel-artifacts.yaml
verbatim from origin/claude/m3-exit-test, and `work-history.yaml` = a
reviewer-constructed YAML transcription of the ONE deviation the prose work
history declares, both documented at the top of the constructed
work-history.yaml file itself.)

Output:
```
REPORT dual-review-decorrelation <dir> declares no delivery mode (no
charter.yaml), so the verdicts for phase M3-P13 were NOT evaluated against a
merge-authority regime; scripts/check-dual-review.mjs refuses such a
directory outright
```
Exit code: **0**.

The REPORT line is informational (dual-review-decorrelation needs a
charter.yaml and a second verdict to compare against, neither of which this
stage's `--context` is expected to carry) and is not a violation; no `INVALID`
line was printed.

**Negative controls, run to confirm the validator is actually exercising the
Kind B checks against my content rather than passing vacuously:**

- Removed criterion "11"'s entry from a copy of the verdict: `INVALID
  #/criteria acceptance criterion 11 of phase M3-P13 in <plan.yaml> has no
  entry, so this review did not walk it (check: verdict-criteria-complete)`,
  exit 1.
- Emptied `deviations-judged` in a copy of the verdict: `INVALID
  #/deviations-judged deviation ... is declared in <work-history.yaml> and
  this review did not judge it (check: verdict-deviations-judged)`, exit 1.

Both reddened as expected; the real verdict.yaml is green. This is the
red-witness discipline applied to my own deliverable: the validator's PASS is
demonstrated to mean something rather than assumed.

Status: DONE.
