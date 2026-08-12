# Clean-room review: exit-test harness assertion direction (fix round)

Reviewer contract H-A. Branch `claude/exit-test-harness-assertion-direction` at
`21509d1`, draft PR #109, base `main`. Under T-009's corollary this is an
orchestrator-side hotfix to shared harness code and therefore a fix round owing
the full fix-round contract in CLAUDE.md:297.

Status: IN PROGRESS. This file is the beacon; it is appended after each command
whose output is cited, before the next command runs.

## Setup

Worktree: detached at `21509d1` under the reviewer scratchpad.
Merge base with `origin/main`: `bb8f6564cce657c121ff97bda9bda4b191aa2184`.

Diff stat, base..head (captured):

```
 .../work-history/exit-test-assertion-direction.md  | 1301 ++++++++++++++++++++
 scripts/m2-exit-test.sh                            |  356 ++++--
 test/behaviors.json                                |    6 +-
 test/gate-registry.test.ts                         |   29 +-
 test/m2-exit-test.test.ts                          |  536 +++++++-
 5 files changed, 2123 insertions(+), 105 deletions(-)
```

No file is reported `Bin`, so every changed file has a reviewable diff.

## FIRST CHECK: what the derivation did NOT cover

The fix-round contract's item 3 is the reviewer's first check (CLAUDE.md:326).

PRESENT. `delivery/work-history/exit-test-assertion-direction.md` carries a
dedicated section 4, "What the derivation did NOT cover (fix-round contract item
3)", with SIX numbered exclusions, each naming the region excluded AND the
reason:

1. the search is by LITERAL filename `summary.json`, so a computed/joined path
   would not appear; bounded (not proved) by the runner writing one literal name;
2. `delivery/**` prose and the two `witness/**` fixtures excluded as documents;
3. the five test files audited for the assertion-DIRECTION shape ONLY, not for
   other over-assertion families;
4. consumers of per-gate `result.json` rather than the bundle summary;
5. `gate-registry.yaml` as a second declaration source (R-094's unfinished half);
6. neither full bundle run end to end in the lab (deferred to CI and to the real
   harness runs in section 9).

Item 1 explicitly says "This is not a proof of absence", which is the register
CLAUDE.md:333 asks for. The section is not decorative: the work history's own
section headed "A SITE MY OWN DERIVATION MISSED" reports a site the grep could
not have found, which is consistent with item 1 being an honest limit rather
than a formality. That claim is verified below.

So the first check PASSES. Detailed verification follows.

## Contract item 1: the MECHANISM, not the instance

VERIFIED. delivery/work-history/exit-test-assertion-direction.md:21 states it as
"the assertion program in scripts/m2-exit-test.sh iterates the hand-written
EXPECTATION and keys into the bundle's rows, so a row the expectation does not
name is never asserted on, whatever its status." That is the mechanism the
dispatch brief asked for, not the `brief-drift` instance. The instance is
explicitly named and set aside at delivery/work-history/exit-test-assertion-direction.md:18.

Confirmed against the pre-change source: the only loop over expectations on
`main` is `for (const spec of expect.gates ?? [])`, and it keys into `rowById`.

## Contract item 2: the derivation, with FULL output

VERIFIED, and re-run rather than read.

The enumeration in the work history is 43 lines. Re-running the same command at
the merge base gives 43 files, and the two lists are IDENTICAL as sets:

```
$ sed -n '299,341p' delivery/work-history/exit-test-assertion-direction.md > /tmp/wh-list.txt
$ git grep -ln 'summary\.json' bb8f656 -- . | sed 's/^bb8f656://' > /tmp/actual-list.txt
wh lines: 43  actual: 43
$ diff <(sort /tmp/wh-list.txt) <(sort /tmp/actual-list.txt)
IDENTICAL SETS
```

So the published derivation is the full output, not a summary of it. At the
branch head the same command returns 44, the extra file being the work history
itself, which is the expected difference.

### The positive control, re-run by me

The work history reports 0/0/0 in `scripts/m1-exit-test.sh` against 9/1/3 in
`scripts/m2-exit-test.sh`. Reproduced at the branch head:

```
$ for p in EXPECT 'summary\.gates' rowById; do printf '%-16s m1=%s m2=%s\n' "$p" \
    "$(git grep -c "$p" -- scripts/m1-exit-test.sh 2>/dev/null || echo 0)" \
    "$(git grep -c "$p" -- scripts/m2-exit-test.sh 2>/dev/null || echo 0)"; done
EXPECT           m1=0 m2=scripts/m2-exit-test.sh:10
summary\.gates   m1=0 m2=scripts/m2-exit-test.sh:1
rowById          m1=0 m2=scripts/m2-exit-test.sh:3
```

10 rather than 9 for `EXPECT`, because this branch adds an `EXPECT` occurrence.
Measured at `bb8f656` instead, `EXPECT` is `m2=9`, `m1` no match: the work
history's number is correct for the state it was taken at. The control does what
a control must: the zeroes are a real absence, since the identical command finds
the same tokens in the sibling file.

```
$ grep -nE '\bgates\b' scripts/m1-exit-test.sh
54:# task whose branch never landed. That guard is itself guarded: the gates
$ grep -cE '\bgates\b' scripts/m2-exit-test.sh
49
$ wc -l scripts/m1-exit-test.sh
1285
```

One prose hit in 1285 lines against 49. The work history's self-correction (it
first wrote that `m1-exit-test.sh` "never invokes the gate runner", which is
false: it invokes the CLI, just never the `gates` subcommand) reproduces exactly.

## The orchestrator's count, measured by me rather than inherited

The dispatch brief warned that "12 manifest gates, one absent from the table" is
false of `main`. Measured directly, with the floor toolchain (node v26.6.0):

```
MAIN manifest gate count: 11
["manifest-self-check","coverage","credential-scrub","credential-token","suite",
 "citations","scope","deploy","migrations","clause-map","red-witness"]
m3-p6 manifest count: 12  (the same 11 plus "brief-drift")
brief-drift: {"id":"brief-drift","command":["node","scripts/check-brief-drift.mjs","--check"],
              "unitLabel":"generated brief gate rows compared","applicability":"required"}
```

ELEVEN on `main`. `brief-drift` is `applicability: "required"` with NO
precondition field, so the chosen default (required-green) is the correct
expectation for it, exactly as the work history claims. The implementer's
correction of the brief is CONFIRMED.

## The design choice: does a permissive default hide in the union?

NO. Walked in the shipped source rather than in the prose.

The derived set is built at scripts/m2-exit-test.sh:508 as
`[...manifestIds, ...rows.map((row) => row?.id), ...explicitById.keys()]`,
skipping any id in `absentIds`. Every surviving id then goes through the SAME
loop at scripts/m2-exit-test.sh:530, and the only branch is
`const spec = explicit ?? { id, expect: "green", required: true }`. So a member
with no table row is asserted `required: true, expect: "green"`, which is the
strictest spec the program can hold: `allowed()` yields exactly `["green"]`, the
required-green rule at scripts/m2-exit-test.sh:554 also fires, `diffScoped` is
absent so the DR-0018 relaxation cannot apply, and the units-greater-than-zero
vacuity check at scripts/m2-exit-test.sh:583 applies too.

The only way OUT of that set is membership of `expect.absent`, and:

- the PR arm's absent list is the literal `[]` (scripts/m2-exit-test.sh:200);
- the main arm's is DERIVED (manifest ids minus `MAIN_ONLY_GATES`) with no
  judgment anywhere in it;
- and leaving the set is not permissive in any case: check 8 at
  scripts/m2-exit-test.sh:688 then asserts the id has NO summary record and NO
  `result.json` on disk. An absent gate is asserted about, in the other
  direction.

Three further paths were checked for permissiveness and each is strict:

- an explicit row can widen a status, but the new ROW-driven zero-red check at
  scripts/m2-exit-test.sh:643 fires regardless of any spec, and the new
  `m2-exit-expect-row-admits-only-reachable-statuses` test refuses any row that
  admits `red` or `error` at all;
- a row id the manifest does not declare still enters the union through the ROWS
  leg and gets the strict default;
- a derived member that is green with zero units still fails the vacuity check.

VERDICT on this item: the union contains no permissive default. The failure
direction of the design is loud (a new gate legitimately allowed a non-green
status reddens the PR that introduces it, with a message naming the row to add),
which is the right direction.

### One LOW observation on the union, no live instance

An id present in BOTH `expect.gates` and `expect.absent` is now excluded from
`expectedIds` by the `absentIds.has(id)` skip at scripts/m2-exit-test.sh:516, so
it gets ONLY the absent check. Before the change such an id was iterated by the
table loop as well, and a bundle carrying no record for it produced the "no
record in the bundle for a gate the table lists" finding. That is a narrow
relaxation for a self-contradictory table.

There is no live instance: the PR arm's absent list is empty and the main arm's
is derived as the manifest complement of `MAIN_ONLY_GATES`, so the two lists are
disjoint by construction on both arms. Recorded as an observation, not a finding.

## The `--only` list NOT derived, and the byte-identity claim

The work history declines to derive `MAIN_ONLY_GATES` on the ground that
`clause-map` is `required` with no precondition and is nonetheless excluded, so
no rule reproduces the six-id set. CONFIRMED against the manifest: `clause-map`
is `"applicability": "required"` with no `precondition` key, and it is not in
`MAIN_ONLY_GATES`. Deriving the list would therefore have WIDENED the main
bundle.

The byte-identity claim is verified DIRECTLY, by rebuilding the recorded command
string from `MAIN_ONLY_GATES` in bash and comparing it with the literal string at
`bb8f656` (with `${base}` resolved to `main` on both sides):

```
OLD: [node dist/bin/tiphys.js gates run --manifest gates.manifest.json --evidence main-bundle --base main --only manifest-self-check --only suite --only coverage --only credential-scrub --only deploy --only migrations]
NEW: [node dist/bin/tiphys.js gates run --manifest gates.manifest.json --evidence main-bundle --base main --only manifest-self-check --only suite --only coverage --only credential-scrub --only deploy --only migrations]
BYTE-IDENTICAL: YES
lengths: old=211 new=211
```

And the derived absent list is set-equal to the old hand-written one:

```
$ bash scripts/m2-exit-test.sh --print-expect main   (exit 0)
  "absent": ["credential-token","citations","scope","clause-map","red-witness"]
```

against the pre-change literal
`["red-witness", "citations", "scope", "credential-token", "clause-map"]`. Same
five ids, different order. The main arm is unchanged in behaviour.

## Claim: the round's own guards had a hole, and members 4 and 5 close it

REPRODUCED, and it is the strongest thing in the round.

Method: snapshot `scripts/m2-exit-test.sh` with `cp` (no `git checkout --` was
used anywhere in this review, per CLAUDE.md:627), apply ONE surgical defang,
restore from the snapshot by `cp`, verify the sha256 each time.

Pristine sha256 `9f53425fc0e119d3398722c50d025a45466cab3d31f2c232f9dc9f5f22da1138`,
restored and re-verified after every defang.

### DEFANG A: the derived union collapses to the explicit table

Edit: `for (const id of [...manifestIds, ...rows.map(...), ...explicitById.keys()])`
becomes `for (const id of [...explicitById.keys()])`. That is the pre-fix
direction and nothing else.

```
$ node --test --test-name-pattern 'RED gate is rejected on BOTH bundles' test/m2-exit-test.test.ts
(x) a RED gate is rejected on BOTH bundles under three structurally different shapes, ... (938.866567ms)
(i) tests 1 / pass 0 / fail 1
  AssertionError: [pr] a manifest gate with no table row reporting not-applicable must be
  REJECTED: it is asserted under the default required-green, and accepting it is how a
  silently skipped gate reads as legitimately N/A: m2-assert (PR bundle): OK. 12 gate
  record(s) match section 1.4; 11 gate(s) asserted (11 from an explicit table row, 0 under
  the default required-green); 0 asserted absent; ... zero red; zero error; zero vacuous.
EXIT=1
```

The failure is at MEMBER 4. Members 1, 2 and 3 are asserted EARLIER in the same
loop body, so their assertions all PASSED under the defang. That is exactly the
self-reported hole: each of the three original members carries a red row, so the
global zero-red backstop satisfied all three on its own and the derivation was
guarded by nothing. The self-report is NOT overstated; it reproduces.

### DEFANG B: the global zero-red check never fires

Edit: `const redRows = rows.filter((r) => r.status === "red")` becomes
`const redRows = []`.

```
(x) a RED gate is rejected on BOTH bundles ... (838.036385ms)
  AssertionError: [pr] a RED gate must be rejected even when the expectations table names
  it, marks it required:false and lists red among its permitted alternates; no expectation
  in section 1.4 permits a red gate: m2-assert (PR bundle): OK. 12 gate record(s) ...;
  12 gate(s) asserted (11 from an explicit table row, 1 under the default required-green:
  fixture-gate-with-no-table-row); ...
```

Reddens at MEMBER 3, so members 1 and 2 passed: they are caught by the
derivation. The two mechanisms are therefore independently guarded, which is the
property the round claims and it holds under measurement.

### DEFANG C: the main arm's absent list is hand-written again

First attempt at this defang left a syntax error and the harness exited 2, which
is red against a BROKEN SCRIPT rather than against the dangerous state, the same
trap the work history records for its own first defang. Redone cleanly
(`bash -n` exit 0, `--print-expect main` emits the old five-id list), so the
harness is valid and only the derivation is gone:

```
$ bash scripts/m2-exit-test.sh --print-expect main | tail -2
  "absent": ["red-witness","citations","scope","credential-token","clause-map"]
$ node --test --test-name-pattern "main bundle's absent list is DERIVED" test/m2-exit-test.test.ts
(x) the main bundle's absent list is DERIVED from the manifest, ... (13.360199ms)
  AssertionError: a manifest gate the main bundle does not run must be asserted ABSENT from
  it, but the derived absent list is ["red-witness","citations","scope","credential-token",
  "clause-map"]. A gate in neither the gates list nor the absent list is asserted by nothing
  on this arm.
```

### DEFANG D: zero-red reads the COUNT instead of the rows

Edit: `redRows` built from `summary.counts.red` instead of from the rows.

```
(x) the zero-red check reads the bundle's ROWS, not the summary's own red count, ... (650.396042ms)
  AssertionError: the rejection did not come from a check that READ THE ROW. ... Output was:
  m2-assert (counts under-report the reds): FAIL with 2 finding(s):
    - recomputed count green=0 does not equal summary.json green=1
    - recomputed count red=1 does not equal summary.json red=0
```

Note WHY this is a real witness rather than a near-miss: the defanged program
still exits nonzero (the pre-existing recount check trips), and the test still
reddens, because it asserts on WHICH finding was produced. A test asserting only
"exit != 0" would have been green here and worthless.

All four defangs redden, each through a DIFFERENT assertion. Harness restored
and sha256-verified after each.

## Claim: the real-bundle witness (`agent-rules-drift`)

REPRODUCED END TO END, with the real gate runner, in both arms.

Setup: a manifest of three real gates plus `agent-rules-drift`; an expectations
table naming only the three; the PRE-fix assertion program extracted from
`bb8f656`'s harness by `--self-test`, and the POST-fix one from this branch the
same way (sha256 `02989cf4...` and `c06fdf26...`, different programs).

### Arm 1, real GREEN bundle

```
$ node bin/tiphys.ts gates run --manifest <manifest+drift> --evidence <ev-green>
gates: declared 4 applicable 4 verdict 4 green 4 red 0 not-applicable 0 error 0 vacuous 0
gates: every applicable gate is green
runner exit=0
rows: manifest-self-check green 8 | credential-scrub green 7 | clause-map green 34 | agent-rules-drift green 17
counts.red=0

PRE-FIX : OK. 4 gate record(s) match section 1.4; counts re-derived and equal to summary.json; zero error; zero vacuous.   exit=0
POST-FIX: OK. 4 gate record(s) match section 1.4; 4 gate(s) asserted (3 from an explicit table row, 1 under the default required-green: agent-rules-drift); 0 asserted absent; counts re-derived and equal to summary.json; zero red; zero error; zero vacuous.   exit=0
```

The units (8, 7, 34, 17) match the work history's figures exactly.

### Arm 2, the same gate genuinely RED

A scratch `git worktree` at `21509d1` with ONE rendered row deleted from
CLAUDE.md's generated gate block, so the gate fails on its own terms. Control
first, in the same worktree before the edit:

```
CONTROL (undrifted scratch worktree): agent-rules-drift: green (17 rendered gate rows compared)   exit=0
DRIFTED: agent-rules-drift: red (17 rendered gate rows compared)
  CLAUDE.md's gate block has drifted from gate-registry.yaml: the registry has a row the file
  does not: | `clause-map` | script | required | full, direct-pr | pull_request | clause-map
  rows checked |. Re-render with node scripts/render-agent-rules-gates.mjs --write
  exit=1

$ node <wt>/bin/tiphys.ts gates run --manifest <manifest+drift> --evidence <ev-red>
gates: declared 4 applicable 4 verdict 4 green 3 red 1 not-applicable 0 error 0 vacuous 0
gates: 1 gate(s) reported red: agent-rules-drift
runner exit=1
rows: ... agent-rules-drift red 17     counts.red=1

=== PRE-FIX ===  OK. 4 gate record(s) match section 1.4; ... zero error; zero vacuous.     exit=0
=== POST-FIX === FAIL with 3 finding(s):
  - [agent-rules-drift] expected status green, observed red (CLAUDE.md's gate block has drifted ...) This gate has NO row in the expectations table, so it was asserted under the default ...
  - [agent-rules-drift] is a REQUIRED gate but its status is red, not green ...
  - 1 gate(s) reported RED: agent-rules-drift. No expectation in section 1.4 permits a red gate, on either bundle.
  exit=1
```

BOTH ARMS VERIFIED. A genuinely broken REAL gate in a REAL runner-produced
bundle passed the exit test before this change (exit 0) and fails it after
(exit 1), while the runner's own exit code was 1 in both cases. The red row
carries units 17, so it is not a vacuous or skipped gate the existing
zero-vacuous check would have caught.

Cleanup: the scratch worktree was removed with `git worktree remove --force`,
and `git status --porcelain` in the review worktree prints only this report file.

## Claim: the truncating edit's blast radius was confined to one file

VERIFIED, and the confinement argument holds at the branch HEAD rather than only
where it was written.

The truncation is visible in the per-commit numstat as one commit that deletes
far more than it adds, and the restore is the next one:

```
$ git log --format='COMMIT %h %s' --numstat bb8f656..21509d1
COMMIT 11b6756 Complete the work history: suite sentence, scope, claim grep, open items
79      271     delivery/work-history/exit-test-assertion-direction.md
COMMIT 86ecf58 Restore the gate-run and end-to-end sections lost to a truncating edit, and renumber
281     4       delivery/work-history/exit-test-assertion-direction.md
```

No other commit on the branch carries a large deletion, and NO commit deletes
from more than one path at a time except where the change is plainly the edit
described. The whole-branch numstat at HEAD:

```
$ git diff --numstat bb8f656...21509d1
1301    0       delivery/work-history/exit-test-assertion-direction.md
264     92      scripts/m2-exit-test.sh
5       1       test/behaviors.json
20      9       test/gate-registry.test.ts
533     3       test/m2-exit-test.test.ts
```

The DELETION column is the one the argument rests on, and it is identical to the
numbers the work history published: 0, 92, 1, 9, 3. Each is accounted for by the
diff I read: 92 in the harness is the two expectation blocks moved above
argument parsing plus the rewritten loop; 9 in `gate-registry` is the replaced
`--only` scraper; 3 in the exit-test tests is the three
`manifest = fileURLToPath(...)` lines; 1 in `behaviors.json` is the reflowed
last line. No file shows a deletion count consistent with a lost tail.

Integrity confirmed positively rather than argued:

```
$ tail -1 scripts/m2-exit-test.sh      -> exit 0
$ tail -1 test/m2-exit-test.test.ts    -> });
$ tail -1 test/gate-registry.test.ts   -> });
$ node -e 'JSON.parse(...)'            -> behaviors.json parses
$ bash -n scripts/m2-exit-test.sh      -> exit=0
```

MINOR, recorded for accuracy: the INSERTION figures inside the work history's
own numstat block are stale relative to the final head (it quotes 1096 and 458
where HEAD has 1301 and 533), because the document was extended after that
capture was taken. That is an artifact of the beacon discipline, not an error in
the argument: the deletion column, which is what the confinement claim rests on,
is unchanged.

## Claim: `test/coverage-gate.test.ts:190` is a DIFFERENT mechanism

I AGREE, and the observation is worth keeping open.

```
$ sed -n '188,191p' test/coverage-gate.test.ts
    const coverageRow = summary.gates.find((row) => row.id === "coverage");
    assert.ok(coverageRow, ...);
    assert.equal(coverageRow?.status, "green");
    assert.equal(coverageRow?.units, 115);
```

`units` for this gate is the count of DISTINCT finding ids in the coverage
inventory (src/gates/coverage.ts:41 and src/gates/coverage.ts:423), whose
precondition names delivery/requirements/migration-table.md:1. That register
grows, so the pin will redden on whichever future phase appends an id. It is the
by-count-not-by-name shape CLAUDE.md:201 forbids.

It is NOT this branch's mechanism, though. The defect this round fixes is a
relation constrained in one direction, so a row is asserted by NOTHING; the
`units, 115` pin is the opposite failure, an OVER-assertion that will redden a
correct future state. Different direction, different file, different contract
(`test/coverage-gate.test.ts` is a unit test of one gate, not a bundle
certifier). Fixing it here would have been scope creep. Leaving it in section 13
as an open item for the orchestrator is the right call.

## The claim grep

RUN BY ME, not taken on trust. 19 hits on the work history.

Dispositioned: three are verbatim quotations of other files (the workflow
comment, the gate-registry divergence map, the m1 harness comment) and are
marked as quotes; two are the grep command line itself; four are inside the work
history's own disposition section; and every remaining substantive hit carries an
adjacent captured command in the same section (the "catches it regardless" at
delivery/work-history/exit-test-assertion-direction.md:636 is followed by the
`PRE-FIX exit=1` capture; the "never touched" at
delivery/work-history/exit-test-assertion-direction.md:740 by the
`git diff --name-only` capture; the "always-red" at
delivery/work-history/exit-test-assertion-direction.md:557 by the control
captures).

The one hit that most needed the right register has it: at
delivery/work-history/exit-test-assertion-direction.md:985, "I have not
established that the file can never be moved or renamed, only that `expect:
green` is the correct row while it is tracked" is the true form, not the false
universal.

MINOR: the work history's own tally ("four are verbatim quotations ... five carry
an adjacent captured command ... and the remaining ones were CHANGED") sums to
about twelve and the grep returns nineteen. The extra hits are self-referential
(the pattern line and the disposition text), so nothing substantive is
undispositioned, but the arithmetic does not tally as written. Observation, not
a finding.

## Per-hunk judgement on `test/gate-registry.test.ts`

29 changed lines, and they are ONE logical change plus its comment. Judged hunk
by hunk, FORCED or RELAXED.

### Hunk 1, the block comment above the reader (comment only)

FORCED, and correct. It previously said the push arm's gate set is "the
hard-coded `--only` list in scripts/m2-exit-test.sh". After this change the set
is declared once in `MAIN_ONLY_GATES` and the flags are generated from it, so the
old sentence describes a file that no longer exists in that form. The
replacement says so and says why the new read is closer to the test's own stated
intent. No assertion is in this hunk.

### Hunk 2, the reader itself

Removed:

```
  const mainBundle = /--only manifest-self-check[\s\S]*?\) \\/.exec(harness);
  assert.ok(mainBundle !== null, "the main bundle's --only list was not found in the harness");
  const pushGates = new Set(
    [...(mainBundle[0].matchAll(/--only ([a-z0-9-]+)/g))].map((match) => match[1] as string),
  );
```

Added:

```
  const mainBundle = /^MAIN_ONLY_GATES="([^"]+)"/m.exec(harness);
  assert.ok(mainBundle !== null, "scripts/m2-exit-test.sh no longer declares MAIN_ONLY_GATES, ...");
  const pushGates = new Set((mainBundle[1] as string).split(/\s+/).filter((id) => id !== ""));
```

**FORCED, not relaxed.** The old regex anchors on the literal text
`--only manifest-self-check`, and that text no longer occurs anywhere in the
harness:

```
$ grep -n '\-\-only manifest-self-check' scripts/m2-exit-test.sh
$ echo $?
1
```

So the old reader could only return `null` at this head, and its own
`assert.ok(mainBundle !== null, ...)` would fail. The test HAD to change.

Nothing was widened by the replacement:

- the null guard is preserved, with a message that names the cause instead of
  the symptom;
- the derived set is the same six ids (verified above by rebuilding the runner
  command byte-for-byte from `MAIN_ONLY_GATES`);
- the downstream assertion is untouched and is the STRICT one, an equality
  rather than a membership test:
  `assert.equal(gate.events.includes("push"), pushGates.has(gate.id), ...)` at
  test/gate-registry.test.ts:437. Both directions still redden.
- `assert.ok(pushGates.size >= 6, ...)` is byte-identical to before. It is a
  floor rather than an equality, which is weaker than it could be, but that is
  PRE-EXISTING and not this change's doing.

No case was deleted, no accepted set was widened, no equality became a
membership test. The single behavioural difference is where the same set is read
from, and the new source is the one declaration the harness now keeps.

The work history's stated red-witness for it (renaming `MAIN_ONLY_GATES` makes
the test fail loudly rather than derive an empty set) follows directly from the
`assert.ok(mainBundle !== null, ...)` guard above, which is retained.

### The site the derivation missed

CONFIRMED, and the account is accurate. test/gate-registry.test.ts:413 reads the
harness text, not a bundle summary, so no `git grep 'summary\.json'` could have
found it. Reproduced: the file appears in the `summary.json` enumeration for
OTHER reasons (its lines 264, 448, 980, 1085 read summaries), so a reader
skimming the enumerated file list would still not have been pointed at line 413.
It surfaced by execution, exactly as reported, and section 4 item 1 of the work
history had already declared the class of miss that produced it.

## Findings

### CR-H-1 (LOW): two documents still assert, in the present tense, the blocker this change removes

Neither is on the branch's changed set, and one of them is a file the branch DID
edit.

1. `.github/workflows/gates.yml`, reason 2 beside the `agent-rules-drift` step
   (.github/workflows/gates.yml:98): "A red would not fail CI otherwise. ... the
   assertion program decides, and it only examines gates named in its
   expectations table". After this change that sentence is FALSE: the assertion
   program derives its set from the manifest and defaults an unlisted gate to
   required-green.
2. test/gate-registry.test.ts:1027, the `REGISTRY_ONLY_SCRIPT_GATES` reason for
   `agent-rules-drift`: "Adding it to gates.manifest.json needs an expectation
   row in scripts/m2-exit-test.sh, which is not on this phase's declaration."
   After this change, adding `agent-rules-drift` to the manifest needs NO
   expectation row, because required-green is the correct expectation for it (it
   is `required` with no precondition, and I demonstrated the real bundle above).

The work history QUOTES both of these as evidence that the mechanism was already
recorded twice in the present tense
(delivery/work-history/exit-test-assertion-direction.md:88), and does not note
that this change makes half of each statement stale. That is the omission.

Why it is worth reporting rather than ignoring: these two sentences are exactly
what the next agent reads when deciding whether a registry-only gate can be
promoted to the manifest, and the branch has just removed the blocker they name.
The repository has recorded twice (T-005, T-006) that a stale written statement
outlives the memory of the change that invalidated it.

Why it is LOW and not blocking: no behaviour depends on either string, both are
comments or message text, the declared divergence itself remains correct (the
other half of R-094, that CI invokes `--manifest`, is untouched and still true),
and editing the workflow would widen this branch's surface. The right disposal is
a line in the branch's own open-items section (section 13 already holds two such
items) or a follow-up, not a code change here.

### CR-H-2 (LOW, observation): the new expectations-row test hand-writes the two scope resolutions

test/m2-exit-test.test.ts:1444 builds its table set as

```
printExpect(harness, root, env, "pr", "green"),
printExpect(harness, root, env, "pr", "green|not-applicable"),
printExpect(harness, root, env, "main"),
```

Those two strings are the two values `resolve_scope_expect`
(scripts/m2-exit-test.sh:108) can return today, so the test does cover both real
resolutions. But they are hand-copied, and the work history's own argument for
adding `--print-expect` is that "a replica is the thing that silently stops
matching". The harness already ships `--resolve-scope-expect` as a pure hook, and
test/m2-exit-test.test.ts:834 already uses it, so the two values could have been
derived rather than written.

Bounded rather than open: a widened resolution admitting `red` would still be
caught at run time by the row-driven zero-red check, and the phase-vs-non-phase
mapping itself is guarded by the existing `--resolve-scope-expect` tests. So this
is a note for the next editor, not a defect.

### No HIGH or MEDIUM finding

I looked specifically for the two shapes the brief named. Neither is present:

- a permissive default anywhere in the union: NO, walked in source above;
- a relaxed guard in `test/gate-registry.test.ts`: NO, the one code hunk is
  forced by the harness change and preserves every assertion.

## Suite, measured by me

TRANSLITERATION NOTE (CLAUDE.md:133). Node's test reporter prints U+2714, U+2716
and U+2139 in the captures quoted in this document. They are rendered `v`, `x`
and `i` respectively. Counts across this whole report: U+2716 replaced by `x`,
8 occurrences; U+2139 replaced by `i`, 16 occurrences; U+2714 replaced by `v`,
0 occurrences (no passing-line capture is quoted). Nothing else in any captured
output was altered.

Row 1, reproduced (node v26.6.0 from the fetched floor toolchain, `dist/` built
by `npm run build` with a clean `git status` afterwards, invocation `npm test`
from the repository root of the review worktree):

```
(i) tests 594
(i) suites 0
(i) pass 594
(i) fail 0
(i) cancelled 0
(i) skipped 0
(i) todo 0
(i) duration_ms 195788.94679
```

594 tests, 594 pass, 0 fail, **0 skipped**, exit 0. Identical to the work
history's row 1.

## The M3-P6 ordering claim, verified directly

The design's whole justification is that `brief-drift` can arrive with M3-P6
without an edit to either the harness table or M3-P6. Driven with M3-P6's real
twelve-gate manifest beside this branch's harness:

```
$ bash <copy>/scripts/m2-exit-test.sh --print-expect main     (12-gate manifest)
  "absent": ["credential-token","citations","scope","clause-map","red-witness","brief-drift"]
$ bash <copy>/scripts/m2-exit-test.sh --print-expect pr green | grep -c 'brief-drift'
0
```

So on the main arm `brief-drift` is derived into the absent list at once, and on
the PR arm it has no row and therefore takes the strict default. No table edit,
no M3-P6 edit. The claim holds.

## Two further checks the brief did not ask for

1. **The `--print-expect` hook cannot make a production gate lie (M2R-011).** It
   exits before argument parsing and before any gate work, and its third
   argument substitutes only into the document it PRINTS. The production path
   resolves the same placeholder from `${scope_expect}`
   (scripts/m2-exit-test.sh:1072), which comes from `resolve_scope_expect`
   (scripts/m2-exit-test.sh:108), not from argv. Same shape and same
   justification as the pre-existing `--resolve-scope-expect` hook.
2. **The PR arm's literal `absent: []` is safe against mode filtering.** The PR
   bundle passes no `--only` and no `--mode`, and `modes` in the manifest schema
   is documented as "Validated if present, ignored by the M2 runner"
   (src/gates/schemas/gate-manifest.schema.json:71), so every manifest gate
   produces a record on that arm. The real PR bundle run reports 11 records for
   11 manifest gates, which is the empirical half.
3. **The harness self-test still behaves as designed** (nonzero is the working
   state):

```
$ bash scripts/m2-exit-test.sh --self-test <dir>
m2-exit-test: self-test OK: the assertion code REJECTED both fixtures, naming
  fixture-vacuous (assert exit 1) and fixture-required-na (assert exit 1).
SELF-TEST exit=1
```

Row 2, reproduced (same toolchain, same build state, invocation bare
`node --test` from the repository root):

```
(i) tests 596
(i) suites 0
(i) pass 596
(i) fail 0
(i) cancelled 0
(i) skipped 0
(i) todo 0
(i) duration_ms 156261.833891
```

The two-test delta is NAMED rather than inferred, by diffing the passing-test
names of the two runs:

```
$ comm -13 <(names from npm test) <(names from bare node --test)
greet rejects an empty name
greet returns a greeting for a name
$ comm -23 ...   (nothing: the bare run is a strict superset)
```

which are the `sandbox/test/greet.test.js` fixtures CLAUDE.md:684 already
records. The decomposition is confirmed, not averaged.

## The behaviors registry

All four appended entries resolve BY NAME against the test file, checked
mechanically rather than by eye:

```
RESOLVES  m2-exit-main-absent-list-derived-from-manifest
RESOLVES  m2-exit-red-gate-rejected-on-both-bundles
RESOLVES  m2-exit-expect-row-admits-only-reachable-statuses
RESOLVES  m2-exit-zero-red-reads-rows-not-counts
total behaviors: 598
```

Appended, no count anywhere asserts over the registry, and no test pins a row's
presence. Consistent with CLAUDE.md:201.

MINOR: the work history's section 7 opens "Two behaviours registered" and then
lists FOUR, and section 8 likewise says "this branch APPENDS two entries". Both
sentences are stale from incremental writing (two were registered when the
sentences were written, two more were added later). The LIST is correct and the
registry is correct; only the prose count is wrong. Observation, not a finding.

### CR-H-3 (LOW): one exclusion in the not-covered section is STALE at HEAD

This is the section the fix-round contract makes the reviewer's FIRST check
(CLAUDE.md:326), which is why a stale line there is worth naming even though it
errs on the safe side.

delivery/work-history/exit-test-assertion-direction.md:492, item 6 of section 4:

> **I did not run either full bundle end to end.** ... The arms are exercised
> here through the shipped assertion program driven over crafted bundles ... CI
> is what runs the bundles.

That is FALSE at HEAD. Section 9 of the same document
(delivery/work-history/exit-test-assertion-direction.md:862) records BOTH full
bundles run end to end against the real repository, with `HARNESS PR BUNDLE
exit=0` and `HARNESS MAIN BUNDLE exit=0`.

Confirmed as an ordering artifact rather than a contradiction of substance:

```
$ git log --oneline -S'I did not run either full bundle end to end' bb8f656..21509d1 -- <work history>
77bbcdb Derive the exit-test expected gate set; add global zero-red
$ git log --oneline -S'HARNESS PR BUNDLE exit=' bb8f656..21509d1 -- <work history>
4d6cda6 Record the end-to-end harness runs and answer the orchestrator's three points
```

The exclusion was written first and never revised when the runs landed. It
UNDERSTATES the work rather than overstating it, so no reviewer is misled into
believing something was checked that was not; the cost is the opposite, a
reviewer who stops at the first check would go looking for evidence that is
already three sections further down. One sentence to fix, and the work history
is on the branch.

The other five exclusions in section 4 were re-checked and each is still true at
HEAD. Item 5 in particular:

```
$ grep -c '\-\-registry' scripts/m2-exit-test.sh
0
```

`--registry` occurs nowhere in the harness, so the derived set really is over the
MANIFEST and R-094's CI half really is untouched, as declared.

