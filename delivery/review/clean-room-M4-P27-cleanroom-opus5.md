# Clean-room review: M4-P27, branch claude/m4-p27-cutover-entry-trigger, head 4e95204

Reviewer: single clean-room reviewer, Opus 5. Framing: EVIDENCE INTEGRITY AND
DATA LOSS COMBINED. Started 2026-09-16.

Status: IN PROGRESS, written incrementally.

## 0. Scope of the change (measured)

    git show --stat 4e95204
    delivery/plan/cutover/entry-trigger.md       | 230 +
    delivery/plan/phase-declarations/m4-p27.json |  22 +
    delivery/work-history/m4-p27.md              | 891 +
    scripts/check-cutover-entry.mjs              | 612 +
    scripts/probe-pilot-readonly.mjs             | 644 +
    test/behaviors.json                          |  33 +- (1 deletion)
    test/cutover-entry.test.ts                   | 886 +

Nothing under src/, bin/, schemas/, roles/, tuition/. DR-0027: findings are
RECORDED, not blocking, unless one makes a shipped artifact wrong.

## 1. First check: does the work history state what the derivation did NOT cover?

YES, and it is unusually good. Section 6.3 of delivery/work-history/m4-p27.md
lists eight named gaps, including the two that matter most (arms a and c never
run against a real `tiphys cutover status`, and arm b's required behavior names
being a declared contract rather than an observed fact). It names the mechanism
("a predicate whose false case and unknown case are collapsed into one value")
rather than the instances, and publishes a 48-site derivation with full output.

Judged honest. Two things are WORSE than they sound, and one gap is MISSING.

- item 2 admits arms a and c were never run against the real CLI. The arms are
  fail-closed to `unreachable` there, so the admission is safe. But arm a and
  arm c ALSO parse text with loose regexes and never look at the CLI's EXIT
  STATUS at all (see finding 2), so "if the delivered shapes differ, both arms
  fail closed" is not the whole truth.
- MISSING FROM 6.3 ENTIRELY: arm d does not measure what the plan asked for.
  See finding 1. This is the largest single defect in the phase and the
  derivation did not reach it, because the derivation enumerated where a
  VERDICT is decided, not what each verdict's INPUT actually measures.

## FINDING 1 (HIGH on the merits, RECORDED not blocking under DR-0027)
### Arm d measures filesystem mtime, so it is decided by checkout order, not by content

Plan text, delivery/plan/kernel-plan-m4.md:3570: arm d is
"`delivery/plan/cutover/pre-freeze-ruleset.json` is present and NEWER than the
most recent inventory change".

Implementation, scripts/check-cutover-entry.mjs:455: `rulesetMtime < newest.mtime`
over `statSync(...).mtimeMs`.

Two measured consequences, both run today against the branch head 4e95204.

(a) FALSE GREEN. Byte-identical content, `touch` alone flips the arm:

    $ sha1sum r1/delivery/plan/cutover/pre-freeze-ruleset.json
    6d42a50f74030c1ed54a5a2c6bbbb704a2abe058
    ARM d pre-freeze-ruleset not-yet -- ... is older than ... retirement-inventory.json
    EXIT=1
    $ touch r1/delivery/plan/cutover/pre-freeze-ruleset.json
    $ sha1sum r1/delivery/plan/cutover/pre-freeze-ruleset.json
    6d42a50f74030c1ed54a5a2c6bbbb704a2abe058          <-- same bytes
    ARM d pre-freeze-ruleset satisfied -- ... is not older than ...
    EXIT=0

(b) FALSE RED, and it is the state every fresh clone is in. git does not
preserve mtimes; a checkout stamps every file with checkout time, ordered by
the checkout walk. Measured on a scratch repository where the ruleset was
committed FIRST and the inventory a second later:

    $ git clone -q src clone
    1789525058762.029   clone/delivery/plan/cutover/pre-freeze-ruleset.json
    1789525058762.5947  clone/delivery/plan/cutover/retirement-inventory.json
    $ armRuleset("/tmp/claude-0/m4p27lab/clone")
    { "verdict": "not-yet", "reason": "... is older than ... retirement-inventory.json" }

The 0.57 MILLISECOND gap that decides the verdict is the order in which git
wrote two files whose names sort `p` before `r`. Nothing about their content is
consulted. On a filesystem with coarser timestamps the two are EQUAL and the
implementation's `<` (rather than the plan's "newer than") returns SATISFIED.

So arm d is a guard whose condition does not test the property that matters:
CLAUDE.md's dominant recorded failure, seventh variant. It is not in the
derivation's not-covered list, the trigger document does not mention it, and
witness D4 reddens only the NO-INVENTORY case, never the stale-content case.
The one test that exercises staleness (test/cutover-entry.test.ts:261) creates
it with `utimesSync` back-dating, which is a state git cannot produce.

Undeclared plan deviation alongside it: the plan says "newer than", the code
and its output string say "not older than". Equal mtimes therefore pass. That
relaxation is exactly what makes the coarse-timestamp case green.

REACHABILITY (DR-0027): scripts/check-cutover-entry.mjs is NOT under src/,
bin/, schemas/, roles/ or tuition/. No shipped artifact is made wrong. RECORDED,
not blocking. It is nevertheless the highest-value thing in this review: the
arm will be consulted before entering cutover and it currently answers a
different question from the one asked.

## FINDING 2 (MEDIUM, RECORDED) Arms a and c never look at the CLI's exit status

`classifyCliFailure` (scripts/check-cutover-entry.mjs:176) only turns a run into
a failure for exit 64 / "usage:" / a permission-refusal regex. Every other
nonzero exit falls through to `return null`, and `armDrain` then parses the text
as if the command had succeeded. Measured, stub CLI exiting 1:

    stdout: SWITCH planning-and-scope kernel
            DRAIN clean
            ERROR: could not read the drain register, the numbers above are stale
    exit:   1

    ARM a drain satisfied -- cutover status reports DRAIN clean
    STEP 1 preconditions: preconditions-satisfied-owner-action-pending
    EXIT=0

This FALSIFIES the sentence the reviewer is told to weigh first. Work history
section 6.3 item 2: "If the delivered shapes differ, both arms fail closed to
`unreachable`, which is the safe direction". Measured, they fail OPEN, to
`satisfied`, on a plausible delivered shape (a command that prints a stale
report and exits nonzero). Arms a and c are the two arms the work history
already admits were never run against the real command.

One-line-class fix: require `run.status === 0` before parsing.

## FINDING 3 (MEDIUM, RECORDED) Arm c counts WORDS, so a summary line is a row

`countRetirementRows` (scripts/check-cutover-entry.mjs:369) counts any line
containing `unported` as an unported row and any other line containing `ported`
as a ported row. Measured, stub printing a summary and no rows at all:

    stdout: RETIREMENT SUMMARY: 12 rows, all ported
    ARM c retirement satisfied -- all 1 retirement row(s) are ported
    EXIT=0

The zero-rows guard, which is witness D3 and one of the phase's headline
properties ("zero rows is not zero unported rows"), is defeated by any single
line that happens to contain the word. Same class as finding 2, structurally
different member: finding 2 is the exit code, this is the row grammar.

## FINDING 4 (MEDIUM, RECORDED) `--json` prints no HALT, and no test runs it

Measured on the all-arms-satisfied fixture:

    $ node scripts/check-cutover-entry.mjs --root <all satisfied> --json
    { "overall": "preconditions-satisfied-owner-action-pending", "arms": [...],
      "ownerAction": { "step": 3, "status": "blocked", ... } }
    EXIT=0

No `HALT, OWNER ACTION`, no `never reports it done`, no STEP 2 or STEP 4 line.
Commit message: "Step 3 prints as a HALT on every run, including the
all-satisfied one." Work history section 2: "prints the step-3 HALT on EVERY
run". Both are FALSE for this mode. `grep -n json test/cutover-entry.test.ts`
finds no test that passes `--json`, so the forbidden-ready-token assertion
(test/cutover-entry.test.ts:231) never runs against this path. The substantive
safety property survives (`ownerAction.status` is `blocked` and no vocabulary
member means ready), so this is an over-claim plus an untested output path,
not a live falsehood.

## FINDING 5 (MEDIUM, RECORDED, and it will be RED in CI) The scope gate was never run locally and it is red

Run with the repository's own runner, in a clean clone at 4e95204 on a branch of
the correct name, base origin/main (= 3b40118, the same merge base the PR will
have):

    gates: declared 1 applicable 1 verdict 1 green 0 red 1 ...
    gates: scope: red: branch claude/m4-p27-cutover-entry-trigger (phase m4-p27)
      matches the phase pattern but no phase declaration exists at
      delivery/plan/phase-declarations/m4-p27.json in the merge base
      3b401182301361700ffa0fd4b2ae099993b3d733 ...; the declaration must be
      committed to main before the phase branch is created
    EXIT=1

M3-P11's both-declarations relaxation (src/gates/scope.ts:110) covers an ENTRY
added on the head, not a declaration file that does not exist at the merge base
at all. Work history section 8.1 lists `npm ci`, `npm run build`,
`check-authored-bytes` and `citations` only; `scope` is absent, and section 9
says "Nothing is marked CI-deferred. Every criterion was walked locally."
DR-0031: "If CI tells you something you did not already know locally, that is a
defect in the local procedure." ORCHESTRATOR ACTION, not a code fix: the
declaration needs to reach main first.

## FINDING 6 (MEDIUM, RECORDED) `--out` truncates before the first read: prior evidence is destroyed

scripts/probe-pilot-readonly.mjs:601 calls `writeFileSync(options.out, ...)`
unconditionally, before any target is probed, with no existence check and no
refusal. Measured:

    $ printf 'IMPORTANT PRIOR EVIDENCE\nline2\nline3\n' > keep.md   (37 bytes)
    $ node scripts/probe-pilot-readonly.mjs --api-base http://127.0.0.1:1 \
        --git-base http://127.0.0.1:1 --repo owner/name --out keep.md
    OVERALL unreachable ; EXIT=3
    $ grep -c 'IMPORTANT PRIOR EVIDENCE' keep.md
    0

At the DEFAULT path this is the case that matters: `delivery/verification/
pulse-re-probe.md` is the evidence document the trigger's step 2 produces, so a
second run that is REFUSED destroys a first run that SUCCEEDED, and destroys it
before it knows it will be refused. The T-008 beacon rule requires writing the
header early; it does not require clobbering the previous run.

## FINDING 7 (LOW, RECORDED) A target string is written into the evidence table unescaped

`targetRow` passes `detail` through `cell()` but interpolates `result.target`
raw (scripts/probe-pilot-readonly.mjs:498). Measured, one `--repo` argument
carrying a pipe and a newline:

    | target | verdict | detail |
    |---|---|---|
    | `x/y | satisfied | all good |
    | `z/w` | satisfied | fabricated row` | unreachable | ... |

A rendered table now shows a row whose verdict column reads `satisfied`. The
OVERALL line is still `unreachable` and the reason column names the
malformation, so a careful reader is not fooled. Fix is `cell(result.target)`.

## FINDING 8 (LOW, RECORDED) Five `:1` citations, three of them substantively wrong

    delivery/plan/cutover/entry-trigger.md:67   -> delivery/work-history/m4-p27.md:1
    delivery/plan/cutover/entry-trigger.md:117  -> test/cutover-entry.test.ts:1
    scripts/check-cutover-entry.mjs:22          -> m4-prototype-probes.md:1
    scripts/probe-pilot-readonly.mjs:34         -> m4-prototype-probes.md:1
    test/cutover-entry.test.ts:290              -> m4-prototype-probes.md:1

Line 1 of delivery/verification/m4-prototype-probes.md is
`# M4 prototype probes: what was measured, and what it overturns`. The claim all
three attach to ("a nonzero exit does NOT mean the condition is false") is at
:153, which the work history and entry-trigger.md both cite CORRECTLY. These
three resolve silently against the title. CLAUDE.md 3b, one scope smaller: the
citation that reddens is not the dangerous one.

## FINDING 9 (LOW, RECORDED) The D9b capture does not correspond to the shipped test

Work history section 5.4 quotes D9b as `requests reached the server: PATCH
/anything, GET /anything` (two). The shipped test issues THREE shaping attempts
(test/cutover-entry.test.ts:502: `{method:"PATCH"}, {body:"x"},
{redirect:"follow"}`). I rebuilt the described defang (remove the option-key
allowlist AND let `options.method` steer the request) and got:

    requests reached the server: PATCH /anything, GET /anything, GET /anything

Section 5.2 DROPPED two earlier lab passes for exactly this reason ("a capture
that does not correspond to the code it is offered as evidence for is worse than
no capture"). This one was retained. The lab script is deliberately uncommitted,
so the capture cannot be audited any other way. The PROPERTY D9b claims holds:
I reproduced a real PATCH reaching a real server.

## FINDING 10 (LOW, RECORDED) A crash in the probe exits 1, which is its own "real negative"

    $ node scripts/probe-pilot-readonly.mjs --repo owner/name --out
    Error: EISDIR ... syscall: 'open', path: '/tmp/claude-0/m4p27rv'
    EXIT=1

`EXIT_REAL_NEGATIVE = 1`. A caller reading exit 1 as "the remote answered and
the answer is a real negative" is wrong. That is precisely the collapse of the
unknown case into the false case that the whole phase exists against, arriving
through the process exit code rather than through a verdict. The checker's
`parseArgs` validates its own missing values; the probe's does not for `--out`.

## FINDING 11 (LOW, RECORDED) The suite sentence is missing the fourth qualifier

Section 8.2 gives interpreter, build state, invocation, pass and skipped counts
and the measured head. It does not say whether the tree was a git checkout or a
`git archive` copy (the 2026-09-16 measurement: 863/0 against 850/13, every
failure a git exit-128 artifact). Almost certainly a checkout, but it is the one
qualifier that is not stated.

## OBSERVATION (orchestrator, not a code finding) The branch carries 25 foreign commits

Work history: "cut from: `plan/pstack-borrow-review` at `c86c07f`". Measured:
`git log --oneline 3b40118..claude/m4-p27-cutover-entry-trigger` is 26 commits,
of which ONE is the phase. Merging this pull request also lands CLAUDE.md,
delivery/STATE.md, the whole 3719-line M4 plan, nine decision records, the
conflict pre-pass and T-026. DR-0031's mirror: the pull request's contents do
not match the unit of value it claims to deliver. The phase COMMIT itself is
clean (see section 0).

## What I tried to break and what HELD

Everything below is a thing I attacked and failed to break, re-run by me rather
than read.

RED WITNESSES, re-run independently. I rebuilt the mutation lab from the twelve
one-line descriptions in section 5.3 (the implementer's lab is uncommitted) and
re-ran EIGHT of the twelve. All eight reddened, and the unmutated control for
each was green:

    D2 unreachable CLI reads as satisfied        not ok 1, fail 1, exit 1
    D4 vacuous freshness reads as clean          not ok 1, fail 1, exit 1
    D5 vacuous suite reads as passing            not ok 1, fail 1, exit 1
    D6 owner step reported done                  not ok 1, fail 1, exit 1
    D8 git chokepoint removed                    not ok 1, fail 1, exit 1
    D9 http option allowlist removed             not ok 1, fail 1, exit 1
    D9b allowlist removed AND options steer      not ok 1, fail 1, exit 1
    D12 probe short-circuits on first source     not ok 1, fail 1, exit 1

D8 is RED AGAINST THE HARM, not the absent guard. Its first failing assertion:

    error: the probe created a commit in the scratch repository
    + '3aa1caa691681ae6f45355abaa1bf6463e2c9b05'
    - 'b1b55c2b8d124f0a0e563058ba48a342f066ce4c'

D9's failure line reproduced the work history's capture exactly
(`GET /anything, GET /anything, GET /anything`).

I BUILT A NINTH DEFANG THE IMPLEMENTER DID NOT RUN, to test "one witness is not
a class" on the git chokepoint. D8 lets both verbs through, so the HEAD
assertion fires first and MASKS member B. D8b lets ONLY `checkout` through:

    error: the probe altered the uncommitted edit in the scratch repository
    + '503bc6963f1c14b738e9c3587865a3a6dca3fc15c1aac0ad56e9da35f41b9e10'
    - '3b15e901cbe7e2755cba4d57259be3689587e2b68cf3228170d01f18720412ab'

Member B reddens on its own and against the harm. The class is genuinely two
structurally different members (history creation, working-tree destruction), and
the destructive one is CLAUDE.md standing warning 8's exact verb.

COUNTS OVER AN APPEND-ONLY REGISTRY (binding convention 5). test/behaviors.json
gains 31 rows and loses none. test/cutover-entry.test.ts:840 asserts PRESENCE BY
NAME over a hardcoded id list with no count, no length assertion and no row
ordering. Clean. The only counted assertions in the file
(test/cutover-entry.test.ts:558) count call sites in the probe's OWN source,
which is not append-only, and are backed by an import-binding assertion so a
second child-process route reddens.

A GUARD THAT CANNOT GO RED. The verb grep (test/cutover-entry.test.ts:525)
carries a control string and asserts every pattern DOES fire on it, so a zero is
the source being clean rather than a broken regex. The probe's git half exists
partly so criterion 3's allowlist assertion is not vacuously true of a program
that invokes no git, and that reasoning is written down. One guard does fail
this test and it is finding 1.

CITATIONS. 20 sampled by hand across the two new documents and the two scripts,
every one read at the cited line. 20 of 20 say what is claimed. HIT RATE 20/20,
with the five `:1` placeholders reported separately as finding 8. The citations
gate reproduced EXACTLY at the submitted head in a clean clone:

    gates: citations: green: linted 18 changed document(s) at 4e95204...:
      522 citation(s) resolved, 0 self-citation(s), 0 unverifiable-external
    EXIT=0

THE ELIDED-SHA CLAIM. Section 8.2 says the suites ran at 62007b9 and that the
submitted head differs only in the work-history file. Verified:
`git diff --name-only 62007b9 4e95204` prints exactly
`delivery/work-history/m4-p27.md` and nothing else. The reasoning for eliding
(delivery/work-history/** is outside the gate's document set) is verified at
src/gates/citations.ts:232, which lists six globs, none of them work-history.

THE CLAIM GREP. I re-ran both binding forms and the seven-passive-form variant
the implementer did not have. I then wrote my own fence/section classifier and
got the SAME three numbers and the SAME six prose lines: fenced 39, section 10
itself 9, AUTHORED PROSE 6. Each of the six has an adjacent captured command or
is an admission of a gap. The passive-form grep adds five hits: three are "the
REST path is refused", settled by the 12x403 capture in section 3.2, and two are
the quoted grep commands themselves. NO NEW OVER-CLAIM from the passive forms.

THE DERIVATION. `grep -n 'return arm(\|verdict: "'` over the two scripts returns
48 lines in my clone, matching "Forty-eight sites".

THE DOCUMENT'S OWN MEASUREMENT. entry-trigger.md records "all four arms
not-yet, exit 1" against the head it lands on. Reproduced exactly:

    ARM a drain not-yet -- the cutover command is not delivered (exit 64)
    ARM b exclusion not-yet -- behaviors.json does not yet register: ...
    ARM c retirement not-yet -- the cutover command is not delivered (exit 64)
    ARM d pre-freeze-ruleset not-yet -- ... is absent
    EXIT=1

SCOPE. The phase COMMIT 4e95204 touches exactly the four declared files plus the
three declared extras, matching delivery/plan/m4-conflict-pre-pass.md:132
("M4-P27 only. All new files plus `test/behaviors.json`"). No collision surface
with the nine concurrent agents.

C-1, C-2, C-3. `grep -nEi '\bpid\b|/proc|process\.kill|SIGKILL|SIGTERM|kill\(|alive|liveness'`
over both scripts, the test file and the trigger document: ZERO HITS. Nothing
reads current state from the tail of an append-only log; the probe appends to its
evidence document and never reads it back. Nothing is auto-backgrounded: the
only `spawn` is in the test file and its exit is awaited; both scripts use
`spawnSync`.

THE SUITE. I could not reproduce the full-suite numbers and I say so rather than
quoting the work history's. `npm test` on node v22.22.2 with `dist/` built, in a
git CHECKOUT, did not finish inside 580 seconds; the container was at load 41 to
61 on `nproc` 4 with nine other agents running. What I did establish, all in a
clean clone at 4e95204:

    npm run build                                       exit 0, git status clean
    test/cutover-entry.test.ts alone, v22.22.2, tap     32 tests, 32 pass,
                                                        0 fail, 0 SKIPPED, exit 0
    test/coverage-gate.test.ts alone, v22.22.2, tap     17 tests, 17 pass,
                                                        0 fail, 0 SKIPPED, exit 0

The second corroborates section 8.4's attribution: the file the work history
blames on load is green in isolation on the same head and the same interpreter.
I did not re-run the file-removed control.

## Verdict

APPROVE, one round, all findings RECORDED.

Not because the findings are small. Findings 1 to 3 mean the trigger's arms
answer a different question from the one delivery/plan/kernel-plan-m4.md:3563
asks. I APPROVE because DR-0027's test is REACHABILITY and none of these reach
a shipped artifact: `git show --name-only 4e95204` touches nothing under src/,
bin/, schemas/, roles/ or tuition/, and no finding here makes a shipped artifact
wrong.

Two things the orchestrator should do that are NOT a fix round on this code:

1. Finding 5. The scope gate is red until m4-p27.json is on main. This is a
   delivery-order action.
2. Finding 1 should be fixed before the trigger is ever ACTED on. Arms a and c
   cannot be validated until M4-P25 lands, so findings 2 and 3 fold naturally
   into that reconciliation. Arm d does not depend on M4-P25 at all and is
   wrong today.

This phase is, on the evidence, one of the more honest work histories in this
repository: its derivation reproduces, its captures reproduce, its elided sha
claim reproduces, its document's own measurement reproduces, and its witnesses
redden. The defects I found are the ones its derivation was pointed away from,
not the ones it claimed to have closed.
