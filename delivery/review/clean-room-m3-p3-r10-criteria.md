# Clean-room review: M3-P3 round 10, acceptance criteria and shipped behaviour

Reviewer: clean-room criteria reviewer (independent of the round-10 implementer
and of the concurrent delta verifier).
Head under review: 676c050
Started: 2026-08-10 (beacon created in the first minutes per T-008).
Status: COMPLETE. This file was created as a beacon in the first minutes and
appended to as the work ran; the report body below supersedes the log.

## Method

Fresh detached worktree at 676c050 under the scratchpad. Floor toolchain
(node v26.6.0) placed first on PATH and re-confirmed with `node --version` in
the shell that runs each command.

## Log

- Worktrees: `CR10-wt` (detached 676c050) for execution, `CR10-report` (branch
  `claude/review-m3p3-r10` off origin/main) for this file. The main repository
  was never written to.
- node v26.6.0, npm 11.18.0, `npm ci` exit 0, `npm run build` exit 0,
  `git status --porcelain` 0 lines after the build.
- Isolated staged install `CR10-inst` (dist, schemas, decisions, registries,
  templates) so no fixture ever mutates a git worktree. Every mutation battery
  restored by `cp` from a pristine copy inside a `finally`, and printed AND
  compared md5: `match=YES` on both batteries.
- `mode show` run for all three modes: exit 0 each, all three
  `execution-status` sentences read, all three `skips:` sections read.
- CR-002 members 1, 2 and 3 re-run. Member 1 exit 1, member 3 exit 1, member 2
  (faithfully reconstructed, including the `review-contracts[]` the round-8
  report specifies) exit 0 with `direct-pr` correctly annotated NEVER
  EXERCISED.
- V-1 direction B, both sides of the relation: phantom `skips[]` entry exit 1;
  reference pipeline SHRUNK with no `skips[]` edited at all, exit 1 with two
  diagnostics.
- CRB9-02 both directions: honestly downgraded `full` exit 1; legitimately
  LEANER `full` exit 0 and still annotated the un-downgraded process.
- Foreign `--file` arm exercised on four documents with a properly staged
  context; all sentences read.

- Schema hunk INERTNESS CHECKED, not assumed. Structural JSON diff of
  `schemas/assurance-modes.schema.json` between b5c01f0 and 676c050 reports
  exactly ONE changed path, `/$defs/modeShape/properties/skips/$comment`, and
  swapping the round-9 schema into the staged install gives byte-identical
  output on four probes (shipped document, downgraded reference, phantom entry,
  `mode show`). `assurance-modes.yaml`'s hunk is comment-only: the parsed data
  is identical and the non-comment line diff is empty at exit 0.
- DR-0020: five `CLOSED VOCABULARY AT v0.1.0 (DR-0020)` disclosures across the
  three schemas, head and round 9 both, and round 10's schema diff contains
  zero `CLOSED VOCABULARY` lines. `mode show` still annotates both
  validated-only modes and the `--file` arm still says "not determinable here".
- DR-0022 re-derived independently from `git archive 676c050 delivery/decisions`:
  20 records, 504 units on both arms, DIFF_EXIT=0, md5
  e5c0dfd22c3b3f9215b88200d2804352. Sixth independent derivation.
- Suite, three axes, all exit 0: npm test + dist = 507/507/0 skipped; bare
  `node --test` + dist = 509/509/0; npm test without dist = 507 tests, 498
  pass, 9 SKIPPED; default toolchain node v22.22.2 + dist = 507 tests, 505
  pass, 2 SKIPPED.
- CI OBSERVED on the exact head: `gates` workflow, event `pull_request`, run
  31375024358, job 93412207232, head_sha
  676c0509b1e5396adee35ca1367ca03eb9469896, conclusion SUCCESS, completed
  2026-08-10T09:48:53Z. The post-merge `push` arm cannot exist yet and remains
  owed under T-009.
- Full registry gate bundle running in a scratch CLONE under the real branch
  name `claude/m3-p3-assurance-modes`, base 3c60acb, `--phase m3-p3`.

- Differential fuzz, reviewer-authored: 20000 random three-mode documents, the
  check's flagged-row set compared against an oracle written from the
  document's own sentence. AGREE=20000, DISAGREE=0. The same fuzz against the
  ROUND-9 check disagrees in 1416 of 20000, so the oracle is discriminating and
  not vacuous (19057 rejected, 943 accepted at head).
- Round 10's corrected V-4 citations verified individually against
  origin/main's copy of the round-8 review: :217 CR-002 heading, :220 the
  mechanism sentence, :228/:250/:266 members 1/2/3, :283 the fix-shape
  predicate, :318 blank. All correct.
- FINDING FOUND: two citations round 10 ADDED to test/assurance-modes.test.ts
  are stale at the head that added them. Written up as CR-001 below.
- Open question independently reproduced: dropping `deploy` from `full`'s
  `gate-sets` while gate-registry.yaml still declares `modes: [full]` for it
  validates at exit 0 with no diagnostic. Written up as CR-002 below.

- Full registry bundle at 676c050, scratch CLONE on the real branch name:
  8 green, 0 red, 0 error, 0 vacuous, 4 not-applicable. Bundle exit 20, whose
  reason is `required gate(s) not applicable: citations` and nothing else.
  `red-witness` green, 37 witnesses, `uncoveredSources: []`.
- Report body written below; the sections that follow supersede this log.

---

# THE REPORT

## Verdict

**APPROVE, with one LOW finding that is round 10's own and one LOW that is
recorded-but-untracked. Nothing high or medium. CI is OBSERVED GREEN on this
exact head.**

Every criterion that touches the changed surface was re-executed and passes.
All three CR-002 members from the round-8 report behave as round 9 and round 10
say, member 2's exit 0 included. V-1 direction B refuses in BOTH directions of
the relation, including the side that edits no `skips[]` at all. CRB9-02 is
closed in both of its directions: an honestly downgraded `full` is refused, and
a legitimately leaner `full` is still accepted and still annotated the
un-downgraded process. DR-0020's disclosure obligations are untouched and still
hold. DR-0022's number is unmoved, re-derived independently from `git archive`.

The two LOWs:

- **CR-001**, round 10's own: two `path:line` citations it ADDED to
  `test/assurance-modes.test.ts` are stale AT THE HEAD THAT ADDED THEM, because
  round 10's own insertions moved the targets. That is the V-4 class, in the
  commit dispatched to fix V-4, and nothing in this repository can see it.
- **CR-002**, inherited: the open question the implementer recorded with a
  measurement is real, I reproduced it independently, and it has no id. It is
  out of scope by instruction; the finding is that a measured defect living
  only in a work-history paragraph is a defect nobody owns.

## Environment, named once because every number below depends on it

- Toolchain node **v26.6.0**, npm **11.18.0**, from the absolute prefix
  `scratchpad/toolchain/node-v26.6.0-linux-x64/bin` placed FIRST on PATH, with
  `node --version` run IN THE SHELL THAT RAN EACH COMMAND.
- `npm ci` exit 0 with zero EBADENGINE lines; `npm run build` exit 0;
  `git status --porcelain` **0 lines** after the build.
- Worktrees and clones, all under the scratchpad, none in the main repository:
  `CR10-wt` (detached at 676c050) for execution, `CR10-clone` (a scratch CLONE
  with `claude/m3-p3-assurance-modes` checked out under its real name) for the
  gate bundle, `CR10-report` (branch `claude/review-m3p3-r10`) for this file.
  No git-mutating command was run in `/home/user/tiphys-ai-helmsman` other than
  the two `git worktree add` calls that created `CR10-wt` and `CR10-report`, and
  no branch named after a phase was created there.
- **Mutation discipline (T-013).** Every dangerous-state fixture ran against an
  ISOLATED STAGED INSTALL (`scratchpad/CR10-inst`: dist, schemas,
  delivery/decisions, the three registries, templates), which is not a git
  worktree, so no fixture could touch tracked content. Every battery restored
  by `cp` from a pristine copy inside a `finally`, and printed AND COMPARED
  md5. Both batteries printed
  `RESTORED_MD5=671e84a257a873ea3a040375cec69cfc match=YES`. The one probe that
  swapped a SCHEMA file restored it and compared:
  `SCHEMA_RESTORED_MD5=a63afa7dddbf6f88d2483910f9fbdcb2 EXPECT=a63afa7dddbf6f88d2483910f9fbdcb2`.
  No `git checkout --` was used anywhere.

## THE CRITERIA I RE-EXECUTED, and the result

Every row was EXECUTED. `EXIT` is the command's own exit code; no row's status
came through a pipe.

| # | why it is on my list | how I executed it | result |
|---|---|---|---|
| 1 | `assurance-modes.yaml` changed | both shipped documents with `--context .`, `--type auto`, the no-context arm, and the charter template | **PASS**. `C1a_EXIT=0`, `C1b_EXIT=0`, `C1auto_EXIT=0`, `CHARTER_EXIT=0`. Without `--context`: the three `SKIPPED ... no context` lines and `C1c_EXIT=1` |
| 2 | `assurance-modes.yaml` changed | `mode show --mode full`, printed pipeline compared MECHANICALLY against the plan's step-2 list at delivery/plan/kernel-plan-m3.md:2436 | **PASS**. `EXIT=0`, `PRINTED_COUNT=12`, `EXACT_MATCH_IN_ORDER=true` |
| 3(a) | `mode-no-undeclared-downgrade` is the function round 10 changed | the completeness arm (`direct-pr`'s `skips` emptied) plus the whole soundness battery below | **PASS**. `VALIDATE_EXIT=1` with 7 `omits stage X, which mode full runs` diagnostics at `#/modes/1/skips` plus 1 from `mode-stage-order` |
| 3(d) | the open question touches `mode-gate-sets-resolve` | one gate id dropped from `full`'s `gate-sets` while the registry still names `full` | **runs, but one-directional**. `QUESTION_PROBE_VALIDATE_EXIT=0`, no diagnostic. CR-002 below |
| 5 | round 10 changed source and test files, so new prose could introduce a forbidden token | `grep -niE 'pid\|kill\|daemon\|background'` over the shipped artifacts, and over every `+` line round 10 added anywhere | **PASS**. `C5_SHIPPED_GREP_EXIT=1` (0 lines), `C5_ADDED_GREP_EXIT=1` (0 lines), each grep's OWN status |
| 6 | the suite is the changed surface's guard | four cells across three axes, plus the CI arm | **PASS**. Table below |
| registry | the phase is being judged for merge | full registry bundle at 676c050, in a clone under the real branch name | **PASS**. 8 green, 0 red, 0 error, 0 vacuous |

## THE CRITERIA I DID NOT RE-EXECUTE, and why. This list is expected

Carried forward by citation from
delivery/review/clean-room-m3-p3-r9-criteria.md:96, the round-9 criteria
reviewer's execution at b5c01f0, which passed every one of them.

| # | what it is | why carrying it forward is safe HERE |
|---|---|---|
| 3(b) | `mode-stage-order`, implement before adversarial-plan-review | round 10 touches neither the check nor the data it reads. `assurance-modes.yaml`'s hunk is proven DATA-INERT below, so the fixture that criterion builds is byte-identical in every field it reads |
| 3(c) | `full` must contain `fix-round-verification` | same: a `contains` keyword in an unchanged schema over unchanged data |
| 4 | charter drift, all four directions and the half-fix trap | `schemas/charter.schema.json` and `templates/charter.example.yaml` are not in round 10's diff at all, and the drift check reads `assurance-modes.yaml`'s mode IDs, which are unchanged |
| 4b, 4c, 4d | `conditions[]`, `escalation-bounds`, `review-contracts[]` schema arms | the only schema change is one `$comment`, proven inert below in TWO independent ways |
| the whole criteria table at b5c01f0 | | executed by the round-9 criteria reviewer, whose file is on `origin/main` |

I agree with the narrowing, and unlike round 9 I could not rest that agreement
on the schema hunk being an inert `$comment` by inspection alone, because the
brief warned it might not be. **So I checked it two ways rather than one.**

- **Structurally.** A key-by-key JSON diff of `schemas/assurance-modes.schema.json`
  between b5c01f0 and 676c050 reports `CHANGED_PATHS=1`, and the one path is
  `/$defs/modeShape/properties/skips/$comment`. `$comment` is declared at
  src/validate.ts:131 in `ANNOTATION_KEYS`, "Annotations that carry no
  constraint and are permitted everywhere".
- **By execution.** I swapped the round-9 schema into the staged install and
  re-ran four probes (shipped document, downgraded reference, phantom entry,
  `mode show --mode full`). Every one produced BYTE-IDENTICAL output:
  `OUTPUT_IDENTICAL[clean]=YES`, `[down]=YES`, `[ph]=YES`, `[show]=YES`.

And `assurance-modes.yaml`'s 36-line hunk is comment-only, also measured twice:
the parsed documents are identical (`PARSED_DATA_IDENTICAL=true`) and the
non-comment line diff is empty (`DIFF_EXIT=0`).

The one place the changed `$comment` COULD have mattered is DR-0020, because a
registered test walks named `$comment` pointers. It does not: the DR-0020
pointers are `$defs.modeShape.properties.id` and `$defs.stageId` in this schema
(test/assurance-modes.test.ts:2389), not `properties.skips`.

## THE SENTENCES, which are the deliverable

Every mode, every arm, read rather than exit-code-checked.

### The kernel's own document, `mode show`, exit 0 each

| mode | `execution-status` | `skips:` |
|---|---|---|
| `full` | "this mode is full, which blueprint section 8 defines by name as the un-downgraded process, and it is the one the tiphys project follows for its own delivery." | `(none)` |
| `direct-pr` | "DECLARED AND VALIDATED, NEVER EXERCISED. This mode is not full ... It declares 7 skipped stage(s). Its pipeline and its gate selection are checked by validation only (DR-0020)." | 7 rows, counted |
| `local-only` | same shape, "It declares 10 skipped stage(s)" | 10 rows, counted |

The counts are consistent with the data rather than with each other: `full` has
12 pipeline stages; `direct-pr` runs 5 and skips 7 (5+7=12); `local-only` runs 3
of which one (`orchestrator-diff-review`) is not in `full` at all, so 2+10=12.

### The `--file` arm, with a properly staged foreign context

All three modes, on a clean foreign document: exit 0, and the sentence is
"not determinable here. This is not the kernel's own assurance-modes.yaml, so
nothing tiphys ships records whether any phase has been delivered under this
mode (DR-0020)." A foreign document that is INVALID is refused at exit 1 with
`... is not a valid assurance-modes document, so it is not served`, and the
sentence is not rendered over it. I also checked the arm that would have been
the sharpest miss: a foreign document whose `full` is honestly downgraded is
now REFUSED rather than described, so the "not determinable here" sentence is
never printed above a `skips:` row on a downgraded reference.

## The three CR-002 members, re-run

| member | construction | validate | what `mode show` says |
|---|---|---|---|
| 1 | `full` gains a bogus `skips` entry its own pipeline runs | **EXIT=1**, `#/modes/0/skips mode full declares stage implement in skips while its own pipeline runs it ...` | refuses, exit 1, no `execution-status` line at all |
| 2 | `direct-pr` given `full`'s pipeline, empty `skips`, and a `review-contracts[]` | **EXIT=0**, and this is CORRECT | `direct-pr` is still "DECLARED AND VALIDATED, NEVER EXERCISED"; the old false "the one the tiphys project follows" claim is gone because the sentence keys off `mode.id` |
| 3 | `local-only` declares `implement` while running it | **EXIT=1**, `#/modes/2/skips ... while its own pipeline runs it` | refuses, exit 1 |

Member 2 is reconstructed FAITHFULLY, including the `review-contracts[]` the
round-8 report specifies (delivery/review/clean-room-m3-p3-r8-criteria.md:250).
My first attempt omitted it and reddened on
`#/modes/1/review-contracts required property review-contracts is missing`,
which is red for a reason unconnected to CR-002. Recorded because it is exactly
the trap round 10's own witness section names: a fixture invalidated by its own
construction is evidence of nothing.

## V-1 direction B, BOTH sides of the relation, and CRB9-02 both ways

| # | what moves | validate | diagnostics |
|---|---|---|---|
| V1B-1 | `direct-pr.skips` gains `orchestrator-diff-review`, which NOTHING runs | **EXIT=1** | exactly 1: `#/modes/1/skips mode direct-pr declares stage orchestrator-diff-review in skips, but mode full does not run it, so it is not a downgrade relative to the reference pipeline` |
| V1B-2 | **no `skips[]` is touched at all**; `full`'s PIPELINE drops `deploy-verify` | **EXIT=1** | 2, at `#/modes/1/skips` and `#/modes/2/skips`, both naming `deploy-verify`. One edit to a third mode reddens two others |
| CRB9-02-A | `full` HONESTLY downgraded: `deploy-verify` moved from `pipeline` into `skips` | **EXIT=1** | 3, and the first is `#/modes/0/skips mode full declares stage deploy-verify in skips, but mode full does not run it`. `mode show --mode full` refuses at exit 1 and the un-downgraded sentence is never printed |
| CRB9-02-B | `full` legitimately LEANER: `deploy-verify` dropped from `full`'s pipeline AND from every mode's `skips` | **EXIT=0**, ACCEPTED | `mode show --mode full` exit 0, still "the un-downgraded process"; `direct-pr` now honestly says "declares 6 skipped stage(s)" |

Both directions of CRB9-02 hold. `full` is not made unrepresentable: the leaner
form is the one the document's own definition supports and it is accepted.

## The check is now EXACTLY the relation the document states, measured not argued

The document defines `skips[]` as every stage in `full`'s pipeline that this
mode's pipeline omits AND NOTHING ELSE (assurance-modes.yaml:22). That is a set
EQUALITY. I wrote an oracle from that sentence alone and fuzzed it against the
shipped check.

```
CASES=20000 AGREE=20000 DISAGREE=0
```

Twenty thousand random three-mode documents over the thirteen stage ids,
including documents with no `full` at all, comparing the SET OF ROWS the check
flags against the set the oracle flags.

**And the fuzz is discriminating, not vacuous, which is the half that makes it
evidence.** The same fuzz against the ROUND-9 check (direction A only)
disagrees in **1416 of 20000** cases. The verdict distribution at head is
`{"REJECTED": 19057, "ACCEPTED": 943}`, so both arms are exercised.

That is a stronger statement than "three members passed": completeness,
soundness A and soundness B are JOINTLY the relation, with no fourth way to
break it left over.

## FINDINGS

### CR-001 (LOW): two citations round 10 ADDED are stale at the head that added them, because round 10's own insertions moved the targets

**The MECHANISM, not the instance.** A `path:line` citation written while
looking at the PRE-EDIT file is stale the moment the same commit inserts lines
above the target. Round 10 was dispatched partly to fix V-4, a citation landing
on a blank line inside the wrong finding, and it fixed that one correctly (I
verified all six of its replacements below). It then created two more of the
same kind, in the same commit, by the mechanism above.

**Instance 1.** test/assurance-modes.test.ts:512 says the un-downgraded
sentence is keyed off `mode.id` "(src/modes.ts:221)". At this head
src/modes.ts:221 is a prose line, ` * kernel's own document is the process the
tiphys PROJECT follows for its own`. The keying it names,
`if (mode.id === UNDOWNGRADED_MODE_ID) {`, is at src/modes.ts:234. At b5c01f0
line 221 WAS that line; round 10's own +13-line comment expansion in the same
file moved it.

**Instance 2.** test/assurance-modes.test.ts:516 says "A registered test
(test/assurance-modes.test.ts:2119) asserts the SHIPPED document is clean". At
this head line 2119 is `    const indentedPath = writeDocument(`, inside the
unrelated `mode-conditions-quote-granted-by` test. The assertion it names is at
test/assurance-modes.test.ts:2340. The arithmetic is exact and is round 10's
own: the diff inserts 215 lines at line 481, and 2119 + 215 = 2334, which lands
inside the 2330-2341 comment block the sentence is pointing at.

**Why NOTHING here catches it.** The `citations` gate's precondition is
`diff-touches` over `delivery/plan/`, `delivery/verification/`,
`delivery/decisions/`, `delivery/tuition/`, `delivery/requirements/` and
`delivery/STATE.md` (gate-registry.yaml:117). A `path:line` written inside
`src/` or `test/` is outside every one of those, so it is unguarded in this
bundle and in CI alike, and this round's `citations` result is
`not-applicable` anyway.

**The derivation, published in full rather than summarised.**

```
$ grep -rnoE '(src/modes\.ts|src/checks\.ts|test/assurance-modes\.test\.ts|assurance-modes\.yaml|schemas/assurance-modes\.schema\.json):[0-9]+' \
    --include='*.ts' --include='*.md' --include='*.json' --include='*.yaml' \
    src test delivery schemas witness assurance-modes.yaml | sort -u | wc -l
138
```

Of those 138 tokens, five live in SOURCE files, which are the ones a reader
resolves at head rather than as a historical record. Resolved one at a time:

| citation, and where it lives | resolves at 676c050 to | verdict |
|---|---|---|
| src/modes.ts:164 -> src/checks.ts:275 | `const REFERENCE_MODE_ID = "full";` | correct, pre-existing |
| src/modes.ts:168 -> test/assurance-modes.test.ts:314 | `line.includes("no mode declares id full") &&` | correct, pre-existing |
| test/assurance-modes.test.ts:491 -> assurance-modes.yaml:22 | the `skips` definition comment | correct, ROUND 10 |
| test/assurance-modes.test.ts:512 -> src/modes.ts:221 | prose, not the keying | **STALE, ROUND 10** |
| test/assurance-modes.test.ts:516 -> test/assurance-modes.test.ts:2119 | a different test's fixture | **STALE, ROUND 10** |

**What the derivation did NOT cover**, stated before any row is examined, per
the fix-round contract:

- The roughly 130 tokens inside `delivery/work-history/m3-p3.md`'s historical
  sections (rounds 1 to 9). Those record the file as it stood at their round
  and go stale by design as code moves; I did not re-resolve them and I am NOT
  claiming they resolve. One of them, work-history line 7004 citing
  src/modes.ts:221, is stale at head by round 10's edit, but it is round-9
  authored and I am not attributing it to round 10.
- Citations into files round 10 did not edit, and citations in `delivery/`
  documents other than this work history.
- Files outside the six trees the grep names. A citation living in `bin/`,
  `scripts/`, `.claude/` or `templates/` would not have been seen.

**Severity, argued both ways.** FOR low: nothing executes, no gate is red, no
shipped sentence is affected, and both targets are findable by reading. AGAINST
raising it: this is the exact class that already cost this delivery a round
(V-4), the guard that would catch it structurally does not cover `src/` or
`test/`, and a citation that points into an unrelated test is how a reader
concludes a guard does not exist. It is not a nit; it is a small instance of a
mechanism this repository keeps paying for. LOW is the right level and it
should be fixed rather than tracked, because the fix is two numbers.

### CR-002 (LOW): the open question is real, I reproduced it, and it has no id

The implementer recorded, and explicitly did not act on, that
`mode-gate-sets-resolve` (src/checks.ts:639) checks only the
mode-to-registry direction. Reproduced INDEPENDENTLY here, from my own fixture
rather than from theirs:

```
full gate-sets BEFORE: 14
registry deploy gate modes: ["full"]
QUESTION_PROBE_VALIDATE_EXIT=0
(no diagnostic)
```

`full` silently stops selecting the `deploy` gate while `gate-registry.yaml`
still declares `modes: [full]` for it, and the document validates at exit 0.
That is the SAME one-directional-relation mechanism as V-1, in a different
field, across two files.

**The finding is not that it should have been fixed here.** The orchestrator
scoped `gate-registry.yaml` out, the implementer honoured that and recorded a
measurement rather than a hunch, and that was the right call. The finding is
that the measurement currently lives only in a paragraph of an 8392-line work
history, with no `CR-nnn`, `V-n` or tracked item attached, so nothing will
surface it again. Under DR-0012 condition 2, a low may be merged with provided
it is "explicitly recorded as a tracked item with a reason". It is recorded; it
is not tracked. Give it an id.

## OBSERVATIONS, not findings

**O-1. Round 10's own gate table is at a different head from the one being
reviewed, and this review is what closes that.** The work history says "Local
runs at head `c5278f3`". The head under review is 676c050, one commit later.
That labelling is HONEST and is exactly the complete sentence T-009 asks for,
so it is not a defect in the record. But it leaves DR-0012 condition 4 owing a
bundle at the reviewed head, and round 9 had this same gap and closed it by
re-running (its commit b5c01f0 is titled "re-run the bundle at the head that
carries the gate table"). Round 10 did not repeat that step. I ran the bundle
at 676c050 myself, below, so the gap is closed rather than outstanding.

**O-2. A stage that is BOTH in the mode's own pipeline and absent from `full`'s
produces two diagnostics at one pointer**, one from each soundness direction.
Both sentences are true and the pointer is the same; I record it only so a
future reader does not read the doubling as a bug.

## CI: OBSERVED, on this exact head

This is the thing round 10 said it could not discharge. It can be discharged.

- Workflow `gates`, event **`pull_request`**, run id **31375024358**, job
  **93412207232**, head_sha
  **676c0509b1e5396adee35ca1367ca03eb9469896**, conclusion **success**,
  completed **2026-08-10T09:48:53Z**.
- Every step success. `M2 exit test (push)` is `skipped`, which is by design on
  the pull_request arm.

**The `push` arm is still owed** and cannot exist yet: under T-009 rule 1 the
phase does not close until the post-merge `push` run on the new `main` head is
observed to completion. Nothing in this review discharges that.

## The full registry bundle, run at 676c050 under the REAL branch name

The scope-gate trap is real and I avoided it deliberately. In a DETACHED
worktree the branch name is literally `HEAD`, the scope precondition is unmet,
and the gate returns a FALSE not-applicable that reads as "fine" to anyone
checking exit codes. So the bundle ran in a scratch CLONE with
`claude/m3-p3-assurance-modes` checked out under its real name, base
`3c60acbee541711aca2b046269aa35a03f22bb8e`, `--phase m3-p3`, node v26.6.0 with
`dist/` built.

| gate | status | units | note |
|---|---|---|---|
| `manifest-self-check` | green | 8 | schema documents validated |
| `coverage` | green | 115 | inventory ids checked |
| `credential-scrub` | green | 7 | no pull-request-capable credential resolvable |
| `credential-token` | not-applicable | 0 | precondition `implementer-token-present-owner-action-a-3` unmet |
| `suite` | green | **507** | pass 507, fail 0, child node v26.6.0, 30 files |
| `citations` | not-applicable | 0 | "no changed path under the configured documents globs (43 changed path(s) total)". PRE-EXISTING; round 9 measured the same at both b5c01f0 and 108eed0 |
| `scope` | **green** | **43** | audited against `delivery/plan/phase-declarations/m3-p3.json` at merge base 3c60acb. NOT the false not-applicable |
| `deploy` | not-applicable | 0 | structural in any pre-merge bundle |
| `migrations` | not-applicable | 0 | structural in any pre-merge bundle |
| `clause-map` | green | 18 | 18 rows checked, 56 pending a phase not yet in force |
| `red-witness` | green | **37** | every witness red against every declared dangerous state and green at head; `uncoveredSources: []` |
| `agent-rules-drift` | green | 17 | CLAUDE.md's gate block matches the registry row for row |

`declared 12 applicable 8 verdict 8 green 8 red 0 not-applicable 4 error 0
vacuous 0`. **The bundle's own exit code is 20, and its reason is stated by the
runner: `required gate(s) not applicable: citations`.** Zero red, zero error,
zero vacuous. Not a failure of anything round 10 did.

### The new witness, from the gate's own records rather than from the work history

`checks-mode-skips-reference-relative`, behavior
`mode-skips-measured-against-the-reference`, status green, four members, each
red on BOTH repeats and green at head:

| member | kind | file | red runs |
|---|---|---|---|
| 0 | mutation | `assurance-modes.yaml` | `[True, True, False]` |
| 1 | mutation | `assurance-modes.yaml` | `[True, True, False]` |
| 2 | mutation | `src/checks.ts` | `[True, True, False]` |
| 3 | mutation | `src/checks.ts` | `[True, True, False]` |

Members 0 and 1 differ in which SIDE of the relation moves, which is what makes
them a class and not one member relabelled: 0 edits `skips[]`, 1 edits the
reference pipeline and touches no `skips[]`. Member 3 reopens ONLY the
reference half, which is CRB9-02's own shape.

The behavior is registered in `test/behaviors.json` and resolves BY NAME to a
test that exists: `registered: True`, and the exact string is the name of a
`test(...)` in `test/assurance-modes.test.ts`.

## The suite: THREE axes, and the complete sentence names all three

| toolchain | build state | invocation | tests | pass | **SKIPPED** | exit |
|---|---|---|---|---|---|---|
| node v26.6.0 | `dist/` built | `npm test` | 507 | 507 | **0** | 0 |
| node v26.6.0 | `dist/` built | bare `node --test` | 509 | 509 | **0** | 0 |
| node v26.6.0 | `dist/` REMOVED | `npm test` | 507 | 498 | **9** | 0 |
| node v22.22.2 (default, `bash -lc`) | `dist/` built | `npm test` | 507 | 505 | **2** | 0 |

The suite gate's own invocation is `npm test`, so **507 tests, 507 pass, 0
skipped** is this head's number, and it is the number the gate reported. The
+2 is the invocation axis (a tracked sandbox fixture the `test/**/*.test.ts`
glob excludes), the 9 is the built-CLI axis, the 2 is the Node floor. My
numbers agree with round 10's table in all four cells.

## DR-0020, checked directly rather than carried forward

- Five `CLOSED VOCABULARY AT v0.1.0 (DR-0020)` disclosures across the three
  schemas: assurance-modes 2, role-model-config 1, charter 2. Identical counts
  at b5c01f0 and at 676c050, and round 10's schema diff contains **zero**
  `CLOSED VOCABULARY` lines.
- `mode show` still annotates both validated-only modes with "DECLARED AND
  VALIDATED, NEVER EXERCISED ... (DR-0020)", and the count in each sentence
  matches that mode's own `skips:` row count (7 and 10).
- The `--file` arm still answers "not determinable here ... (DR-0020)".

## DR-0022, re-derived independently from `git archive`

Never from a staged copy: `git archive 676c050 delivery/decisions | tar -x` into
a lab outside the repository, with the head tree and the pre-A2 baseline
`18c335a` both imported the same way and removed on a trap.

```
NODE=v26.6.0  HEAD=676c0509b1e5396adee35ca1367ca03eb9469896
ARCHIVE_EXIT=0   RECORDS=20
BASELINE PREDATES commonmark (expect 0): 0
HEAD     records=20 total-units=504  HEAD_EXIT=0
BASELINE records=20 total-units=504  BASELINE_EXIT=0
DIFF_EXIT=0  DIFF_LINES=0
e5c0dfd22c3b3f9215b88200d2804352  CR10-units-head.json
e5c0dfd22c3b3f9215b88200d2804352  CR10-units-baseline.json
records=20 byte-identical=20 differing=0
CLEANUP done, LAB present after=NO
```

Sixth independent derivation of `e5c0dfd22c3b3f9215b88200d2804352`, agreeing
with the five on record.

## V-4's replacements, verified one line at a time

Round 10 replaced round 9's bad `:318` with four citations. Resolved against
`origin/main`'s copy of the file:

| line | what is there |
|---|---|
| 217 | `### CR-002 (MEDIUM): ...` the finding's own heading |
| 220 | the MECHANISM sentence, "It never asks the converse ..." |
| 228 | `**Member 1, the sharp one.**` |
| 250 | `**Member 2, structurally different ...**` |
| 266 | `**Member 3, the same root in its mildest form.**` |
| 283 | the fix-shape predicate round 9 implemented |
| 318 | blank, as round 10 says |

All correct. V-4 is genuinely closed.

## The ASCII checks, both of them, with the load-bearing `-a`

Over every file round 10 changed:

```
grep -raP '[^\x00-\x7F]'                 -> NONASCII_GREP_EXIT=1  (0 lines)
grep -raP '[\x00-\x08\x0B\x0C\x0E-\x1F]' -> CTRL_GREP_EXIT=1      (0 lines)
git diff --stat b5c01f0 676c050 | grep -i 'bin '  -> BIN_GREP_EXIT=1  (no Bin file)
```

Every changed file has a reviewable diff.

**No transliteration was needed in this review.** Every capture quoted above is
from `tiphys`, `grep`, `md5sum`, `diff`, `git` or my own scripts, none of which
emits non-ASCII. The `node --test` runs are quoted by their COUNTS only; the
reporter's U+2139 and U+2716 marks are in the raw TAP files under the
scratchpad and were stripped only for the summary lines I read with `tr -d`,
not reproduced here. Stated explicitly so a reader can tell "nothing was
altered" from "alterations were not declared".

## What I did NOT do

- The `push` arm on the post-merge `main` head. It cannot exist before the
  merge and is still owed under T-009 rule 1.
- The criteria listed in the carry-forward table above. Stated there, with the
  reason each is safe to carry at THIS head.
- `role-model-config.yaml` and `gate-registry.yaml` were not audited for the
  one-directional shape beyond the single probe in CR-002.
- The eleven accepted unwitnessed mutants, the `collectUnits` RangeError, and
  rule (g)'s text-versus-effect question: all out of scope, all untouched.
- Ordering, stated exactly rather than as a virtue claim: I read the DIFF first,
  which includes round 10's own code comments, and I ran every mutation battery,
  the fuzz and the DR-0022 derivation BEFORE reading
  `delivery/work-history/m3-p3.md`'s round-10 section. So the work history did
  not frame the probes; the code comments could have, and I am not claiming
  otherwise.
- No scratch artefact was left inside any repository tree. Everything lived
  under the scratchpad, and the DR-0022 lab removed itself on a trap and
  printed the confirmation.
