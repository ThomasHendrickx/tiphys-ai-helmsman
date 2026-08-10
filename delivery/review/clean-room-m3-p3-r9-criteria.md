# Clean-room review of M3-P3 round 9, head b5c01f0 (contract B: changed surface)

STATUS: IN PROGRESS. This file is a beacon and is appended to as the review runs.

Reviewer: independent clean-room reviewer, contract B of
`/tmp/.../m3-p3-round9-review-briefs.md`. Did not write this code, fixed nothing.

Head under review: b5c01f0 on `claude/m3-p3-assurance-modes`. Prior head 108eed0.

## Log

- Worktrees created: CRB9-head (detached b5c01f0), CRB9-report (branch off origin/main).
- Toolchain node v26.6.0, npm 11.18.0, floor prefix first on PATH, confirmed in
  each shell. `npm ci` exit 0, 0 EBADENGINE lines; `npm run build` exit 0;
  `git status --porcelain` 0 lines after build.
- Isolated staged install `CRB9-inst` built by the round-8 restage recipe, so
  no fixture mutates a git worktree.
- Criterion 1 re-executed: C1a_EXIT=0, C1b_EXIT=0, C1c(no --context)_EXIT=1 with
  the three SKIPPED lines, --type auto exit 0.
- `mode show` run for all three modes, exit 0 each, all three execution-status
  sentences captured and read.
- CR-002 member 1 (full gains a bogus skips entry): VALIDATE_EXIT=1, mode show
  refuses at exit 1. Member 2 (direct-pr given full's pipeline + empty skips):
  VALIDATE_EXIT=0, and the false "the one the tiphys project follows" claim is
  gone. Member 3 (local-only declares implement while running it):
  VALIDATE_EXIT=1. All three restored, match=YES.
- Criteria 3(a)(b)(c)(d) re-executed from reviewer-authored fixtures: exit 1 each,
  each naming the field and carrying `(check: <id>)` where Kind B.
- Criterion 4 re-executed end to end, including the half-fix trap: yolo exit 1,
  full exit 0, drift exit 1 naming BOTH charter fields, half-fix still red on
  assurance-tier, full six-edit fix exit 0 and `mode show --mode review-only`
  exit 0.
- Criteria 4b, 4c, 4d re-executed, every direction, exit 1 each with the pointer
  named; duplicate review-contracts rejected by uniqueItems.
- Criterion 5 grep re-run over both changed files: GREP exit 1, 0 lines.
- DR-0020: five `CLOSED VOCABULARY AT v0.1.0 (DR-0020)` disclosures across the
  three schemas, UNCHANGED by round 9 (diff hit count 0). `mode show` still
  annotates both validated-only modes.
- DR-0022 re-derived from `git archive b5c01f0 delivery/decisions`: 20 records,
  504 units both sides, diff exit 0, md5 e5c0dfd22c3b3f9215b88200d2804352.
- CI: the `gates` pull_request run for b5c01f0 is run id 31367859301, observed
  IN PROGRESS at 08:07Z. Polling before the report closes.
- CI OBSERVED. `gates` workflow, event `pull_request`, head_sha
  b5c01f07ee14eda8d7549006dd4693c3a5544125, run 31367859301, job 93390070996,
  conclusion SUCCESS, completed 2026-08-10T08:10:47Z. Every step success; the
  `M2 exit test (push)` step is `skipped` by design on the pull_request arm.
- Suite count discrepancy investigated rather than averaged: my bare
  `node --test` at this head reports 508, round 9 and CI report 506. Resolved
  below; it is an INVOCATION axis, not a defect.
- npm test with dist built: 506 tests, 506 pass, 0 skipped, exit 0. Bare
  `node --test`: 508. The two extra are a tracked sandbox fixture; the
  invocation is the axis. Full table in the report body.
- Report body written below; the sections that follow supersede this log.

---

# THE REPORT

## Verdict

**APPROVE. CR-002 IS CLOSED AT THE MECHANISM, VERIFIED BY EXECUTION, WITH TWO
LOWS AND ONE RECORDED OBSERVATION.** Neither low blocks merge under DR-0012
condition 2; both are stated so the orchestrator can dispose of them rather than
rediscover them.

I re-executed the acceptance criteria that touch the changed surface. Every one
passes. The three CR-002 members from the round-8 criteria report were rerun and
behave exactly as round 9 reports, member 2 included, whose exit 0 is the
CORRECT outcome and not a miss. DR-0020's disclosure obligations still hold and
round 9 did not touch them. DR-0022's criterion was re-derived independently
from `git archive` and matches.

**And the one thing round 9 could not discharge, I could: CI is observed GREEN
on this exact head, on the `pull_request` arm.** Details in the CI section; the
`push` arm on the new `main` head cannot exist until the merge and is still
owed under T-009.

## Environment, named once because every number below depends on it

- Toolchain: node **v26.6.0**, npm **11.18.0**, from the absolute prefix
  `scratchpad/toolchain/node-v26.6.0-linux-x64/bin` placed FIRST on PATH, with
  `node --version` run IN THE SHELL THAT RAN EACH COMMAND.
- `npm ci` exit 0 with **zero** EBADENGINE lines; `npm run build` exit 0;
  `git status --porcelain` **0 lines** after the build.
- Worktrees, all under the scratchpad, none in the main repository:
  `CRB9-head` (detached at b5c01f0) for execution, `CRB9-194` (detached at
  194b489) for one control measurement, `CRB9-report` (branch
  `claude/review-m3p3-r9` off origin/main 396a90b) for this file. The main
  repository at `/home/user/tiphys-ai-helmsman` was never written to and no
  git-mutating command was run there.
- **Mutation discipline (T-013).** Every dangerous-state fixture ran against an
  ISOLATED STAGED INSTALL (`scratchpad/CRB9-inst`, built by the round-8
  `cr8-restage.sh` recipe) so the git worktree was never touched. The single
  probe that HAD to mutate the worktree (the round-9 `full`-declares-no-skip
  assertion, which reads the shipped document) ran inside a script with
  `trap restore EXIT`, restoring by `cp` from a pristine copy, never by
  `git checkout --`, and printed AND COMPARED md5: `match=YES`, `DIRTY=0`.
  Every staged-install probe printed the same.

## THE CRITERIA I RE-EXECUTED, and the result

Every row was EXECUTED, not read. `EXIT` is the command's OWN exit code; no row's
status came through a pipe.

| # | why it is on my list | how I executed it | result |
|---|---|---|---|
| 1 | `assurance-modes.yaml` changed | both documents with `--context .`, plus the no-context arm and `--type auto` | **PASS**. `C1a_EXIT=0`, `C1b_EXIT=0`, `C1auto_EXIT=0`. Without `--context`: the three `SKIPPED ... no context` lines and `C1c_EXIT=1` |
| 2 | `assurance-modes.yaml` changed | `mode show --mode full`, printed pipeline compared MECHANICALLY against the plan's step-2 list read from kernel-plan-m3.md:2436 | **PASS**. `EXIT_full=0`, `printed=12`, `EXACT_MATCH_IN_ORDER=true`. `EXIT_direct-pr=0` (7 skips), `EXIT_local-only=0` (10 skips) |
| 3(a) | `mode-no-undeclared-downgrade` is the function round 9 changed | `direct-pr`'s `skips` emptied | **PASS**. `C3a_EXIT=1`; 7 diagnostics at `#/modes/1/skips` from `mode-no-undeclared-downgrade` plus 1 from `mode-stage-order` at the same pointer |
| 3(b) | fixture derives from the changed document | `implement` and `adversarial-plan-review` swapped in `full` | **PASS**. `C3b_EXIT=1`, `mode full places implement at position 3 and adversarial-plan-review at position 4 ... (check: mode-stage-order)` |
| 3(c) | same | `fix-round-verification` removed from `full` | **PASS**. `C3c_EXIT=1`, `array contains no item equal to "fix-round-verification", and 1 is required` |
| 3(d) | same | `no-such-gate-set` inserted | **PASS**. `C3d_EXIT=1` with `(check: mode-gate-sets-resolve)`; the same fixture without `--context` gives `C3d_nocontext_EXIT=1` and the three SKIPPED lines |
| 4 | `assurance-modes.yaml` changed; the drift check reads it | all four directions plus the amendment's half-fix trap, in a separate context copy | **PASS**. `C4_full_EXIT=0`; `C4_yolo_EXIT=1` naming the enum; drift red with TWO diagnostics naming BOTH `delivery-mode` and `assurance-tier`; `C4_HALFFIX_EXIT=1` still red on `assurance-tier` only; after the full edit set `C4_GREEN_MODES_EXIT=0`, `C4_CHARTER_REVIEWONLY_EXIT=0`, `C4_SHOW_EXIT=0` |
| 4b | `full`'s block changed | empty `conditions[]`, missing `granted-by`, control | **PASS**. `C4b_EMPTY_EXIT=1` (`array has 0 items, fewer than the required minimum 1`), `C4b_NOGRANT_EXIT=1`, `C4b_CTRL_EXIT=0` |
| 4c | same | four schema directions | **PASS**. Missing `escalation-bounds` exit 1; missing `on-exceeded` exit 1; `stop-and-wait-for-owner` exit 1 naming the two-value enum |
| 4d | same | one entry, and two identical entries | **PASS**. `array has 1 items, fewer than the required minimum 2`; duplicates rejected by `uniqueItems` |
| 5 | BOTH files in this criterion changed at this head, so the new prose could have introduced a forbidden token | `grep -niE 'pid\|kill\|daemon\|background'` over both | **PASS**. `C5_GREP_EXIT=1`, 0 lines, the GREP's own status |
| 6 | the suite is the changed surface's guard | three suite arms plus the CI arm | **PASS**, with a COUNT DISCREPANCY that I ran to ground rather than averaged. See the suite section |

## The three CR-002 members, re-run

The reproduction scripts are the round-8 report's own where they exist
(`cr8-probeE.sh` for member 1, `cr8-probeD2.sh` for member 2), repointed at my
staged install; member 3 had no committed script and I wrote one to the same
shape. All three restored from a pristine trap and printed `match=YES`.

| member | what it does | round 8 | this head |
|---|---|---|---|
| 1 (the sharp one) | `full` keeps its complete twelve-stage pipeline and gains ONE bogus `skips[]` entry | `VALIDATE_EXIT=0`, `mode show` printed that no phase had ever been delivered under `full` | **`VALIDATE_EXIT=1`**, `INVALID #/modes/0/skips mode full declares stage deploy-verify in skips while its own pipeline runs it, so skips does not describe what this mode omits (check: mode-no-undeclared-downgrade)`, and `mode show --mode full` REFUSES at exit 1 with `... is not a valid assurance-modes document, so it is not served` |
| 2 | `direct-pr` given `full`'s pipeline, an empty `skips[]` and `review-contracts[]` | `VALIDATE_EXIT=0` and the mode claimed to be `the one the tiphys project follows`, with `merge-authority: owner` beneath it | **`VALIDATE_EXIT=0`, WHICH IS CORRECT**: a mode running MORE stages violates nothing. The claim is GONE. It now prints `DECLARED AND VALIDATED, NEVER EXERCISED. This mode is not full ... It declares 0 skipped stage(s).` Both sentences are true |
| 3 | `local-only` declares `implement` in `skips` while its own pipeline runs it | `EXIT=0`, `implement` printed under BOTH `pipeline:` and `skips:` | **`VALIDATE_EXIT=1`**, `INVALID #/modes/2/skips mode local-only declares stage implement in skips while its own pipeline runs it ...`, and `mode show` refuses |

**Both halves of the fix were needed and each covers what the other does not.**
Member 2 is not fixed by the predicate at all (nothing in it is unsound); it is
fixed by keying `executionStatus` off the name. Members 1 and 3 are not fixed by
the keying (member 3 never touched `executionStatus`); they are fixed by the
predicate. I did not have to take round 9's word for that: the members
themselves separate the two halves, because member 2 still validates at exit 0
and is nevertheless truthful now.

## Every `execution-status` sentence the shipped CLI can print, read

The defect was a FALSE SENTENCE, so the sentences are the deliverable. There are
three reachable forms and I exercised all three, plus the refusal path.

| invocation | sentence | true? |
|---|---|---|
| `mode show --mode full` (shipped document) | `this mode is full, which blueprint section 8 defines by name as the un-downgraded process, and it is the one the tiphys project follows for its own delivery.` | **YES.** `full` is the mode this project has delivered every phase under, and the shipped `full` declares no skip (`skips: (none)` printed directly beneath) |
| `mode show --mode direct-pr` / `--mode local-only` | `DECLARED AND VALIDATED, NEVER EXERCISED. This mode is not full, which blueprint section 8 defines by name as the un-downgraded process, so no phase of the tiphys project has ever been delivered under it. It declares 7 skipped stage(s). Its pipeline and its gate selection are checked by validation only (DR-0020).` (`10` for `local-only`) | **YES**, and the counts are the mode's own: 7 and 10 match the printed `skips` lists exactly |
| `mode show --mode <any> --file <a document that is not the kernel's own>` | `not determinable here. This is not the kernel's own assurance-modes.yaml, so nothing tiphys ships records whether any phase has been delivered under this mode (DR-0020).` | **YES.** Verified on a full copy staged outside the install, including for a mode whose id IS `full`, so the round-9 keying cannot leak the project's own claim onto a consumer's document |
| `mode show` against an invalid document | `... is not a valid assurance-modes document, so it is not served`, exit 1, followed by the diagnostics | it validates before it serves, which is why members 1 and 3 cannot reach a sentence at all |
| error paths | unknown mode exit 1 (`declares no mode nope; it declares direct-pr, full, local-only`); missing `--mode` exit **64** with a usage line | unchanged from round 8 |

## DR-0020, re-checked directly rather than carried forward

| obligation | how | result |
|---|---|---|
| the three schemas carry a `$comment` naming the vocabulary as this repository's own at v0.1.0 | `grep -c 'CLOSED VOCABULARY AT v0\.1\.0'` on each | **MET.** FIVE disclosures: 2 in `schemas/assurance-modes.schema.json`, 1 in `schemas/role-model-config.schema.json`, 2 in `schemas/charter.schema.json`. `git diff 108eed0 b5c01f0 -- schemas/ \| grep -c 'CLOSED VOCABULARY'` is **0**, so round 9 did not touch a single disclosure |
| `mode show` annotates modes that are validated-only and never executed | ran all three modes | **MET, and the annotation is now sounder than it was.** Both downgraded modes carry `DECLARED AND VALIDATED, NEVER EXERCISED`; the standing `limits:` line prints on every invocation |
| escalation bounds shown as DATA, not an enforcement engine | read the `full` output | **MET.** `escalation-bounds (data an orchestrator brief cites; nothing in this release counts fix rounds, detects recurrence, or enforces these):` |

Round 9 changed exactly the function that produces the first line of that
annotation, which is why I re-derived it rather than citing round 8.

## DR-0022's owner criterion, re-derived independently

**DISCHARGED. 20 of 20 byte-identical. I am the fourth party to record
`e5c0dfd22c3b3f9215b88200d2804352` and the first to record it at this head.**

1. `git archive b5c01f0 delivery/decisions | tar -x -C scratchpad/CRB9-records`,
   `ARCHIVE_EXIT=0`, **20** records. Nothing anyone staged was read.
2. The round-8 driver (`cr8-units.mjs`, taken from origin/main) imported
   `quotableUnits` and `readOperatorPath` from two trees and ran them over those
   20 archived files: the head `b5c01f0`, and the pre-A2 baseline `18c335a`.
   The baseline genuinely predates `commonmark`:
   `git show 18c335a:src/checks.ts | grep -c commonmark` printed `0`.
3. Both sides: `records=20 total-units=504`. `diff` of the two dumps
   `DIFF_EXIT=0`, and both files md5 **`e5c0dfd22c3b3f9215b88200d2804352`**.

Provenance note, because a baseline that is not what it claims is the way this
goes wrong: the baseline tree is the pre-existing worktree `wt-m3p3-delta4`,
`git rev-parse HEAD` = `18c335a2fc4be0ff68bbff8528416fd82146349f`, and its only
dirty path is one untracked review document (`git status --porcelain` = 1 line,
`?? delivery/review/verification-m3-p3-round-5.md`). `src/` there is pristine. I
did not write to it.

## The new registered test: it exists, it is registered, and it is MEANINGFUL

Round 9 says it added a test asserting the shipped `full` declares no skipped
stage, because keying off the name is only sound if that holds. It did, and I
witnessed it rather than reading it.

- The assertion is `assert.deepEqual(skips, [], ...)` at
  test/assurance-modes.test.ts:2123, inside the test declared at
  test/assurance-modes.test.ts:2073, in the arm now selected by `id === "full"`.
- **RED ARM, and it is a DATA edit, not a code mutation.** With the shipped
  `full` honestly downgraded (`deploy-verify` moved OUT of `pipeline` and INTO
  `skips`), the test goes `GREEN_EXIT=0` to `RED_EXIT=1` with
  `AssertionError: full is annotated as the un-downgraded process while declaring skips: deploy-verify`.
  Restore printed `match=YES` and `DIRTY=0`.
- The separate soundness behavior is registered by name:
  `mode-skips-describe-only-omitted-stages` in test/behaviors.json:482, and the
  suite gate resolves behaviors by name on every run.

The important part is what that red arm demonstrates about the SHAPE of the fix.
Keying off the name MOVES the burden from a proxy onto a fact about the data,
and the round put a guard on exactly the fact it moved the burden to. That is
the right structure. Its residue is CRB9-02 below.

## FINDINGS

### CRB9-01 (LOW): a citation added by this round points at a blank line

test/assurance-modes.test.ts:361 cites
`delivery/review/clean-room-m3-p3-r8-criteria.md:318` to support the sentence
"The reviewer measured three members, all at exit 0 with every registry gate
green". Line 318 of that document is EMPTY, and it sits inside CR-001, not
CR-002. The content being cited is CR-002, whose heading is at
delivery/review/clean-room-m3-p3-r8-criteria.md:217 and whose three members run
to line 269.

Measured against every committed version of that file, so this is not a
line-shift after the fact:

```
$ for c in $(git log --format=%h --all -- delivery/review/clean-room-m3-p3-r8-criteria.md); do
    echo "$c: $(git show $c:delivery/review/clean-room-m3-p3-r8-criteria.md | sed -n '318p')"; done
97196da:
ab8c434:
```

Both versions have a blank line 318. The other two citations round 9 added to
the same document are CORRECT: `src/checks.ts:402` and `assurance-modes.yaml:32`
both cite `:217`, which is the CR-002 heading.

Why it is worth a row rather than silence: commit `68d7db7`'s own message says
it "corrects the citation line numbers to the lines they resolve at", so this is
a miss inside a correction pass, and the `citations` gate cannot see it because
the citation is in a source file rather than under `delivery/`. Fix is a one-
character-class edit, `318` to `217`. It does not block merge.

### CRB9-02 (LOW): the successor hazard is real, is guarded only by a test, and the CLI self-contradicts on the way through

Keying `executionStatus` off `mode.id` is right, and it makes the truth of the
`full` sentence depend on the shipped `full` genuinely being un-downgraded.
Round 9 says so explicitly and guards it with the registered test above. That
guard works; I reddened it. But the VALIDATOR does not close it, and the
validator is the layer that runs at exit 0 on a developer's machine before any
test does:

```
# full's pipeline drops deploy-verify AND declares it in skips: an HONEST downgrade
$ node dist/bin/tiphys.js validate --type assurance-modes --context . assurance-modes.yaml
VALIDATE_EXIT=0
$ node dist/bin/tiphys.js mode show --mode full
mode: full
execution-status: this mode is full, which blueprint section 8 defines by name as the
un-downgraded process, and it is the one the tiphys project follows for its own delivery.
...
skips:
  deploy-verify
SHOW_EXIT=0
```

The sentence and the `skips` block eight lines below it contradict each other,
in one output, at exit 0. This is CR-002's own hazard class ("the shipped CLI
prints a false claim about the project's own delivery at exit 0") in a milder
form: milder because the suite gate DOES redden, which is exactly what CR-002
lacked, so it cannot reach `main` through this project's process.

Stated in both directions, as the round-8 reviewer did:

- FOR raising it: blueprint section 8 makes `full` un-downgraded BY DEFINITION,
  so a `full` with a non-empty `skips[]` is not merely unusual, it is a
  contradiction in terms, and the check that now reads both arrays is one
  `if (row.id === REFERENCE_MODE_ID && skips.length > 0)` away from rejecting
  it at the same layer as every other criterion-3 rejection.
- AGAINST: a consuming project cannot hit the false sentence at all, because
  `--file` yields `not determinable here` regardless of the mode's name (I
  verified this above), so the exposure is bounded to the kernel's own document,
  which the registered test and the new data dangerous state both cover.

I rate it LOW and request no action beyond a decision to leave it or close it.
It is NOT a reason to hold the merge.

## An OBSERVATION, not a finding: the suite has a THIRD axis, and it is why two honest agents get 506 and 508

CLAUDE.md warning 12 says the complete sentence for a suite result names the
TOOLCHAIN and the BUILD STATE. Measured at this head, it must also name the
INVOCATION, and I found that by refusing to average a two-test discrepancy.

| arm | invocation | tests | pass | fail | SKIPPED | exit |
|---|---|---|---|---|---|---|
| node v26.6.0, `dist/` built | bare `node --test` from the repo root | **508** | 508 | 0 | 0 | 0 |
| node v26.6.0, `dist/` built | `npm test` | 506 | 506 | 0 | 0 | 0 |
| node v26.6.0, `dist/` REMOVED | `npm test` | 506 | 497 | 0 | **9** | 0 |
| CI runner, `gates` / `pull_request`, this exact head | `npm test` | 506 | 506 | 0 | 0 | success |

The two extra tests under the bare invocation are named, not inferred. I
extracted the passing-test names from my run and from the CI log and diffed
them; the diff is exactly two lines:

```
> greet rejects an empty name
> greet returns a greeting for a name
```

They come from `sandbox/test/greet.test.js`, a TRACKED sandbox fixture at the
repository root. `package.json:27` declares
`"test": "node --test \"test/**/*.test.ts\""`, which excludes it, and
src/gates/suite.ts:772 shows the `suite` GATE runs `package.json`'s `test`
script rather than a pattern of its own. So 506 is the number CI and the gate
mean, 508 is the number CLAUDE.md's gate list line 3 (`node --test`) literally
asks for, and both are true sentences about different commands.

Head-independence controlled: the same bare invocation at round 9's own
gate-table head `194b489`, same toolchain, same build state, also reports
**508**. So this is the invocation, not the head and not the round.

Nothing here is a defect in M3-P3 and I raise no finding. It is recorded because
this repository has already paid twice for an unexplained suite-count
difference, and the next agent to see 506 next to 508 should find this paragraph
instead of a third investigation.

## CI, which is the thing round 9 explicitly could not discharge

**I OBSERVED IT, so DR-0012 condition 4 is discharged for one arm and I name
which.**

```
workflow  : gates
event     : pull_request
head_sha  : b5c01f07ee14eda8d7549006dd4693c3a5544125
run       : 31367859301   job: 93390070996
status    : completed     conclusion: SUCCESS
started   : 2026-08-10T07:55:47Z   completed: 2026-08-10T08:10:47Z
```

Every step concluded `success`, including `npm ci`, `npm run build`,
`npm test`, the agent-rules drift step, `M2 exit test (pull request)`, the M2
self-test guard, `M1 exit test (local mode)` and the M1 falsifiability guard.
The one non-success step is `M2 exit test (push)`, conclusion `skipped`, which
is the event fork T-009 describes and is by design on this arm.

**What is STILL OWED, and it is not mine to give.** T-009 rule 1: the merge is
not complete until the post-merge `push` run whose head sha is the NEW `main`
tip is observed to completion. That run does not exist yet. Reporting the
pull_request arm green is not reporting that `main` is green.

## What I did NOT re-execute, and why. READ THIS FIRST.

The narrowing is the orchestrator's, recorded in the brief, and I agree with it
(see the next section). These are the criteria and checks I did NOT run, stated
as items AND as axes so an empty result cannot be mistaken for an absence of
defects.

1. **The `red-witness` GATE.** Reported separately below; see the row for what
   was and was not run.
2. **The delta verifier's whole contract.** V-1 through V-6 closure, the ReDoS
   reproduction, the eleven accepted unwitnessed mutants, rule (g)'s
   text-versus-effect comparison, and any NEW defect in the round-9 diff are the
   concurrent verifier's job. I did not read its output and I did not duplicate
   it. **In particular I did not reason about every hunk of the `src/` diff for
   novel defects; I reasoned about the hunks the criteria touch.**
3. **`role-model-config.yaml` beyond criterion 1.** It validates; round 9 did
   not touch it or its schema.
4. **The `npm pack` surface.** Round 8 measured it, `package.json` is unchanged
   between `108eed0` and this head (it is not in the diff at all), so I carried
   it forward by citation.
5. **The A2 `quotableUnits` correctness question.** I ran the OWNER's criterion
   (byte-identity over the archived records) and nothing wider. It is an
   equivalence test, not a correctness test: if the head and the baseline are
   both wrong in the same way on some shape, my comparison cannot see it BY
   CONSTRUCTION.
6. **The two `clean-room-checklist` gates.** Declared in the registry and not
   executed by the runner. Not probed.
7. **The consumer lens.** No scratch consuming project was built. I checked
   DR-0020's OBLIGATIONS, not its findings.
8. **The work history's claim grep and the fix-round contract's three items.**
   Round 9's own section states its axes and its non-coverage, and the delta
   verifier is contracted to audit that. I read the round-9 non-coverage section
   and the section index and nothing else of the 7,800-line file.
9. **Axes rather than items.** Everything above is ONE container, ONE engine
   (V8), ONE node build, ONE architecture, and every timing number is from a box
   that carried a concurrent verifier throughout (load average between 0.9 and
   5.4 across my runs). I did not vary the operating system, the filesystem, the
   locale, or the clock.

## On the orchestrator's narrowing

I was asked to say if I think it is wrong. **I do not.** The change between
`108eed0` and this head is nine files, and only four of them are product:
`assurance-modes.yaml` (comments plus one comment-line correction),
`schemas/assurance-modes.schema.json` (a `$comment` only, which cannot change
validation), `src/checks.ts` (one added loop) and `src/modes.ts` (one predicate
swapped for a name comparison plus a constant). Re-walking criteria that touch
none of that would have re-derived a measured answer.

One qualification I would put on the record: the narrowing was safe HERE
because the schema hunk is a `$comment`, and `$comment` is inert by the
specification. Had it been any other keyword, "the schema changed" would have
put every criterion back on the list. I checked that it is a `$comment` rather
than assuming it.

## The witness set, which round 9 changed and which criterion 3's witnesses row rests on

Two specs changed: `witness/checks-mode-skips-sound.json` is new, and
`witness/modes-execution-status-derived.json` gained a third dangerous state.

**The point of the round is that the new dangerous states are DATA, not code,
and they are.** Two of the three states in the new spec name
`assurance-modes.yaml` as their `file`, and the state added to the existing spec
names it too. That is the gap CR-002 exposed: every prior state in this
repository mutated source, so a data edit had no witness at all.

**Two structurally different members, and the difference is a real branch.**
State 1 targets `full`, the REFERENCE mode, which the completeness loop
`continue`s past entirely (src/checks.ts:448); state 2 targets `local-only`, a
non-reference mode that the loop does traverse. A soundness predicate written
inside the completeness loop would have been green against the sharper of the
two. I read the code and confirmed the soundness loop at src/checks.ts:427 runs
over EVERY row and runs BEFORE the reference is resolved at src/checks.ts:438,
so its violations survive an absent `full`.

**Every `find` string resolves to exactly one occurrence** (T-011), measured by
counting substring occurrences in the named file at this head rather than by
eye:

```
witness checks-mode-skips-sound
  assurance-modes.yaml  occurrences=1  "    skips: []"
  assurance-modes.yaml  occurrences=1  "    skips:\n      - intake"
  src/checks.ts         occurrences=1  "        if (running.has(stage)) {"
witness modes-execution-status-derived
  src/modes.ts          occurrences=1  "  if (mode.id === UNDOWNGRADED_MODE_ID) {"
  src/modes.ts          occurrences=1  "  if (!context.shippedDocument) {"
  assurance-modes.yaml  occurrences=1  "      - deploy-verify\n      - migration-verify\n      - final-report\n    skips: []"
```

The behavior is registered by name (`mode-skips-describe-only-omitted-stages`,
test/behaviors.json:482) and the registry grew by exactly one entry: 511 keys at
`108eed0`, 512 here, counted from the JSON rather than from the diff.

**The `red-witness` GATE, run by me at this head: GREEN.**

```
node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
  --only red-witness --evidence <dir> --base 3c60acbe --head HEAD --phase m3-p3
RED_WITNESS_EXIT=0
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
detail: 36 witness(es) evaluated (23 own, 13 stored re-evaluated in 139746ms);
        every witness red against every declared dangerous state and green at head
```

Round 8 measured 35 (22 own, 13 stored); 36 (23 own) is that plus this round's
one new spec, which is the arithmetic I expected and checked rather than took.

Per-member, read out of the gate's own `witness-records.json` rather than
summarised from the verdict line, each member showing 2 RED mutated runs and 1
green control:

| witness | member | file mutated | test it reddens |
|---|---|---|---|
| `checks-mode-skips-sound` | 0 | **assurance-modes.yaml** | `a mode declaring a stage in skips that its own pipeline runs is rejected, and the shipped document is green` |
| `checks-mode-skips-sound` | 1 | **assurance-modes.yaml** | same |
| `checks-mode-skips-sound` | 2 | src/checks.ts | same |
| `modes-execution-status-derived` | 0 | src/modes.ts | `mode show says which mode is the un-downgraded process and which is a declared downgrade never exercised` |
| `modes-execution-status-derived` | 1 | src/modes.ts | same |
| `modes-execution-status-derived` | 2 | **assurance-modes.yaml** | same |

**The gate left no mutant behind.** I md5-compared all 450 tracked files before
and after the run: `TREE_MD5_DIFF_EXIT=0`, zero differing lines, and
`git status --porcelain` in `CRB9-head` is 0 lines.

## Final state of everything I touched

- `CRB9-head` (detached b5c01f0): `git status --porcelain` 0 lines.
- `CRB9-194` (detached 194b489): created by me for one control measurement, no
  mutation beyond `npm ci` and `npm run build`.
- The staged install `CRB9-inst`, the context copy `CRB9-ctx` and the foreign
  document `CRB9-foreign` are outside any git tree and are kept as evidence.
- The main repository at `/home/user/tiphys-ai-helmsman` was never written to.
- `wt-m3p3-delta4`, borrowed read-only as the DR-0022 baseline tree, is
  unchanged: 1 line of `git status --porcelain`, the same untracked review
  document it carried before I read from it.

No captured output in this report or its evidence bundle contains a non-ASCII
byte or a control character. Both CLAUDE.md checks with the load-bearing `-a`
return GREP exit 1 over the report and the whole evidence directory.
**No transliteration was needed for anything quoted in the report body**, because
every capture quoted here came from the CLI, the gate runner or the reporter's
`tests/pass/fail/skipped` summary lines. The ONE place the glyph problem arises
is the suite's own summary: node's spec reporter prefixes those lines with
U+2139, so where I quote counts I quote the NUMBERS and not the prefixed lines.
Nothing was hand-written to avoid a glyph and no captured value was altered.

## Handover, in one line for the orchestrator

The changed surface is DISCHARGED: CR-002 is closed at the mechanism with all
three members re-measured, DR-0020 and DR-0022 hold, and the `pull_request` CI
arm is GREEN and OBSERVED at b5c01f0. Two LOWs (CRB9-01, a citation pointing at
a blank line; CRB9-02, the successor hazard closed by a test rather than by the
validator) and one recorded observation (the suite's invocation axis). What
remains owed is T-009 rule 1: the post-merge `push` run on the new `main` tip.

## Evidence committed alongside this report

`delivery/review/evidence/clean-room-m3-p3-r9-criteria/`:

| file | what it is |
|---|---|
| `CRB9-member1.sh`, `CRB9-member2.sh`, `CRB9-member3.sh` | the three CR-002 reproductions, members 1 and 2 derived from the round-8 report's own scripts, each self-restoring from a pristine trap with md5 printed |
| `CRB9-succ.sh` | CRB9-02: an honestly-declared downgrade of `full`, validating at exit 0 |
| `CRB9-succwit.sh` | the red witness for the new `full`-declares-no-skip assertion, green then red then restored |
| `mode-show-full.txt`, `mode-show-direct-pr.txt`, `mode-show-local-only.txt` | the three shipped `mode show` outputs in full, which is where the execution-status sentences are read from |
| `mode-show-file-foreign-full.txt` | the `--file` arm, showing `not determinable here` for a mode named `full` in a document that is not the kernel's own |
| `successor-hazard-mode-show-full.txt` | the self-contradicting output CRB9-02 describes |
| `units-head-b5c01f0.json`, `units-baseline-18c335a.json`, `units-md5.txt` | the DR-0022 re-derivation and its md5 on both sides |
| `red-witness-result.json`, `red-witness-evaluations-summary.json` | the gate's own verdict and a per-member summary of all 36 evaluations (the full 15 MB record is not committed) |
| `tree-md5-diff-after-red-witness.txt` | empty, which is the claim that the gate left no mutant behind |
| `suite-counts.txt` | all five suite measurements with toolchain, build state and INVOCATION named |
| `ci-run.txt` | the observed CI run, its ids, its conclusion and its per-step outcome |
