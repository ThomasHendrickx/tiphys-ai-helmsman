# Clean-room review: M3-P11, criteria-contract lens

Reviewer: clean-room A (criteria lens). Head under review:
`claude/m3-p11-precondition-crash-verdict` at a73313d, PR #137.
Date 2026-08-13. This file was written incrementally and committed as the
round ran; its mtime was the liveness beacon.

Lens: THE ELEVEN ACCEPTANCE CRITERIA AS A CONTRACT. A second reviewer covered
the hazard lens; its report is `delivery/review/clean-room-m3-p11-hazard.md`,
quoted rather than cited because it does not exist in this tree. This review
was formed before that report was opened, and its two findings (H-1, the
readability gap in the runnability probe; M-1, the directory-prefix addition)
are NOT re-derived here.

The contract under review is delivery/plan/m3-p11-phase-spec.md:84 (criteria 1
to 7) and delivery/plan/m3-p11-phase-spec.md:169 (the amendment, criteria 8 to
11).

**VERDICT: REQUEST CHANGES.** All eleven criteria are met AS LITERALLY
WRITTEN, and I verified each by execution rather than by reading the
implementer's account. Two MEDIUM findings stand, both against change B, and
the first of them is that criterion 9's stated PURPOSE ("a silent pass is the
failure this change exists to avoid") is not delivered on the path CI and any
consumer actually takes. It is already true of this very pull request.

## NOT COVERED (read this first)

1. **CI.** I read no CI run, no check status and no job log. `gh` is
   unusable here and the brief forbids polling. Every measurement below is
   local, on node v26.6.0, and none of it is a CI result.
2. **The hazard lens.** H-1 (an unreadable-but-present command defeats the
   probe) and M-1 (a directory-prefix addition prints like a single-file one)
   were not re-derived, re-measured or re-severity-rated. My C-2 below builds
   on M-1's mechanism and says so explicitly.
3. **The new tests were not read line by line.** I checked that every new
   behaviour name resolves, that the `red-witness` gate mechanically evaluates
   the five new witness specs, and then measured the eleven behaviours MYSELF
   through the real CLI against a `main` control rather than trusting the
   tests. A test that asserts the right thing badly would not be caught by
   what I did.
4. **The full gate bundle was not run.** I ran `scope`, `red-witness` and
   `manifest-self-check` individually. I did not run
   `scripts/m2-exit-test.sh`, so the branch's claimed
   `declared 12 applicable 8 ... error 0` bundle line is unverified by me.
5. **Two of the three suite axes are taken on trust.** I measured node
   v26.6.0 with `dist/` built under `npm test` and under bare `node --test`.
   I did NOT run the default toolchain (node v22.22.2) row, and I did not run
   any no-`dist/` arm.
6. **Only the `command-exit-zero` precondition kind was exercised.** The
   `file-exists`, `file-absent`, `branch-matches` and `diff-touches` kinds
   were not run at all; the probe does not sit on their paths, but I did not
   confirm that by execution.
7. **No concurrency, claim-stealing or evidence-directory contention was
   attempted.**
8. **`delivery/` paperwork was audited only where it bears on a criterion.**
   I did not run the claim grep over the whole work history, did not check its
   citations, and did not review the phase spec, STATE.md or the decision
   records for consistency.
9. **Self-inflicted environment note, so a later reader can discount it.**
   Partway through I symlinked a scratch clone's `node_modules` at the head
   worktree's and then ran `npm ci` in the clone, which emptied the target. I
   reinstalled and rebuilt before the bare-invocation suite measurement. The
   `npm test` measurement below predates that mistake and is unaffected; both
   were taken with `npm ci` exit 0 and `npm run build` exit 0 in the tree that
   ran them.

## How this was measured

- toolchain: node v26.6.0 from a scratch prefix on PATH, confirmed in every
  shell that ran a command.
- three git worktrees plus one clone, all at absolute scratch paths. The
  primary repository at /home/user/tiphys-ai-helmsman was never mutated and no
  `git checkout --` was run anywhere.
- `main` control is 57bafe9, built from its own worktree, so every
  before/after pair below differs only in the code under review.

Transliteration declaration for the captured suite output quoted in this
document: Node's test reporter prints U+2139 at the head of its summary lines.
Every occurrence was replaced with the ASCII letter `i`. EIGHT occurrences of
U+2139 were replaced, in two blocks of four. ZERO occurrences of U+2716
appeared (no test failed). Nothing else in any captured output in this
document was changed.

## Findings

### C-1, MEDIUM. The criterion-9 amendment note never reaches the runner's stdout on the green arm, which is the only arm criterion 9 is about

**Shipped artifact reached:** `dist/src/commands/gates.ts` and
`dist/src/gates/scope.ts`. **User path:** anyone, this repository's own CI
included, who runs `tiphys gates run` over a branch that widened its own
phase declaration.

Criterion 9 (delivery/plan/m3-p11-phase-spec.md:176) requires that a branch
adding a declaration entry PASSES and that the gate PRINTS the added entry by
name, and it gives its reason in the same sentence: a silent pass is the
failure this change exists to avoid. The change's own header says the same,
that the only protection left against a head-side addition is the printed line
and a reviewer who reads it.

The GATE does print it. The RUNNER does not relay it, because the line the
phase added to `src/commands/gates.ts` prints one row per NON-GREEN gate, and
a scope gate carrying nothing but an amendment is GREEN.

Measured on THIS pull request, not on a fixture. Clone of the repository at
a73313d with the branch checked out, `origin/main` at 57bafe9, the branch's
own `dist/`:

```
$ node dist/bin/tiphys.js gates run --manifest gates.manifest.json \
    --only scope --evidence /tmp/arm1 --base <origin/main> --head <HEAD> --phase m3-p11
gates: run d15a371f630739660528e843
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
gates: every applicable gate is green
exit=0
```

Two lines. Neither names `src/commands/gates.ts` nor
`delivery/plan/phase-declarations/m3-p11.json`, which are the two entries this
branch added to its own declaration at head. The named diff exists, and it is
in exactly two places, both of which stay on the machine that ran the gate:

```
$ grep -o "DECLARATION AMENDED[^\"]*" /tmp/arm1/summary.json | head -1
DECLARATION AMENDED AT HEAD: 2 entry/entries ADDED at head a73313d1... that are
absent from the merge-base declaration, allowed and NAMED here for a reviewer to
sign off (this gate does not sign them off): filesToTouch
delivery/plan/phase-declarations/m3-p11.json, filesToTouch src/commands/gates.ts.
$ grep -c "DECLARATION AMENDED" /tmp/arm1/scope/stdout.txt
1
```

`summary.json` and the gate's captured `stdout.txt` are the two places. Both
are inside the evidence directory, and CLAUDE.md:565 records that the `gates`
workflow uploads no artifact. Re-run on this branch, as that entry instructs:

```
$ grep -rn 'upload-artifact\|actions/upload' .github/workflows/
$ echo $?
1
```

No hits. So neither file leaves the runner, and `scripts/m2-exit-test.sh`
surfaces a gate's `detail` into the job log only on an assertion FAILURE (its
green reporter prints `gate GREEN with N unit(s)` and no detail).

**The behaviour is deliberate and the composition was not noticed.** The
runner's new loop is documented as skipping green rows, and a test asserts a
green row is NOT printed; that is a reasonable rule taken on its own. Nothing
in the work history connects it to the amendment note. Its residue 8 states
that self-authorizing the declaration file "is visible (both the addition and
the path are printed)". That is true of the gate and false of the runner, and
the runner is where a reviewer looks.

**Positive control, so the finding is not overstated.** The note DOES print
when the scope gate is non-green, because the red detail carries it and red is
non-green. Same lab, amendment plus one out-of-scope path:

```
gates: scope: red: touched path(s) outside the declared scope: ... other/violation.txt
(declaration ... ) DECLARATION AMENDED AT HEAD: 2 entry/entries ADDED at head
d643b71b... : declaredExtras docs/NEWTHING.md, filesToTouch
delivery/plan/phase-declarations/m9-p2.json.
gates: 1 gate(s) reported red: scope
```

So the note is reachable on the arm where the gate already refuses, and
unreachable on the arm where it is the only refusal there is. That is the
inversion.

The fix is small: print the amendment note unconditionally, or exempt a green
row whose detail carries `DECLARATION AMENDED AT HEAD` from the green skip. I
am not prescribing which.

### C-2, MEDIUM. A head-side directory-prefix addition over the declarations directory lets a branch narrow ANOTHER phase's declaration, and the removal-is-red rule does not apply there

**Shipped artifact reached:** `dist/src/gates/scope.ts`. **User path:** a phase
branch amending its own declaration at head.

The general mechanism (a directory-prefix addition prints in the same shape as
a single-file one) is the hazard reviewer's M-1 and I do not re-derive it. The
part that is not M-1 is the consequence: `compareDeclarations` reads the merge
base and the head of the AUDITED PHASE's declaration only, so the "a removal is
still hard" guarantee is scoped to that one file. Grant the directory and every
other phase's declaration becomes an ordinary allowed path with no delta check
at all.

Measured in a scratch repository, phase `m9-p2`, with a second phase `m9-p3`
whose merge-base declaration lists `src/other.ts` and `src/guarded.ts`. The
branch adds `delivery/plan/phase-declarations/` to its own head declaration and
in the same commit deletes `src/guarded.ts` from M9-P3's declaration:

```
scope: green (6 changed paths audited)
6 changed path(s) audited against declaration .../m9-p2.json at merge base 90c0925...
DECLARATION AMENDED AT HEAD: 3 entry/entries ADDED at head 8f894d7... : declaredExtras
docs/NEWTHING.md, filesToTouch delivery/plan/phase-declarations/, filesToTouch
delivery/plan/phase-declarations/m9-p2.json.
EXIT=0
```

Green. Another phase's declaration was narrowed on a branch that has no
relationship to it, and that narrowing lands on `main` and governs that
phase's later audit.

**Stated honestly, this is a reachability change, not a wholly new hole.** A
phase could always put `delivery/plan/phase-declarations/` in its MERGE-BASE
declaration and do the same. What change B removes is the requirement that the
grant be merged first in its own pull request, which is precisely the friction
the amendment was written to remove; the friction was also the review point.

**It composes with C-1 into total silence.** The `filesToTouch
delivery/plan/phase-declarations/` line above is the compensating control, and
per C-1 it does not reach the runner's stdout on this green verdict.

### C-3, MEDIUM, TRACKED. The work history's three-outcome discriminator table asserts a record that the code never produces

`delivery/work-history/m3-p11.md`'s divergence section is the phase's argument
for departing from spec step 3, and it turns on this table:

| outcome | `status` | `precondition` field |
|---|---|---|
| ran, precondition met | the gate's own verdict | present, `met: true` |

Row one is false. `precondition:` is set at exactly one site in
`src/gates/run.ts`, inside the `unmet` branch, and there is no `met: true`
anywhere in the file. On the met path the runner ingests the gate's own record
verbatim and adds nothing. Measured, one gate whose precondition exits 0:

```
{ "gate": "lab-gate", "status": "green", "units": 3, "unitLabel": "lab units",
  "startedAt": "...", "endedAt": "...", "detail": "3 lab units checked",
  "evidence": [] }
```

No `precondition` key. The capture the same section cites as carrying "one of
each shape" also contains no met-with-record example; its four records are an
unmet-with-record, a `precondition: null`, and the two after-arm rows.

The substance of the divergence is UNAFFECTED, because `status` alone already
separates the three outcomes (`error`, `not-applicable`, and the gate's own
verdict). What is wrong is the specific mechanism the document offers as the
replacement for the record the spec asked for. This is the artifact a later
reviewer trusts, so it should be corrected rather than left.

The met-path gap itself is PRE-EXISTING (the diff does not touch that path) and
is not attributed to this phase.

### C-4, LOW, TRACKED. Nine behaviour rows were added, not eight

`delivery/work-history/m3-p11.md` says "Eight rows added, one row RESTATED".
The diff of `test/behaviors.json` against `main` adds nine keys. The ninth is
`gates-command-prints-nongreen-detail-to-stdout`, which is the row for
criterion 1's stdout half and was almost certainly added after the sentence was
written. All nine resolve by name; only the count is wrong.

## The four items the brief asked me to attack

### 1. The `spawnSync` premise. CONFIRMED, all four rows

The design rests on the claim that `spawnSync` cannot distinguish a missing
script from a script that deliberately exits 1, so runnability must be probed
BEFORE the spawn. I re-derived it from scratch, one `spawnSync` per row, node
v26.6.0:

```
node missing-script.mjs          status 1      signal null   error undefined
node -e process.exit(1)          status 1      signal null   error undefined
./noexec.sh (mode 644)           status null   signal null   error EACCES
./badinterp.sh (bad shebang)     status null   signal null   error ENOENT
node present.mjs                 status 0      signal null   error undefined
nosuchlauncher                   status null   signal null   error ENOENT
```

Rows one and two are identical to `spawnSync` and opposite in meaning. The
implementer's table reproduces exactly. The design is NOT more complicated than
it needs to be.

The claim that a REAL declaration depends on "exit 1 means unmet" also holds:
`credential-token`'s precondition in `gates.manifest.json` is
`node -e "process.exit(process.env.TIPHYS_IMPLEMENTER_TOKEN === undefined ? 1 : 0)"`.
It is protected from the probe twice over, by the whitespace rule and by the
after-an-option rule, so either alone would suffice.

### 2. The CI-runs-branch-code measurement. REPRODUCED EXACTLY

Same tree, same `dist/bin/tiphys.js`, same base, head and phase; the only
difference is which `src/gates/scope.ts` sits in the tree.

```
### ARM 1: the branch's src/gates/scope.ts
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
gates: every applicable gate is green
exit=0

### ARM 2: CONTROL, main's src/gates/scope.ts (57bafe9) copied in
gates: declared 1 applicable 1 verdict 1 green 0 red 1 not-applicable 0 error 0 vacuous 0
gates: scope: red: touched path(s) outside the declared scope:
delivery/plan/phase-declarations/m3-p11.json, src/commands/gates.ts (declaration
delivery/plan/phase-declarations/m3-p11.json at merge base 57bafe94..., sha256
f4bfa4c4fa228bd7b00042171d5ef42dd0e92e947916ac036da3fc2ec9665b1a) (1 declared
path(s) not touched: delivery/requirements/clause-map.json)
gates: 1 gate(s) reported red: scope
exit=1
```

The control reddens, naming both amended paths, and the sha256 and merge base
match the work history's quoted run byte for byte. The green in arm 1 is
attributable to the branch's code. The read half is sound too: the workflow
checks out `github.head_ref` at .github/workflows/gates.yml:59 and the harness
resolves the CLI at scripts/m2-exit-test.sh:86 under the checked-out root.

Arm 1 is also, unhappily, the measurement behind C-1: that green is what a
reviewer sees for a declaration amendment.

### 3. The declaration amendment. Prints both, removals redden, and one new weakness

Both added entries are printed by the gate, by name, with the field they were
added to. Removals redden in every shape I could construct:

| attack | verdict |
|---|---|
| remove one `filesToTouch` entry present at the merge base | RED, names the entry |
| delete the declaration file outright at head | RED, "removed the whole of it" |
| change the `branch` field at head | RED, both the scalar change and the entry |

The self-authorization route (a branch adds its own declaration path to its own
head declaration in order to touch it) is real, is disclosed as residue 8, and
has been taken by the orchestrator. I have nothing to add to it beyond C-1:
its disclosure claims visibility the runner does not provide.

The weakness I did find is C-2 above.

### 4. The departure from spec step 3. THE IMPLEMENTER IS RIGHT; THE SPEC IS WHAT SHOULD BE CORRECTED

Spec step 3 (delivery/plan/m3-p11-phase-spec.md:80) asks for an evaluated
precondition record on EVERY path. The implementer refused on the could-not-run
path, arguing that src/gates/result.ts:99 defines `met: false` to mean
EVALUATED AND UNMET, so attaching a record to a crash would make the record
assert the opposite of what happened.

I checked the premise rather than the conclusion. That definition is on `main`
and this branch does not touch `src/gates/result.ts`, so it is not a comment
written to justify the departure. `PreconditionRecord` has a required boolean
`met` and no third state; there is no value that means "not evaluated". The
same doc comment already says, in the same sentence, that an evaluation which
could not conclude produces no record at all. So step 3 as written cannot be
satisfied without either lying in a shipped field or extending a shipped type
that is on no part of this declaration.

**The argument is correct and the departure is right.** No acceptance criterion
requires a record on the crash path, so the CONTRACT is intact; only a method
step is departed from, it is departed from openly, in two places, and the
orchestrator accepted it. My recommendation is that
delivery/plan/m3-p11-phase-spec.md:80 be corrected to ask for an evaluated
record on every path where an evaluation CONCLUDED, so the next reader does not
re-litigate this.

The one thing that is wrong is the substitute mechanism as described, which is
C-3.

## The eleven criteria, walked by execution

Every row below was measured by me. "Same gate id" means one manifest, one
gate, two runs.

**1. MET.** A gate whose precondition command names a missing path reports
`error`, exits nonzero, and stdout names the missing path:

```
gates: lab-gate: error: precondition lab-pre command node scripts/lab-pre.mjs
could not be run: scripts/lab-pre.mjs does not exist (resolved to
/.../lab123/scripts/lab-pre.mjs) (this is NOT not-applicable: nothing was
evaluated, M2-C-3)
EXIT=21
```

`main` control on the identical manifest: `not-applicable 1 error 0`, reason
`no applicable gate`. The criterion also holds one level out, for a GATE's own
command: see criterion 5.

**2. MET.** The same gate with the script present and exiting 1 deliberately:
`not-applicable`, with an evaluated record carrying the reason:

```
"precondition": { "id": "lab-pre", "met": false,
                  "reason": "node scripts/lab-pre.mjs exited 1" }
```

**3. MET, and this is the one that makes the work real.** Both of the above are
gate id `lab-gate`, one manifest, differing ONLY in whether
`scripts/lab-pre.mjs` exists (it was moved aside and moved back). The verdicts
are `error` and `not-applicable`; the details differ; the summary counts differ.
Distinguishable, not merely both reachable.

**4. MET, with a caveat the implementer states first.** A non-executable
launcher gives `is not executable (mode 644, ...)` and a bad interpreter line
gives `Error: spawnSync ./scripts/badinterp.sh ENOENT`. Both `error`, by
structurally different routes (the probe, and the spawn's own error). **Both
already reported `error` on `main`**, which the work history says plainly, so
they are regression guards rather than witnesses for the new behaviour. I
therefore measured the class that this phase actually MOVES, and it has three
members, each `not-applicable` on `main` and `error` here:

| new class member | branch verdict | `main` control |
|---|---|---|
| operand absent | error, names the path | not-applicable 1 error 0 |
| operand is a directory | error, "is a directory, not a regular file" | not-applicable 1 error 0 |
| operand is a dangling symlink | error, "symbolic link whose target does not exist" | not-applicable 1 error 0 |

Three structurally different members, so "one witness is not a class" is
satisfied with one to spare.

**5. MET, and the criterion mis-describes its own baseline, which the work
history already corrects.** Against a tree from `npm pack` (no `src/`, `bin/`
or `scripts/`), branch code:

```
gates: manifest-self-check: error: gate manifest-self-check could not be run:
bin/tiphys.ts does not exist (resolved to /.../pkg/package/bin/tiphys.ts)
```

`main` control on the same tree: also `error`, detail `gate manifest-self-check
exited 1 without writing a result record at /tmp/ev-c5m/manifest-self-check/
result.json`. So the STATUS was never `not-applicable` for this gate; what
changed is which path the detail names, and the old one named the record path,
the single path in the sentence that is not the problem. The spec calls this
"the phase's real-world witness"; it is not, and the real instance is
`check-dual-review` at delivery/review/clean-room-m3-p9-hazard.md:243. The work
history says exactly this, unprompted, so I record it as a spec defect and not
as an implementer overclaim.

One behaviour change worth noting for the four-fact bundle-reading procedure:
the crashed gate is now `applicable: false` where `main` had `applicable: true`.
It does not affect the verdict (errors dominate in `decideAggregate`) and it
does not enter `requiredNotApplicable`, which keys on the `not-applicable`
status.

**6. MET.** Nine new behaviour keys (see C-4), each present in
`test/behaviors.json` and each with its described test name present in `test/`.
The one restated row keeps its id. The only count assertion in the two changed
test files is `summary.gates.length === 1` over a purpose-built one-gate
fixture, which is not an append-only registry.

**7. MET.** `npm ci` exit 0, `npm run build` exit 0, `git status --porcelain`
empty afterwards. Suite, with all three axes named:

| toolchain | build state | invocation | tests | pass | SKIPPED |
|---|---|---|---|---|---|
| node v26.6.0 | `dist/` built | `npm test` | 778 | 778 | **0** |
| node v26.6.0 | `dist/` built | bare `node --test` | 780 | 780 | **0** |
| node v22.22.2 default | `dist/` built | `npm test` | 778 | 776 | 2 |

The first two rows are mine, verbatim (transliterated per the declaration
above):

```
i tests 778        i tests 780
i pass 778         i pass 780
i fail 0           i fail 0
i skipped 0        i skipped 0
```

The third row is the branch's claim and I did not run it; the +2 skips it
reports are the floor-gated `doctor` tests, consistent with CLAUDE.md's warning
12. The +2 tests under the bare invocation are the tracked `sandbox/` fixture,
also consistent. `main`'s stated baseline is 769, and 769 plus nine new tests
is 778.

**8. MET, both arms plus a boundary control.** Phase `m9-p2` in a scratch
repository:

| arm | verdict |
|---|---|
| own `delivery/review/clean-room-m9-p2-hazard.md` and `delivery/verification/m9-p2-delta.md`, undeclared | GREEN, 3 paths audited |
| another phase's `clean-room-m9-p3-hazard.md` | RED, names it |
| `clean-room-m9-p21-hazard.md` against phase `m9-p2` | RED, so a longer id is not swallowed by a shorter one |

**9. MET AS WRITTEN, PURPOSE NOT DELIVERED.** The head declaration adds
`declaredExtras docs/NEWTHING.md`; the gate is green and prints:

```
DECLARATION AMENDED AT HEAD: 2 entry/entries ADDED at head 482ef0e9... that are
absent from the merge-base declaration, allowed and NAMED here for a reviewer to
sign off (this gate does not sign them off): declaredExtras docs/NEWTHING.md,
filesToTouch delivery/plan/phase-declarations/m9-p2.json.
```

The printed LINE is what I asserted, not the exit code. See C-1 for why this is
nevertheless the finding of the round.

**10. MET.** Three removal shapes, all red; table under item 3 above.

**11. MET.** Criteria 9 and 10 were demonstrated on ONE declaration
(`m9-p2.json`), one merge base, one branch, differing only in the direction of
the change.

## Red-witness rule, checked mechanically

The five new witness specs each declare TWO structurally different dangerous
states, and the second member in each case is a genuinely different failure
rather than a variant of the first (for example: dropping the removal refusal,
versus emptying the amendment note so the gate still decides correctly and
merely stops saying what it allowed). The `red-witness` gate on this branch:

```
gates: red-witness: green
units 10, "10 witness(es) evaluated (5 own, 5 stored re-evaluated in 24125ms);
every witness red against every declared dangerous state and green at head"
vacuous: false
```

So every declared mutant was demonstrated red and the head green, by the gate
rather than by assertion. Separately, the three NEW class members under
criterion 4 were each shown red against `main` by me, which is the stronger
form the rule asks for: red against the DANGEROUS state, not merely against the
absent feature.

## What would clear this review

C-1 and C-2 are both against change B and neither touches the crash-verdict fix,
which is the part of this phase that DR-0029 and the release ordering actually
depend on. C-3 and C-4 are corrections to the work history.

I would approve on: the amendment note reaching the runner's stdout on a green
scope row (C-1), a decision recorded on C-2 (refusing a directory prefix at
head, or scoping the addition rule to literal paths, or accepting it in writing
with the reason), and the two work-history corrections.

## Overlap check against the hazard lens, done last

The hazard report was opened only after everything above was written and
committed. Checked against it:

- **C-1 is not in it.** Its treatment of the new stdout stream is a LOW about
  newline forgery in `singleLine`, and elsewhere it reads the stdout half as
  working, which it is on the `error` rows it was exercising. The green-row
  case is untouched there.
- **C-2 is not in it either, and it credits the mechanism to M-1.** Its
  section on change 3 walks removal by rename, whole-declaration deletion and
  a field-mismatched move, all of which held, and then records M-1 for the
  directory prefix. It does not follow the prefix into the declarations
  directory, where the per-phase scope of the removal check is what makes the
  consequence different in kind from "unbounded scope over a tree".
- **C-3 and C-4 are work-history accuracy findings and appear in neither.**

Nothing in this review contradicts a hazard finding. H-1 stands independently
of everything here, and it is the more serious of the two lenses' results.
