# Clean-room review, M3-P7, criteria contract

- Subject: branch `claude/m3-p7-review-checklists`, PR #124, head 4bfa790
- Contract: criteria. Every acceptance criterion of M3-P7 in
  delivery/plan/kernel-plan-m3.md:3861 walked and EXECUTED.
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
