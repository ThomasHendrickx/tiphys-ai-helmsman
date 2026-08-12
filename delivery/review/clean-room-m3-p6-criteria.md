# Clean-room review, M3-P6, Contract A: acceptance-criteria walk

- phase: M3-P6 (delivery-role briefs)
- pull request: #105
- head reviewed: 16bab6f
- contract: A, the acceptance-criteria walk (executed, not read)
- reviewer worktree: detached at 16bab6f, node_modules present
- verdict: APPROVE, with three LOW findings, none blocking
- toolchain: node v22.22.2 throughout, via `bash -lc`

This file was written incrementally as the work happened; its mtime was the
beacon.

## 0. What this review did NOT cover

Read this first. An empty result from a search whose scope was wrong is
indistinguishable from an absence of defects.

1. **CI itself.** Everything below ran locally on node v22.22.2. The declared
   floor is `>=26` and CI is the authority. I did NOT fetch a floor-satisfying
   toolchain, so every number here is from a toolchain BELOW the floor, and I did
   not observe the pull-request check run or any post-merge `push` run on the new
   `main` head. T-009 rule 1 is not discharged by anything in this document.
2. **The `scope` gate as a gate.** My worktree is detached, so the branch reads
   `HEAD` and the gate's phase-branch precondition is unmet. Another worktree
   holds the phase branch, so I could not check it out and could not produce a
   green `scope` myself. I audited the 24 changed paths against the declaration
   BY HAND instead. What I verified about the gate's remaining input (the
   declaration's `branch` field, and that the reviewed head is the branch tip) is
   recorded under the gate-bundle section; what I did not do is run it green.
3. **The suite's third axis.** I measured `npm test` and bare `node --test`, both
   with `dist/` PRESENT. I did NOT measure `dist/` ABSENT, so the work history's
   third row (614 / 603 / 11 skipped) is unverified by me.
4. **The work history's 49 citations.** The `citations` gate is not-applicable
   here (no changed path falls under its document globs, which I confirmed and
   which the work history itself discloses). I spot-checked citations I used and
   did not re-resolve all 49.
5. **Whether the clauses change implementer behaviour.** I verified text,
   structure, exit codes and round trips. Whether an agent reading this brief
   actually behaves differently is not something I measured and not something any
   criterion claims.
6. **Deviation 3 of the three re-derived by the resumed implementer.** I
   reproduced deviations 1 and 2 by execution. I read deviation 3's derivation
   (`package.json`'s `files` entry) but did not force it.
7. **The `hazard` review contract's substance.** Contract A is the criteria walk.
   I verified the hazard brief composes, declares itself and differs in its first
   instruction; I did NOT review this phase against its own hazard classes. That
   is contract B's job and this document is not evidence about it.
8. **Two of my own early background suite runs were contaminated by my own
   defangs running concurrently**, and one reported a failure that was mine, not
   the phase's. I re-ran cleanly afterwards and report only the clean numbers,
   but I did not re-run every single-test measurement under guaranteed isolation;
   the single-test runs were fast and sequential with their own defang and
   restore, and each was bracketed by a restore plus a `git diff --quiet` check.
9. **Regions I did not search at all:** `src/` beyond the three modules this
   phase touches, the M3-P5 briefs' own bodies, and `schemas/` beyond
   `mechanism-index.schema.json` and `role-brief.schema.json`.

## 1. Criteria walk

### Toolchain, build state, invocation (quoted together, per the standing warning)

- toolchain: node v22.22.2 (via `bash -lc`; a stripped environment gives v20)
- build state: `dist/` PRESENT (`npm run build` exit 0, `git status` clean after)
- invocation: `npm test`
- result: 614 tests, 612 pass, 0 fail, **2 skipped**, exit 0

`npm run build` output ended with exit 0 and `git status --short` showed only
this reviewer's own untracked report file.

### Preliminary: `roles/_shared-dispatch-contract.md` is UNTOUCHED

Not assumed. The blob hash is identical at the merge base and at the head:

```
$ git merge-base HEAD origin/main
307ed2f4e02d7a6f2b05388308dadedbaaf8e617
$ git rev-parse 307ed2f4e02d7a6f2b05388308dadedbaaf8e617:roles/_shared-dispatch-contract.md
f8784f2256cad1ac0e934bf7b628ca7519d81758
$ git rev-parse HEAD:roles/_shared-dispatch-contract.md
f8784f2256cad1ac0e934bf7b628ca7519d81758
$ git diff --stat 307ed2f..HEAD -- roles/_shared-dispatch-contract.md
(empty)
```

VERDICT: untouched. The file is on the declaration's `filesToTouch` list
(delivery/plan/phase-declarations/m3-p6.json:20) as read-only per the plan's own
note at delivery/plan/kernel-plan-m3.md:3410, and the phase did not change it.

## Criterion 1: `tiphys validate --type role-brief` exits 0 on both briefs

```
$ node bin/tiphys.ts validate --type role-brief roles/implementer.md
EXIT_IMPL=0
$ node bin/tiphys.ts validate --type role-brief roles/clean-room-reviewer.md
EXIT_CR=0
```

VERDICT: **met**.

## Criterion 2: six R-033a sections, each non-empty; both directions per section

Compose baseline (595 lines, exit 0) carries exactly six section anchors:

```
$ grep -n '^## section' composed-impl.md
75:## section mandated-reading: ...
112:## section phase-scope: ...
217:## section push-protocol: ...
355:## section gate-list: ...
398:## section environment-warnings: ...
428:## section reporting-contract: ...
$ grep -c '^## section' composed-impl.md
6
```

Deleting each section in turn from `roles/implementer.md` (heading plus body,
restored from a pristine copy between runs) and re-composing:

```
DELETE[mandated-reading]     exit=1 :: required section mandated-reading is missing from the brief body, and R-033a requires all six of ...
DELETE[phase-scope]          exit=1 :: required section phase-scope is missing ...
DELETE[push-protocol]        exit=1 :: required section push-protocol is missing ...
DELETE[gate-list]            exit=1 :: required section gate-list is missing ...
DELETE[environment-warnings] exit=1 :: required section environment-warnings is missing ...
DELETE[reporting-contract]   exit=1 :: required section reporting-contract is missing ...
RESTORED exit=0
```

The NON-EMPTY half was forced separately, because a deleted section and an
emptied one are structurally different states and only the second leaves six
anchors in place:

```
EMPTY[gate-list]           exit=1 :: required section gate-list is present and empty, so the ...
EMPTY[reporting-contract]  exit=1 :: required section reporting-contract is present and empty
RESTORED-CLEAN
```

VERDICT: **met**, both directions, one witness per section, plus the emptied
arm on two sections.

## Criterion 3: gate-list block byte-identical, added gate reddens, re-render green

Direction 0, byte identity of the COMPOSED brief's block against the registry
rendering (not against the committed brief, which would be the compare-to-itself
shape the plan names as this criterion's hazard):

```
$ node scripts/check-brief-drift.mjs > rendered-block.txt      # print mode, derives from the registry
$ <extract BEGIN..END block from the composed brief> > composed-block.txt
$ diff rendered-block.txt composed-block.txt
BYTE_IDENTICAL: composed block == registry rendering
$ md5sum rendered-block.txt composed-block.txt
230b382daf939153356bc950ec022b1c  rendered-block.txt
230b382daf939153356bc950ec022b1c  composed-block.txt
```

Baseline check:

```
$ node scripts/check-brief-drift.mjs --check
brief-drift: green (18 generated brief gate rows compared)
CHECK_BASELINE_EXIT=0
```

Direction 1, add a gate `reviewer-planted-gate` to `gate-registry.yaml` and do
NOT re-render:

```
$ node scripts/check-brief-drift.mjs --check
brief-drift: red (19 generated brief gate rows compared)
roles/implementer.md's full gate block has drifted from gate-registry.yaml: the
registry has a row the brief does not: | `reviewer-planted-gate` | script |
required | planted rows checked |. Re-render with node
scripts/check-brief-drift.mjs --write
CHECK_ADDED_GATE_EXIT=1
```

The gate is NAMED, which is what the criterion asks for.

Direction 2, re-render:

```
$ node scripts/check-brief-drift.mjs --write
check-brief-drift: rewrote the full gate block in roles/implementer.md (19 row(s) from gate-registry.yaml)
WRITE_EXIT=0
$ node scripts/check-brief-drift.mjs --check
brief-drift: green (19 generated brief gate rows compared)
CHECK_AFTER_RERENDER_EXIT=0
```

Restored from the pristine copies; `git diff --quiet` then reported
TREE_CLEAN_AFTER_RESTORE.

Structural read confirming the derivation is real: `renderBriefGateBlock` is
called at scripts/check-brief-drift.mjs:228 with the DECODED registry and the
mode read out of the brief's own begin marker, and the brief is opened only to
compare against or write into. The added-gate direction above is the empirical
half of that.

VERDICT: **met**, both directions.

## Criterion 4: no PR-creation or merge instruction in the composed brief

```
$ grep -n -i 'gh pr create\|pr merge\|open the PR' composed-impl.md
grep_exit=1 (no match)
```

The registered test is test/implementer-brief.test.ts:312. VERDICT: **met**.

## Criterion 5: fleet warnings file, both directions

No `warnings.md` in the working directory: the composed brief carries no
`# Environment warnings` block (grep exit 1).

With a three-line `warnings.md` staged in a scratch working directory, composing
from there:

```
$ diff composed-impl.md composed-with-warnings.md
595a596,601
> 
> # Environment warnings
> 
> FLEET WARNING ALPHA
> second line of the fleet warnings file
> FLEET WARNING OMEGA
```

The FULL text of the file appears (all three lines, in order) and the ONLY
difference from the no-warnings compose is that appended block, which is the
"exactly the brief text when none exists" half. VERDICT: **met**, both
directions.

## Criterion 6: suite, and this phase's thirteen clause-map rows

The suite result is at the head of this document. The thirteen rows this phase
adds to delivery/requirements/clause-map.json:65 are R-007, R-009b, R-031,
R-033a, R-034, R-037a, R-038, R-039, R-040, R-074, R-081b, R-082a, R-087, all
`"phase": "M3-P6"`. Counted from the diff: thirteen, matching the criterion.

The gate itself, run against the merge base, covers "earlier mappings still
resolve":

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full --only clause-map --evidence <dir> --base origin/main --head HEAD
gates: registry gate-registry.yaml mode full
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
gates: every applicable gate is green
GATE_EXIT=0
```

VERDICT: **met**. See the skip accounting in the findings section for the
"zero unaccounted tests" half.

## Criterion 7: clause id round trip, both directions, both briefs

```
BASELINE roles/implementer.md          exit=0
BASELINE roles/clean-room-reviewer.md  exit=0

ANCHOR_ONLY roles/implementer.md         exit=1 :: INVALID #/clauses body heading anchor reviewer-planted-anchor is not declared in frontmatter
ANCHOR_ONLY roles/clean-room-reviewer.md exit=1 :: INVALID #/clauses body heading anchor reviewer-planted-anchor is not declared in frontmatter

ORPHAN roles/implementer.md         exit=1 :: INVALID #/clauses/0 clause id reviewer-orphan-clause is declared in frontmatter and has no body heading anchor, so the clause is orphaned
ORPHAN roles/clean-room-reviewer.md exit=1 :: INVALID #/clauses/0 clause id reviewer-orphan-clause is declared in frontmatter and has no body heading anchor, so the clause is orphaned
TREE_CLEAN
```

(The first pass of this measurement piped through `tail`, so the reported exit
code was `tail`'s and not the validator's; the numbers above are from the
re-measurement without a pipe.)

VERDICT: **met**, both directions on both briefs.

## Criterion 8: the seed mechanism index is a superset of the interim twelve

```
$ node bin/tiphys.ts validate --type mechanism-index tuition/mechanism-index.yaml
VALIDATE_EXIT=0
```

`MECHANISMS.md` has 13 table lines, one of which is the header, so twelve
mechanism rows. `tuition/mechanism-index.yaml` carries twelve `- key:` entries,
and each key is the slug of its own name (asserted in the test rather than by me).

Direction 1, remove a converted row. TWO structurally different members, per the
one-witness-is-not-a-class rule:

```
--- removed row: worktree-removal-and-force-branch-delete ---
not ok 1 - the seed mechanism index validates, and its mechanism keys are a superset of the interim index's, naming any that is missing
  error: 'the seed index has lost the interim mechanism: Worktree removal and force branch delete'
# fail 1

--- removed row: a-guard-s-own-failure-path ---
not ok 1 - ...
  error: "the seed index has lost the interim mechanism: A guard's own failure path"
# fail 1

=== restored ===
# pass 1
# fail 0
```

Each names the missing mechanism, which is what the criterion requires.

**IS THE COUNT DERIVED OR PINNED?** This is the half the brief told me to check
hardest, so I forced it rather than reading the source. Adding a THIRTEENTH row
to `MECHANISMS.md` (`| Reviewer planted mechanism | ... |`) immediately reddens
the test naming that new row:

```
not ok 1 - the seed mechanism index validates, and its mechanism keys are a superset ...
  error: 'the seed index has lost the interim mechanism: Reviewer planted mechanism'
```

A check pinned to twelve would have stayed GREEN under that mutation. It did not.
The expected set is parsed from `MECHANISMS.md` at run time
(test/implementer-brief.test.ts:457) and the only numeric assertion is a FLOOR,
`interimNames.length >= 12`, which guards the parse rather than pinning a count.
A future phase adding an interim row will redden this test until the seed is
extended, which is the coupling the criterion asks for and not an over-assertion.

Direction 2, delete the seed and compose:

```
SEED_DELETED exit=1 :: tiphys brief compose: mandated-reading path tuition/mechanism-index.yaml does not exist (looked for .../tuition/mechanism-index.yaml)
SEED_RESTORED exit=0
```

VERDICT: **met**, both directions, count derived.

## Criterion 8b: the destructive-authority clause

The clause is at roles/implementer.md:283 and names all three conjuncts
("State the destructive authority explicitly in the command's OWN contract",
"Never inherit force semantics from a caller", "Add the command to the
`destructiveCommands` list in `gates.manifest.json`").

The named hazard for this criterion is a clause pointing at a manifest key M2
renamed, so I checked the key EXISTS rather than that the clause mentions it:

```
$ node -e 'const m=require("./gates.manifest.json"); console.log(Object.prototype.hasOwnProperty.call(m,"destructiveCommands")); console.log(JSON.stringify(m.destructiveCommands))'
key present: true
["pool destroy","teardown","src/pool.ts","src/teardown.ts"]
```

Both directions on the mandated-reading resolution:

```
MANIFEST_MOVED exit=1 :: tiphys brief compose: mandated-reading path gates.manifest.json does not exist (looked for .../gates.manifest.json)
MANIFEST_RESTORED exit=0
```

VERDICT: **met**.

## Criterion 9(a): the claim-grep command, verbatim

```
=== 9a baseline ===        # pass 1  # fail 0
=== 9a defang: paraphrase the grep command ===
not ok 1 - the claim-grep clause carries the CLAUDE.md grep command verbatim, and a paraphrase reddens
  error: "the claim-grep clause does not carry the command verbatim; expected grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to'"
# pass 0  # fail 1
=== 9a restored ===        # pass 1  # fail 0
```

The expected pattern is read out of `CLAUDE.md` at run time
(test/implementer-brief.test.ts:505 and its preceding comment), not restated in
the test, so this is not an assertion of agreement with itself. The criterion
labels it a TEXT assertion and the brief's own comment repeats that label; I
agree with the labelling and record it as such rather than as coverage.

VERDICT: **met**.

## Criterion 9(b): the fix-round clause's three items

The registered test proves its weakening arm IN MEMORY (`clause.replace(items[2],
"")`) rather than by editing the brief and re-running the predicate. That is a
weaker shape than the rest of this phase uses, so I did not accept it: I forced
two REAL defangs against the brief file.

```
=== 9b baseline ===   # pass 1  # fail 0

=== REAL defang A: delete item 3 from the brief ===
not ok 1 - the fix-round-mechanism clause names all three items and cites the M1 measurement, and dropping one item reddens
  error: 'the fix-round clause does not carry: STATE WHAT THE DERIVATION DID NOT COVER'
# pass 0  # fail 1

=== REAL defang B: soften item 2 to drop the FULL-output demand ===
not ok 1 - ...
  error: 'the derivation item does not require the full output'
# pass 0  # fail 1

=== restored ===      # pass 1  # fail 0
```

The clause also carries the ordering requirement ("The reviewer's FIRST check is
item 3") and the M1 measurement (sixteen / thirteen / TWELVE / ELEVEN call sites
/ listed eight), each pinned separately in the test.

VERDICT: **met**. The in-memory arm is noted as an observation below, not as a
finding, because the real defangs redden.

## Criterion 9(c) and 9d: the two dispatch clauses, text-specific, in both briefs

The clause text is shipped ONCE. Both briefs carry an include line and neither
carries its own copy:

```
$ grep -n '$include' roles/implementer.md roles/clean-room-reviewer.md
roles/implementer.md:457:$include: _shared-dispatch-contract.md
roles/clean-room-reviewer.md:140:$include: _shared-dispatch-contract.md
```

All five briefs in `roles/` include the same one file, and the registered test
DERIVES the carrier set from the directory
(test/clean-room-brief.test.ts:505) and asserts it equals
`["_shared-dispatch-contract.md"]`, so a sixth copy appearing anywhere in
`roles/` reddens it.

**The "five briefs" half of the criterion is satisfied, and not by this phase's
own test.** This phase's test loops over `PHASE_BRIEFS = ["implementer",
"clean-room-reviewer"]` (test/clean-room-brief.test.ts:67), which is two. The
other three are reached by M3-P5's `AUTHORING_ROLES`, which is DERIVED from the
directory (test/roles.test.ts:72: every `.md` whose first line is `---`) and now
resolves to all five:

```
$ node -e '...readdirSync("roles")...'
[ 'adversarial-plan-reviewer.md', 'clean-room-reviewer.md', 'implementer.md', 'investigator.md', 'plan-writer.md' ]
```

So adding these two briefs extended the older test's coverage automatically,
which is the derived-set discipline working as intended.

The two named weakenings, forced by me against the real shared source and
restored from a pristine copy:

```
=== baseline ===  # pass 2  # fail 0

=== WEAKENING A (generic restatement of incremental-output) ===
not ok 1 - both briefs' composed dispatch clauses name the first-minutes rule, the mtime consequence and the freshness guard
  error: "implementer's composed brief does not name the artifact-within-the-first-minutes rule"
# pass 0  # fail 1

=== WEAKENING B (liveness probe replacing beacon-is-not-a-claim) ===
not ok 1 - ...
  error: "implementer's composed beacon clause does not state: NEWEST MODIFICATION TIME"
# pass 0  # fail 1

=== restored ===
SHARED_FILE_BYTE_RESTORED
# pass 1  # fail 0
TREE_CLEAN
```

The two members are structurally different and redden DIFFERENT assertions: A
trips the first-minutes phrase, B trips the freshness phrase. B is specific and
wrong (a C-2 liveness probe) rather than vague, which is the distinction the
plan asks for and which a vagueness-tuned check would miss.

VERDICT: **met**, both directions, two structurally different members.

## Criterion 10: the two review contracts

```
CONTRACT[criteria] exit=0
CONTRACT[hazard]   exit=0
UNKNOWN     exit=1 :: tiphys brief compose: unknown review contract adversarial; the contracts are criteria, hazard
WRONG_ROLE  exit=1 :: tiphys brief compose: --review-contract applies to clean-room-reviewer and implementer declares no review contracts
```

Each composed brief DECLARES its contract in the header (`review-contract:
criteria` / `review-contract: hazard`, line 6 of each) and each carries exactly
ONE contract clause, the other having been selected out:

```
$ grep -n '^## clause review-contract' cr-criteria.md cr-hazard.md
cr-criteria.md:60:## clause review-contract-criteria: walk every criterion, and do not call it completeness
cr-hazard.md:60:## clause review-contract-hazard: start from the hazard classes, and not from the criteria
```

The first instruction differs, at the same line in both. The hazard brief says
"DO NOT BEGIN FROM THE ACCEPTANCE CRITERIA" and "You may read the criteria, and
you read them LAST"; the criteria brief carries "all acceptance criteria met" is
ONE INPUT and never a terminal green (cr-criteria.md:76). Both sentences the
criterion names are present.

VERDICT: **met**, both directions.

## Criterion 11: the brief-drift check is wired as a BEHAVIOUR

I extracted the step from the workflow MYSELF rather than trusting the test's
helper:

```
MATCHING_STEPS=1
NAME=Implementer brief gate-list drift (gate-registry.yaml is the single source, R-094)
IF=undefined
RUN="node scripts/check-brief-drift.mjs --check"
JOBS=["gates"]
STRATEGY=undefined
```

One job named `gates`, no matrix, no second job, and no `if:` on the step
(DR-0017, DR-0004, and T-009's both-arms rule).

### 11a. Executing the extracted step, my own two defangs

```
=== clean tree ===
brief-drift: green (18 generated brief gate rows compared)
STEP_EXIT_CLEAN=0

=== MY DEFANG 1: registry gains a gate, brief not re-rendered ===
STEP_EXIT_DEFANG1=1
brief-drift: red (19 generated brief gate rows compared)
... the registry has a row the brief does not: | `smuggled-by-reviewer` | script | required | smugglings counted |
STEP_EXIT_RESTORED=0

=== MY DEFANG 2: the brief's generated block is REMOVED (nothing to compare) ===
STEP_EXIT_DEFANG2=21
brief-drift: error (0 generated brief gate rows compared)
roles/implementer.md carries no generated gate-list begin marker naming a mode
STEP_EXIT_RESTORED=0
TREE_CLEAN
```

The two are structurally different and redden differently: defang 1 is a REAL
DRIFT and produces `red`/exit 1; defang 2 removes the check's SUBJECT and
produces `error`/exit 21 with `units: 0`, which is M2-C-2's vacuous-run contract
refusing to call "I found nothing to compare" a pass. That second member is the
one that kills a compare-to-itself implementation.

### 11b. Does the wiring test catch a DEFANGED step, or only a deleted one?

This is the half D-M3-28 and CR-760 exist for, so I forced it rather than
reading the test. Three mutations of the WORKFLOW itself:

```
=== baseline ===  # pass 1  # fail 0

=== WORKFLOW DEFANG A: drop --check, so the step runs in print mode and always exits 0 ===
not ok 1 - the brief-drift step wired into the gates workflow is executed against stubs and reddens under two structurally different defangs
  error: 'the wired step exited 0 with the registry ahead of the brief'
# pass 0  # fail 1

=== WORKFLOW DEFANG B: add an if: gating the step to pull_request only ===
not ok 1 - ... # pass 0  # fail 1

=== WORKFLOW DEFANG C: delete the step entirely ===
not ok 1 - ... # pass 0  # fail 1

=== restored === # pass 1  # fail 0
TREE_CLEAN
```

**Defang A is the decisive one.** The step is still present, still named, still
mentions `check-brief-drift.mjs`, and is completely toothless. A text assertion
over the workflow would be GREEN against it. The test is red because it
EXECUTES the extracted `run:` and observes the exit code. That is the criterion
satisfied in the strong form the plan asks for, and it is the shape the interim
index records under "asserting a CI step is wired".

### 11c. The script's own claims about which CI arm reaches it, checked

The script header states where it runs (scripts/check-brief-drift.mjs:31). Each
half checked:

```
$ node -e '...gates.manifest.json...'   # PR arm: the runner executes it
{"id":"brief-drift","command":["node","scripts/check-brief-drift.mjs","--check"],
 "unitLabel":"generated brief gate rows compared","applicability":"required"}

$ grep -n -- '--only' scripts/m2-exit-test.sh   # push arm: the main bundle list
949: ... --only manifest-self-check --only suite --only coverage --only credential-scrub --only deploy --only migrations

$ grep -n 'brief-drift' scripts/m2-exit-test.sh
grep_exit=1   (the harness does not name this gate at all)
```

So the main bundle's hard-coded `--only` list does NOT name `brief-drift`. The
step carrying no `if:` is what the phase relies on for the push arm.

**A CLAIM I AM NOT SETTLING, stated rather than smuggled.** "The push arm is
covered" and "an `if:` means the push arm does not run it" are claims about how
GitHub Actions evaluates a step, and I did NOT execute a workflow run on either
event. What I executed is the step's `run:` script, locally, and what I read is
the workflow YAML. So: the step is present, carries no `if:`, and its script
reddens on drift when run. Whether the `push` event actually reaches it is an
open question this review does not close, and closing it needs an observed CI run
on a `main` head, which is T-009's duty on the orchestrator and item 1 of my
not-covered list. The header's
sharper claim, that a plain `red` from this gate would not fail the PR harness
because its global checks are zero-error and zero-vacuous with no global
zero-red, also holds: scripts/m2-exit-test.sh:498 reads "counts re-derived and
equal to summary.json; zero error; zero vacuous" and no global red assertion
exists. That is why the `if:`-less workflow step must not be deleted, which the
comment says in as many words.

I record this as ACCURATE rather than as a defect: the phase documented the
limit of its own wiring instead of claiming both arms were covered by one
mechanism.

VERDICT: **met**, in the strong (executed) form, under three workflow defangs
and two subject defangs.

## The resumed phase: was the salvage verified or inherited?

The first implementer died mid-sentence at `239978e`. The work history has an
explicit RESUME section (delivery/work-history/m3-p6.md:266) that states the
method BEFORE the work, says salvaged work is verified or rewritten rather than
trusted, and records at delivery/work-history/m3-p6.md:441 that all three
recorded deviations were CONFIRMED and none rewritten. It also states that a
green suite is not verification of salvaged work, which is the correct reading
of R-081b.

I spot-checked two of the three by execution rather than by reading the
reasoning.

**Deviation 1 (`review-contract` is not a frontmatter field): reproduces.**

```
$ grep -n 'additionalProperties' schemas/role-brief.schema.json
8:  "additionalProperties": false,
$ sed '2i review-contract: criteria' roles/clean-room-reviewer.md > <scratch>/clean-room-reviewer.md
$ node bin/tiphys.ts validate --type role-brief <scratch>/clean-room-reviewer.md
EXIT=1 :: INVALID #/review-contract property review-contract is not permitted here
```

**Deviation 2 (`outputs` names `finding`, not `verdict`): reproduces.**

```
$ node --input-type=module -e '...import src/commands/validate.ts...'
verdict -> undefined
finding -> finding.schema.json
$ grep -n -A2 '^outputs:' roles/clean-room-reviewer.md
18:outputs:
19-  - finding
```

Both match the work history's captured output exactly. VERDICT: the salvage was
re-derived, and the work history says which parts were confirmed and which were
rewritten (three small edits, listed at delivery/work-history/m3-p6.md:765).

## Byte checks and scope

```
$ node scripts/check-authored-bytes.mjs
SCRIPT_EXIT=0
```

Independently, over the 24 files this branch changes, both forms WITH `-a`:

```
$ grep -qaP '[^\x00-\x7F]' <each changed file>      -> no hits
$ grep -qaP '[\x00-\x08\x0B\x0C\x0E-\x1F]' <each>   -> no hits
BYTE_SCAN_DONE
$ git diff --stat 307ed2f..HEAD | grep -i Bin
bin_grep_exit=1 (no file lost its diff to binary classification)
```

Scope: every one of the 24 changed paths is on
delivery/plan/phase-declarations/m3-p6.json:4 or is a standing pre-authorized
extra (`test/behaviors.json`, the phase work history). Nothing off-list.

`MECHANISMS.md` is on the declaration and DID change (+11 lines). I checked what
changed, because editing the interim file to match the seed would game criterion
8's superset check. It is PROSE ONLY: a paragraph saying the file has been
converted and that new rows go in the index rather than here. No table row was
added, removed or reworded, so the twelve-name derivation keeps its independent
source. The paragraph also states the consequence I confirmed empirically under
criterion 8, that a row added below reddens the test.

All eighteen new behaviours in the plan's list are present in
`test/behaviors.json` and each resolves to a test by name.

## Suite, final clean measurement (no concurrent tree mutation)

Two of my earlier background runs were contaminated by my OWN defangs running
concurrently; I say so under findings rather than quietly discarding them. The
numbers below are from a run made after every probe had finished and the tree
was verified clean.

| toolchain | build state | invocation | tests | pass | SKIPPED | exit |
|---|---|---|---|---|---|---|
| node v22.22.2 | `dist/` built | `npm test` | 614 | 612 | 2 | 0 |
| node v22.22.2 | `dist/` built | bare `node --test` from the root | 616 | 614 | 2 | 0 |

The two skips are NAMED, not inferred, from the run's own TAP directives:

```
ok 162 - doctor in a healthy fleet exits 0 # SKIP local Node v22.22.2 is below the kernel floor >=26; exit-0 witnessed on CI (Node 26)
ok 166 - doctor with gh absent exits 0 under the generic profile # SKIP local Node v22.22.2 is below the kernel floor >=26; exit-0 witnessed on CI (Node 26)
```

Two skips, both the floor-gated `doctor` tests, which is what the default
toolchain skips at any head. That is the "zero unaccounted tests" half of
criterion 6 discharged: nothing is skipped for a reason connected to this phase.

The two-test gap between invocations is the tracked `sandbox/test/greet.js`
fixture that `package.json`'s test script glob excludes, exactly as the standing
warning describes. Both numbers match the work history's own table
(delivery/work-history/m3-p6.md:797), independently reproduced.

I did NOT run the third axis (`dist/` absent), so the work history's third row
(614 / 603 / 11 skipped) is unverified by me.

## Gates I ran myself

| gate | status | units | note |
|---|---|---|---|
| `clause-map` | green | 47 clause-map rows checked | |
| `agent-rules-drift` | green | 18 rendered gate rows compared | |
| `manifest-self-check` | green | 8 schema documents validated | |
| `brief-drift` | green | 18 generated brief gate rows compared | run directly, and as the extracted workflow step |
| `scope` | not-applicable | 0 | my worktree is DETACHED, so the branch is `HEAD` and the phase-branch precondition is unmet |
| `citations` | not-applicable | 0 | no changed path falls under the gate's `documents` globs |

The `scope` not-applicable is an artifact of reviewing from a detached worktree,
not a property of the phase: the precondition reported "branch HEAD does not
match `^(?:claude/m[0-9]+-p[0-9]+-.*)$`". I audited the 24 paths by hand instead
(above) and found none off-list. The phase's own run on the real branch reports
`scope: green (24 changed paths audited)`, which matches my count of 24.

The `citations` not-applicable independently CONFIRMS the work history's own
disclosure at delivery/work-history/m3-p6.md:893: none of the 24 changed paths is
under the citations gate's document globs, so no citation in the work history was
resolved by a gate. The implementer says so and resolved them with a script of
their own; I did not re-resolve all 49.

## Findings

### F1 (LOW): criterion 9(b)'s registered weakening arm is proved in memory, not by re-running the check

test/implementer-brief.test.ts:569 constructs the two-item weakening as a STRING
operation and asserts that the result no longer contains item 3:

```
  const weakened = items.slice(0, 2).every((item) => clause.replace(items[2], "").includes(item));
  assert.ok(weakened, "the two-item weakening could not be constructed");
  assert.equal(clause.replace(items[2] as string, "").includes(items[2] as string), false, ...);
```

It never re-runs the predicate over the weakened text and observes a failure, so
strictly it proves the weakening is CONSTRUCTIBLE rather than that it REDDENS.
Every other both-directions arm in this phase edits a file and re-executes.

NOT a defect in the guard: I forced two real defangs against the brief file and
both redden with the right message (see criterion 9(b) above). Recorded so the
shape is visible, because this is the form that becomes a false green if the
assertion loop above is ever changed.

### F2 (LOW): the wiring witness spec's two dangerous states both make the step NOT RUN; neither makes it run toothlessly

`witness/brief-drift-check-wired-executably.json` declares exactly two mutations
of `.github/workflows/gates.yml`: deleting the step, and adding
`if: github.event_name == 'pull_request'`. Both are "the step does not execute on
some arm", and each trips a workflow-SHAPE assertion in the test
(`found.length === 1`, `step.if === undefined`). Neither reaches the EXECUTED
half, which is the half criterion 11 exists for.

The structurally different member is the step that RUNS and is toothless. I
forced it (dropping `--check`, so the script runs in print mode and always exits
0) and the test IS red against it:

```
error: 'the wired step exited 0 with the registry ahead of the brief'
```

So the guard is correct today. The narrow gap is that the red-witness GATE, which
is what re-evaluates these arms on later heads, exercises only the two mutations
below and neither of them reaches the exit-code assertions. The spec's own
`dangerousStates`, quoted so the claim is checkable rather than asserted:

```
  "dangerousStates": [
    { "kind": "mutation", "file": ".github/workflows/gates.yml",
      "find": "      - name: Implementer brief gate-list drift ...\n        run: node scripts/check-brief-drift.mjs --check\n",
      "replace": "" },
    { "kind": "mutation", "file": ".github/workflows/gates.yml",
      "find": "      - name: Implementer brief gate-list drift ...\n        run: node scripts/check-brief-drift.mjs --check\n",
      "replace": "      - name: ...\n        if: github.event_name == 'pull_request'\n        run: node scripts/check-brief-drift.mjs --check\n" }
  ]
```

Both replace the step wholesale; neither leaves a step whose `run:` is present
and toothless. Mitigating: the sibling spec
`witness/implementer-brief-gate-list-drift.json` defangs the check's LOGIC in two
places (`renderBriefGateBlock`'s mode filter, and `describeDrift`'s return), so
the check's own logic is re-evaluated even though the step's ARGUMENTS are not.

### F3 (LOW): the brief declares its own gate-list mode, and no test asserts it is `full`

`locateGateBlock` reads the mode from the brief's own begin marker, deliberately
(scripts/check-brief-drift.mjs:213 explains why a `--mode` flag would be worse).
Nothing then pins WHICH mode the shipped brief declares. Switching the marker to
`local-only` and re-rendering produces a green drift check over a brief that
advertises five gates instead of fifteen:

```
$ <marker changed to (mode: local-only)>
$ node scripts/check-brief-drift.mjs --write
check-brief-drift: rewrote the local-only gate block in roles/implementer.md (8 row(s) from gate-registry.yaml)
$ node scripts/check-brief-drift.mjs --check
brief-drift: green (8 generated brief gate rows compared)
CHECK_EXIT=0
ROWS=5   (manifest-self-check, credential-scrub, suite, agent-rules-drift, brief-drift)
```

That would be a real instruction-surface defect: every future implementer shown
five gates instead of fifteen, with the drift check green.

IT IS CAUGHT TODAY, and I verified that rather than assuming it:

```
$ node --test test/implementer-brief.test.ts
not ok 4  - adding a gate to the registry without re-rendering ...
not ok 14 - the brief-drift step wired into the gates workflow is executed ...
# pass 13  # fail 2
```

But it is caught INCIDENTALLY: both tests plant a gate declared `modes: [full]`
(test/implementer-brief.test.ts:263 and :643), so under a `local-only` brief the
planted gate is filtered out, no drift appears, and the tests fail because they
expected drift. A future edit that changed the planted gate's modes would remove
the guard without touching anything that looks like a mode assertion. A one-line
direct assertion that the shipped brief declares `full` would make this
intentional. Severity LOW because there is no live defect and the state is
currently detected.

## The full PR gate bundle, run by me

```
$ bash scripts/m2-exit-test.sh --base origin/main --head HEAD --phase m3-p6 --bundle pr --no-build <evidence>
gates: declared 12 applicable 7 verdict 7 green 7 red 0 not-applicable 5 error 0 vacuous 0
gates: required gate(s) not applicable: citations, scope
m2-assert (PR bundle): FAIL with 1 finding(s):
  - [scope] expected status green, observed not-applicable (precondition
    scope-branch-is-a-phase-branch evaluated and unmet: branch HEAD does not
    match ^(?:claude/m[0-9]+-p[0-9]+-.*)$)
m2-exit-test: FAILED: the PR bundle does not match section 1.4's PR-bundle column (assertion exit 1)
EXITTEST_EXIT=1
```

Per-gate, from the run's own summary:

| gate | status | units |
|---|---|---|
| manifest-self-check | green | 8 schema documents validated |
| coverage | green | 115 finding ids checked |
| credential-scrub | green | 7 credential sources probed |
| credential-token | not-applicable | 0 |
| suite | green | **614 tests reported** |
| citations | not-applicable | 0 |
| scope | not-applicable | 0 |
| deploy | not-applicable | 0 |
| migrations | not-applicable | 0 |
| clause-map | green | 47 clause-map rows checked |
| red-witness | green | **19 witnesses evaluated** |
| brief-drift | green | 18 generated brief gate rows compared |

**THE ONE FAILURE IS MY SETUP, NOT THE PHASE, and I checked that rather than
assuming it.** The assertion failed on exactly one row, `scope`, and only because
this review worktree is DETACHED, so the branch reads `HEAD`. The three facts the
precondition needs all hold on the real branch:

```
$ git rev-parse origin/claude/m3-p6-delivery-role-briefs
16bab6fcaf54f0c419c40fa4a42467eefef8cf0e
$ git rev-parse HEAD
16bab6fcaf54f0c419c40fa4a42467eefef8cf0e
$ node -e 'console.log(require("./delivery/plan/phase-declarations/m3-p6.json").branch)'
claude/m3-p6-delivery-role-briefs
```

The reviewed head IS the tip of the phase branch, and the declaration's own
`branch` field equals that branch, which is what the gate compares. I could not
check the branch out here because another worktree holds it, so I did not
reproduce a green `scope` myself; the phase's own run reports
`scope: green (24 changed paths audited)` and my hand audit of the same 24 paths
found none off-list.

The branch-name rule also holds, checked with the command the agent-rules file
gives:

```
claude/m3-p6-delivery-role-briefs  true    (the phase's own implementation branch, correct)
claude/reviews-m3-p6               false   (the review-evidence branch, correctly does NOT match)
```

`red-witness: green (19 witnesses evaluated)` is the load-bearing row for F2:
every declared dangerous state in every witness spec was re-evaluated and each
reddened its test. `suite: green (614 tests reported)` matches my own `npm test`
count exactly.

## Verdict

All eleven acceptance criteria (1, 2, 3, 4, 5, 6, 7, 8, 8b, 9a-c, 9d, 10, 11)
are **MET**, each walked by execution with both directions forced where the
criterion asks for them. Three LOW findings, none blocking, none a live defect.

The two criteria I was told to walk hardest both hold in their strong form:
criterion 11's check is a genuine behaviour (a still-present but toothless
workflow step is caught because the step is executed and its exit code observed),
and criterion 8's count is genuinely derived (adding a thirteenth interim row
reddens the test naming it, where a pinned twelve would not).

## The claim grep over this document, both forms

Run against this report itself, after the settlements above.

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/review/clean-room-m3-p6-criteria.md
340, 367, 493, 550, 598, 752, 771, 873

MATCHING_LINES=8
RAW_OCCURRENCES=18
FLATTENED_OCCURRENCES=19
```

**18 does not equal 19, and the gap is the point of running the second form.**
Counts are compared like with like (occurrences against occurrences, never
matching-lines against occurrences, which would have looked like ten missed hits
and been a false alarm). The one extra occurrence was located rather than
shrugged at:

```
$ node -e '<regex with \s+ for the space, reporting matches containing a newline>'
WRAPPED[is covered]: [[24811,"\"is\ncovered\""]]
```

It is the phrase "The push arm is / covered" in my own not-settling paragraph,
split across a hard wrap. The line-based grep could not see it; the flattened
form could. It is a QUOTATION of the claim sitting immediately beside the
paragraph that declines to settle it, which is the permitted shape.

Settlement of every hit:

| line | hit | settled by |
|---|---|---|
| 340 | "Never inherit force semantics" | quotation of the brief's own clause text; the test asserting it was run (criterion 8b) |
| 367 | the whole grep pattern | pasted verbatim inside captured test output |
| 493 | "never a terminal green" | quotation of the composed brief, cited to cr-criteria.md:76 and grepped |
| 550 | "always exits 0" (print mode) | the adjacent defang-A capture: the test reddens with "the wired step exited 0 with the registry ahead of the brief" |
| 592 | "The push arm is covered" (wrapped) | quoted in order to be declined; restated as an open question in the same paragraph |
| 598 | "needs an observed CI run" | statement of what would settle it, not a claim that it is settled |
| 752 | "It never re-runs the predicate" | the test source is quoted directly above the sentence |
| 771 | "always exits 0" | same capture as line 550 |
| 873 | "precondition needs all hold" | followed immediately by the three captured `git rev-parse` / declaration commands |

Byte checks on this document, both forms with `-a`:

```
$ grep -qaP '[^\x00-\x7F]' <this file>                 -> non-ascii: none
$ grep -qaP '[\x00-\x08\x0B\x0C\x0E-\x1F]' <this file> -> control chars: none
$ grep -c '<em dash>' <this file>                      -> 0
```

No captured output in this document required transliteration: nothing pasted here
came from Node's test-reporter summary lines, and all suite totals are quoted as
numbers rather than as reporter output. Where I quote a failing test I quote the
TAP `not ok` line and the `error:` field, which are plain ASCII.
