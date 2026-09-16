# Clean-room review: M4-P11, the declared single-family review exception

- phase: M4-P11
- branch: claude/m4-p11-single-family-exception
- head: 399953c
- base: 3b40118 (= origin/main tip)
- reviewer model family: Claude Opus 5
- framing: CORRECTNESS AND DATA LOSS
- review contract: criteria
- status: IN PROGRESS (written incrementally from the first minutes)

## Structural facts established first

- `git merge-base origin/main claude/m4-p11-single-family-exception` = 3b40118, so
  the branch is cut from the current main tip.
- The branch is STACKED on M4-P10, which is unmerged. The phase's own commits start
  at 7d97291; everything before that is M4-P10 and the M4 plan paperwork.
  `git diff --stat 7d97291^...HEAD` is the phase's own change:
  8 files, 2960 insertions, 12 deletions.
- The plan says so: section 4.2.6 "depends on: M4-P10 merged".

## Check 0 (FIRST): the derivation's "what it did NOT cover" statement

The work history carries THREE such statements, not one, which is more than the
contract asks for:

- delivery/work-history/m4-p11.md:479, five items, on the aggregation mechanism.
- delivery/work-history/m4-p11.md:642, five items, on the rule (f) red-witness class.
- delivery/work-history/m4-p11.md:1210, on what the claim grep cannot do.

Judged honest. Three of the admissions are WORSE than they sound and I say so:

1. :479 item 1, "the exception arm does not run in CI today". This is correct and
   understated. `check-dual-review` is registry-only, `scripts/m2-exit-test.sh`
   runs `--manifest gates.manifest.json`, so the entire feature this phase ships
   has NO CI arm. Every green in this work history is local-only by construction.
   T-009's second rule ("where behavior forks on the CI event, BOTH arms need a
   witness") has zero witnessed arms here, not one.
2. :642 item 1, "I did not read all 39 witnesses". Combined with the phase being
   delivered with a RED required gate, this is the load-bearing gap: the phase
   does not establish that the 39 reddened witnesses are wrongly reddened, only
   that they redden.
3. :479 item 2, a REQUIRED field was added to `RunSummary` and consumers outside
   this checkout were not searched. `summary.json` is a shipped record.

## Candidate HIGH under investigation: the declaration is read from git, the
## corpus that refutes it is read from the WORKING TREE

`singleFamilyException` (src/checks.ts:3712 area) evaluates both falsifiers over
`committed.verdicts`, which comes from `loadCommittedVerdicts` at
src/checks.ts:2922. That function is named "committed" and is NOT: it
`readdirSync`s `<contextDirectory>/delivery/review` and reads each file off
disk. No git object is consulted.

The phase's own anti-widening argument is that a declaration must be committed
so an implementer cannot add it, merge under it and delete it. The same actor
controls the corpus with no commit at all: deleting a second-family verdict from
the WORKING TREE removes falsifier 1's only evidence.

Under measurement now.

### CONFIRMED HIGH, measured in three arms at one commit

Staged context `/tmp/claude-0/probe1`, a real git repository at commit
`22d1ca2`, charter committed declaring `review-families.available: [family-a]`,
three verdicts committed under `delivery/review/`: two `family-a` at phase
M3-P9 (which form the pair under review) and one `family-b` at phase M2-P1
(which is in the corpus and not in the group). Shipped script, unmodified,
node v22.22.2.

| arm | working tree | commit | result |
|---|---|---|---|
| A | all three files present | `22d1ca2` | **red**, exit 1, units 3. Falsifier 1 fires and names `family-a, family-b` |
| B | `rm delivery/review/b-other-phase.yaml`, NOT committed | `22d1ca2`, unchanged | **not-applicable**, exit 20, units 2, precondition `single-family-declared`, `met: false` |
| C | the same file copied back, still nothing committed | `22d1ca2`, unchanged | **red**, exit 1, units 3 |

`git ls-tree -r HEAD -- delivery/review` in arm B lists all three files and
`git show HEAD:delivery/review/b-other-phase.yaml` still reads
`produced-by: family-b`. The declaration's recorded `refSha` and blob sha256
are byte-identical across A, B and C.

So the exception is bought by an UNCOMMITTED deletion. The declaration is
tamper-evident and the evidence that refutes it is not.

Worse, the record that arm B writes says, in shipped output:

```
REPORT single-family-declared charter.yaml declares exactly one review family
(family-a) and all 2 committed verdict(s) carry it ...
```

That sentence is false of the commit it names, and it is printed beside a
provenance line that makes it look attributable and dated.

The work history asserts the opposite at delivery/work-history/m4-p11.md:515:
"Both are evaluated over the WHOLE committed corpus rather than over the pair
under review, so a project cannot satisfy them by arranging for two agreeing
reviews in front of the check while its history says otherwise." Refuted above.

Reaches: `src/checks.ts` (shipped), `scripts/check-dual-review.mjs` (shipped
gate script), and the user-visible `tiphys gates run --only check-dual-review`
and `node scripts/check-dual-review.mjs <dir>` paths. This is the merge gate for
DR-0012 condition 1.

### CONFIRMED MEDIUM: falsifier 1's "whole committed corpus" is ONE DIRECTORY,
### and this repository does not keep its verdicts there

`loadCommittedVerdicts` reads only `<context>/delivery/review`
(src/checks.ts:2925). Measured at `/tmp/claude-0/probe2`, one commit,
everything committed:

- `delivery/review/`: two `family-a` verdicts (the pair under review).
- `delivery/evidence/past/`: two committed verdicts carrying `produced-by:
  family-b`, found by `git grep -l '^produced-by: family-b' HEAD`.
- Result: **not-applicable**, exit 20, precondition `single-family-declared`.

The project's own record demonstrably carries two families and the exception is
granted. That is falsifier 1's stated job, defeated by file placement alone.

This is not hypothetical placement. On this very head, `delivery/review/`
contains ZERO verdict documents, and the repository's only two real verdicts are
at delivery/evidence/m3-exit-test/e1/e1-7/verdict-criteria.yaml:1 and
delivery/evidence/m3-exit-test/e1/e1-7/verdict-hazard.yaml:1, moved out of
`delivery/review` on purpose by commit `20c4c30`. The phase's own test file
reaches into that path (test/single-family-exception.test.ts:75) because the
directory the shipped check reads is empty. So the subject the plan says gives
falsifier 1 its red witness is a subject the shipped check does not look at.

## Check 1: the red witnesses

Reproduced independently in a clone at `/tmp/claude-0/lab` (node v22.22.2 at
`/opt/node22/bin/node`, `dist/` built, `npm run build` exit 0, a GIT CHECKOUT
and not a `git archive` copy).

- `node --test test/single-family-exception.test.ts`: 21 tests, 21 pass, 0 fail,
  **0 skipped**, exit 0. Criterion 1 met.
- I wrote TWO mutants of my own rather than replaying theirs:
  - `decideAggregate` appends the declaration clause ONLY when
    `exitCode === EXIT_GREEN`. Result: 21 tests, 20 pass, **fail 1**,
    `not ok 11 - a declared not-applicable is named on a red bundle too`.
    That is a dangerous state (a guard that goes quiet exactly when something
    else is also wrong), not an absent feature.
  - `readReviewFamilies` decodes the WORKING TREE charter instead of the blob.
    Result: 21 tests, 20 pass, **fail 1**, `not ok 13`. Also a dangerous state.
  Both files restored byte-identically (`cmp` exit 0).

Classes:
- "the exception narrows more than one dimension", members (a) shared `framing`
  and (b) shared `review-contract`. `DECORRELATION_DIMENSIONS` has exactly three
  entries, so these two are the EXHAUSTIVE set rather than a sample. Adequate.
- "an exception reported without the work behind it", members (a) fewer than two
  reviews, (b) the falsifier-bearing check did not run. Structurally different
  guards. But the work history itself says member (a) is NOT reachable through
  the shipped path with both checks registered, so the class has one reachable
  member and one defence-in-depth member. Stated honestly there; recorded here.

## Check 2: a guard that cannot go red

I did not find a new check that passes for a reason unrelated to its property.
Test 9 carries its own anti-vacuity assertion (`requiredNotApplicable` must be
empty, "if it does, this test is passing for the wrong reason") and test 10
carries an explicit control arm. Test 5 asserts `ARMS.length >= 5`, a floor, so
it cannot be satisfied by an empty set.

The one guard that IS weaker than it reads is the pair of falsifiers, and that
is findings 001 and 002 above: their condition is evaluated over a set the
actor being guarded against can change without committing anything.

## Check 3: a count pinned over an append-only registry

CLEAN. `test/behaviors.json` is asserted BY NAME over a 14-id list
(test/single-family-exception.test.ts:924), with an explicit comment citing
binding convention 5. `grep -nE "\.length,\s*[0-9]"` over the phase's test file
returns exactly one hit, `assert.equal(seen.length, ARMS.length, ...)`, which is
a self-comparison and not a pin. No gate count, no clause-map count, no manifest
count is pinned.

## Check 4: the claim greps

| form | whole file |
|---|---|
| line-based, matching lines | 33 |
| line-based, OCCURRENCES | 74 |
| wrap-insensitive, occurrences | 74 |

74 = 74, so the wrap gap is zero, which reproduces the work history's own figure
exactly.

**The passive-form grep from the dispatch found the one claim that matters, and
the binding grep cannot see it.** Two hits:

- delivery/work-history/m4-p11.md:538, "One further thing that is caught ... The
  declaration must be COMMITTED." Settled by test 14 and a mutant. Fine.
- delivery/work-history/m4-p11.md:516, "**What IS caught.** ... Both are
  evaluated over the WHOLE committed corpus rather than over the pair under
  review, so a project cannot satisfy them by arranging for two agreeing reviews
  in front of the check while its history says otherwise."

  **No adjacent captured command. Measured FALSE in two independent ways
  (findings 001 and 002).** This is exactly the shape the claim grep exists for,
  and the binding eleven-alternative pattern does not contain `is caught`.

## Check 5: the suite sentence

The work history's sentence is complete on THREE qualifiers (interpreter, build
state, invocation) plus pass and skipped counts, and it establishes the base
BEFORE attributing anything, with three samples and a per-file control. That is
better practice than this repository's average.

It does NOT name the fourth qualifier (git checkout versus `git archive` copy).
Its runs were in git worktrees, so the answer is "checkout", but it is not
stated.

My independent run, complete sentence: node v22.22.2 at `/opt/node22/bin/node`,
`dist/` built (`npm run build` exit 0), invocation `npm test`, tree a GIT CLONE
CHECKOUT at `399953c`: **899 tests, 896 pass, 1 fail, 2 skipped, exit 1.** The
single failure is `not ok 258 - a staged install of the built package reproduces
the captured contract live` at test/doctor.test.ts:934, which is the
floor-dependent-without-being-floor-gated test CLAUDE.md names and which the
work history measured failing on the BASE. The coverage-gate failures the work
history saw did not reproduce for me, which corroborates its reading that they
are load and not the branch. 899 - 878 = 21, this phase's file, so no existing
test was added or removed.

## Check 6: scope

The phase's own three-dot diff from M4-P10's tip is EXACTLY the declaration:
five files-to-touch and three declared extras, 8 files. Verified with
`git diff --stat 7d97291^...399953c`.

Two operational points for the orchestrator rather than findings against the
code:

- The branch is STACKED on unmerged M4-P10. Against `origin/main` the diff is 46
  files. The plan says "depends on: M4-P10 merged"
  (delivery/plan/kernel-plan-m4.md:1724), so merge order must be respected or
  the scope gate sees a declaration that does not exist at the merge base.
- delivery/plan/m4-conflict-pre-pass.md:6 scopes itself to WAVE 1 and M4-P11 is
  not in it; the pairwise serialisation for M4-P10/M4-P11 is in the plan at
  delivery/plan/kernel-plan-m4.md:1964 instead. No wave-2 pre-pass document
  exists in the tree.

## Check 7: citations

I extracted every `path:line` outside backticks from the work history: 56
resolving citations. I verified a sample of 27 by opening each line.

**Hit rate 27 of 27, 100%.** Every sampled line says what the document claims,
including the hard ones: src/witness/run.ts:319 is
`export const SPAWN_GREP = /child_process|execFile|spawnSync|execSync/;`,
src/witness/run.ts:1305 is `if (!inputs.phaseOwnedMembers.has(index)) {` (the
rule (d) filter the recommendation rests on), src/gates/release.ts:817 is
`export function loadDeclaration(...)`, and CLAUDE.md:155 is the rule 3b heading.

## Check 8: C-1, C-2, C-3

CLEAN. `git diff 7d97291^...HEAD -- src scripts schemas` matched none of
`process\.pid`, `/proc/`, `kill\(`, `SIGTERM`, `detached`, `unref`. The only new
subprocess is `spawnSync("git", ...)` at src/checks.ts:3521, which is
synchronous (C-3 satisfied), reads stdout for data rather than probing liveness
(C-2 satisfied), and reads whole blobs rather than a log tail (C-1 satisfied).

## Check 9 and the red-witness gate

`node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full --only
red-witness --base origin/main --head HEAD` at `399953c`: **exit 1, red**,
48 witnesses evaluated, 57244ms. Confirmed.

Control at M4-P10's tip `deae190`: **exit 21, error**, 39 witnesses evaluated,
0 occurrences of `rule (f)`. Confirmed, and it matches the work history.

**But the count is 40, not 39.** `grep -o 'no longer guards' | wc -l` on my head
run is 40 and `grep -o 'rule (f)' | wc -l` is 39. The fortieth is

```
witness precondition-nonzero-exit-attributable no longer guards its behavior
  (member 0 red 2/2, member 1 red 2/2)
```

That witness's members mutate `src/gates/run.ts`, which this phase changes, and
it DOES declare `consumesExternalOutput`, so rule (f) never fires for it. Its
printed reason reads like a success because of a separate, PRE-EXISTING defect
at src/gates/red-witness.ts:414: when any member has a rate, the rate string
REPLACES `evaluation.reasons`, so the actual reason is discarded. Reading
src/witness/run.ts:1554, the only reason that can fire with `red 2/2` on a
deterministic spec is `record.headGreen === false`, "the named tests are not
green at the audited head".

The work history's derivation prints 39 and concludes "The reddened set and the
set of specs naming `src/checks.ts` are the same set, both 39 ... it is exactly
every witness over that file." At this head that is off by one, and the extra
one is a different failure mode that appears nowhere in the document.

## What I tried to break and how it held

I attacked the change as a data-destruction and false-authorisation surface,
not as prose.

- **Held.** The aggregate. I mutated `decideAggregate` so the declaration clause
  appears only on the green arm; test 11 reddened. Every return path in the
  function is wrapped by `decided()`, including the two internal-inconsistency
  arms, so there is no exit that drops the clause. No consumer in `src`,
  `scripts` or `bin` parses `summary.reason`, and no schema exists for
  `summary.json`, so appending a clause cannot invalidate a record.
- **Held.** Provenance of the DECLARATION. I made `readReviewFamilies` decode
  the working-tree charter; test 13 reddened. `HEAD:./charter.yaml` with the
  leading `./` is load-bearing and correct.
- **Held.** The narrowing. `DECORRELATION_DIMENSIONS` has three entries and only
  `produced-by` is in `exemptDimensions`; the report prints the compared subset
  and test 8 asserts the word `produced-by` is absent from it.
- **Held.** C-1, C-2, C-3. One new subprocess, synchronous, reading stdout for
  data.
- **Held.** Group membership. The group is a subset of the corpus and
  `decorrelationTriple` membership is enforced before any dimension is compared,
  so the exemption cannot be granted over a document that was never read.
- **BROKE.** The corpus. Three arms at one commit, only the working tree
  changing: red, then not-applicable, then red. The declaration is
  tamper-evident and the thing that refutes it is not. Finding CR-M4P11-001.
- **BROKE.** The corpus again, differently. Two committed verdicts carrying a
  second family, placed where this repository actually keeps its verdicts, and
  the exception is granted. Finding CR-M4P11-002.
- **BROKE.** The red-witness enumeration. 40 failures at this head, not 39, and
  the fortieth is a different failure mode that the document does not mention.
  Finding CR-M4P11-003.

## Verdict

**FIX-ROUND-NEEDED.**

One HIGH that reaches shipped `src/checks.ts` and shipped
`scripts/check-dual-review.mjs` and is reproducible in three arms at one commit.
Two MEDIUMs. Under DR-0012 an unresolved high or medium bars a merge; under
DR-0027 CR-M4P11-001 and CR-M4P11-002 name the shipped files and the
user-visible command they reach, and CR-M4P11-003 does not reach a shipped file
and is recorded as tracked.

Separately and independently of my grading: the required `red-witness` gate is
RED at this head, which I confirmed at exit 1.

The work is otherwise of high quality. The suite sentence, the base control, the
claim grep arithmetic, the citation accuracy (27 of 27 in my sample) and the
three separate not-covered statements are all better than this repository's
average, and the escalation of rule (f) rather than defanging it is the right
call made for the right reason.

- verdict document: /tmp/claude-0/verdicts/M4-P11-opus5-correctness.json
  (ajv 2020, strict true: valid)
