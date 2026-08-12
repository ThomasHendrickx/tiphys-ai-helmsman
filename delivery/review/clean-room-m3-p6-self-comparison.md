# Clean-room review, M3-P6, CONTRACT B: the self-comparing-check audit

Head under review: 16bab6f (PR #105), worktree detached at that commit.
Reviewer: clean-room, contract B. Did not see the implementation session.
Wrote nothing in the phase, committed nothing, pushed nothing, posted nothing
to the pull request. Every defang below was applied to a snapshot-protected
working tree and restored by copying back, never by git checkout; the tree at
the end of the review carries no modification (git status reports only this
untracked report file).

**The single question.** Does every check this phase adds or edits that CLAIMS
to compare two things actually read BOTH of them, or does it read one and
compare it to itself?

Toolchain and invocations, stated because a bare number starts an
investigation here: every command was run through `bash -lc`, node v22.22.2,
with `dist/` ABSENT (no build was performed in this worktree). The one whole
suite run was `npm test`: 614 tests, 603 pass, 0 fail, **11 skipped**. Eleven
is the expected total for this configuration and decomposes as CLAUDE.md
records: nine that skip when `dist/` is absent, plus the two floor-gated
`doctor` tests that skip below the Node floor. No captured output quoted below
contains a reporter glyph, so nothing here is transliterated.

## 1. What this review did NOT cover

This is first because it is the reviewer's own first check under the
fix-round contract, and a search whose scope is wrong returns an empty result
indistinguishable from an absence of defects.

- **The acceptance criteria.** A second reviewer walks those under a different
  contract. I did not read the criteria list before attacking, and nothing
  here should be read as a criteria verdict.
- **The red-witness GATE end to end.** I did not run
  `node src/gates/red-witness.ts` with `--base` and `--head`. I hand-applied
  two of the ten dangerous-state members across the phase's five witness
  specs, both from `witness/implementer-brief-gate-list-drift.json` because
  that witness guards the check my contract is about. The other eight members
  are UNTESTED BY ME. I read all ten and they are structurally distinct
  mutations of real code, but reading is not running.
- **The gates this phase did not touch**: `manifest-self-check`, `coverage`,
  `credential-scrub`, `credential-token`, `suite`, `citations`, `scope`,
  `deploy`, `migrations`. None is edited on this branch and I did not attack
  any of them.
- **The CI workflow as GitHub would run it.** I never ran the `gates`
  workflow. The `brief-drift` step was exercised only through the registered
  test that lifts its `run:` script out of the YAML and executes it against a
  staged tree, and through my own direct invocations of the same command.
- **The prose of the two briefs.** Whether a clause's text says the right
  thing is judgment, and my contract is mechanical. I checked that clause ids
  resolve to real anchors; I did not evaluate what the anchors say, with the
  one exception recorded as observation O-1.
- **`schemas/mechanism-index.schema.json` beyond reading it.** I did not fuzz
  it. I confirmed by reading that `evidence` carries `minItems: 1` and that
  `mechanisms` carries `minItems: 1`, and the registered superset test proves
  the two ends the schema cannot reach.
- **Downstream/package consumers.** `package.json` now ships `tuition` and
  `gates.manifest.json`. Whether a downstream project composing the
  implementer brief receives the KERNEL's gate table rather than its own is a
  design question I did not pursue; it is not a self-comparison defect.
- **Any long-run or timing property.** Nothing here is a concurrency or
  freshness claim.

## 2. Findings

### F-B1 (MEDIUM): `brief-drift` is the one manifest gate the M2 exit test's expectation table does not name, and the assertion program never compares in the rows-to-table direction

**The two inputs.** `scripts/m2-exit-test.sh` asserts that a gate bundle
matches kernel plan M2 section 1.4's expected-status table. The two inputs are
the bundle's `summary.json` rows and the expectation document built from
`PR_EXPECT_JSON` at scripts/m2-exit-test.sh:829.

**The mechanism, not the instance.** The assertion program iterates the
EXPECTATION and looks up each row (scripts/m2-exit-test.sh:325). It never
iterates the ROWS and asks whether each is named by the expectation. Its only
whole-bundle checks are zero-error (scripts/m2-exit-test.sh:429) and
zero-vacuous (scripts/m2-exit-test.sh:433). There is no global zero-red. So a
gate present in `gates.manifest.json` but absent from the table is
**unconstrained in both directions**: its red is not a failure and its absence
would not be one either.

**The instance this phase creates.** Derived rather than asserted, by parsing
both files:

```
manifest gate ids: ['manifest-self-check', 'coverage', 'credential-scrub',
 'credential-token', 'suite', 'citations', 'scope', 'deploy', 'migrations',
 'clause-map', 'red-witness', 'brief-drift']
PR table covers  : ['citations', 'clause-map', 'coverage', 'credential-scrub',
 'credential-token', 'deploy', 'manifest-self-check', 'migrations',
 'red-witness', 'scope', 'suite']
MANIFEST GATES NOT IN THE PR TABLE: ['brief-drift']
```

Eleven of twelve are covered. `brief-drift` is the first and only manifest
gate ever to be added without a table row; M3-P1 added `clause-map` to the
manifest AND to both expectation documents, which is the precedent.

**The defang that SHOULD have reddened, and the captured exit code showing it
did not.** I extracted the assertion program verbatim from the harness
heredoc, built two synthetic PR bundles differing ONLY in the presence of a
`brief-drift` row with `status: "red"`, and ran the real program against the
real expectation document and the real manifest:

```
m2-assert (PR bundle): OK. 11 gate record(s) match section 1.4; counts
 re-derived and equal to summary.json; zero error; zero vacuous.
EXIT_WITHOUT=0
m2-assert (PR bundle): OK. 12 gate record(s) match section 1.4; counts
 re-derived and equal to summary.json; zero error; zero vacuous.
EXIT_WITH_RED_BRIEF_DRIFT=0
```

The count re-derivation (check 7) does not save it: recomputed counts and
`summary.json` counts both come from the same rows, so a red row increments
both consistently and the comparison passes. And `run_pr_bundle` records the
runner's own exit code without asserting on it, by design, so the runner
exiting nonzero on a red gate does not fail the harness either.

**Is it a finding against this phase or a pre-existing property?** Both halves,
and they should be reported separately.

- The MECHANISM (expectation-to-rows only, no rows-to-expectation direction,
  no global zero-red) is PRE-EXISTING. It came with the harness and no M3
  phase introduced it.
- The INSTANCE is introduced by this phase, and it is the first time the
  mechanism has ever been exercised. Before this branch the two sets were
  equal, so the missing direction cost nothing.

**Why I am not calling it high.** The build still fails on brief drift. The
direct workflow step carries no `if:` and runs on both CI events, and the
registered test at test/implementer-brief.test.ts:607 lifts that step out of
the YAML and executes it, reddening under two structurally different defangs.
So drift is caught. What is lost is narrower and still real: the M2 exit test,
which is milestone-exit evidence, will report "the PR bundle matches section
1.4" over a bundle containing a red gate. That is a false sentence in the
artifact this project treats as authoritative for milestone exit.

**Why the implementer could not simply fix it, verified rather than assumed.**
`scripts/m2-exit-test.sh` is not on the phase's files-to-touch list; the
declaration at delivery/plan/phase-declarations/m3-p6.json:3 lists twenty
paths and that file is not among them. Editing it would have failed the scope
gate. The implementer flagged the gap itself in its work history, which is the
correct behaviour under the claim-grep and no-softening rules, and I confirm
the claim independently here.

**Recommendation.** Not a merge blocker on its own. It needs a tracked
follow-up that does two things and not only the first: add the `brief-drift`
row to `PR_EXPECT_JSON` (the instance), AND add a rows-to-expectation check so
the next gate added to the manifest cannot land unconstrained (the mechanism).
Fixing only the instance is exactly the shape the fix-round contract exists to
prevent.

### F-B2 (LOW): the vacuity floor is preflight, so `brief-drift` cannot go vacuous, and a run comparing ZERO gate rows reports green

**The two inputs.** `renderBriefGateBlock` at src/roles.ts:612 selects gates by
the mode string and returns
`units: registry.preflight.length + selected.length` at src/roles.ts:644. The
mode string is read out of the brief's own begin marker, and the check compares
the rendering against the brief block at scripts/check-brief-drift.mjs:258.

**The claim under test.** The script's header states that because it emits
through `makeGateResult`, "M2-C-2 applies: a run that compared ZERO rows
becomes `error` with `vacuous: true` instead of exiting 0."

**The defang and the captured result.** I changed only the mode named in the
brief's begin marker to a mode the registry declares for no gate, re-rendered
with the script's own `--write`, and ran `--check` with `--result`:

```
check-brief-drift: rewrote the sandbox gate block in roles/implementer.md
 (3 row(s) from gate-registry.yaml)
EXIT_WRITE=0
brief-drift: green (3 generated brief gate rows compared)
roles/implementer.md's sandbox gate block matches gate-registry.yaml row for
 row (3 row(s) compared)
EXIT_CHECK=0
```

and the emitted `GateResult` is `"status": "green"`, `"units": 3`, with no
`vacuous` field. The brief at that point carried a gate table with a header
row, a separator, and NOTHING ELSE.

Three separate points fall out, none of them fatal:

1. The vacuity guard is wired but cannot fire for this gate while the registry
   declares any preflight command, because units has a floor of three. The
   header's sentence is therefore true of the plumbing and false of the
   behaviour.
2. The `unitLabel` is "generated brief gate rows compared" and three of the
   counted units are preflight COMMANDS, not gate rows. The number in the
   gate's own report does not measure the thing the label names.
3. Nothing pins the brief's declared mode to a mode the registry knows.

**What saves it, stated exactly, because the margin is thinner than it looks.**
The suite DOES redden against this state: running the phase's own test file
with the brief in the hollowed `sandbox` mode gives

```
not ok 4 - adding a gate to the registry without re-rendering makes
 check-brief-drift --check exit nonzero naming the gate, and --write returns
 it to 0
not ok 14 - the brief-drift step wired into the gates workflow is executed
 against stubs and reddens under two structurally different defangs
# pass 13
# fail 2
```

But it reddens for an incidental reason: both tests inject a gate declaring
`modes: [full]`, so any brief declaring some other mode fails to pick it up.
No assertion anywhere states that the implementer brief carries the `full`
gate set. Note also which test did NOT redden: test 3, "the composed brief's
gate-list block is byte-identical to the block gate-registry.yaml renders for
the declared mode", passed, because it renders for `located.mode` at
test/implementer-brief.test.ts:238 and is therefore mode-relative by
construction. That is the correct design for what it asserts, and it is worth
knowing that it cannot see this state.

**Recommendation.** One line in the phase's own test file would close it: pin
the declared mode, or assert that the rendering selected at least one gate
row. Low severity because the state is reachable only by hand-editing the
marker in the brief and is caught by the suite today.

### F-B3 (LOW): the drift message names what differs in six of eight defangs and names nothing in two of them

`describeDrift` at scripts/check-brief-drift.mjs:140 compares the two blocks
as SETS of lines and falls back to a single sentence when the sets agree.
Criterion 3 requires the check to NAME what differs, and for a reordered or a
duplicated row it names nothing:

```
=== brief-reorder
brief-drift: red (18 generated brief gate rows compared)
... the two blocks differ only in blank-line placement or line order.
EXIT=1
=== brief-dup-row
brief-drift: red (18 generated brief gate rows compared)
... the two blocks differ only in blank-line placement or line order.
EXIT=1
```

The duplicate case is additionally mis-described: a row duplicated in the
brief is neither a blank-line difference nor a reordering, and the message
sends the reader to a diff. This is NOT a green-and-worthless defect. Both
cases exit 1, so the gate does its job; only the diagnostic is wrong. I record
it because the criterion asks for naming and because a reader trusting the
message would look for the wrong thing.

## 3. Clean results, with the defangs that prove them

A clean result with runs attached is the useful half of this contract, so
these are stated with their evidence rather than asserted.

### C-1: `scripts/check-brief-drift.mjs` reads BOTH inputs. Ten defangs, ten reddenings.

Baseline, unmodified tree: `brief-drift: green (18 generated brief gate rows
compared)`, exit 0.

REGISTRY side (the brief untouched). This is the direction a
compare-the-block-to-itself check cannot see, and it is the one that matters:

| defang | result | exit |
|---|---|---|
| change one gate's `unitLabel` in the registry | red, names the old row and the new one | 1 |
| ADD a gate (`zz-new-invented-gate`) to the registry | red, "the registry has a row the brief does not: \| `zz-new-invented-gate` \| ..." | 1 |

BRIEF side (the registry untouched):

| defang | result | exit |
|---|---|---|
| delete the `red-witness` row from the brief | red, names `red-witness` | 1 |
| edit the `suite` row's unit text | red, names both forms | 1 |
| swap two adjacent rows | red (message imprecise, see F-B3) | 1 |
| add a `phantom` row to the brief | red, names `phantom` | 1 |
| empty the block, keeping both markers | red, enumerates every missing row | 1 |
| remove the begin marker | **error**, "carries no generated gate-list begin marker naming a mode" | 21 |
| duplicate the `suite` row | red (message imprecise, see F-B3) | 1 |
| edit a PREFLIGHT command's note in the brief | red, names both forms | 1 |

The missing-marker case is the one that decides whether the check can find its
subject: it refuses with a gate `error` rather than reporting no drift, which
is the guard-condition failure this repository has recorded twice.

I also confirmed by reading that the derivation genuinely does not touch the
block: `renderBriefGateBlock` at src/roles.ts:612 takes the decoded registry
and a mode string and nothing else, and the script passes it
`decoded.value` and `located.mode` at scripts/check-brief-drift.mjs:233. The
brief's bytes reach the comparison and never the rendering.

### C-2: `agent-rules-drift` (CLAUDE.md against the registry) is also two-sided.

| defang | result | exit |
|---|---|---|
| baseline | green (18 rendered gate rows compared) | 0 |
| registry only: change `brief-drift`'s `unitLabel` | red, names both rows | 1 |
| `CLAUDE.md` only: delete the `brief-drift` row | red, names the missing row | 1 |
| restored | green | 0 |

### C-3: the mechanism-index superset assertion reads both indexes AND guards its own derivation.

The test derives the expected names from MECHANISMS.md's table and compares
against `tuition/mechanism-index.yaml`. Three defangs, run against the named
test only:

| defang | test |
|---|---|
| baseline | ok |
| drop one mechanism from the SEED yaml | **not ok** |
| ADD a thirteenth row to MECHANISMS.md only | **not ok** |
| destroy MECHANISMS.md's table so the derivation yields nothing | **not ok** |

The third is the one that matters for my contract: a derivation that silently
returned an empty set would make the superset assertion vacuously true, and
the floor assertion at test/implementer-brief.test.ts:463 catches it. This is
the strongest single check on the branch by my measure.

### C-4: the clause-map rows this phase adds are checked against a genuinely separate source.

`scripts/check-clause-map.mjs` takes its inventory from Appendix A of the plan
and its coverage from `delivery/requirements/clause-map.json`, which are
authored by different acts. Derived, not asserted: Appendix A declares
thirteen M3-P6-owned rows and the map now carries exactly those thirteen
(R-007, R-009b, R-031, R-033a, R-034, R-037a, R-038, R-039, R-040, R-074,
R-081b, R-082a, R-087). The gate runs green over 47 rows with 27 pending.

Condition 4 is a substring test (`body.includes(entry.clause)`), which is a
presence check the script's own header labels as such, so I verified by
reading that each of the thirteen ids resolves to a real clause anchor rather
than to an incidental mention. All thirteen do; twelve are `## clause R-nnn:`
headings in roles/implementer.md and R-009b is one in
roles/clean-room-reviewer.md. R-034 additionally appears in prose, which is
harmless.

### C-5: the tests do not build their expectations by calling the thing under test, with one declared exception.

Checked every equality assertion the two new test files make:

- The byte-identical block test decodes the registry with the `yaml` package,
  a decode path independent of the script's `decodeDocument`, and compares
  against the COMPOSED brief rather than against the file's block. Two file
  inputs, two parsers.
- The claim-grep test extracts the pattern from CLAUDE.md and asserts there is
  EXACTLY ONE such command before using it, so the subject cannot change under
  the test. An independent source, and the ambiguity guard is the right one.
- The fleet-warnings test writes its own fixture text and asserts the FIRST
  and LAST lines of it separately, which separates "the file was read" from
  "the file was truncated".
- The dispatch-clause tests pin their expected phrases as constants and say in
  a comment why they are not read out of the file under test. The two
  weakenings then prove the pinning bites, and the second (a specific-and-wrong
  liveness phrasing) is structurally different from the first (a vague
  restatement), which satisfies the two-members rule.
- The clause round trip compares frontmatter against body anchors, and checks
  EXACTLY ONCE rather than set equality, which a set comparison would miss.
- The witness mutations I executed both redden their named test:

```
=== baseline
ok 1 - adding a gate to the registry without re-rendering makes
 check-brief-drift --check exit nonzero naming the gate, and --write returns
 it to 0
=== member 1: renderer selects nothing (src/roles.ts)
not ok 1 - adding a gate to the registry ...
=== member 2: drift check never reports a difference (check-brief-drift.mjs)
not ok 1 - adding a gate to the registry ...
=== restored
ok 1 - adding a gate to the registry ...
```

The exception is recorded as O-1 below.

## 4. Observations (not findings)

**O-1. `R033A_SECTIONS` is one source serving both the validator and the
test's expectation, and no check can detect it drifting from R-033a.**
`missingRequiredSections` iterates it and the six-sections test at
test/implementer-brief.test.ts:157 compares the composed brief's anchors
against the same constant at src/roles.ts:429. A list that lost a section
would leave both green. This is not the same defect as a self-comparing drift
check, because the two inputs to the comparison are still the brief and the
constant, and the constant's own correctness is not machine-derivable: the
module comment says so and gives the reason, and the same file deliberately
does the OPPOSITE for `PHASE_FIELD_ORDER`, whose test is driven from the
schema precisely so the two can disagree. The asymmetry is explained and I
accept it. What it means is that a HUMAN must check the list, so I did:
R-033a at delivery/requirements/migration-table.md:65 requires "mandated
reading in order, phase scope with pipeline-history updates, push protocol,
full gate list, accumulated environment warnings, reporting contract", and the
constant is `mandated-reading, phase-scope, push-protocol, gate-list,
environment-warnings, reporting-contract`. Six of six, in the row's own order.
Verified by reading, which is the only way it can be verified.

**O-2. The mode-from-the-marker design does what its comment claims, in the
one direction the comment is about.** A `--mode` flag would let a CALLER
compare the brief against a mode it never declared. Reading the mode out of
the brief removes that, and I confirm the caller cannot influence it. F-B2 is
the different direction: an EDITOR of the brief can still choose the mode, and
that is the residual the phase does not close.

## 5. Verdict on my single question

Every check this phase adds or edits that claims to compare two things does
read both of them. I found no check that compares its input to itself, and the
one named in the phase's own hazard paragraph (a generated gate-list block
whose drift check compares the block to itself) is genuinely absent: the
registry-side defangs redden, which is the direction that shape cannot detect.

The defects I did find are of a neighbouring family rather than that one. F-B1
is a check that reads both inputs but only in one direction, so a row on one
side that is on neither list is unconstrained. F-B2 is a check that reads both
inputs correctly and can be pointed at an empty subject while its vacuity
guard reports a floor it cannot fall below. Neither is green-and-worthless in
the way the hazard paragraph fears, and neither blocks on its own; F-B1 needs
a tracked follow-up that fixes the mechanism and not only the instance.

## 6. The claim grep over this report

CLAUDE.md's line-based form, run over this file:

```
grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/review/clean-room-m3-p6-self-comparison.md
```

and a wrap-insensitive supplement, because the line-based one misses a phrase
straddling a hard wrap:

```
tr '\n' ' ' < delivery/review/clean-room-m3-p6-self-comparison.md \
  | grep -oEi '.{60}(cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to).{60}'
```

Both were run. The supplement returned FIFTEEN spans and every one of them
corresponds to a hit the line-based grep already reported, so on this document
no phrase straddles a hard wrap. That is a measured result for this file and
not a reason to skip the supplement next time.

Every hit walked, with its disposition:

- "never by git checkout" and "I never ran the `gates` workflow": statements of
  what I did and did not do, not claims about the code. Both are recorded in
  section 1 as uncovered ground rather than as absences of defects.
- "the assertion program never compares in the rows-to-table direction" and
  "It never iterates the ROWS": settled by scripts/m2-exit-test.sh:325, which
  is the only loop over the expectation, and by the synthetic-bundle run, which
  is the executable form of the same claim. The captured
  EXIT_WITH_RED_BRIEF_DRIFT=0 is what makes it a measurement rather than a
  reading.
- "It needs a tracked follow-up" and "F-B1 needs a tracked follow-up": these
  are recommendations, which are judgments and are labelled as such. They are
  not claims about program behaviour and no command can settle them. The
  underlying facts they rest on are the two captured runs and the manifest-vs-
  table derivation above.
- "the floor assertion ... catches it": settled by the captured run in C-3,
  where destroying MECHANISMS.md's table gives `not ok` on the named test.
- "The brief's bytes reach the comparison and never the rendering": settled by
  reading the signature at src/roles.ts:612, which takes the decoded registry
  and a mode string and no brief, and by scripts/check-brief-drift.mjs:233,
  which is the only call site. This is a code-shape claim and the citation is
  the evidence; I did not additionally force it with a mutation, and the
  witness member that empties `selected` (executed in C-5) is the closest
  thing I have to one.
- "compare the brief against a mode it never declared": a description of what
  a hypothetical `--mode` flag would allow, not a claim about shipped code.
- "cannot detect", "cannot see", "cannot fire": each sits beside a captured
  run. The sandbox-mode capture settles the vacuity one; the two mode-relative
  test outcomes settle "cannot see this state"; the registry-side defangs
  settle "the direction that shape cannot detect".
- "no assertion anywhere states that the implementer brief carries the `full`
  gate set": this is a SEARCH RESULT, not an impossibility. The search was a
  grep for `mode: full`, `"full"`, `located.mode` and `mode ===` over
  test/implementer-brief.test.ts, test/clean-room-brief.test.ts and
  src/commands/brief.ts, and it returned exactly one hit,
  test/implementer-brief.test.ts:238. I did not search the whole repository.
  The honest form is the one used above: I did not find one in the files this
  phase adds.
- "the only way it can be verified" in O-1: a claim about machine-derivability
  with the module's own reasoning cited, not a claim that no method exists.
- "always", "anyway", "recovers": these three words occur in this document
  only inside this list and inside the two quoted grep commands. They match
  nothing in the findings.

Where a sentence could not be settled by a captured command it was rewritten
as what I did or did not find, not as what is or is not possible.
