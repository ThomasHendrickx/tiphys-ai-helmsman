# Clean-room review, M3-P7, criteria contract

- Subject: branch `claude/m3-p7-review-checklists`, PR #124, head 4bfa790
- Contract: criteria. Every acceptance criterion of M3-P7 in
  delivery/plan/kernel-plan-m3.md:3851 walked and EXECUTED.
- Reviewer: clean-room agent A. Did not write this code.
- Report branch cut from `origin/main` at d5051e5 (T-019).
- Status: IN PROGRESS (appended incrementally; mtime is the beacon).

## Citation convention in this document

This report sits on `main`. Files the branch CHANGES are quoted in backticks
and are deliberately non-resolving, per CLAUDE.md:155. Only paths byte-identical
on both sides are cited as `path:line`.

## Criteria walked

(appended below as each is executed)

## Toolchain, build state, invocation (the complete suite sentence)

Node v26.6.0 from the scratch prefix (`node --version` checked in the running
shell), `dist/` BUILT via `npm run build` (exit 0), invocation `npm test`, in a
worktree at head 4bfa790:

    npm ci exit=0
    npm run build exit=0
    tests 688 / pass 688 / fail 0 / SKIPPED 0 / todo 0
    npm test exit=0

That matches the work history's own sentence.

## Criterion 1: `validate --type checklist` exits 0 on the checklists

EXECUTED. The literal command in the criterion exits 1:

    $ node bin/tiphys.ts validate --type checklist checklists/clean-room.yaml
    SKIPPED gate-probes-resolve no context
    EXIT=1

All five checklists behave the same way. With `--context` they exit 0:

    $ node bin/tiphys.ts validate --type checklist --context . checklists/clean-room.yaml
    EXIT=0
    $ node bin/tiphys.ts validate --type checklist --context . checklists/hazard-review.yaml
    EXIT=0

This is NOT new behaviour introduced by the phase. The same shape is already
merged on `main` from M3-P3, measured in the same worktree on a file the branch
does not change:

    $ node bin/tiphys.ts validate --type assurance-modes assurance-modes.yaml
    SKIPPED charter-mode-enum-matches-modes no context
    SKIPPED mode-conditions-quote-granted-by no context
    SKIPPED mode-gate-sets-resolve no context
    EXIT=1

Verdict: DISCHARGED under the repository's established `--context` convention.
The criterion's wording (and criterion 4e's) omits `--context`; recorded as
finding CR-01 (LOW).

## Criterion 2: probe injection, all directions (R-054)

EXECUTED, four directions, all against the built branch:

| extra file | exit | output |
|---|---|---|
| disjoint probe | 0 | `probes 24` (23 canonical + 1), the extra last |
| reuses `correctness-zero` | 1 | `probe id correctness-zero is declared in checklists/clean-room.yaml and again in <extra>` |
| `evidence-required: false` | 1 | `... does not require evidence; every extra probe must set evidence-required: true` |
| `evidence-required` ABSENT | 1 | `INVALID #/probes/0/evidence-required required property evidence-required is missing` |

The collision message names BOTH sources, which is what the hazard class asks
for (a silent last-wins override). DISCHARGED.

## Criterion 4c: framings differ at the entry point

EXECUTED:

    --framing criteria-contract  -> exit 0, first probe criteria-walked-with-evidence
    --framing destructive-paths  -> exit 0, first probe destructive-authority-declared
    --framing nope               -> exit 1, "declares no framing nope; it declares
                                    criteria-contract, destructive-paths, fix-round"

Each framing resolves 23 probes, so no framing drops one. DISCHARGED.

## Criterion 4d: `--framing fix-round` heads on `fix-round-not-covered`

EXECUTED at the command level:

    --framing fix-round -> exit 0, "1. fix-round-not-covered [fix-round] evidence-required"

Noted for the test-reachability check below: the DEFAULT resolution, with no
framing at all, also heads on `fix-round-not-covered`, because that probe is
first in the file. This is exactly the confound the fix round says it closed;
checked separately.

## Criterion 4d, re-derived: does the test REACH the ordering arm?

This is the arm the fix round says it closed, so I mutated the resolver myself
rather than reading the round's table. Both mutations are the two members the
witness spec declares; both were applied to a working copy of `src/checklists.ts`
and reverted from a pristine copy afterwards (`git status --porcelain` empty).

Named tests, run with `--test-name-pattern` BEFORE the positional path:

| mutation | `...fix-round-not-covered first...` | `...first probes differ` |
|---|---|---|
| pristine (control) | pass 1 fail 0 | pass 1 fail 0 |
| scope match in `orderUnderFraming` defanged | **fail 1** | **fail 1** |
| `orderUnderFraming` call bypassed | **fail 1** | **fail 1** |

The failure message under the first mutation is the hoisted-probe assertion:

    actual: 'criteria-walked-with-evidence'
    expected: 'fix-round-not-covered'

So the round's claim holds as measured: BOTH members redden BOTH named tests,
which is what the harness's conjunctive `red` predicate requires. DISCHARGED,
both directions plus the arm the file order alone could satisfy.

## Criterion 3: `gate-probes-resolve`, registry to checklist

EXECUTED, all three captures, against a staged context holding a copy of
`gate-registry.yaml`:

    control, shipped checklist        -> EXIT=0
    probe deleted from the checklist  -> EXIT=1
      INVALID #/probes gate unit-tests-for-changed-service-methods in <ctx>/gate-registry.yaml
      names probe unit-tests-for-changed-service-methods, which no probe in this
      checklist declares (check: gate-probes-resolve)
    check DEREGISTERED, same fixture  -> failed=false, lines []
    check RE-REGISTERED               -> failed=true

Names the gate AND the probe id. DISCHARGED.

## Criterion 3c: the other direction, checklist to registry

EXECUTED, two structurally different members plus the deregistration.

Member 1, gate id RENAMED to `unit-tests-for-changed-service-methods-v2`:

    EXIT=1
    INVALID #/probes/21/verifies-gate probe unit-tests-for-changed-service-methods
      is named by gate unit-tests-for-changed-service-methods-v2 ... and its
      verifies-gate says unit-tests-for-changed-service-methods
    INVALID #/probes/21/verifies-gate probe unit-tests-for-changed-service-methods
      verifies gate unit-tests-for-changed-service-methods, which <ctx>/gate-registry.yaml
      does not declare (check: gate-probes-resolve)
    restoring the name -> EXIT=0

Member 2, gate entry DELETED (gates 15 -> 14, asserted before running):

    EXIT=1
    INVALID #/probes/22/verifies-gate probe fixtures-for-changed-component-states
      verifies gate fixtures-for-changed-component-states, which <ctx>/gate-registry.yaml
      does not declare (check: gate-probes-resolve)
    check DEREGISTERED -> failed=false, lines []
    check RE-REGISTERED -> failed=true

The two fail through different lookups, as the criterion requires. DISCHARGED.

## Criterion 4: Kind A dangerous-instance rejections on the verdict schema

EXECUTED against a verdict I wrote, in a staged context holding
`templates/plan.example.yaml` as `plan.yaml` (phase `M9-P1`, acceptance ids
1 and 2, hazard classes H1 and H2) and the work-history template re-pointed at
that phase.

| instance | exit | diagnostic |
|---|---|---|
| control, complete `criteria` verdict | 0 | - |
| (a) APPROVE + `high` finding | 1 | `#/verdict value "APPROVE" is not one of the permitted values "FIX-ROUND-NEEDED"` |
| (a) APPROVE + `critical` finding | 1 | same |
| control, FIX-ROUND-NEEDED + `high` | 0 | - |
| control, APPROVE + `low` | 0 | - |
| (b) finding with no `concrete-fix` | 1 | `#/findings/0/concrete-fix required property concrete-fix is missing` |
| (c) no `produced-by` | 1 | `#/produced-by required property produced-by is missing` |
| (c) no `framing` | 1 | `#/framing required property framing is missing` |

Witnesses, each by editing `schemas/verdict.schema.json` in the working tree and
restoring it from a pristine copy (`git status --porcelain` clean afterwards):

| keyword removed | the rejected instance then |
|---|---|
| the `enum` inside `then` | APPROVE+high EXIT=0, APPROVE+critical EXIT=0; restored -> EXIT=1 |
| `concrete-fix` from `$defs.finding.required` | EXIT=0 |
| `produced-by` and `framing` from root `required` | both EXIT=0 |

Declared deviation 2 checked rather than taken: deleting `then` outright gives

    INVALID # schema is refused by this validator's strict policy

so it would witness nothing, and removing the inner `enum` is the correct
defang. The deviation's claim is TRUE as measured. DISCHARGED.

## Criterion 4b: Kind B completeness, both checks, both directions

EXECUTED.

    criteria[] omits criterion "2"     -> EXIT=1, "acceptance criterion 2 of phase M9-P1
                                          in <ctx>/plan.yaml has no entry, so this review
                                          did not walk it (check: verdict-criteria-complete)"
    criteria[] names criterion "99"    -> EXIT=1, "...declares no such acceptance criterion"
    deviations-judged omits one        -> EXIT=1, "(check: verdict-deviations-judged)"
    deviations-judged invents one      -> EXIT=1, "...declares no such deviation"

Deregistration witnesses, run through the checks module:

    verdict-criteria-complete   REGISTERED failed=true / DEREGISTERED failed=false []
                                / RE-REGISTERED failed=true
    verdict-deviations-judged   REGISTERED failed=true / DEREGISTERED failed=false []
                                / RE-REGISTERED failed=true

DISCHARGED.

## Criterion 4e: hazard checklist and `verdict-hazard-classes-addressed`

EXECUTED.

    validate --type checklist --context . checklists/hazard-review.yaml -> EXIT=0
    probe-id sets: clean-room 23, hazard-review 9, SHARED []
    hazard-review resolved head: "1. hazard-classes-addressed [hazard-classes]"

Check, all three captures plus the contract discrimination:

    hazard verdict, both classes addressed   -> EXIT=0
    hazard verdict, H2 omitted               -> EXIT=1, "hazard class H2 of phase M9-P1
                                                 ... did not address it
                                                 (check: verdict-hazard-classes-addressed)"
    check deregistered, same fixture         -> failed=false, lines []
    check re-registered                      -> failed=true
    THE SAME incomplete document with only `review-contract` flipped to
    `criteria`                               -> EXIT=0

That last row is the strong form of "a criteria verdict is unaffected": the
green comes from the contract discriminating, not from the check being inert.
DISCHARGED.

## Criterion 3b: probe-text specificity, both directions

EXECUTED. The tests assert the required substrings AND assert that a generic
rewrite fails the same predicate, but that negative control lives inside the
test rather than in the shipped file, so I weakened the SHIPPED probe text
instead and re-ran the named tests. Controls first, read from TAP `ok` lines so
a pattern that matched nothing could not read as green (see the measurement
note below):

    ok 1 - the R-027 probe carries the process document's own zero illustration ...
    ok 1 - the R-055 correctness probes are separate entries naming negative, zero, empty and unicode
    ok 1 - the destructive-authority probe names all three of its questions and cites destructiveCommands by name
    ok 1 - the R-059 and R-093 probes name a consumer-search action rather than asking a bare question
    ok 1 - the R-066 flake-playbook probes name the three-consecutive-reds threshold

Then, one weakening at a time, each restored from a pristine copy afterwards:

| probe replaced with the plan's own generic phrasing | result |
|---|---|
| `fix-shape-state-that-cannot-exit` (R-027) | `not ok` |
| `correctness-zero` (R-055) | `not ok` |
| `destructive-authority-declared` | `not ok` |
| `blast-radius-consumers` (R-059) | `not ok` |
| `shared-consumer-render-and-decide` (R-093) | `not ok` |
| `flake-three-consecutive-reds` (R-066) | `not ok` |

The third question of `destructive-authority-declared` is answerable: the list
it tells the reviewer to open is really there.

    $ node -e 'console.log(JSON.stringify(require("./gates.manifest.json").destructiveCommands))'
    ["pool destroy","teardown","src/pool.ts","src/teardown.ts"]

and that array is at gates.manifest.json:189, unchanged by this branch.
All five sets the criterion names. DISCHARGED.

## Criterion 4f: the two unexecuted-claim probes (T-006)

EXECUTED, same method. Controls green; weakened to "Check claims are
supported.":

    claim-impossibility-constructed -> not ok
    claim-coverage-constructed      -> not ok
    class-witness-has-two-members   -> not ok  (weakened to "Check that class
                                                tests are adequate.")

Two structurally different members. DISCHARGED.

## Criterion 5: the harness evidence fixture

EXECUTED, and checked for provenance rather than shape alone.

    $ git cat-file -t ce819fd && git cat-file -t ec77c7d      # both commit
    ce819fd Exit-test harness: assert over the bundle's rows, not only over the expectation table (#109)
    ec77c7d M3-P6: delivery-role briefs, the mechanism index seed, and the brief gate-list drift check (#105)

The fixture's `base` and `head` are the full shas of those two commits, its
single evaluation names `witness/modes-type-registered.json`, its two members
each record three runs with exit codes 1/1/0 and `red` true/true/false, and its
`appliedDiff` carries `index 4431a7d..` for `src/commands/validate.ts`, which is
the same pre-image blob the branch's own diff of that file shows. Those are
facts a hand-written file would have had to get right by coincidence.

The provenance note's kept-field list checked against the file: `headGreen` and
`baselineSha` are per-MEMBER fields and both are present (`headGreen: true`,
`baselineSha: ce819fd...`). The note is accurate.

Reachability of the guarding test, measured:

| mutation | result |
|---|---|
| pristine | `ok 1 - the red-witness fixture is a real captured harness evidence file...` |
| one run's `exitCode` flipped to 0 while `red` stays true | `not ok` |
| `dangerousStates[0].find` edited in witness/modes-type-registered.json:8 | `not ok` |

The second mutation is the staleness coupling the fixture's own note declares.
DISCHARGED.

## Criterion 6: suite, clause map, behaviors

EXECUTED.

    $ node scripts/check-clause-map.mjs --evidence <dir>
    clause-map: green (60 clause-map rows checked)
    60 rows checked, 14 pending a phase not yet in force
    EXIT=0

The clause map is keyed by requirement id; the thirteen this phase appends are
R-026b, R-027, R-028a, R-050b, R-053, R-054, R-055, R-056a, R-057b, R-059,
R-060, R-066, R-093, which is exactly the citations list at
delivery/plan/kernel-plan-m3.md:3970. Earlier mappings still resolve (the run is
whole-file).

Behaviors: the plan declares 24 new behavior ids for this phase; all 24 are
present in the registry (`MISSING: []`), plus the one the fix round added.

Suite: 688 tests, 688 pass, 0 fail, 0 SKIPPED, exit 0, node v26.6.0, `dist/`
built, invocation `npm test`. DISCHARGED.

## Beyond the criteria: does this work for a USER of the kernel?

The criteria are all about the repository tree. A kernel user gets a tarball, so
I packed and installed one.

    $ npm pack --pack-destination <dir>              exit 0, 160 files
    $ npm init -y && npm install ./tiphys-kernel-0.0.0.tgz     exit 0

`package.json`'s `files` carries `checklists`, and all five checklists plus both
new schemas are in the tarball. From the installed package:

| command | exit |
|---|---|
| `tiphys checklist resolve --checklist clean-room` | 0, 48 lines, head `fix-round-not-covered` |
| `tiphys checklist resolve --checklist hazard-review` | 0, head `hazard-classes-addressed` |
| `tiphys checklist resolve --checklist clean-room --framing fix-round` | 0, head `fix-round-not-covered` |
| `tiphys checklist resolve --checklist clean-room --extra <colliding>` | 1, names both sources |
| `tiphys validate --type checklist --context <pkg> <pkg>/checklists/clean-room.yaml` | 0 |
| `tiphys validate --type checklist --context <pkg> <pkg>/checklists/hazard-review.yaml` | 0 |
| `tiphys validate --type verdict --context <ctx> <APPROVE+high>` | 1 |
| `tiphys validate --type verdict --context <ctx> <complete>` | 0 |

So `packageRoot()` resolves `checklists/` correctly from `dist/` inside an
installed package. Nothing is broken for a consumer.

Two operator-path hazards probed directly, both handled:

    --extra <a real mkfifo>   -> exit 1 in under 20s, "is a named pipe, not a
                                 regular file, so it was not opened" (no hang)
    --extra <a directory>     -> exit 1, "is a directory, not a regular file"

And `checklist resolve` validates the CANONICAL checklist before serving it:
with a duplicate probe id injected into the shipped file, the command refuses
rather than printing a list whose lookups are ambiguous.

    tiphys checklist: .../checklists/clean-room.yaml is not a valid checklist
    document, so it is not served
    INVALID #/probes/5/id probe id criteria-walked-with-evidence is already
    declared at #/probes/4/id ... (check: checklist-probe-ids-unique)
    EXIT=1

## The fix round's own claims, re-derived rather than taken

The round's stated mechanism is the harness's red predicate, quoted from
src/witness/run.ts:886 (byte-identical on `main` and on the branch, checked with
`cmp`):

    red: exitCode !== 0 && failed.length === tests.length,

A member is red only when EVERY test the spec names fails, so a spec whose
members map one-to-one onto its named tests reddens no member. The round's
table claims four two-test specs are safe and two were not. I re-measured all
four surviving two-test specs by applying each declared member to the working
tree and running the spec's named tests:

| spec | member 0 | member 1 |
|---|---|---|
| `checklist-framing-orders-by-position` | both named tests `not ok` | both `not ok` |
| `checklist-orphan-probe-detection` | both `not ok` | both `not ok` |
| `checklist-gate-probes-registry-direction` | both `not ok` | both `not ok` |
| `verdict-type-registered` | both `not ok` | both `not ok` |

Every mutation was reverted from a pristine copy; `git status --porcelain` is
empty at the end.

Cause B re-derived independently: no `destructiveCommands` entry appears as a
substring anywhere in `test/verdict-schema.test.ts` or `test/checklists.test.ts`
at this head. The round's claim holds.

Claim grep over the work history, both forms:

    grep -nEi '...' delivery/work-history/m3-p7.md    -> 11 matching lines
    tr '\n' ' ' | grep -oEi '...'                     -> 11 occurrences
                                                         (3 "cannot be", 8 "never")

Line-visible count equals total, so nothing is hidden by a wrap.

## Findings

### CR-01 (LOW): criteria 1 and 4e name a command that exits 1 as written

The criteria say `tiphys validate --type checklist` exits 0 on the checklists,
and `tiphys validate --type checklist checklists/hazard-review.yaml` exits 0.
Measured, both exit 1 with `SKIPPED gate-probes-resolve no context`; they exit 0
only with `--context`.

Why this is LOW and not a blocker: the behaviour is the merged convention from
M3-P3, reproduced in the same worktree on an artifact this branch does not
touch (`validate --type assurance-modes assurance-modes.yaml` -> three SKIPPED
lines, exit 1). A cross-document check that could pass by not running is the
vacuous shape the derived-check mechanism exists against, so exiting nonzero is
the right behaviour and the criterion's wording is what is loose. Nothing a user
does breaks; the diagnostic names the missing input.

Concrete fix: none required in code. If anything is edited, it is the criteria's
wording in the plan, and that is the orchestrator's call, not a fix round.

### CR-02 (LOW): a framing whose scopes are all misspelled validates, and
`--framing` becomes cosmetic

`orderUnderFraming` groups probes by `applies-to` and leaves unmatched probes in
file order, and nothing validates that a framing's `orders-probes` entries name
scopes any probe carries. `schemas/checklist.schema.json` constrains those
entries only to the token pattern.

Measured, by appending one framing to a COPY of the shipped clean-room
checklist whose two scopes are `destructive-commands` and `blast-radiuss`
(both misspelled):

    validate --type checklist --context <ctx> <copy>   EXIT=0
    NO framing         -> head: fix-round-not-covered
    --framing all-typo -> head: fix-round-not-covered
    identical order to no-framing: true

That is the phase's own hazard-class item word for word ("a framing that
reorders the list without changing the ENTRY POINT, so `--framing` is cosmetic
and the T-001 decorrelation is nominal"). Criterion 4c reddens against it for
the two SHIPPED framings, which a test asserts and which I re-measured, so
nothing shipped today is cosmetic. What has no guard is the CLASS: a framing
added by a later phase.

Why LOW rather than MEDIUM under DR-0027: reaching it requires an authoring
mistake in a future shipped checklist, and a kernel user has no way to make one,
because `--extra` does not introduce framings. Settled by construction rather
than asserted: an extra file carrying its own `framings[]` is itself a valid
checklist document, and the framing it declares is still unreachable.

    $ node bin/tiphys.ts validate --type checklist --context <ctx> <extra-with-framing>
    EXIT=0
    $ node bin/tiphys.ts checklist resolve --checklist clean-room \
        --extra <extra-with-framing> --framing user-supplied-framing
    tiphys checklist: .../checklists/clean-room.yaml declares no framing
    user-supplied-framing; it declares criteria-contract, destructive-paths, fix-round
    EXIT=1
    $ ... same --extra without --framing
    EXIT=0, probes 24

So the extra probe merges and the extra framing does not. It threatens a future
phase's artifact, not a user path.

Concrete fix, if taken: a derived check for type `checklist` asserting every
`framings[].orders-probes` entry equals some probe's `applies-to`, and a
witness with two members (one scope wrong, all scopes wrong). Roughly the size
of `checklist-probe-ids-unique`.

### CR-03 (LOW): `verifies-gate` may name a gate that verifies nothing by
checklist

A probe carrying `verifies-gate: suite` validates, because the check asks only
that the named gate id exists in the registry.

    <clean-room copy + probe "bogus-backref" verifies-gate: suite>   EXIT=0

Criterion 3c asks exactly for "resolves to a gate id present in
`gate-registry.yaml`", so this is inside the criterion and not a miss. It is
recorded because the back-reference reads as an assertion of a relationship the
registry does not have: `suite` is a script gate and names no probe. No gate
run consumes the field, so nothing breaks.

Concrete fix, if taken: tighten the same check to require the named gate's
`verified-by` to be a `-checklist` verifier. One added condition where the
`endsWith("-checklist")` test already sits.

### Measurement hazard worth recording (not a finding against the phase)

`node --test --test-name-pattern <pattern>` reports `tests 1 / pass 1 / fail 0`
when the pattern matches NOTHING. Measured on node v26.6.0 in this worktree with
`^this test name does not exist anywhere$`. So a green from a mistyped pattern is
indistinguishable from a green from a passing test, and any control run that
reads only the counters is worthless. Every control above was re-read from TAP
`ok <n> - <name>` lines instead. This is node's behaviour and not this phase's,
but it bit me once in this review and it is the same shape as the guard-that-
cannot-go-red the repository keeps paying for.

## What this review did NOT cover

- **The `red-witness` gate itself was not re-run here.** CI is reported green by
  step at 4bfa790 and I took that for the gate bundle. What I did instead is
  re-measure the four multi-test witness specs member by member, which is the
  arm the fix round was about. The other 30-odd stored witnesses were not
  re-evaluated by me.
- **The CI push arm was not observed.** T-009: a gate result is evidence only
  for the configuration it ran under, and the post-merge `push` run on the new
  `main` head is the orchestrator's to watch.
- **Probe QUALITY is out of scope and no execution decides it.** Criterion 3b
  and 4f constrain the text of eight probes; the other twenty-two in
  `checklists/` and the twenty in the other four files are prose I read but did
  not test. The phase declares this residue and so does the plan.
- **The scope, citations, brief-drift and agent-rules-drift gates were not run
  by me.** They are in the CI bundle and are reported green by step.
- **I did not exercise `--extra` against the four non-clean-room checklists**,
  nor `--framing` against them (none declares `framings[]`).
- **The verdict checks were exercised against a context I staged from
  `templates/plan.example.yaml` and the work-history template re-pointed at
  phase `M9-P1`**, which is the same shape the implementer used. I did not build
  a context from a real kernel plan document.
- **One unexplained observation, left open rather than dressed as a finding.**
  A single `git diff --stat` in this session reported
  `checklists/clean-room.yaml | 2 +-` immediately after a test run, while
  `git status --porcelain` was empty a moment later and the file's md5 matched
  HEAD. I could not reproduce it in a dedicated run of the whole
  `test/checklists.test.ts` file, and I found no writer: every write in that
  file goes to a `mkdtemp` scratch directory. I state it as an open question,
  not as a defect.

## Verdict

APPROVE.

Thirteen acceptance criteria (1, 2, 3, 3b, 3c, 4, 4b, 4c, 4d, 4e, 4f, 5, 6) were
walked by direct execution. Every one is discharged, with the single caveat that
criteria 1 and 4e name a command that needs `--context` to exit 0, which is a
pre-existing repository convention rather than a defect in this phase (CR-01).

The two things this review was asked to distrust both held under independent
measurement: the fix round's re-shaped witnesses redden on every member and
every named test, and the criterion-4d test now reaches the arm that file order
alone used to satisfy. Three LOW findings are recorded; none reaches a shipped
artifact through a real user path, and per DR-0027 none blocks a merge.
