# Clean-room review: harness assertion-direction fix round (criteria contract)

Reviewer: clean-room, criteria/fix-round contract.
Branch under review: claude/exit-test-harness-assertion-direction
Head: fdb3120692f4178e213c40a6439a742effe24466
Base: origin/main at c75152b93d3f1035bf175b5ece2889261af5f0cc
Started: (see git log of this file)

Status: IN PROGRESS. This file is appended after each command whose output it cites.

## 0. Tip confirmation

Command and output:

```
$ git rev-parse origin/claude/exit-test-harness-assertion-direction
fdb3120692f4178e213c40a6439a742effe24466
$ git rev-parse origin/main
c75152b93d3f1035bf175b5ece2889261af5f0cc
```

Confirmed: the sha in the brief is still the branch tip. 27 commits ahead of main.

## 1. Scope of the change

True diff is against the MERGE BASE, not against current main. Merge base is
bb8f6564cce657c121ff97bda9bda4b191aa2184.

```
$ git merge-base c75152b fdb3120
bb8f6564cce657c121ff97bda9bda4b191aa2184
$ git diff --stat bb8f656..fdb3120
 .github/workflows/gates.yml                                |   19 +-
 delivery/work-history/exit-test-assertion-direction.md     | 2188 +++++++++
 scripts/m2-exit-test.sh                                    |  356 +-
 test/behaviors.json                                        |    6 +-
 test/gate-registry.test.ts                                 |   37 +-
 test/m2-exit-test.test.ts                                  |  638 +-
 6 files changed, 3133 insertions(+), 111 deletions(-)
```

Six files. Read the whole work history (2188 lines) and both salvaged partial
reviews before running anything.

## 2. "No production code changed" (VERIFIED)

```
$ git show 21509d1:scripts/m2-exit-test.sh | sha256sum
9f53425fc0e119d3398722c50d025a45466cab3d31f2c232f9dc9f5f22da1138  -
$ git show fdb3120:scripts/m2-exit-test.sh | sha256sum
9f53425fc0e119d3398722c50d025a45466cab3d31f2c232f9dc9f5f22da1138  -
$ git diff --stat 21509d1..fdb3120 -- scripts/m2-exit-test.sh
(empty, exit 0)
```

The hash matches the value the work history states at
delivery/work-history/exit-test-assertion-direction.md:1914 EXACTLY. VERIFIED.

Files the fix round itself touched (21509d1..fdb3120):

```
.github/workflows/gates.yml
delivery/work-history/exit-test-assertion-direction.md
test/behaviors.json
test/gate-registry.test.ts
test/m2-exit-test.test.ts
```

One PRECISION defect, not a finding: FR1.6 at
delivery/work-history/exit-test-assertion-direction.md:1578 says the change "is
confined to test/m2-exit-test.test.ts and the one behaviors row". The round also
edited test/gate-registry.test.ts (CR-H-1's second half) and
.github/workflows/gates.yml. FR1.12 at
delivery/work-history/exit-test-assertion-direction.md:2040 states the full set
correctly, and FR1.7 names both edits, so the document as a whole is accurate and
no reader is misled if they read past FR1.6. Nothing production changed either
way: two test files, one workflow COMMENT.

## 3. test/gate-registry.test.ts, per hunk (the contract's explicit ask)

Two hunks against the merge base.

### Hunk 1 (around test/gate-registry.test.ts:396): the push-arm reader. FORCED.

Old: `/--only manifest-self-check[\s\S]*?\) \\/` scraped literal `--only` flags
out of the runner invocation text. New: `/^MAIN_ONLY_GATES="([^"]+)"/m` reads the
single declaration.

FORCED, and mechanically so. The literal text the old regex needed no longer
exists in the harness:

```
$ grep -n -- '--only manifest-self-check' scripts/m2-exit-test.sh
(no output, exit 1)
$ grep -n 'MAIN_ONLY_GATES' scripts/m2-exit-test.sh
217:MAIN_ONLY_GATES="manifest-self-check suite coverage credential-scrub deploy migrations"
234:  ' "${MANIFEST}" "${MAIN_ONLY_GATES}"
1112:  for gate_id in ${MAIN_ONLY_GATES}; do
```

The old reader could not match at this head, so the edit was not optional.

NOT a relaxation on the axis a reviewer would suspect: the pre-existing
`assert.ok(pushGates.size >= 6, ...)` floor is CONTEXT in the diff, unchanged.
No accepted set was widened, no case deleted, no equality turned into membership.
The failure message was made louder, and failing to find the declaration is still
a hard failure rather than an empty set.

One REAL, SMALL weakening, stated because the contract asks and the work history
does not name it: the old reader read the INVOCATION (what the runner is handed);
the new one reads the DECLARATION. Line 1112 builds the flags from the
declaration, so they agree today, but a future edit that hard-coded the flags at
1112 while leaving line 217 in place would leave this test green on a memory. The
old form had the mirror-image weakness (a declaration change with stale literal
flags), so this is a lateral move, not a regression, and the new form is the one
the harness's own single-source design implies. Reported as an observation, NOT a
finding.

### Hunk 2 (around test/gate-registry.test.ts:1027): the divergence-map reason string. NEITHER.

The map's VALUE is never asserted on; only its keys are used:

```
$ grep -n 'REGISTRY_ONLY_SCRIPT_GATES' test/gate-registry.test.ts
1025:const REGISTRY_ONLY_SCRIPT_GATES: ReadonlyMap<string, string> = new Map([
1060:    [...REGISTRY_ONLY_SCRIPT_GATES.keys()].sort(),
```

So this hunk is behaviourally INERT: it corrects prose that had gone false, which
is exactly CR-H-1. It is not a relaxation because it relaxes no assertion, and it
is not forced because no test would have reddened had it been left. It is the
right edit for the reason CR-H-1 gives, and it needs no further justification
beyond the one the work history supplies.

## 4. The derivation, re-run independently (NOT read off their table)

Their command reproduced exactly, then a WIDER search, then a structural
enumeration that maps each `assertProg` spawn to its enclosing `test()` block
rather than trusting a grep count.

```
$ node -e '<map every line spawning assertProg to its enclosing test() block>'
--- lines spawning assertProg ---
372 -> test@310
860 -> test@793      (this is the top-level helper runScopeAssert, not a test body)
1262 -> test@1212
1641 -> test@1585
--- mentions grouped by owning test ---
test@310  3   test@865  5   test@970  5   test@1212 3   test@1585 3
```

The five DIRECT invoking blocks are confirmed independently:
test/m2-exit-test.test.ts:310, test/m2-exit-test.test.ts:865,
test/m2-exit-test.test.ts:970, test/m2-exit-test.test.ts:1212 and
test/m2-exit-test.test.ts:1585. That is exactly the set FR1.9 lists. The claim
that block 1212 was the only live instance and 1585 already used the sound form
is VERIFIED by reading both: 1585 asserts
`match(/1 gate\(s\) reported RED: suite/)`, a POSITIVE identification of the
check, which is the sound form; 1212's old exclusion was the negative one.

### CR-FR-1 (LOW): the derivation missed a SIXTH site, and its "not covered"
### list does not name the reason

test/m2-exit-test.test.ts:272, "--self-test rejects a vacuous-green fixture and a
required-not-applicable fixture, naming each, and exits nonzero", DRIVES the same
assertion program. It does so through the harness's own `--self-test` mode
(test/m2-exit-test.test.ts:281) rather than by spawning the extracted program, so
it carries no literal `m2-assert` token and their `git grep -n 'm2-assert'` could
not see it.

FR1.10 item 1 bounds the literal-token search with "a test that obtained the
assertion program by a computed path, or that re-implemented its checks rather
than running it, would not appear". This site does NEITHER: it runs the real
harness end to end. So the exclusion that would have covered it is not the one
that is written down.

I checked the site rather than only reporting the gap, and it is SOUND, for a
reason that had to be measured rather than assumed. The worry is that the new
derivation default or the new zero-red check now over-determines the self-test's
two fixtures, which would quietly turn CI's falsifiability guard into a witness
for the new code instead of for the vacuity check it exists for. It does not,
because both fixtures are named EXPLICITLY in their own expectation tables inside
the harness:

```
$ grep -n 'fixture-vacuous\|fixture-required-na' scripts/m2-exit-test.sh
1184:  { id: "fixture-vacuous", command: [...], applicability: "required" }
1190:  gates: [{ id: "fixture-vacuous", expect: "green", required: true }]
1197:  id: "fixture-required-na",
1208:  gates: [{ id: "fixture-required-na", expect: "green", required: true }]
```

An explicit table row means the derivation's required-green DEFAULT cannot fire
on either fixture, and neither fixture carries a red row, so zero-red cannot fire
either. The two fixtures are still rejected by the vacuity check and the
required-green rule respectively, which is what the block exists to witness.

SEVERITY LOW, and it is a completeness defect in item 3 of the fix-round contract
rather than a defect in the code: the enumeration missed a live call site, the
missed site turns out to be sound, and the written exclusions do not describe the
way it was missed. The remedy is one line in FR1.10.

## 5. The `citations` gate-scope claim: VERIFIED, and TRUE FOR A STRONGER REASON

The round says the `citations` gate could not have caught its nine wrong
citations because `delivery/work-history/` is outside the gate's precondition
path list. Checked in both declaration sources:

```
$ grep -n -A 12 'id: citations' gate-registry.yaml
114:    precondition:
115:      id: citations-diff-touches-documents
116:      kind: diff-touches
117:      paths:
118:        - delivery/plan/
119:        - delivery/verification/
120:        - delivery/decisions/
121:        - delivery/tuition/
122:        - delivery/requirements/
123:        - delivery/STATE.md
```
(`gates.manifest.json` carries the identical six paths.)

TRUE. `delivery/work-history/` is not among the six.

**But the precondition is the weaker half of the reason, and the stronger half
matters beyond this round.** Even on a diff that DID touch a precondition path,
the gate would still not check a work history, because the tree is absent from
the gate's `documents` list altogether:

```
$ grep -n 'citationRequired\|delivery/' src/gates/citations.ts
233:    "delivery/plan/**/*.md",
234:    "delivery/verification/**/*.md",
235:    "delivery/decisions/**/*.md",
236:    "delivery/tuition/**/*.md",
237:    "delivery/requirements/**/*.md",
238:    "delivery/STATE.md",
240:  citationRequired: [
241:    "delivery/plan/**/*.md",
242:    "delivery/verification/**/*.md",
```

and src/gates/citations.ts:184 states the exclusion is deliberate and settled:
"The `delivery/review/` and `delivery/work-history/` trees are records of what
was examined at the time".

So work-history citations are NEVER machine-checked, on ANY diff, by design. The
round's claim is right; the consequence is broader than it says. The measured
error rate on the one document class the gate never sees was NINE of the tokens
the implementer extracted, caught only because someone hand-checked. Worth the
orchestrator's attention independently of this branch. **Note this cuts both
ways: it also means my own review document and every other
`delivery/review/**` file is unchecked.**

### Independent citation resolution at HEAD

I did not take "54 citations, zero unresolved" on trust. My own extractor, which
skips fenced blocks and same-line backtick spans and requires `path.ext:LINE`:

```
$ node -e '<extract and resolve every path.ext:LINE outside backticks/fences>'
UNRESOLVED @1125: gates.yml:98 (NO SUCH FILE)
total citation tokens (outside backticks and fences): 78 | fix-round section: 27 | earlier: 51
UNRESOLVED: 1
```

The single hit is NOT a defect: it is the backtick-quoted path
`` `.github/workflows/gates.yml:98` `` at
delivery/work-history/exit-test-assertion-direction.md:1124, split across a line
wrap so my same-line backtick stripper could not see the opening tick. Quoted,
therefore deliberately non-resolving (M2-D-22). **Zero genuine unresolved
citations at HEAD.**

Counts differ from theirs (I count 27 in the fix-round section, 78
whole-document, against their 54). That is a difference in extraction scope, not
a correctness claim, and it is not a finding: they did not publish their
extractor, so the numbers are not comparable. What IS comparable is resolution,
and it agrees.

Resolution to an in-range line is weaker than resolution to the INTENDED content,
so I spot-checked sixteen targets by content:

```
CLAUDE.md:326 **The reviewer's FIRST check is item 3**, before examining any row.
CLAUDE.md:380 ### One witness is not a class
CLAUDE.md:201 **A test over an append-only registry asserts BY NAME and never BY COUNT,
CLAUDE.md:686 12. **Running the suite without building first SILENTLY SKIPS NINE TESTS
CLAUDE.md:708     **The complete sentence for a suite result names the toolchain AND the
CLAUDE.md:721     **THERE IS A THIRD AXIS AND IT IS THE INVOCATION.**
scripts/m2-exit-test.sh:509   const DEFAULT_SPEC_WHY =
scripts/m2-exit-test.sh:515   for (const id of [...manifestIds, ...rows.map((row) => row?.id), ...explicitById.keys()])
scripts/m2-exit-test.sh:692   for (const id of expect.absent ?? []) {
scripts/m2-exit-test.sh:108   resolve_scope_expect() {
test/m2-exit-test.test.ts:1147 function harnessCopy(root: string, extraGateIds: string[])
test/m2-exit-test.test.ts:1101 function writeBundle(dir: string, rows: ...)
test/m2-exit-test.test.ts:834  return run("bash", [harness, "--resolve-scope-expect", phase, branch]
```

Every one lands on exactly the content the sentence citing it claims. The three
suite-axis citations in FR1.8 resolve to the three DIFFERENT axis paragraphs,
which is the case most likely to be sloppy and is not.

## 6. The lab, re-run against the SHIPPED test rather than a replica

The round's own lab drives a REPLICA of the member construction and validates it
in FR1.5. I did not rebuild the replica. I ran the REAL committed test against
defanged copies of the REAL harness, which skips the replica-validity question
entirely.

Toolchain node v26.6.0 (checked in the running shell), `npm ci` exit 0,
`npm run build` exit 0, `git status --porcelain` empty but for this untracked
report.

Extracted assertion program, third independent extraction:

```
$ bash scripts/m2-exit-test.sh --self-test <lab>/hev   (exit 1, the working state)
$ sha256sum <lab>/hev/m2-assert.mjs
c06fdf264b35e2d6767a915fec5615a23e967bebee51b36b71940c03abd6b531
```

IDENTICAL to the hash at
delivery/work-history/exit-test-assertion-direction.md:1391 and to the salvaged
reviewer's. Three extractions, one hash.

File hashes, both matching the round's stated values EXACTLY:

```
$ sha256sum <pristine harness> <final test> <test at 21509d1>
9f53425fc0e119d3398722c50d025a45466cab3d31f2c232f9dc9f5f22da1138  harness (claimed at :1914)
45ac51ee6fba57c4d7d5e912542ec75dedebd07877dd889cf1d288746dc6080d  test NEW (claimed at :2167)
3fddb074ff06d0cb11e7278e32f8af5d40e70500a8620f0e0dd1efef32d3da29  test OLD (claimed at :1611)
```

Defangs built by anchored single replacement, aborting unless the anchor occurs
exactly once. Negative control run first:

```
$ node mkdefang.mjs <harness> <out> 'this anchor does not occur' 'x'
ANCHOR NOT UNIQUE (0 occurrences), aborting: this anchor does not occur
EXIT=2
```

No `git checkout --` was used at any point (CLAUDE.md:627). Every swap is `cp`
from a snapshot and every restore is `cp` back, sha256-verified after.

### CR-V01 reproduced, and the fix witnessed (MY OWN RUN)

```
OLD-main-pristine                EXIT=0
OLD-main-tableonly               EXIT=0      <== CR-V01: the derivation is GONE and the old main arm is GREEN
NEW-main-pristine                EXIT=0
NEW-main-tableonly               EXIT=1
NEW-main-norows                  EXIT=1
NEW-main-nomanifest              EXIT=1
```

Restore verified afterwards:
```
9f53425f...  scripts/m2-exit-test.sh
45ac51ee...  test/m2-exit-test.test.ts
git status --porcelain: only this untracked report
```

This is FR1.6's table and FR1.15's table, both REPRODUCED row for row by an
independent run against the shipped files. **CR-V01 was real and is fixed.** The
last two rows are the class property that matters: the main arm now reddens under
EACH leg of the union separately, not only under the whole union, so the two legs
are independently witnessed on the arm that previously witnessed nothing.

### The PR arm, measured (the "PR arm never had the defect" claim)

```
OLD-pr-pristine                  EXIT=0
OLD-pr-tableonly                 EXIT=1
OLD-pr-norows                    EXIT=0     <== the old PR arm did NOT witness the ROWS leg
OLD-pr-nomanifest                EXIT=1

NEW-pr-pristine                  EXIT=0
NEW-pr-tableonly                 EXIT=1
NEW-both-nored                   EXIT=1
NEW-both-nosec8                  EXIT=1
NEW-both-pristine                EXIT=0
```

The claim as stated is VERIFIED: the old PR arm reddens under `v-tableonly`
(EXIT=1), so old PR members 4 and 5 did discriminate and the vacuity was
main-arm-only. That is what the round says and it is true.

**It is however not the whole picture, and the extra fact favours the round.**
`OLD-pr-norows EXIT=0` shows the old PR arm reddened only through the MANIFEST
leg: both old derivation-only members were manifest-leg entrants (a manifest gate
with no table row, and one with no record at all), and old member 2, the only
rows-leg shape, carried a RED row and so stayed rejected by zero-red when the
rows leg was removed. So the ROWS leg of the union was unwitnessed on BOTH ARMS
at `21509d1`, not only on the main arm.

The round's probe 1 closes that on both arms. The fix is therefore STRICTLY
BROADER than the finding it answers, and the work history under-claims rather
than over-claims. Recorded as evidence in the round's favour, and as a small
completeness note on FR1.2: its member table measures `v-nored` and `v-nosec8`
but not `v-norows`, which is why this did not surface there. NOT a finding.

### The orthogonality claim, REPRODUCED at the TEST level (stronger than the round's own evidence)

The round proves orthogonality by defanging each leg against a REPLICA of the
member construction (FR1.3). I proved it against the SHIPPED test. Full matrix,
my runs, exit code of `node --test --test-name-pattern 'RED gate is rejected on
BOTH bundles' test/m2-exit-test.test.ts`:

| test / arm | pristine | tableonly | norows | nomanifest | nored | nosec8 |
|---|---|---|---|---|---|---|
| NEW, pr arm only | 0 | 1 | 1 | 1 | 1 (both) | n/a |
| NEW, main arm only | 0 | 1 | 1 | 1 | 1 | 1 |
| OLD, pr arm only | 0 | 1 | **0** | 1 | - | - |
| OLD, main arm only | 0 | **0** | - | - | - | - |

And the assertion that reddened in each case, which is what makes this an
orthogonality proof rather than a set of exit codes:

```
NEW-pr-norows       [pr]   ...declared in NEITHER the manifest nor the table... through the ROWS leg
NEW-pr-nomanifest   [pr]   ...whose table row is gone and which produced NO record... MANIFEST leg alone
NEW-main-norows     [main] ...declared in NEITHER the manifest nor the table... (ROWS leg)
NEW-main-nomanifest [main] ...MANIFEST leg alone...
NEW-main-nored      [main] a RED gate must be rejected even when the table names it, marks it required:false...
NEW-main-nosec8     [main] a not-applicable record for a gate the DERIVED absent list covers must be REJECTED
```

Five defangs, five DIFFERENT named assertions, on both arms wherever the arm
applies. **VERIFIED, and the round's claim is if anything understated**: it
proves the two probes differ, and my run additionally shows that all five
independent mechanisms in the change are separately guarded, each by the
assertion that names it.

`v-nosec8` correctly reddens only the main arm, because the declared-absent
probes are guarded by `if (!runsUnlisted)` (test/m2-exit-test.test.ts:1474) and
the PR bundle runs the whole manifest. That is right, not a gap.

## 7. CR-FR-2 (LOW): the leg-count gap IS guardable, and the stated reason it is not does not hold

This is the one the brief singles out, so it gets a demonstration rather than an
opinion.

The round's position, twice stated:

- FR1.10 item 5 (delivery/work-history/exit-test-assertion-direction.md:1900):
  "I did not add a guard over the number of legs, because a count over a source
  line is the kind of pinned assertion CLAUDE.md:201 warns against, and I could
  not find a non-pinning form."
- FR1.13 item 1 (delivery/work-history/exit-test-assertion-direction.md:2049):
  same, raised as open rather than improvised.

**The phrasing is honest.** "I could not find" is the true form CLAUDE.md:340
endorses, not the false "no such guard exists", so this is not a claim-grep
breach and the item is correctly left open rather than closed. What is wrong is
the PREMISE, and it is worth correcting because the next round will otherwise
re-derive "it cannot be done".

**The premise error.** CLAUDE.md:201 forbids pinning a COUNT over an APPEND-ONLY
REGISTRY, and its stated reason is that "a count is a claim about every FUTURE
phase, and it is false the moment the next one appends", i.e. growth there is
LEGITIMATE and the assertion produces a false red. The union's source list at
scripts/m2-exit-test.sh:515 is not an append-only registry and its growth is not
routine: a fourth leg is exactly the event you want to be told about. The rule
does not reach this case.

**The answer, and it is BY NAME, which is the form CLAUDE.md:201 prescribes.**
Assert the SET OF SOURCE NAMES spread into the union, not their number. I wrote
one and red-witnessed it rather than asserting it works:

```
$ node legguard.mjs <pristine harness>
sources derived: ["manifestIds","rows","explicitById"]
GREEN
EXIT=0

$ node legguard.mjs <harness with a fourth source spread in>
sources derived: ["manifestIds","rows","explicitById","registryIds"]
RED: the derived expected set now draws from a source with no probe: registryIds
EXIT=1

$ node legguard.mjs <harness with the union collapsed (v-tableonly)>
sources derived: ["explicitById"]
RED
EXIT=1
```

Green on the shipped harness, red on a fourth leg, red on a removed leg. No
count is pinned anywhere; the assertion is a set equality over identifier names,
which is precisely "asserts BY NAME and never BY COUNT".

**And the technique is already in this change, twice.** The round did not need a
new idea, only to notice it had already used one:

- test/gate-registry.test.ts:396, written by THIS branch, reads
  `MAIN_ONLY_GATES` out of the harness source by regex and hard-fails if the
  declaration is gone.
- test/m2-exit-test.test.ts:1249, written by THIS ROUND, derives
  `DEFAULT_SPEC_WHY` out of the harness source by regex and hard-fails if it
  cannot, with the comment "a reword of the message must redden here loudly
  instead of silently turning that assertion into a tautology".

That is the same guard shape applied to the same file for the same reason, one
screen away from the open item that says the shape could not be found.

**Honesty about my prototype**: it is twenty lines. Its RED message names only
added sources, so the removed-source case (third block above) reddens with an
empty name list; a production version must report both directions. That is a
message defect in my sketch, not an objection to the approach.

SEVERITY LOW. Nothing on this branch is wrong because of it, the gap is real but
prospective, and it was correctly raised rather than improvised. It should be
closed in a later piece of work with the note that the guard is available.

## 8. The complete suite sentence (run in progress at this point in the walk)

A first `npm test` attempt was killed by MY OWN 2-minute command timeout, not by
a test failure (exit 143 = SIGTERM). Recorded so the timing is not mistaken for a
result. Re-running with a longer budget; CLAUDE.md:684 records that suite wall
time grows with real-clock lease waits.

### My complete suite sentence

TOOLCHAIN node v26.6.0 (the fetched floor toolchain, `node --version` checked in
the shell that ran each command). BUILD STATE: `dist/` present, built by
`npm run build` exit 0, `git status --porcelain` empty but for this untracked
report. HEAD fdb3120.

| invocation | tests | pass | fail | SKIPPED | exit | duration |
|---|---|---|---|---|---|---|
| `npm test` | 594 | 594 | 0 | **0** | 0 | 300235 ms |
| bare `node --test` from the repository root | 596 | 596 | 0 | **0** | 0 | 249787 ms |

**Both numbers match the round's FR1.8 table EXACTLY** (594 and 596, 0 skipped).
The two-test delta is the known `sandbox/test/greet.test.js` fixture that
`package.json`'s test pattern excludes (CLAUDE.md:721). 594 is what CI and the
`suite` gate mean.

I did NOT run the default-toolchain (node v22.22.2) arm. The round reports 594 /
592 pass / 2 skipped there for the previous head. That axis is UNVERIFIED BY ME
and I am not vouching for it; the two axes I did run agree with the round.

TRANSLITERATION NOTE (CLAUDE.md:144): the captured `node --test` output above was
altered before being written into this ASCII-only document. U+2714 (heavy check
mark) was replaced by the word "pass" where it appeared at the head of result
lines, and U+2139 (information source) was replaced by nothing where it prefixed
the summary lines. Counts in the excerpts I pasted: U+2714 x 6, U+2139 x 16.
Nothing else in any captured output on this page was changed. The summary numbers
are as the reporter printed them.

## 9. The MECHANISM refutation: VERIFIED, and it matters

The orchestrator handed the round a mechanism: "every member of the vacuous test
carries a RED row", so zero-red rejects them all. The round REFUTED it and
substituted its own. I tested the refutation two ways.

**By source.** The old test at `21509d1`, member construction:

```
name: "member-4",  rows: [...withoutUnlisted, { id: UNLISTED, status: "not-applicable" }]
name: "member-5",  rows: withoutUnlisted                       (pr arm)
name: "member-5",  rows: [...withoutUnlisted, { id: UNLISTED, status: "green" }]   (main arm)
```

Neither carries a red row. Members 1 to 3 do (`status: "red"` appears in their
construction). So the orchestrator's mechanism is FALSE for two of the five,
exactly as the round says.

**By execution**, which is decisive. If the round is right, the main arm's
members 4 and 5 are rejected by section 8's declared-absent check ALONE, so
removing section 8 must turn them green:

```
$ run OLD test, main arm only, harness = v-nosec8
OLD-main-nosec8                  EXIT=1
  AssertionError [ERR_ASSERTION]: [main] a gate the derived absent list covers must not
  carry a record on this bundle; a not-applicable record for it means it ran when this
  bundle does not run it: m2-assert (main bundle): OK. 7 ga...
```

The old main-arm member-4 STOPS being rejected when section 8 is removed. Its
unique rejecter was section 8, not zero-red, and it carries no red row.

**THE REFUTATION IS CORRECT, AND THE ORCHESTRATOR'S VERSION WAS NOT ADEQUATE.**
The consequence the round draws follows: a fix built on "remove the red rows"
would have left main members 4 and 5 rejected by section 8, still
non-discriminating, and the main arm exactly as vacuous as it was. Refusing the
handed mechanism and measuring instead is the fix-round contract working as
designed, and it is the single best thing about this round.

The replacement mechanism ("a probe witnesses a check only when that check is its
UNIQUE rejecter; the competitor set is a function of the ARM") is the right
altitude: it names the class, not the instance, and the remedy it implies (a
MECHANICAL uniqueness assertion instead of a hand-named exclusion) is
strictly more general than the defect. That is item 1 of the fix-round contract
satisfied properly.

## 10. The three salvaged LOW findings

**CR-H-1 (two documents assert the removed blocker in the present tense).**
ACCEPTED AND FIXED, against the salvaged reviewer's suggestion to defer. **I side
with the implementer.** Reasons, in order of weight:

- Both sentences were FALSE at HEAD and this branch is what made them false.
  Leaving them is the stale-prose failure T-005 and T-006 record, in the exact
  file the next agent reads to decide whether a registry-only gate can be
  promoted.
- The deferral argument was "editing the workflow widens this branch's surface".
  That cost is near zero here and I checked why: the branch is deliberately
  non-phase, so the `scope` gate reports not-applicable and no files-to-touch
  list is in force. There is no scope penalty to pay.
- Both edits are comment or reason text with no behavioural effect
  (`.github/workflows/gates.yml` comment block; a map VALUE in
  test/gate-registry.test.ts that nothing asserts on, see section 3).

The rewritten claim is narrower and I verified it holds:
```
$ grep -c 'agent-rules-drift' gates.manifest.json
0
$ grep -c -- '--registry' scripts/m2-exit-test.sh
0
```
`agent-rules-drift` is in the registry, absent from the manifest, and the harness
passes `--manifest` on both arms, so neither leg of the derivation can reach it
and the workflow step remains what executes it. TRUE.

**CR-H-2 (the expectations-row test hand-wrote the two scope resolutions).**
ACCEPTED AND FIXED. The fix is present and structurally right: both resolutions
now come through the shipped `--resolve-scope-expect` hook and are asserted
DIFFERENT from each other, so a resolver collapsed to one value cannot leave the
test covering one case twice.
```
+    const phaseScope = resolveScopeExpect(root, env, "m9-p9", "claude/m9-p9-fixture-branch");
+    const nonPhaseScope = resolveScopeExpect(root, env, "", "claude/fixture-not-a-phase-branch");
+    assert.notEqual(...)
```
Upgrading the reviewer's "observation" to a defect is the right call: a two-string
replica is precisely the failure mode this branch's own design argument names.

**CR-H-3 (a stale exclusion in the not-covered section).** ACCEPTED AND FIXED IN
PLACE at delivery/work-history/exit-test-assertion-direction.md:499. The
correction is done the right way: it says what the item was true OF, points at
the sections that superseded it, and states the residual exclusion that IS still
true and is narrower. It also fixes the related stale prose counts ("two
behaviours" for four). I confirmed the registry now carries four and that all
four resolve VERBATIM by name (section 11).

All three: correctly dispositioned. No finding.

## 11. Mechanical checks

```
$ git add -A && node scripts/check-authored-bytes.mjs
EXIT=0
```
(Staged first: it exits 2 WITHOUT CHECKING on a tree that differs from the index,
which reads like a pass. Staged, then reset.)

Behaviors registry: APPEND-only against the merge base (four new keys at the end,
nothing removed or renumbered), and every description is the test's name VERBATIM:

```
RESOLVES  m2-exit-main-absent-list-derived-from-manifest
RESOLVES  m2-exit-red-gate-rejected-on-both-bundles
RESOLVES  m2-exit-expect-row-admits-only-reachable-statuses
RESOLVES  m2-exit-zero-red-reads-rows-not-counts
total behavior keys: 598 (context only; no test pins this)
$ grep -rn 'behaviors' test/*.ts | grep -iE 'length|size|count'
(no output: NO test pins a behaviors count, per CLAUDE.md:201)
```

Claim grep, run by me over the whole document and over the fix-round section
separately: 41 hits whole-document. Every substantive hit in the fix-round
section carries an adjacent capture or is explicitly restated in FR1.11. The word
"impossible" now appears in the section ONLY inside FR1.11's quotation of the
pre-restatement hit list, which is the restatement having actually happened
rather than being claimed. The line numbers FR1.11 quotes (1401, 1663, ...) are
three off from the shipped file's, because the grep was run before the final
edits shifted lines; the CONTENT of each hit matches. Not a finding.

## 12. The one RED `suite` gate run

Attribution offered: a pre-existing real-clock flake in an untouched file,
surfaced under the extra load of a gate run.

Facts I checked myself:
```
$ git diff --name-only bb8f656...fdb3120 -- test/watcher.test.ts
(empty: UNTOUCHED by this branch)
$ git log --oneline -1 -- test/watcher.test.ts
8cadeac Fix real-clock test flakes: liveness exact-age bands and watcher duplicate-not-drop (#26)
```
The file is untouched by the branch and its last change was itself a real-clock
flake fix. My own two full-suite runs at this head reported 0 failures.

**The attribution HOLDS, and the round scoped it correctly.** It states what it
does NOT claim (that the flake is rare, that it cannot recur in CI, that no
change of its own influenced scheduling), which is the honest form. Reporting a
red rather than averaging it away is the behaviour this repository has paid three
times to learn (CLAUDE.md:721), and it was done unprompted.

I did NOT reproduce the red. Two green full-suite runs are consistent with a
flake and do not prove one. The round did not claim more than that either.

## 13. WHAT I DID NOT RUN

A gate I did not run is not a gate that passed.

- **I ran NO gate from `gate-registry.yaml`.** Not `citations`, not `scope`, not
  `suite`, not `red-witness`, not `clause-map`, not `agent-rules-drift`, not
  `coverage`, not `credential-scrub`, not `manifest-self-check`. The round's
  FR1.14 gate table is UNVERIFIED BY ME. I used CI (`gates` run 31602409424 on
  fdb3120, conclusion success, already verified BY STEP by the orchestrator) as
  the authority there, as the brief permits.
- **I did not run either full bundle end to end** (`scripts/m2-exit-test.sh
  --bundle pr|main`). Sections 9 and 9a are unverified by me, except for the
  harness sha256 identity that makes those runs still describe the shipped
  program, which I DID verify.
- **I did not run the default-toolchain (node v22.22.2) suite arm.** The third
  row of the round's section-10 table is unverified by me.
- **I did not re-run the U1/U2 uniqueness witnesses** (FR1.6 red witness 2). The
  round itself declares these were not re-run against the final file (FR1.15's
  closing paragraph) and bounds the risk by the uniqueness code being
  byte-identical between the two test-file versions. I did not check that
  byte-identity claim either. It is the one witness on this branch that no one
  has run against the file that ships.
- I did not audit `scripts/m2-exit-test.sh` line by line for defects unrelated to
  the assertion direction.

## 14. I CLOSED the round's one declared-open witness gap

FR1.15's closing paragraph declares the U1 and U2 witnesses for the uniqueness
assertion were taken against the PRE-CR-H-2 test file and NOT re-run against the
file that ships, bounding the risk by byte-identity of the uniqueness code and
explicitly not claiming otherwise. That is honest, and it left the branch's
newest guard unwitnessed on the shipped file.

I ran them, against the FINAL test (sha256 `45ac51ee...`) and the PRISTINE
harness, each an anchored single replacement (anchor verified to occur exactly
once):

- U1, competitor = the global ZERO-RED check: an extra red row added to probe 1.
- U2, competitor = SECTION 8's declared-absent check: probe 1 rebuilt around the
  declared-absent gate, which reconstructs the original CR-V01 defect shape (the
  old main-arm member 4) inside the new probe.

```
U1-final                         EXIT=1
U2-final                         EXIT=1

U1: [main] probe-1-rows-leg was rejected by 1 check(s) OTHER than the derived expected
    set, ...:   - 1 gate(s) reported RED: fixture-extra-red. ...
U2: [main] probe-1-rows-leg was rejected by 2 check(s) OTHER than the derived expected
    set, ...:   - [fixture-gate-with-no-table-row] expected to be ABSENT from thi...
```

Both fire, with the same finding counts (1 and 2) the work history reports for
the pre-CR-H-2 file. **The uniqueness assertion is load-bearing on the file that
ships**, and U2 in particular shows the new guard catches, by exit code and by
name, the exact defect that reached this pull request. Gap closed. Harness and
test restored and sha256-verified; `git status --porcelain` shows only this
untracked report.

## 15. The EIGHT uncovered regions: honest, prominent, one incomplete

The contract's FIRST check (CLAUDE.md:326). Item by item.

| # | region | verdict |
|---|---|---|
| 1 | enumeration by literal token `m2-assert` | **INCOMPLETE** (CR-FR-1): it names computed paths and re-implementations as the ways a site could hide, and the site actually missed (test/m2-exit-test.test.ts:272) is neither; it runs the harness end to end |
| 2 | `delivery/**` excluded from the enumeration | honest, and SELF-AWARE: it notes CR-H-1 is exactly such a case and was found by reading, not grep |
| 3 | five blocks audited for THIS mechanism only | honest, standard scoping, and NOT convenient in practice: the round volunteered an out-of-scope finding it tripped over (test/coverage-gate.test.ts:190 pins `units, 115`) |
| 4 | the lab replicates the member construction | honest; and I superseded the question entirely by running the REAL test, whose results agree with the replica's predictions, so the replica is independently validated |
| 5 | two legs, no leg-count guard | real; correctly raised in TWO places rather than buried; PREMISE WRONG (CR-FR-2) |
| 6 | `defaultSpecReason` regex over harness source | honest; I confirmed the hard-fail is real, `assert.ok(whyMatch, ...)` at test/m2-exit-test.test.ts:1250, and that it reads the SHIPPED harness, not the copy |
| 7 | full bundles not re-run in this round | sound, and its load-bearing premise VERIFIED BY ME: the harness sha256 is identical, so sections 9 and 9a still describe the shipped program |
| 8 | the workflow edit is unrun locally | honest; discharged by CI run 31602409424 having parsed and run the workflow |

**Is the list CONVENIENT?** I tested it the way the brief asks, by looking for an
exclusion that happens to fence off ground where a defect would be embarrassing,
without a reason that survives scrutiny. I did not find one.

- Item 5 is the candidate: an exclusion that excuses not writing a guard. But it
  is raised TWICE, prominently, including in the "open and explicitly NOT closed
  by me" section, which is the opposite of burying it. Its reasoning is wrong and
  its honesty is not.
- Item 3 is the generic escape hatch, and the round undercut its own convenience
  by reporting a defect that fell outside it.
- Item 7 could have hidden staleness, and instead rests on a hash I re-computed
  and confirmed.

The list is honest and unusually prominent. It is not complete: item 1's stated
bound does not describe the way its own enumeration actually missed a live site.
That is CR-FR-1, LOW, and one line fixes it.

**A minor imprecision in the same family**, worth a sentence because the fix
round is about precision: item 5 says "the union has exactly two legs TODAY". The
union at scripts/m2-exit-test.sh:515 spreads THREE sources
(`manifestIds`, `rows`, `explicitById`). Two of them are legs a DEFAULT-asserted
probe can enter by, which is what the sentence means; the third is the explicit
table, whose members get their own spec instead of the default. The intent is
right and the wording undercounts the thing a guard would have to watch. My
prototype guard in section 7 watches all three, which is why it also reddens on
`v-tableonly`.

## 16. FINDINGS

| id | severity | summary |
|---|---|---|
| CR-FR-1 | LOW | the derivation missed a sixth live call site (test/m2-exit-test.test.ts:272, which drives the assertion program through `--self-test`), and FR1.10 item 1's stated bound does not describe how it was missed. The site itself is SOUND, verified by execution: both self-test fixtures carry explicit table rows, so neither the new default nor zero-red fires on them. |
| CR-FR-2 | LOW | the leg-count open item's stated reason ("I could not find a non-pinning form") rests on a misapplication of CLAUDE.md:201, and a BY-NAME guard exists. I wrote one and red-witnessed it: green on the shipped harness, red on a fourth leg, red on a removed leg. The technique is already used twice on this branch (test/gate-registry.test.ts:396, test/m2-exit-test.test.ts:1249). |

No HIGH. No MEDIUM. Both findings are about the PAPERWORK of the fix-round
contract (item 3's completeness, and the reasoning behind a correctly-raised open
item), not about the code, the guards, or the harness. Neither blocks merge.

Two things I looked for specifically and did NOT find, recorded so the absence is
a result rather than a silence:

- No relaxation in `test/gate-registry.test.ts`. Both hunks accounted for; the
  `pushGates.size >= 6` floor is unchanged context; no accepted set widened, no
  case deleted, no equality turned into a membership test.
- No over-determination in the new probes. Every one of the five defangs reddens
  a DIFFERENT, correctly-named assertion, and the uniqueness assertion itself
  reddens under two structurally different competitors on the shipped file.

## 17. VERDICT: APPROVE

With two LOW findings, neither blocking.

The reasons, in the order I weigh them:

1. **The round refused the mechanism it was handed, measured, and was right.**
   Verified by source and by execution: the orchestrator's "every member carries
   a red row" is false for two of five members, and a fix built on it would have
   left the main arm exactly as vacuous. This is fix-round contract item 1 done
   properly, and it is rare.
2. **CR-V01 is real and is fixed**, reproduced by me against the shipped files
   rather than a replica: OLD main arm EXIT=0 with the derivation removed, NEW
   main arm EXIT=1, and EXIT=1 under each leg separately.
3. **The guards are independently witnessed.** Five defangs, five distinct named
   assertions. The uniqueness assertion is itself witnessed under two structurally
   different competitors, and I ran those two against the file that ships, which
   nobody had.
4. **"No production code changed" is true**, by sha256 identity I recomputed.
5. **The evidence discipline is honest in the places it costs something**: a red
   gate reported rather than averaged, nine of its own citations found wrong and
   corrected, a stale exclusion corrected in place rather than defended, a
   truncating self-inflicted edit recorded as an event, and a witness gap declared
   rather than papered over. The document under-claims more often than it
   over-claims, which is the right direction.

**The bound on the green, restated because it is the thing most likely to be
over-read:** no run on this branch can exercise the case the fix exists for, since
`brief-drift` is not in `gates.manifest.json` on `main`. CI green here is
necessary and not sufficient. The lab work IS the evidence, and having re-run the
load-bearing parts of it myself against the shipped files rather than a replica, I
find it sufficient.

### Conditions attached to this approval

None blocking. Two recommendations for the orchestrator:

- Carry CR-FR-1 and CR-FR-2 forward as one-line corrections to FR1.10 and FR1.13
  rather than as a fix round. Neither changes code. Opening a fix round for them
  would cost more than they are worth, and DR-0016's test (would I defend a
  recommendation?) says decide rather than escalate.
- The `citations` gate never checks `delivery/work-history/` OR `delivery/review/`
  on ANY diff, by design (section 5). Nine wrong citations in one document were
  caught only because an implementer hand-checked. That is worth a decision of its
  own, and it is not this branch's business.

### Reviewer's own limits

This review is one of two contracts on this head. It did NOT run any gate from
the registry, did not run either full bundle end to end, and did not run the
default-toolchain suite arm; section 13 lists everything omitted. My complete
suite sentence is in section 8: node v26.6.0, `dist/` built, `npm test` 594 tests
594 pass 0 fail **0 skipped** exit 0, and bare `node --test` 596/596/0/**0**
exit 0.

END OF REPORT.
