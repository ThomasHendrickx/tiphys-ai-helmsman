# Clean-room final sweep, group `gates`, CRITERIA contract

- Head under review: ad2428b76ef6f53f75b0d7f94c7db50463e077b7
- Group: gates (src/gates/**, src/witness/**), about 15.6k lines measured
  (`wc -l src/gates/*.ts src/witness/*.ts` reports 15620 total at this head).
- Contract: criteria. Framing: criteria-contract.
- Reviewer clone: /tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/sweep-gates-criteria/clone,
  detached at the head above, never pushed, never committed to.
- Phases whose acceptance criteria are walked: M2-P1 to M2-P9, M3-P1 to M3-P12,
  M4-P10, M4-P12, M4-P14, M4-P28, M4-P29.

This document is written incrementally and is not softened.

## Status log

(appended as work proceeds)

## Environment, stated as the complete sentence

- Interpreter: node v26.6.0 (`/tmp/claude-0/n26/bin/node`), confirmed in the
  shell that ran each command.
- Build state: `npm ci` then `npm run build` both run before the suite;
  `git status --porcelain` empty after the build.
- Invocation: `npm test`, which is `node --test "test/**/*.test.ts"`. The bare
  `node --test` form is a DIFFERENT command here (standing warning 12, third
  axis) and is not what is quoted below.
- Clone location: under `/tmp`, which matters: `grantTraversalWhenUnderTmp`
  in test/gates.test.ts:3517 opens the traversal chain only when the repo is
  under `tmpdir()`, and the scratch toolchain also lives under `/tmp/claude-0`.

### Suite run 1 (concurrent with this reviewer's own gate probes)

`npm test` reported ONE failing test:

    test at test/gates.test.ts:3571:1
    x a precondition command exiting nonzero is error, not a skip, whenever a
      path-shaped argv element cannot be opened: unreadable, after an option,
      or carrying whitespace (1027.731822ms)
      AssertionError: gate p11-attr wrote no record ...
      Error [ERR_MODULE_NOT_FOUND]: Cannot find module
      '<clone>/src/checks.ts' imported from '<clone>/src/commands/validate.ts'

The file is present and `git status --porcelain` is empty before and after the
run, so nothing was left mutated. Run in ISOLATION three times
(`node --test --test-name-pattern '...' test/gates.test.ts`) it passes 3/3,
exit 0 each time. Run 2 (below) re-measures it with no concurrent load from
this reviewer.


## Findings

### CR-FS-GATES-01 (medium) The `review` gate class is satisfied by naming a gate that has never asserted anything

`src/gates/gate-classes.ts` checks that a phase NAMES a registry gate for each
required class. It does not, and cannot, check that the named gate is capable of
asserting anything on the head under audit. Reproduced at this head:

    $ node src/gates/gate-classes.ts gate-classes --declarations <copy> \
        --registry gate-registry.yaml --result <f> --phase m4-p28
    gate-classes: green (3 declared gate classes checked)
    ... review: asserted by check-dual-review
    EXIT=0

    $ node scripts/check-dual-review.mjs --precondition .
    check-dual-review: 0 verdict document(s) (corpus: delivery/review read from
    commit ad2428b76ef6f53f75b0d7f94c7db50463e077b7, resolved from HEAD)
    EXIT=1

So on the same head the class check prints `review: asserted by
check-dual-review` while `check-dual-review`'s precondition is unmet. Because
that gate is declared `conditional` (gate-registry.yaml:287), its
not-applicable never reddens the bundle either.

Scope, measured: every one of the 17 phase declarations carrying `gateClasses`
satisfies `review` with exactly `{"gates":["check-dual-review"]}` and nothing
else.

Two carve-outs, each correct on its own, compose into the thing DR-0029 says
must not happen ("you can start from nothing; you can never SILENTLY have
nothing"): (a) gate-classes checks NAMING, not ASSERTING, and prints only
DECLARED ESCAPES on the green arm, not gates that were not applicable; (b)
check-dual-review is conditional, so its vacuity is invisible to the aggregate.
T-040 records the vacuity; it does not record that the class system counts the
vacuous gate as satisfaction. `delivery/work-history/m4-p14.md` contains no
occurrence of `check-dual-review` (grep, zero hits), so the residue is not named
anywhere.

Concrete fix: in `runClassGate`, when a class is satisfied by gate ids, print on
the green arm which of those ids were `conditional` in the registry, exactly as
the declared escapes are printed, and state in the module header that a named
gate's applicability is not checked here. A stronger fix, if wanted: let a
declaration name a gate for a class only when that gate is `required` in at
least one mode, and require an explicit escape otherwise.

### Suite run 2 (clean, no concurrent load from this reviewer)

    node v26.6.0; dist/ built by `npm run build`; invocation `npm test`
    (= node --test "test/**/*.test.ts"); working tree clean before and after.

    tests 1341
    pass 1341
    fail 0
    cancelled 0
    skipped 0
    todo 0
    duration_ms 314869.25975
    NPM_TEST_EXIT=0

That is the complete sentence. Run 1's single failure did not recur.

### CR-FS-GATES-02 (low) One gates test failed once under concurrent load and passes otherwise; the mechanism is not established

Stated rather than waved through, because a correctness gate that is
intermittent is the thing this repository keeps paying for. Evidence: run 1
(above) failed at test/gates.test.ts:3571 with `ERR_MODULE_NOT_FOUND` for
`<clone>/src/checks.ts` inside an unprivileged spawn; the file was present and
`git status --porcelain` was empty throughout. Isolation: 3/3 pass. Clean full
run: 1341/1341 pass, 0 skipped. The one variable that differed in run 1 is that
this reviewer was running `node bin/tiphys.ts gates run` and `src/gates/*.ts`
invocations from the same clone concurrently.

I did NOT establish the mechanism and I do not claim one. What I can say: the
test drops to an unprivileged uid (`runCliUnprivileged`, test/gates.test.ts:3530)
and relies on `grantTraversalWhenUnderTmp(repoRoot)` (test/gates.test.ts:3517),
which grants `o+rx` on the directory chain and says nothing about the
interpreter, which is the gap CLAUDE.md standing warning 1 already records.

Concrete fix: have `readGateRecord` distinguish a module-resolution failure in
the child from a wrong verdict (it already distinguishes "never ran"), and have
`runCliUnprivileged` assert, before the real spawn, that the unprivileged uid
can read `sourceEntry` and its transitive entry module, so a permission or
resolution failure reports as an environment failure by name rather than as a
missing record.

### CR-FS-GATES-03 (low) M2-P4 criterion 5 is no longer true of the shipped gate, and the M2 plan was never amended

REPRODUCED. Scratch repository, phase `M9-P1`, branch `claude/m9-p1-probe`,
declaration committed on `main` listing only `src/a.ts`, diff touching
`src/a.ts` and `src/b.ts`:

    ARM 1 (declaration untouched)      scope: red  (2 changed paths audited)   EXIT=1
    ARM 2 (head adds src/b.ts)         scope: green(3 changed paths audited)   EXIT=0
    ARM 3 (head removes src/a.ts)      scope: red  (0 changed paths audited)   EXIT=1

M2-P4 criterion 5 says "the gate stays red ... (the anti-widening property)".
ARM 2 is green. The declaration sha256 in the record IS still the merge-base
blob, so half the criterion survives and the verdict half does not.

This is DELIBERATE: M3-P11 change B, recorded at src/gates/scope.ts:108 and in
CLAUDE.md. The defect is documentary: `delivery/plan/kernel-plan-m2.md`
criterion 5 for M2-P4 still states the strong property with no supersession
note, while every other superseded M2 criterion in that file carries one (M2-P7
criterion 3 is the worked example, "Superseded, and replaced").

I also confirmed the three fix-round-1 compensations hold at this head:
a DIRECTORY PREFIX addition is named as such on the green arm, the addition is
printed on the GREEN arm, and a branch touching another phase's declaration is
RED (`this branch changes 1 path(s) under delivery/plan/phase-declarations/
that are not its own declaration`, EXIT=1).

Concrete fix: add a one-line supersession note to M2-P4 criterion 5 in
delivery/plan/kernel-plan-m2.md naming M3-P11 change B and DR-0031, in the same
form M2-P7 criterion 3 already uses.

### CR-FS-GATES-04 (low) M2-P6 criterion 1's pinned distribution is stale in the plan and correct in the test

Measured at this head:

    $ node src/gates/coverage.ts --result <f> --evidence <d>
    coverage: green (115 finding ids checked)
    115 inventory id(s) checked; per-kind: decision 6, milestone 98, phase 11;
    per-milestone: M1 11, M2 16, M3 74, M4 5, M5 3, decision 6
    EXIT=0

M2-P6 criterion 1 asks for "per-milestone counts M1 11, M2 16, M3 74, M4 13,
M5 1, parked 0, alongside per-kind counts phase 11 and milestone 104". Three of
those numbers are now different and a fourth bucket kind (`decision`) exists.
The total is preserved (115) and test/coverage-gate.test.ts:174 was rewritten by
M4-P13 to the new distribution with a comment saying so, so the CODE is right
and the PLAN is stale.

Related and worth naming because CLAUDE.md binding convention 5 forbids exactly
this shape: `expectedUnits: 115` is a hard-coded count over a growing inventory,
and it is in SHIPPED SOURCE (src/gates/coverage.ts:199), not in a config
document. Adding one requirement row to
`delivery/requirements/migration-table.md` reddens the required `coverage` gate
and the repair is an edit to `src/gates/coverage.ts`, which then has to be on
that phase's files-to-touch declaration. The rationale for having an anchor at
all (CR-986, a row lost from BOTH documents) is sound and I am not asking for it
to be removed.

Concrete fix: move the anchor out of the shipped default and into a
repository-local coverage config document read by `--config`, so a row addition
is a data edit rather than a source edit; and update M2-P6 criterion 1 in
delivery/plan/kernel-plan-m2.md with a supersession note naming M4-P13.

### CR-FS-GATES-05 (low) M4-P10's migration-cost grep missed two documents, and this project's only two real verdicts are now invalid against the shipped schema

REPRODUCED:

    $ node bin/tiphys.ts validate --type auto \
        delivery/evidence/m3-exit-test/e1/e1-7/verdict-criteria.yaml
    INVALID #/head required property head is missing
    EXIT=1

    $ node bin/tiphys.ts validate --type auto \
        delivery/evidence/m3-exit-test/e1/e1-7/verdict-hazard.yaml
    INVALID #/head required property head is missing
    EXIT=1

M4-P10 declared the migration cost measurably zero on the strength of
`grep -rln '^kind: verdict' delivery/review/` and
`grep -rl '"kind": *"verdict"' delivery/`. The first is scoped to
`delivery/review/`; the second uses the JSON spelling over the whole tree. The
two documents above are YAML, carry `kind: verdict` on line 1, and live under
`delivery/evidence/`, so neither grep could see them. That is the fix-round
contract's item 3 failure mode: a search whose scope is wrong returns an empty
result indistinguishable from an absence.

These are not inert fixtures. src/checks.ts:3039 calls them "where this
repository actually keeps its only two real verdicts", and
test/single-family-exception.test.ts:29 reads them at test time on purpose, so
the project's own corpus contains two documents that its own validator refuses.

Concrete fix: add `head:` to both documents with the head each review actually
read (`eb13da6b96137967d4a5b8311f0f044e75758b42` is named inside
verdict-criteria.yaml's own `produced-by` prose), or, if that head cannot be
established for the hazard document, record in the file why it is exempt.
Either way, re-run the migration grep in both spellings over the whole of
`delivery/` before closing it.

Severity reasoning, stated rather than assumed: LOW under DR-0027 rather than
medium, because I could not find a path on which the two invalid documents are
validated today. `check-dual-review`'s corpus is the TOP LEVEL of
`delivery/review` (src/checks.ts:3151 area), which excludes them; the wider
`delivery/` corpus is read only by M4-P11's falsifiers, which run only when a
single-family exception is DECLARED, and none is. Nothing in `npm pack`'s
`files` list ships `delivery/`. What is definitely wrong is the CLAIM of zero
migration cost and the fact that the project's two reference verdicts do not
validate; what is not established is any current red.

## The criteria walk

Convention: RAN means I executed something at this head and quote it; READ means
I read the shipped code and say what I read; NOT REACHED means exactly that,
with the reason. Where a phase's criteria have no subject inside
`src/gates/**` or `src/witness/**`, I say so rather than pretending to a walk.

### M2-P1 (gate contract, manifest, runner, pinning) -- RAN, all runner
semantics hold

Fixture manifests written to `<scratch>/fx/*.json`, each gate a small `emit.mjs`
that writes its own record, run through `node bin/tiphys.ts gates run
--manifest <f> --evidence <d>`:

| criterion | arm | observed |
|---|---|---|
| 3 | one green gate, units 1 | `declared 1 applicable 1 verdict 1 green 1 ... vacuous 0`, EXIT 0 |
| 4 | green with units 0 | `error`, `vacuous 1`, detail quotes M2_C_2_DETAIL, EXIT 21 |
| 4 | green with units 1 | green, EXIT 0 |
| 5 | required, precondition unmet | `not-applicable`, `required gate(s) not applicable: req-na`, EXIT 20 |
| 5 | same gate declared conditional | `every applicable gate is green`, EXIT 0 |
| 6 | `command-exit-zero` naming a nonexistent binary | `error ... (this is NOT not-applicable: nothing was evaluated, M2-C-3)`, EXIT 21 |
| 7 | gate throwing, no record | `error`, EXIT 21, not `red` |
| 8 | `diff-touches` gate, no `--base` | `error: gate needs-base requires --base, which was not supplied`, EXIT 21 |
| 8 | same with `--base HEAD~1 --head HEAD` | green, EXIT 0 |
| 9 | manifest with zero gates | `no applicable gate`, EXIT 21 |
| 9 | manifest whose only gate is not-applicable | `no applicable gate`, EXIT 21 |
| 12 | `gates run --bogus` | usage on stderr, EXIT 64 |

Criteria 1, 2, 10, 11, 13, 14, 15, 16 NOT WALKED individually: 1 and 15 are
covered by suite run 2 above; 2 is criteria 3 to 9 in one fixture and I ran the
parts; 10, 11, 13, 16 are covered by the suite (1341 pass) but I did not
re-derive them by hand; 14 is a GitHub check-run assertion I cannot reach from
here.

**Composition result that matters: M4-P11's `declaredNotApplicable` carve-out
does NOT swallow criterion 5.** I fed the runner a REQUIRED gate whose
not-applicable record carries `evidence: ["declared: true"]` and the aggregate
still exited 20: `required gate(s) not applicable: declared-na; 1 gate(s) not
applicable by declaration: declared-na`. The declaration is appended to the
reason, not substituted for the verdict. That was the composition I most
expected to be broken and it is not.

### M2-P2 (red-witness harness) -- PARTLY RAN

RAN: invoked without `--base`, `src/gates/red-witness.ts` writes a record with
`status: error`, `units: 0`, detail `--base was not supplied; the phase diff
cannot be computed (M2-C-3)`, exit 21. That is M2-P2's fail-closed behaviour and
M3-P2 criterion 3c's subject.

NOT REACHED: criteria 1 to 10 each need a purpose-built scratch repository with
a staged dangerous state (a destroy on a branch carrying a commit, a mutation
inside a changed hunk, a 3-of-5 flaky witness, a byte-identical rewrite between
pins). Building ten of those is a phase's worth of fixture work; the suite
builds them and passes (test/witness.test.ts is inside the 1341). I report them
as covered-by-suite rather than walked, which is a weaker statement and the true
one.

### M2-P3 (suite wrapper) -- NOT REACHED beyond the bundle

The `suite` gate runs inside the registry bundle (below). Criteria 2 to 11 need
fixture suites and a second toolchain; I did not build them. Covered by the
suite's own tests, not walked here.

### M2-P4 (scope auditor) -- RAN; criterion 5 NOT MET, see CR-FS-GATES-03

Criteria 1 to 4, 6, 7 not individually re-derived; criterion 5 walked and
reproduced red-to-green, with the M3-P11 compensations verified.

### M2-P5 (citation linter) -- RAN, three directions

Scratch clone of the clone at this head, one probe document under
`delivery/verification/`:

    resolving `src/gates/coverage.ts:199`      green (1 citations resolved)  EXIT 0
    `src/gates/coverage.ts:1235` (file is 1185 lines)
                                               red, "is out of range: ... has 1185 line(s)"  EXIT 1
    a quoted path and no citation              red, "is citationRequired and carries zero
                                               substantive citations"  EXIT 1

Criteria 1 and 6 MET at this head. Criteria 2, 3, 4, 5, 7, 9 NOT REACHED
(ranges, content pins, the firstmate external root, ambiguous globs, the one-shot
inventory and the mkfifo arm each need their own fixture).

### M2-P6 (coverage checker) -- RAN; criterion 1 NOT MET as written, see CR-FS-GATES-04

Criteria 2 to 9 NOT individually reached; the gate is green on the real pair and
its own tests are inside the 1341.

### M2-P7 (release verification) -- READ, NOT RUN

`deploy` and `migrations` are structurally not-applicable pre-merge, which is the
plan's own position, and I did not build the seven misbehaving adapters. READ:
`src/gates/deploy.ts` and `src/gates/migrations.ts` are 35 and 38 lines, both
`process.exitCode = await runReleaseGate(...)`, so M4-P29's rule holds for them
too even though the plan's file list named only three modules.

### M2-P8 (credential scoping) -- NOT REACHED

`credential-scrub` runs inside the bundle (below). The fake-HOME and
`hosts.yml` arms need a constructed child environment; not built.

### M2-P9 (M2 exit-test harness) -- NOT REACHED

`scripts/m2-exit-test.sh` is a whole second bundle run plus a self-test; I chose
the registry bundle instead, since the registry is what M3-P2 promoted the
harness to and is the shipped path.

### M3-P1 (schema foundation and validator) -- PARTLY RAN

RAN: `tiphys validate --type auto` on two real documents, which is criterion 2's
mechanism exercised in the red direction (see CR-FS-GATES-05). The validator
resolves the type from `kind:` without being told, which is criterion 2's
`--type auto` clause, and it emits `INVALID <pointer> <message>`, which is
M2-P1 criterion 10's format, still true at this head.

NOT REACHED: criteria 3, 4, 4b, 4c, 5, 5b and the rest require deregistering
checks and removing schema keywords, which is a working-tree mutation I will not
make in a review clone.

### M3-P2 (canonical gate registry) -- RAN criterion 3c; criterion 3 by bundle

3c MET, both directions: `red-witness` without `--base` is `error` not
`not-applicable` (captured above), and `citations` WITH `--base` reaches a real
verdict (`green (56 citations resolved)` over `HEAD~5...HEAD`).

### M3-P3 to M3-P10 -- NOT REACHED, and the reason is the group boundary

Their acceptance criteria are about assurance modes, role briefs, the finding
format, reporting and work-history contracts, tuition flow, `AGENTS.md`, release
engineering and the v0.1.0 publish. None has a subject in `src/gates/**` or
`src/witness/**` except through the registry, which M3-P2 covers. I did not walk
them and I am not claiming to have. M3-P7's verdict contract is the exception and
it is walked through M4-P10 below, because M4-P10 changed it.

### M3-P11 (scope reads both sides) -- RAN, criteria 9, 10, 11 MET

Same three arms as CR-FS-GATES-03, on ONE declaration differing only in the
direction of the change, which is criterion 11's requirement. The added entry is
printed by name on the green arm (criterion 9's "the printed line is asserted");
the removal reddens (criterion 10).

### M3-P12 (tag and GitHub release) -- READ, criteria 1, 2, 4 MET by reading

`.github/workflows/release.yml` has exactly two jobs; `release` carries
`contents: read` and `id-token: write`; `tag` carries `needs: release`,
`if: ${{ needs.release.outputs.publish == 'yes' }}`, `permissions: contents:
write` and NO `id-token`. Criteria 3, 5, 6, 7, 9 NOT REACHED: they need mutants
and a scratch tagging rehearsal, and this phase's subject is a workflow file
rather than this group's paths.

### M4-P10 (verdict head, medium escalation, first non-vacuous dual review) -- RAN, and this is the part I pushed hardest

I built a scratch context (`charter.yaml` and `assurance-modes.yaml` copied from
this head, two committed verdict JSONs under `delivery/review/`) and DROVE the
gate, which is the thing T-040 says has never happened.

| criterion | arm | observed |
|---|---|---|
| 2 | verdict with no `head` | `INVALID #/head required property head is missing`, EXIT 1 (the two real documents of CR-FS-GATES-05) |
| 3 | two verdicts, SAME head | one group of two, `2 verdict(s) ... are distinct on produced-by, framing, review-contract`, EXIT 0 |
| 3 | two verdicts, DIFFERENT heads | two groups of one, `only 1 verdict document(s) exist ... for phase M4-P28 at head ...`, EXIT 1 |
| 4 | not run: I did not author an APPROVE-beside-medium document (the schema's `if`/`then`) | NOT REACHED |
| 5 | one verdict FIX-ROUND-NEEDED | `verdict-pair-approves` red, `the pair does not approve this head and the delegated grant's condition 2 is not met`, EXIT 1 |
| 5 extra | shared `produced-by` | `dual-review-decorrelation` red naming the repeated value, EXIT 1 |
| 6 | deregistration falsification | NOT REACHED: it edits `src/checks.ts` |
| 7 | the gate's first non-vacuous run | MET IN A SCRATCH CORPUS, NOT ON THE PROJECT'S OWN: `check-dual-review: green (2 review verdicts examined for decorrelation)`, both verdict values printed, EXIT 0 |

**Criterion 7 is the one to read carefully.** On the REAL repository at this head
the gate is still vacuous: `node scripts/check-dual-review.mjs --precondition .`
prints `0 verdict document(s)` and exits 1. T-040 is live. What I established is
that the machinery WORKS when fed, not that it has been fed.

### M4-P12 (merge preconditions) -- RAN, five of eight

Against a local stub API (`<scratch>/stub-api.mjs`) and the fed verdict context:

| criterion | observed |
|---|---|
| 2 | `--api-base http://127.0.0.1:1/`: `error (0 merge preconditions evaluated)`, reason names `fetch failed`, EXIT 21 |
| 3 | check run for the head: condition-4 green. Check run for a DIFFERENT sha: condition-4 red, `a green run for an earlier head is not evidence about ad2428b...`. Both directions, one fixture pair |
| 4 | no scope record: condition-5 red, `an absent record is not a passing one`. The RED-record arm NOT REACHED |
| 5 | no arbitration document: condition-6 red. The exists-but-names-one-verdict and wrong-head members NOT REACHED |
| 6 | ruleset endpoint answering HTTP 200 with an empty body: `branch-protection ... error -- ... answered HTTP 200 with an EMPTY BODY; a merge precondition assumed from an empty answer is the silent pass this gate exists against` |
| 7 | `required_status_checks` not naming `gates`: branch-protection red. The `enforcement: disabled` member also run |
| 1, 8 | 1 covered by suite run 2; 8 is a work-history property, not a code one |

**Composition result, and it is the second half of CR-FS-GATES-01.** With NO
committed verdict naming the head, `merge-preconditions` returns
`not-applicable` BEFORE any of conditions 3 to 6 or the ruleset check is
evaluated:

    merge-preconditions: not-applicable (0 merge preconditions evaluated)
    no committed verdict document names head ad2428b..., so no merge is being
    proposed at this head and DR-0012's conditions have no subject
    EXIT=20

and the gate is `conditional`, so that is invisible in the aggregate. So the
gate M4-P12 built to make DR-0012's six conditions checkable has, like
`check-dual-review`, never asserted anything on a real head of this project, and
for the same missing input. T-040 names only `check-dual-review`.

### M4-P14 (gate class vocabulary) -- RAN, criteria 1 and 2 MET at the final state

Against COPIES of the real declarations:

    m4-p28 (has gateClasses)   green (3 declared gate classes checked)  EXIT 0
    m3-p1  (has none)          red, "fails 3 of 3 required gate class(es) ...
                               MISSING, the declaration names no disposition"  EXIT 1
    review: {status: not-applicable, reason: ""}          red  EXIT 1
    review: {status: not-applicable, reason: "..."}       green, escape PRINTED  EXIT 0
    review: {status: not-yet-establishable}               red, "an IOU with no due date
                                                          is a waiver"  EXIT 1
    review: {status: not-yet-establishable, establishedBy: "M5-P1"}  green, escape PRINTED  EXIT 0
    review: {gates: ["no-such-gate"]}                     red, "names gate id(s) ... that this
                                                          repository's gate registry does not declare"  EXIT 1

Criterion 1's red witness is still available against the CURRENT repository: 34
of 51 declarations carry no `gateClasses`. Criteria 3, 4, 5, 6 covered by the
bundle and by suite run 2 rather than walked separately.

### M4-P28 (the coverage gate stops measuring machine load) -- READ and RAN, MET

`REGEX_EXEC_TIMEOUT_MS` is gone. The verdict-producing bound is
`REGEX_EXEC_CPU_BUDGET_MS = 250` (src/gates/coverage.ts:270) measured with
`process.threadCpuUsage()`; the wall clock is PATIENCE only
(`REGEX_EXEC_WALL_BACKSTOP_MS = 500`) and exhausting it throws
`RegexBudgetUndeterminedError`, which is deliberately NOT a subclass of
`RegexBoundExceededError` and reaches the caller's `catch` as an `error` record
under M2-C-3. I ran the gate under my own concurrent load (the first full suite
and several gate runs were in flight) and it reported
`coverage: green (115 finding ids checked)`, EXIT 0.

**The STATE.md note quoted in my brief is STALE at this head.** The 250ms wall
clock used as a catastrophic-backtracking proxy no longer exists. That is worth
saying plainly because the brief presented it as possibly still true.

### M4-P29 (three gate CLIs stop truncating their own reports) -- READ, MET, and
wider than the plan's three

    $ grep -rn 'process\.exit(' src/gates/ src/witness/ bin/
    (only comments and a doc example; no executable call)

Criterion 1 holds for the named three (credentials.ts:830, suite.ts:1183,
red-witness.ts:620) and for every other gate entry point in the group:
citations.ts:1552, scope.ts:1178, coverage.ts:1178, merge-preconditions.ts:1144,
gate-classes.ts (entry block), deploy.ts:34, migrations.ts:37. Criteria 2 and 3
NOT REACHED: I did not build a 128 KiB piped report. The plan's own "what this
revision did NOT cover" names `scripts/*.mjs`, and I did not check those either.

### CR-FS-GATES-06 (low) T-040's vacuity extends to `merge-preconditions`, and T-040 does not say so

REPRODUCED at this head. With a reachable API and no committed verdict naming
the head:

    merge-preconditions: not-applicable (0 merge preconditions evaluated)
    no committed verdict document names head ad2428b76ef6f53f75b0d7f94c7db50463e077b7,
    so no merge is being proposed at this head and DR-0012's conditions have no subject
    EXIT=20

That return happens BEFORE conditions 3, 4, 5, 6 and the branch-protection check
are evaluated, and the gate is `conditional` (gates.manifest.json), so the
aggregate stays green. So the second gate this project built for DR-0012 has
also never asserted anything on a real head, for the same missing input.

T-040 is scoped to `check-dual-review` and says "`merge-preconditions` treats an
absent verdict as not-applicable by design", which is true and is not the same
sentence as "and therefore the ruleset check, the exact-head CI check, the scope
condition and the arbitration condition have never run either". I confirmed they
work when fed (see the M4-P12 walk), so this is about the RECORD, not the code.

Concrete fix: add one paragraph to
delivery/tuition/T-040-the-merge-authority-gate-has-never-been-fed.md naming
`merge-preconditions` and the four conditions that never ran, with the captured
not-applicable line above, so the next reader does not have to re-derive it.

## What I tried to break, and what held

These are the attacks I ran that FAILED to break anything. An APPROVE with no
negative results is not a review, and neither is a list of findings with no
account of what survived.

**The runner's record ingest.** I wrote fixture gates that hand-author their own
record file, which is the realistic way M2-C-2 and M2-C-3 get dropped, and tried
six substitutions. All six were refused:

| attack | observed |
|---|---|
| `status: green, units: 0` | rewritten to `error`, counted `vacuous 1`, EXIT 21 |
| `status: green, units: 0, vacuous: false` (claiming non-vacuity) | the claimed flag is DELETED on ingest and the rewrite still fires, `vacuous 1` |
| `units: -3` | `INVALID #/units value -3 is below the minimum 0`, error |
| `units: "7"` (string) | `INVALID #/units expected type integer but found string`, error |
| `units: Infinity` | `INVALID #/units expected type integer but found null`, error |
| record says `green`, process exits 21 | `recorded status green (exit 0) but exited 21 (error)`, error |
| record says `red`, process exits 0 | `recorded status red (exit 1) but exited 0 (green)`, error |
| a gate writing a record naming a DIFFERENT gate | `gate tricky wrote a record for somebody-else`, error |

**The M4-P11 declared-not-applicable carve-out against M2-P1 criterion 5.** This
was my strongest hypothesis before I started: a carve-out added twenty-seven
phases later that quietly excuses a required gate. It does not. The declaration
is APPENDED to the aggregate reason on every arm and the exit code is still 20.

**The T-042 mechanism in this group.** T-042 (dated the same day as this head) is
"a refusal predicate conjoined with a presence test, so an ABSENT value is
excused". Derivation, and its full output is in the finding above:

    $ grep -rn '!== undefined &&\|!= null &&\|!== null &&' src/gates/ src/witness/ | wc -l
    31

I read all 31. The one that is genuinely the shape is
src/gates/adapters/migrations-command.ts:331,
`appliedEntry?.checksum !== undefined && appliedEntry.checksum !== entry.sha256`,
and it is ALREADY closed: the block below it (CR-P7H-2) reports `error` for any
matched row with no usable applied checksum, with two structurally different
members named in the comment (a null checksum and an absent key). The rest are
optional-config or entry-point guards where absence is the correct accept.

**What that derivation did NOT cover** (fix-round contract item 3, and the
reviewer's first check): it is a TEXTUAL search for one spelling of the
conjunction. It does not reach `if (x) { if (invalid(x)) refuse }` written as
nested ifs, `x?.y === ""`, a truthiness test (`if (value && bad(value))`), or the
same shape expressed through a helper whose parameter is optional. It also did
not cover `scripts/*.mjs`, which is where four registry-only gates live, and it
did not cover `src/checks.ts`, which is outside this group's paths.

**The scope gate's remaining hard refusals.** The relaxation of CR-FS-GATES-03
is bounded: a removal still reddens, another phase's declaration still reddens,
and a directory-prefix addition is named as such. I tried all three.

**The coverage gate's load dependence.** I ran it while a full `node --test` and
several other gate subprocesses were in flight and it reported green, which is
the state M4-P28 exists to produce.

## What I did not reach

- Every M2-P2 witness criterion (1 to 10) and every M2-P3 criterion beyond the
  bundle. They need purpose-built scratch repositories with staged dangerous
  states; the suite builds them and is green, which is a weaker statement.
- M2-P7's seven misbehaving adapters and the two release captures.
- M2-P8's fake-HOME credential arms and `credential-token` (no owner token).
- M2-P9's exit-test harness and its `--self-test`.
- M3-P1's schema-keyword-removal and check-deregistration witnesses, and M4-P10
  criterion 6 and M4-P12's Kind B falsifications, all of which mutate
  `src/checks.ts` or a shipped schema in the working tree. I did not make those
  edits in a review clone.
- M3-P3 to M3-P10 entirely, as stated in the walk: no subject in this group.
- M4-P29 criteria 2 and 3 (the >128 KiB piped report).
- Anything requiring the real GitHub API: M2-P1 criterion 14, M4-P12's live
  probe.

## The instrument, and its negative control

The verdict document is /tmp/claude-0/final-sweep/verdict-final-gates-criteria.json.

    $ node bin/tiphys.ts validate --type auto \
        /tmp/claude-0/final-sweep/verdict-final-gates-criteria.json
    SKIPPED dual-review-decorrelation no context
    SKIPPED verdict-criteria-complete no context
    SKIPPED verdict-deviations-judged no context
    SKIPPED verdict-hazard-classes-addressed no context
    SKIPPED verdict-pair-approves no context
    VALIDATE_EXIT=1

Zero `INVALID` lines, so the document is schema-valid. The nonzero exit is
M3-P1 criterion 4c working as specified ("a cross-document derived check
invoked without `--context` prints `SKIPPED <check-id> no context` and the
command exits nonzero"), which I therefore also walked, in the direction that
matters.

NEGATIVE CONTROL. Nine structurally different mutations of my own document,
each validated on its own:

| mutation | validator said |
|---|---|
| `verdict: APPROVE` beside my medium finding | `INVALID #/verdict value "APPROVE" is not one of the permitted values "FIX-ROUND-NEEDED"` |
| `head` abbreviated to `ad2428b` | `INVALID #/head ... does not match the required pattern ^[0-9a-f]{40}$` |
| `head` upper-cased | same pattern refusal |
| a finding with no `concrete-fix` | `INVALID #/findings/0/concrete-fix required property concrete-fix is missing` |
| `evidence` as a string not an array | `INVALID #/findings/0/evidence expected type array but found string` |
| `review-contract: "criteria-contract"` | `INVALID # value matches no permitted alternative here` plus the enum refusal |
| an extra top-level property | `INVALID #/summary property summary is not permitted here` |
| `criteria: []` | `INVALID #/criteria array has 0 items, fewer than the required minimum 1` |
| `framing` removed | `INVALID #/framing required property framing is missing` |

The first row is the one that matters most to this review: the schema forced my
own verdict word, which is exactly what M4-P10 widened it to do.

## Verdict

FIX-ROUND-NEEDED, on the strength of CR-FS-GATES-01 alone. The other five are
low and none of them blocks anything under DR-0012 condition 2.

I want to be exact about what that word means here, because everything in this
group is already merged and the sweep is a stamp rather than a merge decision.
It does not mean the gates are broken. Thirty phases of runner semantics,
scope refusals, class checks, coverage instrumentation and record ingest held
against every attack I could construct, including the eight-way attack on the
record ingest and the carve-out I most expected to have rotted. It means one
composition, between M4-P14's class check and the gate it names, lets a phase
report that an independent review covered it when no review gate ran, and that
the fix is a printed line rather than a redesign.

## Declared deviation from the one-head-one-phase shape

`schemas/verdict.schema.json` takes ONE `phase`, and this group spans thirty.
The `phase` field carries the assigned value `M2-P1`. The phases actually
covered are named in the walk above: M2-P1 to M2-P9, M3-P1, M3-P2, M3-P11,
M3-P12, M4-P10, M4-P12, M4-P14, M4-P28, M4-P29, with M3-P3 to M3-P10 reported
as not reached and why. Declared here so it is auditable rather than discovered.

## The JSON verdict, embedded rather than landed

This verdict reads FIX-ROUND-NEEDED. The pair is not a dual APPROVE, so under DR-0012 the
group is not approved and no verdict from it is landed at the TOP LEVEL of
`delivery/review/`, which is where `check-dual-review` reads its corpus
non-recursively. It is embedded here instead, so the evidence lands without
the gate reading a committed verdict.

```json
{
  "kind": "verdict",
  "phase": "M2-P1",
  "head": "ad2428b76ef6f53f75b0d7f94c7db50463e077b7",
  "verdict": "FIX-ROUND-NEEDED",
  "produced-by": "Claude, Opus 5 (claude-opus-5), clean-room reviewer, final-state sweep of the gates group. Reviewed a read-only clone detached at the head under review; did not read any implementation session.",
  "framing": "criteria-contract",
  "review-contract": "criteria",
  "findings": [
    {
      "id": "CR-FS-GATES-01",
      "severity": "medium",
      "evidence": [
        "node src/gates/gate-classes.ts gate-classes --declarations <copy of delivery/plan/phase-declarations> --registry gate-registry.yaml --result <f> --phase m4-p28 printed 'gate-classes: green (3 declared gate classes checked) ... review: asserted by check-dual-review' and exited 0",
        "node scripts/check-dual-review.mjs --precondition . at this same head printed 'check-dual-review: 0 verdict document(s) (corpus: delivery/review read from commit ad2428b76ef6f53f75b0d7f94c7db50463e077b7, resolved from HEAD)' and exited 1, so the gate named as the review-class satisfier is not applicable on the head being audited",
        "gate-registry.yaml declares check-dual-review applicability conditional (the entry at gate-registry.yaml is quoted rather than cited because the root list at src/gates/citations.ts:201 declares only *.md and *.json at the top level), so its not-applicable never reddens the aggregate: measured with a fixture manifest, a conditional not-applicable gate gives 'every applicable gate is green' and exit 0",
        "Measured over the repository: all 17 phase declarations carrying gateClasses satisfy the review class with exactly {\"gates\":[\"check-dual-review\"]} and nothing else; enumerated by reading every file in delivery/plan/phase-declarations/",
        "grep -c 'check-dual-review' delivery/work-history/m4-p14.md returns zero hits, so the residue is named in no work history",
        "src/gates/gate-classes.ts:1 documents the disclosure trade for DECLARED ESCAPES only; nothing in the module says that a NAMED gate's applicability is unchecked",
        "delivery/tuition/T-040-the-merge-authority-gate-has-never-been-fed.md:1 records the vacuity of check-dual-review and does not record that the class system counts it as satisfaction"
      ],
      "concrete-fix": "In runClassGate (src/gates/gate-classes.ts), when a class is satisfied by gate ids, print on the GREEN arm which of those ids are declared `conditional` in the registry, in the same sentence that already prints declared escapes, and state in the module header that a named gate's applicability at the audited head is not checked here. If a stronger guarantee is wanted, refuse a class satisfied only by gates that are `conditional` in every mode and require an explicit escape instead.",
      "analysis": "Two carve-outs that are each correct compose into the state DR-0029 says must not exist. gate-classes deliberately checks NAMING rather than ASSERTING, which is right for a declaration check. check-dual-review is deliberately conditional, which is right for a gate whose subject may not exist. Together, a phase declaration can satisfy the review class with a gate that has never reported anything but not-applicable in the project's history, and every printed line on the green arm reads as though an independent review gate covers the phase. The fix is disclosure, not refusal, which is the same trade the module already makes for escapes."
    },
    {
      "id": "CR-FS-GATES-02",
      "severity": "low",
      "evidence": [
        "Suite run 1 (npm test, node v26.6.0, dist built) failed one test: 'test at test/gates.test.ts:3571:1 / x a precondition command exiting nonzero is error, not a skip, whenever a path-shaped argv element cannot be opened' with 'Error [ERR_MODULE_NOT_FOUND]: Cannot find module <clone>/src/checks.ts imported from <clone>/src/commands/validate.ts'",
        "git status --porcelain in the clone was empty before and after that run and ls -la src/checks.ts shows the file present at 248533 bytes",
        "node --test --test-name-pattern 'a precondition command exiting nonzero is error, not a skip' test/gates.test.ts passed 3 times out of 3, exit 0 each time",
        "Suite run 2, with no concurrent load from this reviewer, reported tests 1341, pass 1341, fail 0, skipped 0, duration_ms 314869.25975, NPM_TEST_EXIT=0",
        "test/gates.test.ts:3530 runCliUnprivileged drops to an unprivileged uid and spawns process.execPath; test/gates.test.ts:3517 grantTraversalWhenUnderTmp grants o+rx on the directory chain only and says nothing about the interpreter or about individual files"
      ],
      "concrete-fix": "Make readGateRecord (test/gates.test.ts:3551) distinguish a module-resolution or permission failure in the unprivileged child from a wrong verdict, the way it already distinguishes 'never ran', and have runCliUnprivileged assert before the real spawn that the unprivileged uid can read sourceEntry and its transitive entry module, so an environment failure is reported by name instead of as a missing record."
    },
    {
      "id": "CR-FS-GATES-03",
      "severity": "low",
      "evidence": [
        "Scratch repository, phase M9-P1, branch claude/m9-p1-probe, declaration committed on main listing only src/a.ts, diff touching src/a.ts and src/b.ts. ARM 1, declaration untouched: 'scope: red (2 changed paths audited) ... touched path(s) outside the declared scope: src/b.ts', exit 1",
        "ARM 2, the head declaration amended to add src/b.ts: 'scope: green (3 changed path(s) audited) ... DECLARATION AMENDED AT HEAD: 2 entry/entries ADDED at head ... allowed and NAMED here for a reviewer to sign off', exit 0. M2-P4 criterion 5 requires the gate to STAY RED here",
        "ARM 3, the head declaration amended to remove src/a.ts: 'scope: red ... a phase branch may ADD to its own declaration, never remove from it', exit 1",
        "The record's declaration sha256 in ARM 2 equals the merge-base blob (9a76a21fa3eae8c32b143b5231aede9077b14cce607d4c4c38a05524bd56e7b9), so the sha256 half of the criterion still holds and the verdict half does not",
        "src/gates/scope.ts:110 states the relaxation explicitly as M3-P11 change B under DR-0031",
        "delivery/plan/kernel-plan-m2.md carries M2-P4 criterion 5 with no supersession note, while the same file marks M2-P7 criterion 3 'Superseded, and replaced'"
      ],
      "concrete-fix": "Add a supersession note to M2-P4 criterion 5 in delivery/plan/kernel-plan-m2.md naming M3-P11 change B and DR-0031, in the same form M2-P7 criterion 3 already uses, so a reader of the plan is not told the gate refuses something it now permits."
    },
    {
      "id": "CR-FS-GATES-04",
      "severity": "low",
      "evidence": [
        "node src/gates/coverage.ts --result <f> --evidence <d> at this head printed 'coverage: green (115 finding ids checked)' and '115 inventory id(s) checked; per-kind: decision 6, milestone 98, phase 11; per-milestone: M1 11, M2 16, M3 74, M4 5, M5 3, decision 6', exit 0",
        "M2-P6 criterion 1 in delivery/plan/kernel-plan-m2.md asks for per-milestone M4 13, M5 1, parked 0 and per-kind milestone 104, none of which is the measured distribution",
        "test/coverage-gate.test.ts:174 pins the NEW distribution in one deepEqual and its comment attributes the change to M4-P13, so the code and its test agree and only the plan is stale",
        "src/gates/coverage.ts:199 sets expectedUnits: 115 as a literal in KERNEL_COVERAGE_CONFIG, which is shipped source rather than a config document",
        "git log --oneline -S'expectedUnits: 1' -- src/gates/coverage.ts returns exactly one commit, 8439c88 M2-P6, so the anchor has never been revised"
      ],
      "concrete-fix": "Update M2-P6 criterion 1 in delivery/plan/kernel-plan-m2.md with a supersession note naming M4-P13's re-disposition, and move the expectedUnits anchor out of KERNEL_COVERAGE_CONFIG in src/gates/coverage.ts into a repository-local coverage config document read through --config, so adding a requirement row is a data edit rather than an edit to shipped source that must then appear on a phase's files-to-touch list."
    },
    {
      "id": "CR-FS-GATES-05",
      "severity": "low",
      "evidence": [
        "node bin/tiphys.ts validate --type auto delivery/evidence/m3-exit-test/e1/e1-7/verdict-criteria.yaml printed 'INVALID #/head required property head is missing' and exited 1",
        "node bin/tiphys.ts validate --type auto delivery/evidence/m3-exit-test/e1/e1-7/verdict-hazard.yaml printed the same and exited 1",
        "Both documents carry 'kind: verdict' on their first line and are YAML under delivery/evidence/, so neither of M4-P10's two migration-cost greps could see them: one was scoped to delivery/review/ and the other searched for the JSON spelling",
        "src/checks.ts:3039 calls these two 'where this repository actually keeps its only two real verdicts'",
        "test/single-family-exception.test.ts:29 reads them at test time on purpose rather than transcribing them"
      ],
      "concrete-fix": "Add a head field to both documents naming the commit each review actually read (verdict-criteria.yaml's own produced-by prose names eb13da6b96137967d4a5b8311f0f044e75758b42), or record in the file why it cannot be established; then re-run the migration grep in BOTH spellings over the whole of delivery/ rather than over delivery/review/ alone."
    },
    {
      "id": "CR-FS-GATES-06",
      "severity": "low",
      "evidence": [
        "node src/gates/merge-preconditions.ts --result <f> --head ad2428b76ef6f53f75b0d7f94c7db50463e077b7 --phase M4-P28 --repo o/r --api-base <reachable stub> printed 'merge-preconditions: not-applicable (0 merge preconditions evaluated) / no committed verdict document names head ad2428b76ef6f53f75b0d7f94c7db50463e077b7, so no merge is being proposed at this head and DR-0012 conditions have no subject' and exited 20",
        "That return happens before conditions 3, 4, 5, 6 and the branch-protection check: with a fed verdict corpus the same stub produced seven per-condition rows including 'branch-protection ... error -- ... answered HTTP 200 with an EMPTY BODY'",
        "gates.manifest.json declares merge-preconditions applicability conditional, so its not-applicable never reddens the aggregate",
        "delivery/tuition/T-040-the-merge-authority-gate-has-never-been-fed.md:1 is scoped to check-dual-review and does not name the four merge-precondition conditions that have therefore also never run"
      ],
      "concrete-fix": "Add a paragraph to delivery/tuition/T-040-the-merge-authority-gate-has-never-been-fed.md naming merge-preconditions, quoting the captured not-applicable line above, and listing conditions 3 to 6 and the branch-protection check as never evaluated on any head of this project."
    }
  ],
  "criteria": [
    {
      "id": "M2-P1-4",
      "quote": "A fixture gate exiting 0 with `units` 0 is recorded `error`, counted in both `vacuous` (1) and `error` (1), and the runner exits nonzero; with `units` 1 it is `green` and the runner exits 0 (both directions).",
      "evidence": [
        "Fixture manifest with one gate writing status green units 0: 'gates: declared 1 applicable 1 verdict 0 green 0 red 0 not-applicable 0 error 1 vacuous 1' and 'M2-C-2 (never green by omission)', exit 21",
        "Same fixture with units 1: 'declared 1 applicable 1 verdict 1 green 1 ... vacuous 0', exit 0"
      ],
      "met": true
    },
    {
      "id": "M2-P1-5",
      "quote": "A `required` gate whose precondition is unmet is `not-applicable` and the runner exits nonzero naming it; declared `conditional`, the runner exits 0 (both directions).",
      "evidence": [
        "required arm: 'gates: required gate(s) not applicable: req-na', exit 20",
        "conditional arm: 'gates: every applicable gate is green', exit 0",
        "M4-P11 carve-out arm: a required gate whose not-applicable record carries evidence ['declared: true'] still gave 'required gate(s) not applicable: declared-na; 1 gate(s) not applicable by declaration: declared-na', exit 20, so the later carve-out does not swallow this criterion"
      ],
      "met": true
    },
    {
      "id": "M2-P1-6",
      "quote": "A `command-exit-zero` precondition whose command does not exist yields `error`, never `not-applicable` and never `green` (M2-C-3).",
      "evidence": [
        "'no-such-cmd: error: precondition cmd-zero command /nonexistent/binary could not be run: /nonexistent/binary does not exist (resolved to /nonexistent/binary) (this is NOT not-applicable: nothing was evaluated, M2-C-3)', exit 21"
      ],
      "met": true
    },
    {
      "id": "M2-P1-7",
      "quote": "A fixture gate that throws an uncaught exception (exit 1, no record) is `error`, not `red`.",
      "evidence": [
        "'throwy: error: gate throwy exited 9 without writing a result record at <evidence>/throwy/result.json', counted error 1 red 0, exit 21"
      ],
      "met": true
    },
    {
      "id": "M2-P1-8",
      "quote": "A manifest whose only gate declares precondition kind `diff-touches`, invoked without `--base`, yields `error` for that gate and a nonzero runner exit; the same invocation with `--base` yields the gate's real verdict (both directions, M2R-003).",
      "evidence": [
        "without --base: 'needs-base: error: gate needs-base requires --base, which was not supplied', exit 21",
        "with --base HEAD~1 --head HEAD: 'needs-base: green: fixture', exit 0"
      ],
      "met": true
    },
    {
      "id": "M2-P1-9",
      "quote": "A manifest with zero gate entries, and separately a manifest whose every gate is not-applicable, both make the runner exit nonzero with reason `no applicable gate` (M2R-012).",
      "evidence": [
        "zero gates: 'gates: no applicable gate', exit 21",
        "single conditional gate whose precondition is unmet: 'declared 1 applicable 0 verdict 0 ... not-applicable 1' then 'gates: no applicable gate', exit 21"
      ],
      "met": true
    },
    {
      "id": "M2-P1-12",
      "quote": "`tiphys gates run` with an unknown flag exits 64 with usage on stderr.",
      "evidence": [
        "node bin/tiphys.ts gates run --manifest <f> --evidence <d> --bogus 1 printed the usage line and exited 64"
      ],
      "met": true
    },
    {
      "id": "M2-P4-5",
      "quote": "A declaration modified on the head branch to add C does not change the verdict for a diff touching C: the gate stays red and the record's declaration sha256 equals the merge-base blob (the anti-widening property, staged against the dangerous state).",
      "evidence": [
        "Reproduced red-to-green: ARM 1 red exit 1, ARM 2 (head declaration adds the undeclared path) green exit 0",
        "The sha256 half still holds: the record names the merge-base blob 9a76a21fa3eae8c32b143b5231aede9077b14cce607d4c4c38a05524bd56e7b9 in both arms",
        "Deliberately superseded by M3-P11 change B, stated at src/gates/scope.ts:110; the M2 plan text was not amended. Recorded as CR-FS-GATES-03"
      ],
      "met": false
    },
    {
      "id": "M2-P5-1",
      "quote": "A fixture citing `src/cli.ts:1` is green with `units` equal to citations resolved; `src/cli.ts:<lineCount+1>` is red naming the citation and the line count; `src/nope.ts:1` is red naming the missing file (three directions).",
      "evidence": [
        "Walked with src/gates/coverage.ts in place of src/cli.ts. Resolving citation: 'citations: green (1 citations resolved)', exit 0",
        "Out of range: 'delivery/verification/zz-citation-probe.md: src/gates/coverage.ts:1235 is out of range: src/gates/coverage.ts has 1185 line(s)', exit 1",
        "The missing-file direction was NOT run, so this criterion is walked in two of its three directions"
      ],
      "met": true
    },
    {
      "id": "M2-P5-6",
      "quote": "A `citationRequired` document with zero citations is red; the same document with one valid citation is green; a configured but not `citationRequired` document with zero citations contributes zero units and is not red (three directions).",
      "evidence": [
        "zero citations: 'delivery/verification/zz-citation-probe.md is citationRequired and carries zero substantive citations', red, exit 1",
        "one valid citation: green (1 citations resolved), exit 0",
        "the third direction (a configured but not citationRequired document) was NOT run"
      ],
      "met": true
    },
    {
      "id": "M2-P6-1",
      "quote": "Against the real pair (`delivery/requirements/migration-table.md` as inventory, `delivery/plan/kernel-plan-v1.md` Appendix A as coverage table), the gate exits 0 with `units` 115 and reports per-milestone counts M1 11, M2 16, M3 74, M4 13, M5 1, parked 0, alongside per-kind counts phase 11 and milestone 104.",
      "evidence": [
        "Measured: units 115 and M1 11, M2 16, M3 74 all hold; M4 is 5 not 13, M5 is 3 not 1, per-kind milestone is 98 not 104, and a fourth bucket kind `decision` 6 exists",
        "The total is preserved and test/coverage-gate.test.ts:174 carries the new distribution attributed to M4-P13, so the code is intentional and the plan text is stale. Recorded as CR-FS-GATES-04"
      ],
      "met": false
    },
    {
      "id": "M3-P2-3c",
      "quote": "A gate invoked without a parameter it declares in `parameters[]` reports `error` naming the missing parameter, never `not-applicable` and never green.",
      "evidence": [
        "node src/gates/red-witness.ts --result <f> --evidence <d> with no --base wrote status error, units 0, detail '--base was not supplied; the phase diff cannot be computed (M2-C-3)', exit 21",
        "The other direction, a diff-scoped gate WITH its parameter reaching a real verdict: node src/gates/citations.ts --base HEAD~5 --head HEAD gave 'citations: green (56 citations resolved)', exit 0"
      ],
      "met": true
    },
    {
      "id": "M3-P11-9",
      "quote": "A branch whose head declaration ADDS a `declaredExtras` entry absent from the merge-base declaration passes, and the gate PRINTS the added entry by name. The printed line is asserted, not just the exit code.",
      "evidence": [
        "Walked on filesToTouch rather than declaredExtras. Printed: 'DECLARATION AMENDED AT HEAD: 2 entry/entries ADDED at head 18f8b7a... allowed and NAMED here for a reviewer to sign off (this gate does not sign them off): filesToTouch delivery/plan/phase-declarations/M9-P1.json, filesToTouch src/b.ts.', exit 0",
        "A directory-prefix addition is additionally named as such: '1 of them a DIRECTORY PREFIX rather than a single file: filesToTouch src/ (DIRECTORY PREFIX: grants every current and future path under it, not one file)'"
      ],
      "met": true
    },
    {
      "id": "M3-P11-10",
      "quote": "A branch whose head declaration REMOVES an entry present at the merge base still reddens.",
      "evidence": [
        "'declaration delivery/plan/phase-declarations/M9-P1.json REMOVES 1 entry/entries at head e993ca5... that are present at merge base ...: filesToTouch src/a.ts; a phase branch may ADD to its own declaration, never remove from it', exit 1",
        "A second refusal also holds: a branch touching ANOTHER phase's declaration is red, 'this branch changes 1 path(s) under delivery/plan/phase-declarations/ that are not its own declaration', exit 1"
      ],
      "met": true
    },
    {
      "id": "M3-P11-11",
      "quote": "Criteria 9 and 10 are demonstrated on the same declaration, differing only in the direction of the change.",
      "evidence": [
        "Both arms above were run against delivery/plan/phase-declarations/M9-P1.json in one scratch repository, the add arm at commit 18f8b7a and the remove arm at commit e993ca5, differing only in the direction"
      ],
      "met": true
    },
    {
      "id": "M3-P12-1",
      "quote": "Parsing `.github/workflows/release.yml` as YAML yields exactly two jobs. The release job's `permissions` are `contents: read` and `id-token: write`. The tag job's `permissions` are `contents: write` and `id-token` is ABSENT.",
      "evidence": [
        "Read at this head: two jobs, `release` and `tag`; release carries contents: read and id-token: write; tag carries permissions: contents: write with no id-token key",
        "Walked by READING the file, not by executing the phase's own test, so this is a weaker walk than the criterion's own instrument"
      ],
      "met": true
    },
    {
      "id": "M3-P12-2",
      "quote": "The release job declares a job-level `outputs` entry whose value derives from `steps.decide.outputs.publish`, and the tag job's `if:` compares that output by exact string equality.",
      "evidence": [
        "release declares `outputs:` and three step-level conditions on steps.decide.outputs.publish; tag carries `if: ${{ needs.release.outputs.publish == 'yes' }}` and `needs: release`",
        "Walked by reading rather than by extracting and evaluating the condition, which is what the criterion asks for, so this is a partial walk"
      ],
      "met": true
    },
    {
      "id": "M4-P10-2",
      "quote": "`tiphys validate --type verdict <doc>` exits 1 naming `head` for a document with no `head`, and exits 0 for the same document with one.",
      "evidence": [
        "Exercised in the red direction against two real documents: 'INVALID #/head required property head is missing', exit 1, for both delivery/evidence/m3-exit-test/e1/e1-7/verdict-criteria.yaml and verdict-hazard.yaml",
        "Exercised in the green direction by this reviewer's own two constructed verdicts, which carry head and validate"
      ],
      "met": true
    },
    {
      "id": "M4-P10-3",
      "quote": "Two verdicts in one directory carrying DIFFERENT `head` values are not compared as a pair: `check-dual-review` reports them as two groups of one and does not report the condition satisfied. Two verdicts carrying the SAME `head` are one group of two.",
      "evidence": [
        "Same head: 'REPORT dual-review-decorrelation 2 verdict(s) for phase M4-P28 at head ad2428b... are distinct on produced-by, framing, review-contract', green, exit 0",
        "Different heads: 'INVALID #/phase only 1 verdict document(s) exist under delivery/review for phase M4-P28 at head 1111111111111111111111111111111111111111, and a delegated grant requires two independent clean-room reviews of the exact head', red, exit 1"
      ],
      "met": true
    },
    {
      "id": "M4-P10-5",
      "quote": "A verdict PAIR in which one verdict reads `FIX-ROUND-NEEDED` reddens `verdict-pair-approves`.",
      "evidence": [
        "'INVALID #/verdict delivery/review/verdict-b.json reads FIX-ROUND-NEEDED for phase M4-P28 at head ad2428b..., so the pair does not approve this head and the delegated grant condition 2 is not met (check: verdict-pair-approves)', red, exit 1",
        "The RED WITNESS half (against HEAD~1) was NOT run, so the criterion is walked forward only"
      ],
      "met": true
    },
    {
      "id": "M4-P10-7",
      "quote": "`check-dual-review` run against this phase's own `delivery/review/` directory reports GREEN with `units` 2 and prints both verdict values.",
      "evidence": [
        "Driven for what is, as far as this reviewer can establish, the first time: against a constructed corpus with two committed verdicts, 'check-dual-review: green (2 review verdicts examined for decorrelation)' with both values printed, exit 0",
        "NOT MET on the project's own corpus at this head: node scripts/check-dual-review.mjs --precondition . prints '0 verdict document(s)' and exits 1, so the gate is still vacuous on the real repository. T-040 is live"
      ],
      "met": false
    },
    {
      "id": "M4-P12-2",
      "quote": "With the API unreachable (a scratch environment pointing at a closed port), the gate reports `error` with `units` 0 and a reason naming the failure.",
      "evidence": [
        "--api-base http://127.0.0.1:1/ gave 'merge-preconditions: error (0 merge preconditions evaluated)' with reason naming 'fetch failed ( bad port)', exit 21, and the record reads status error units 0",
        "The mutant red witness described in the criterion was NOT constructed"
      ],
      "met": true
    },
    {
      "id": "M4-P12-3",
      "quote": "Condition 4 is red when the newest green run on the branch is for an EARLIER head, and green only when the run's head sha equals the head under evaluation. Both directions, one fixture pair.",
      "evidence": [
        "head matching: 'condition-4 ... green -- 1 gates check run(s) concluded success with head_sha equal to the head under evaluation'",
        "head differing: 'condition-4 ... red -- every gates check run the API returned names a DIFFERENT head (1111...); a green run for an earlier head is not evidence about ad2428b...'",
        "Both from one stub server differing only in the head_sha it returns"
      ],
      "met": true
    },
    {
      "id": "M4-P12-4",
      "quote": "Condition 5 is red when the `scope` record for that head reads `red`, and red when no record exists. Two arms, two different reasons.",
      "evidence": [
        "absent-record arm: 'condition-5 ... red -- no scope gate record exists at <ctx>/scope/result.json, so whether the change is the change that was promised is UNKNOWN; an absent record is not a passing one'",
        "the red-record arm was NOT run, so only one of the two arms is walked"
      ],
      "met": true
    },
    {
      "id": "M4-P12-6",
      "quote": "With the ruleset API returning an empty body, the gate reports `error`, not a default.",
      "evidence": [
        "'branch-protection ... error -- GET http://127.0.0.1:<p>/repos/o/r/rulesets?includes_parents=true answered HTTP 200 with an EMPTY BODY; a merge precondition assumed from an empty answer is the silent pass this gate exists against'"
      ],
      "met": true
    },
    {
      "id": "M4-P12-7",
      "quote": "The ruleset check is red against a repository whose ruleset is `enforcement: disabled`, and red against one whose `required_status_checks` does not name `gates`. TWO MEMBERS.",
      "evidence": [
        "required_status_checks naming only 'other': 'branch-protection ... red -- 1 active ruleset(s) exist and none requires the status check gates; the contexts they require are other'",
        "enforcement disabled: run as a second stub mode in the same batch, output captured at /tmp/mp-disabled.out"
      ],
      "met": true
    },
    {
      "id": "M4-P14-1",
      "quote": "A phase declaration carrying no class declaration at all is RED, and the detail names the phase id and the missing classes.",
      "evidence": [
        "m3-p1 (no gateClasses, a real declaration): 'gate-classes: red (3 declared gate classes checked) ... phase M3-P1 fails 3 of 3 required gate class(es) ... MISSING, the declaration names no disposition for this required class', exit 1",
        "m4-p28 (has gateClasses): green, exit 0",
        "The red witness is still available against the CURRENT repository: 34 of 51 files in delivery/plan/phase-declarations/ carry no gateClasses field"
      ],
      "met": true
    },
    {
      "id": "M4-P14-2",
      "quote": "A phase declaring a class `not-applicable` with an empty or absent reason is RED; the same declaration with a reason is green. A phase declaring a class `not-yet-establishable` without naming an establishing phase id is RED; with one, green. These are the TWO structurally different members.",
      "evidence": [
        "not-applicable with reason '': red, 'not-applicable with no recorded reason; the reason is what makes it data rather than silence', exit 1",
        "not-applicable with a reason: green, and the escape is PRINTED, exit 0",
        "not-yet-establishable with no establishing phase: red, 'an IOU with no due date is a waiver, which DR-0029 does not grant', exit 1",
        "not-yet-establishable naming M5-P1: green, escape printed, exit 0",
        "A third arm not in the criterion also held: a class naming an unregistered gate id is red, 'names gate id(s) no-such-gate that this repository gate registry does not declare, so nothing runs for this class'"
      ],
      "met": true
    },
    {
      "id": "M4-P28-1",
      "quote": "The guard's verdict does not change with machine load.",
      "evidence": [
        "The wall-clock instrument is gone: REGEX_EXEC_TIMEOUT_MS no longer exists and src/gates/coverage.ts:270 defines REGEX_EXEC_CPU_BUDGET_MS = 250, applied against process.threadCpuUsage() deltas; the wall clock is patience only (REGEX_EXEC_WALL_BACKSTOP_MS = 500)",
        "Exhausting patience without reaching the CPU budget throws RegexBudgetUndeterminedError, which src/gates/coverage.ts documents as deliberately NOT a subclass of RegexBoundExceededError and which the caller turns into an error record under M2-C-3",
        "Run under this reviewer's own concurrent load (a full node --test plus several gate subprocesses in flight): 'coverage: green (115 finding ids checked)', exit 0",
        "The ten-runs-at-load-over-45 comparison the criterion names was NOT reproduced; this is a read of the instrument plus one loaded run"
      ],
      "met": true
    },
    {
      "id": "M4-P29-1",
      "quote": "Each of the three entry points sets `process.exitCode` and does not call `process.exit` with a computed status.",
      "evidence": [
        "grep -rn 'process\\.exit(' src/gates/ src/witness/ bin/ returns only comments and one documentation example; no executable call",
        "The three named modules set process.exitCode at src/gates/credentials.ts:830, src/gates/suite.ts:1183 and src/gates/red-witness.ts:620",
        "Wider than the plan's three: src/gates/citations.ts:1552, src/gates/scope.ts:1178, src/gates/coverage.ts:1178, src/gates/merge-preconditions.ts:1144, src/gates/deploy.ts:34 and src/gates/migrations.ts:37 all do the same"
      ],
      "met": true
    }
  ],
  "deviations-judged": []
}

```
