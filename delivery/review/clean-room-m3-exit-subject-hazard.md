# Clean-room review, HAZARD contract: M3 exit test stage E1.7

- review-contract: hazard
- framing: hazard-contract
- produced-by: Claude Opus 5 (Anthropic model family)
- subject branch: claude/exit-subject-doctor-kernel-artifacts
- head: eb13da6b96137967d4a5b8311f0f044e75758b42
- base: origin/main at 7b18144
- date: 2026-08-15
- toolchain: node v26.6.0 from the scratch prefix, confirmed in every shell

## Running log (incremental; this file's mtime is the beacon)

### 00 setup
Toolchain confirmed: `node --version` -> v26.6.0. Branches fetched.
Read the brief, the resolved 9-probe hazard checklist, and the dispatch pack's
verbatim H1..H5 table. Starting question is H1..H5, not the criteria.

### 01 the diff, and the two claims in it I can check by execution

Three-dot diffstat (base 7b18144, head eb13da6b): 11 files, 1032 insertions.
Changed shipped source: src/commands/doctor.ts only. Also test/doctor.test.ts,
test/behaviors.json, four new witness specs, one capture, and EDITS to two
M3-P8 witness specs.

The check's design note asserts two layout facts. Both are checkable, so I
checked them rather than reading them:

    cd <lab>/subject && npm ci && npm run build   # exit 0, node v26.6.0, npm 11.18.0
    ls dist            -> bin  node_modules  src  tsconfig.src.tsbuildinfo
    ls -la dist/package.json -> No such file or directory
    find dist -name doctor.js -not -path '*/node_modules/*' -> dist/src/commands/doctor.js

So "the published package puts this module at dist/src/commands/doctor.js" and
"dist/package.json does not exist" are TRUE at this head. The upward walk for
package.json therefore lands on the package root in the built layout, and on
the repository root under type stripping. That part of the PR-1 fix is real:
the resolver does not repeat kernelRoot's search for the artifact under test.

Next: attack H1 for a residual vacuous pass, since non-emptiness is a PROXY for
resolvability and proxies are where this shape hides.
### 02 H1 attacks, run against a REAL staged install of the built package

Lab: `labA/install` is a copy of the built head (dist, package.json, roles,
schemas, checklists, AGENTS.md, and the rest of the `files` list); `labA/fleet`
is a fleet made by that install's own `tiphys init`. Every run below is the
built CLI, node v26.6.0, dist built.

Baseline, complete install, `doctor --for full`:

    CHECK kernel-artifacts PASS the kernel install at .../labA/install carries
    roles/, schemas/, checklists/ and AGENTS.md

A1c: `checklists/` present, NON-EMPTY, and carrying no checklist at all
(one file `NOTES.txt`).

    doctor --for full   -> CHECK kernel-artifacts PASS ... carries ... checklists/ ...
    checklist resolve --checklist clean-room
                        -> tiphys checklist: no checklist clean-room is shipped;
                           the shipped checklists are
                           exit=1
    (control on the complete install: "checklist clean-room / probes 23")

A2: `AGENTS.md` truncated to ZERO BYTES (`: > AGENTS.md`, `ls -l` shows 0).

    doctor --for full   -> CHECK kernel-artifacts PASS ... and AGENTS.md

A3: every file in `roles/` truncated to zero bytes.

    doctor --for full   -> CHECK kernel-artifacts PASS

A1/A1b: `roles/` containing only an empty subdirectory, and `roles/` containing
only `README.txt`: both PASS.

These are H1 by its own words: the check reports PASS on an install that
resolves nothing. Criterion 3 closed the empty-DIRECTORY form and the
non-emptiness test is a PROXY for resolvability, so the proxy's gap is where
the shape moved to. See CR-001 and CR-002 below.

A2b (control that the guard is not simply absent): `AGENTS.md` replaced by a
DIRECTORY -> FAIL naming `AGENTS.md (irregular: ... is a directory ...)`. So
the type check is real; it is the CONTENT that is unchecked.

### 03 H5 battery: six shapes, no hang in the new code

Each run `timeout 10 tiphys doctor`, default profile:

    F1 FIFO at AGENTS.md            -> WARN "AGENTS.md (irregular: ... named pipe ...)"  no hang
    F2 FIFO replacing roles/        -> WARN "roles/ (ENOTDIR)"                            no hang
    F3 FIFO INSIDE roles/           -> PASS (readdirSync counts members)                  no hang
    F4 symlink AGENTS.md -> FIFO    -> WARN "irregular: ... named pipe"                   no hang
    F5 dangling symlink AGENTS.md   -> WARN "AGENTS.md (dangling)"                        no hang
    F6 symlink loop at AGENTS.md    -> WARN "unexaminable ... ELOOP"                      no hang

The new code's guard is real: `classifyEntry` on a FIFO returns
`{"kind":"irregular", ...}` in bounded time, measured directly. Criterion 11 is
genuinely discharged for the four paths the check names.

### 04 BUT: tiphys hangs forever on a FIFO at package.json (A5)

The mechanism criterion 11 is written against is "reading a path whose type has
not been established". The change closed it at its own call site and there are
TWO OTHER instances of the same walk, both still using existsSync + readFileSync:
src/version.ts:15 and src/commands/doctor.ts:72.

Forced, not reasoned about:

    rm -f install/package.json && mkfifo install/package.json
    (cd fleet && timeout 15 node install/dist/bin/tiphys.js doctor)
      -> timeout/exit=124, ZERO bytes of output

Every entry point hangs, not only doctor:

    version  exit=124
    --help   exit=124
    doctor   exit=124
    status   exit=124

`--help` hanging places the block at CLI startup, in readOwnVersion
(src/version.ts:20), before any command runs. Attribution measured at the BASE
commit 7b18144, same lab, same construction: `tiphys --help` exit=124 there
too. So the hang is PRE-EXISTING and is not introduced by this change. It is
recorded as CR-003 because the phase declares H5 closed and the class is wider
than the four paths it instrumented.

### 05 the strongest form of the H1 attack, with the environment neutralised

Criterion 4's "the FAIL count is zero" needs `gh` on PATH and a remote, which
this container lacks (standing warning 6). Both were supplied: a stub `gh`
printing a version line, and `git remote add origin` in the fleet. Control, the
COMPLETE install:

    CHECK gh PASS gh version 2.62.0 (2024-11-14)
    CHECK remote PASS remote configured (origin)
    CHECK kernel-artifacts PASS ... carries roles/, schemas/, checklists/ and AGENTS.md
    exit=0   FAILcount=0

That independently reproduces case 1 of the shipped capture. Now the same
install with `checklists/` gutted to one unrelated file AND `AGENTS.md`
truncated to zero bytes:

    CHECK kernel-artifacts PASS ... carries roles/, schemas/, checklists/ and AGENTS.md
    exit=0   FAILcount=0
    $ tiphys checklist resolve --checklist clean-room
    tiphys checklist: no checklist clean-room is shipped; the shipped checklists are
    exit=1
    $ ls -l AGENTS.md -> 0 bytes

`doctor --for full` says the install carries them. It does not. This is CR-001.

### 06 probes 3, 4, 5, 6, 7: derivations and results

Probe 3 (what can be LOST) and probe 5 (what can DESTROY): derivation over the
ADDED source lines rather than over my reading,

    git diff 7b18144...eb13da6b -- src/ | grep '^+' | grep -E \
      'writeFileSync|appendFileSync|renameSync|rmSync|unlinkSync|mkdirSync|openSync|spawnSync|execSync'
    -> grep exit 1, no hits

Instrumented anyway: 30 runs of `doctor --for full` SIGKILLed 50ms in. The
install's file set md5 is byte-identical before and after
(26b615fe1ca413599730b23809fbefe9), and the check still reports PASS. What this
does NOT cover: the rest of doctor writes nothing either, but I did not probe
the fleet state directory, only the install.

Probe 4 (what can NEVER EXIT): 24 concurrent `doctor --for full` against one
install and one fleet, each under `timeout 60`. Elapsed 4s, all 24 exited 1
(gh and remote missing in that lab), zero timeouts. The new check takes no
lease and opens nothing, so no contention exists to force; that is a real
result and not a cleared one, see the failed-attacks section.

Probe 6 (C-2 liveness vocabulary): no file under `roles/`, `checklists/`,
`AGENTS.md` or `assurance-modes.yaml` is changed by this diff
(`git diff --name-only ... | grep -E '^(roles/|checklists/|AGENTS.md|assurance-modes.yaml)'`
exits 1). And no added line anywhere in the diff carries pid, /proc, "process
liveness", SIGKILL, kill( or signal (grep exit 1). Nothing here defines
completion in terms of a process being alive.

Probe 7 (clause text matches row): the diff adds exactly one clause heading,
`## clause mechanism-lookup`, and it is in the work history rather than in a
clause-mapped artifact. `clause-map` was green at 74 units in the phase's own
run. No mapped clause text is changed by this diff, so this probe has no pair
to compare.

## Findings

### CR-001, MEDIUM: presence is a proxy for resolvability, and the proxy is reachable in four shapes

**The MECHANISM, not the instance.** The check tests that a required path is
PRESENT (`readdirSync(...).length > 0` for a directory at src/commands/doctor.ts:709,
`classifyEntry(...).kind === "regular"` for the file at src/commands/doctor.ts:729)
and reports success as `carries roles/, schemas/, checklists/ and AGENTS.md`,
which is a claim about RESOLVABILITY. Criterion 3 closed one instance of the gap
between those two, the empty directory. The mechanism has three more, and the
phase's own work history NAMES the mechanism at
delivery/work-history/exit-subject-doctor-kernel-artifacts.md:122 as "directory
emptiness as a proxy for resolvability" with "no entry" in the mechanism index,
then ships the proxy without probing its residue.

Every instance forced against a real staged install of the built package, not
reasoned about:

| instance | staged state | `doctor --for full` | the command that needs it |
|---|---|---|---|
| directory carrying no resolvable member | `checklists/` = one `NOTES.txt` | **PASS**, exit 0, FAIL count 0 | `checklist resolve --checklist clean-room` -> "no checklist clean-room is shipped; the shipped checklists are", exit 1 |
| directory carrying only a subdirectory | `roles/` = one empty subdir | **PASS** | not separately probed |
| directory whose members are all zero bytes | every `roles/*.md` truncated | **PASS** | not separately probed |
| FILE present and zero bytes | `AGENTS.md` truncated to 0 | **PASS** | AGENTS.md is the policy document; an empty one states no policy |

The last row is the sharpest, because it is the FILE member of the class and the
emptiness reasoning was applied to the directory member only. The plan's own
words for the directory member, "an install that carries an empty roles/
resolves no role", are true word for word of a zero-byte AGENTS.md.

**Reachability (DR-0027).** Shipped `src/commands/doctor.ts`, in the check's
success path, reached by the ordinary CLI with no test harness. The real user
path is a partial extract, an interrupted sync, or a `files` list that ships a
directory whose contents were filtered: the states this check exists to
diagnose. Under the combined attack the whole command exits 0 with FAIL count 0
and prints a positive assertion that is false, which is also an R-087 shape.

**Concrete fix.** Give each required directory a RESOLUTION PREDICATE rather
than a count: at least one entry that the consuming command would actually
resolve (`roles/*.md`, `schemas/*.schema.json`, `checklists/*.yaml`), ideally by
calling the same predicate the brief composer, validator and checklist command
use, so the check cannot drift from them. Give `REQUIRED_KERNEL_FILES` a size
floor (`statSync(path).size > 0`) with the detail `AGENTS.md (present but
empty)`. Add one staged test per shape, and extend
witness/doctor-kernel-artifacts-empty-directory.json with a member that defangs
the new predicate.

### CR-002, MEDIUM: H5's mechanism is closed at one call site and open at two, and tiphys hangs forever at one of them

**The mechanism** is the mechanism index's `reading-a-path-whose-type-is-not-established`,
which this change cites by name at src/commands/doctor.ts:724 and satisfies at
its own call site. The fix-round contract requires the derivation over every
call site of the mechanism. Neither the change nor the work history publishes
one. Derived here:

    grep -n "readdirSync\|existsSync" src/commands/doctor.ts
    72:    if (existsSync(candidate)) {          <- the same upward walk, then readFileSync
    190, 505, 554: existsSync used as a boolean, no read follows
    src/version.ts:15: if (existsSync(candidate)) { ... readFileSync

Two of those establish presence and then OPEN the path: src/commands/doctor.ts:72
(`readKernelEnginesNode`) and src/version.ts:15 (`findOwnPackageJson`). Forced:

    rm -f install/package.json && mkfifo install/package.json
    cd fleet && timeout 15 node install/dist/bin/tiphys.js doctor
    -> exit 124, ZERO bytes of output

    version exit=124   --help exit=124   doctor exit=124   status exit=124

`--help` hanging locates the block at CLI startup in readOwnVersion
(src/version.ts:20), before any command runs.

**Attribution, measured rather than assumed.** The same construction against a
build of the BASE commit 7b18144: `tiphys --help` exit 124. The hang is
PRE-EXISTING and this change did not introduce it. What this change did is
declare the class addressed while two instances of its own cited mechanism
remained in the file it edits and the module it depends on, with no derivation
stating what was covered.

**Reachability (DR-0027).** Shipped src/, on the code path EVERY tiphys
invocation takes, and the threat model is the one criterion 11 already accepts
as real. What I did NOT establish: how a FIFO comes to sit at an installed
package's package.json in practice. I could not construct a non-adversarial
route to it, and I state that as a limit rather than as a clearance.

**Concrete fix.** Route both walks through `classifyEntry`, which this change
already imports into doctor.ts, and hoist the shared walk into one function so
there is one call site rather than three. Publish the derivation above, with its
exclusions, in the work history.

### CR-003, LOW: a test name states an outcome the test does not assert (R-087)

test/doctor.test.ts:651 is named "a staged install missing roles/ is a FAIL
naming roles/" and its body asserts `result.status` equals `"WARN"`. The check
returns WARN plus the condition and the PRINTER promotes it under `full`, so the
name is a true statement about the CLI and a false one about this test. R-087
puts a false claim in a test name in the findings rather than in the notes,
because the reported name is what a later reader trusts.

**Reachability.** Test text only; no shipped behaviour. Low.

**Concrete fix.** Rename to name the condition it asserts, for example "a staged
install missing roles/ carries kernel-artifacts-incomplete, which full promotes
to FAIL", and update the value in test/behaviors.json, which must equal the
reported test name.

### CR-004, LOW: the unresolvable arm is unreachable through the CLI and nothing says so

Criterion 10's arm is real at the unit level and dead at the command level.
Measured with `dist/` copied to a directory with no package.json above it:

    tiphys doctor -> exit 1, "tiphys: package.json not found above file://.../doctor.js"

That satisfies the criterion's letter (exit 1, not an uncaught error), and it
comes from readOwnVersion's handler at CLI startup, never from
`checkKernelArtifacts`. The comment at test/doctor.test.ts:713 says "The success
path is total ... so removing the explicit failure would be visible rather than
being covered by a crash", which is true of the function; I did not find a
way to demonstrate it through the command, because the process refuses earlier.

**Reachability.** A documentation claim, not shipped behaviour. Low.

**Concrete fix.** One sentence in the source comment above
`resolveInstalledKernelRoot` and in the work history: the unresolvable arm is
witnessed at the unit level only, because the CLI refuses earlier in
src/version.ts:20.

### CR-005, LOW: the exit test's own E1.7 context cannot make `verdict-deviations-judged` non-vacuous

Scoped to the STAGE, not to the subject change. `tiphys validate --type verdict
--context <dir>` runs `verdict-deviations-judged`, which reads `work-history.yaml`
from the context directory (src/checks.ts:2359) and compares its
`deviations[].plan-clause` against the verdict. The exit-test bundle ships no
`work-history.yaml` for this subject: the only work history in it is
`e1/e1-6/work-history-copy.md`, markdown. So the reviewer must author the
document the check compares the reviewer's own array against, which makes the
check vacuous for this stage while still exiting 0. That is the same shape the
verdict schema's own comment warns about for `hazard-classes-addressed`.

**Reachability.** The exit test's evidence, not shipped src/. Low.

**Concrete fix.** Have E1.6 emit `work-history.yaml` as a validated
`work-history` instance beside the markdown, and have the E1.7 dispatch name the
context directory rather than leaving each reviewer to assemble one.

## Attacks that FAILED, which bound what a later reader need not re-check

Each is what I tried, what I expected, and what happened. A failed attack is a
result; none of these is a clearance of the whole class.

1. **Make the resolver answer about an ancestor (the PR-1 high, re-attacked).**
   Expected: a staged install with `roles/` removed inside a parent carrying
   `roles/implementer.md` would resolve to the parent. Ran the CLI, not the
   unit: `CHECK kernel-artifacts FAIL ... is missing roles/ (absent) (required
   for profile full)`, exit 1. The decoy did not shadow it. The search key is
   `package.json`, which is not a member of the audited set, so the class of
   attack that killed `kernelRoot` does not apply. **The fix is real.**
2. **Break the layout assumption behind the walk.** Expected `dist/package.json`
   to exist and stop the walk one level too low, which would make the check FAIL
   on every published install. Measured after `npm ci && npm run build` at the
   head: `ls dist` gives `bin node_modules src tsconfig.src.tsbuildinfo`, no
   `dist/package.json`, and doctor.js is at `dist/src/commands/doctor.js`. The
   design note's two layout claims are TRUE.
3. **Hang the new check on a named pipe.** Six shapes (FIFO at AGENTS.md, FIFO
   replacing roles/, FIFO inside roles/, symlink to a FIFO, dangling symlink,
   symlink loop), each under `timeout 10`. None hung; each produced a named
   refusal. **H5 is genuinely closed for the four paths the check names.** It is
   NOT closed one step earlier on the same walk, which is CR-002.
4. **Reach the vacuous pass through a directory REPLACED by a file or a pipe.**
   Expected `readdirSync` on a non-directory to be swallowed. It is not:
   `roles/ (ENOTDIR)` is reported. The catch arm names the errno rather than
   collapsing to "absent".
5. **Force loss or destruction.** Derivation over the added source lines found
   no write, rename, unlink or spawn (grep exit 1). 30 SIGKILLs mid-run left the
   install's file set byte-identical. **Nothing in this change can lose work**,
   as far as the install is concerned; I did not probe the fleet state directory.
6. **Force a never-exit.** 24 concurrent `doctor --for full` against one install
   and one fleet finished in 4s with no timeout. The check takes no lease and
   holds no lock, so there is no contention to construct. I could not build a
   collision here; that is a statement about my attempts, not a proof that none
   exists.
7. **Find a hard-coded registry count in the new test.** Criterion 8's grep and
   my own returned 0; resolution is by name at test/doctor.test.ts:782. The
   append-only-registry trap is avoided.
8. **Catch the two edited M3-P8 witness specs being DEFANGED rather than
   repaired.** Compared old and new mutation text. Old: delete
   `retention-undeclared` from the `full:` array. New: rename it to
   `retention-undeclared-DEFANGED`, which removes it from the array just as
   effectively. Old for the sibling: append `retention-not-applicable`. New:
   the same append, re-quoted against the reformatted array. Both preserve the
   dangerous state, and the `find` text `    "retention-undeclared",` occurs
   exactly once in the file (grep -c = 1), so neither mutation is ambiguous. I
   then RAN the gate: `red-witness green, 7 witnesses (6 own, 1 stored
   re-evaluated), every witness red against every declared dangerous state and
   green at head`, runner exit 0. **Repaired, not weakened.**
9. **Find a claim-grep violation in the work history.** Line-based binding grep:
   4 hits, all benign ("was therefore never the source", "binds a witness",
   "cannot be applied to anything", "was never about that arm"). Wrap-
   insensitive form: also 4. No over-claim found.
10. **Catch the gate table being quoted at a different head.** The work history
    names head 25e9df73 for its expected-status table while the head under
    review is eb13da6b. `git diff --stat 25e9df7 eb13da6` is one file, the work
    history itself, 89 insertions. The difference is disclosed in the document
    and is documentation-only. **Not a finding**, and recorded so the next
    reader does not re-derive it.

## What I did NOT cover

- **The criteria contract.** Another reviewer holds it. I walked the criteria
  LAST and my `criteria[]` entries are a hazard reviewer's reading of them.
- **`main`'s post-merge push-event run.** No merge has happened; T-009's second
  rule is the orchestrator's to discharge.
- **The full suite count at this head.** `node --test test/doctor.test.ts`
  reported 30 tests, 30 pass, 0 fail, 0 skipped on node v26.6.0 with `dist/`
  built; the whole-suite run was still going when this was written and its
  number is quoted separately below if it landed.
- **The scope audit.** Not applicable on this branch by the orchestrator's I-3
  ruling, so nothing asserts this change's file set. The work history says so
  itself. I did not re-derive it.
- **Whether a FIFO at an installed package.json arises non-adversarially.**
  Stated in CR-002 as an open question rather than as either a clearance or an
  alarm.
- **The fleet state directory under SIGKILL.** I probed the install only.
- **`npm pack` on a real registry install.** I staged from the built tree with
  the `files` list applied by hand rather than by `npm pack`, so a packing bug
  that drops a directory would not have been visible to me. The work history
  cites a 181-file pack listing; I did not reproduce it.

## The verdict instance and the validator

Verdict at .../scratchpad/rev-e17-hazard/verdict-hazard.yaml. Context directory
assembled at .../scratchpad/rev-e17-hazard/ctx, holding `plan.yaml` (the exit
test's own `e1/plan-kernel-artifacts.yaml`, unmodified) and `work-history.yaml`,
which THIS REVIEWER wrote because the bundle ships none; that is CR-005 and the
file says so in its own header.

    node bin/tiphys.ts validate --type verdict --context <ctx> verdict-hazard.yaml
    VALIDATOR EXIT=0
    REPORT dual-review-decorrelation <ctx> declares no delivery mode (no
      charter.yaml), so the verdicts for phase M3-P13 were NOT evaluated
      against a merge-authority regime

**Exit 0 alone is a bundle-level green, so three negative controls were run to
show the three required checks actually assert on this document.** Each is one
edit to a copy, everything else unchanged, and no pipeline, so `$?` is the
validator's and not `tail`'s (the dispatch pack records that exact trap):

| control | exit | message |
|---|---|---|
| the H5 entry removed | **1** | `INVALID #/hazard-classes-addressed hazard class H5 ... has no entry, so this hazard review did not address it (check: verdict-hazard-classes-addressed)` |
| the criterion-7 walk removed | **1** | `INVALID #/criteria acceptance criterion 7 ... has no entry, so this review did not walk it (check: verdict-criteria-complete)` |
| `deviations-judged` emptied | **1** | `INVALID #/deviations-judged deviation computed from import.meta.url WITHOUT searching upward is declared in ... and this review did not judge it (check: verdict-deviations-judged)` |

**A measurement worth carrying: putting `charter.yaml` in the context directory
makes the stage UNSATISFIABLE for an uncommitted verdict.** With the bundle's
charter and `assurance-modes.yaml` copied in, the run turns
`INVALID #/phase this verdict is not among the 0 verdict document(s) committed
under delivery/review for phase M3-P13`, exit 1. A clean-room reviewer commits
nothing by contract, so `dual-review-decorrelation` can only be satisfied after
the orchestrator lands the document. The context that makes E1.7 exit 0 is
therefore the plan-and-work-history one, and the decorrelation judgement is the
orchestrator's separate step, which is what the REPORT line says.

## Verdict

**FIX-ROUND-NEEDED**, on CR-001.

CR-001 is not a criteria failure: all eleven criteria are met and I measured
every one of them. It is the hazard the phase declared as H1, still reachable in
the shipped check, in three shapes the criteria do not name and one, the
zero-byte file, where the phase's own reasoning was never applied to the FILE
member of its own class. Under DR-0027 a medium blocks when it reaches a shipped
artifact or a real user path, and this one reaches `src/commands/doctor.ts` on
the ordinary CLI path, ending in a command that exits 0 with FAIL count zero
while printing a positive assertion that is false.

CR-002 is a medium whose defect is PRE-EXISTING, measured at the base. It should
not on its own hold this change, and the half that belongs to this round is the
missing derivation the fix-round contract requires; I would route the hang
itself as its own item rather than folding it into this phase.

CR-003, CR-004 and CR-005 are lows and none of them blocks.

What would change my verdict: a resolution predicate per required directory and
a size floor on the file member, each with a staged test and a witness member,
which is one round of work in the file the phase already owns.

## A note on the citations in this document (CLAUDE.md:155)

Every `path:line` above was verified against the BRANCH head eb13da6b, not
against `main`. Three of the cited files are changed by the branch, so on `main`
those lines are different or absent:

    git diff --name-only origin/main...eb13da6b
    src/commands/doctor.ts
    test/behaviors.json
    test/doctor.test.ts
    witness/... (five specs and one capture)
    delivery/work-history/exit-subject-doctor-kernel-artifacts.md

If this review is landed on `main` before the subject is, the citations into
`src/commands/doctor.ts`, `test/doctor.test.ts` and the work history must be
QUOTED into backticks rather than left resolving, which is the T-019 collision
CLAUDE.md:155 records. The citations into src/version.ts, src/task.ts and
src/checks.ts are into files the branch does not change and resolve on both
sides; that was checked with the command above rather than assumed.

## The claim grep, run against this document

    grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' \
      clean-room-m3-exit-hazard.md
    -> 9 matching LINES

    tr '\n' ' ' < clean-room-m3-exit-hazard.md | grep -oEi '<same alternation>' | wc -l
    -> 10 OCCURRENCES

The gap of one is not a wrap miss: line 382 carries two hits ("cannot be applied
to anything" and "was never about that arm"), both of them quotations OF the
work history rather than claims of mine, and the line-based form counts that line
once. Every remaining hit is either a probe title ("what can NEVER EXIT") or a
statement with its captured command beside it. Two were rewritten after this
grep rather than defended: a table cell reading "members are counted, never
opened" now names the call (`readdirSync`), and "cannot be demonstrated through
the command" is now "I did not find a way to demonstrate it through the
command", which is the true sentence.

## Suite result, the complete sentence

**Invocation** `node --test test/doctor.test.ts`. **Toolchain** node v26.6.0 from
the scratch prefix, confirmed with `node --version` in the shell that ran it.
**Build state** `dist/` present (`npm ci` then `npm run build`, both exit 0).
**Reported: tests 30, pass 30, fail 0, SKIPPED 0**, exit 0. That is criterion 6's
command, and it is the strongest number I own.

The WHOLE-SUITE run (`npm test`, same toolchain and build state) was started
twice and did not finish inside my budget on this container; the first attempt
was killed by a two-minute foreground limit and the second was still running when
this document closed. So I do NOT independently confirm the work history's 847 /
847 / 0 skipped; the `suite` gate reported 847 units green in the phase's own run
and I read that as the phase's evidence rather than as mine.

