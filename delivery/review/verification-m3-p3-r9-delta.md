# Delta verification: M3-P3 fix round 9 (head b5c01f0)

Independent delta verifier, contract A. Started 2026-08-10. This file is the
beacon (T-008) and is appended to as work proceeds.

Head under verification: b5c01f0 on claude/m3-p3-assurance-modes.
Prior head: 108eed0. Merge base with origin/main: 3c60acb.

Toolchain: node v26.6.0 from the scratchpad floor prefix, first on PATH,
confirmed in each shell that runs a command.

## Findings, up front

| id | severity | one line |
|---|---|---|
| V-1 | **MEDIUM** | `skips[]` is still unconstrained in a third direction, and the shipped data and schema now claim it is not |
| V-2 | LOW | the DATA-member count is three not four, and the "first DATA witness in this repository" claim is false |
| V-3 | LOW | the absolute the round says it weakened is still in the shipped source comment |
| V-4 | LOW | a citation in the new test lands in the wrong finding of the review it cites |
| O-1 | observation | `node --test` reports 508 and `npm test` reports 506 at the same head; pre-existing, not round 9's |

Confirmed as claimed: the predicate's placement (claim 1), the DATA witness and
its three members (claim 2), the converse-burden assertion (claim 3), CR-001's
red arm at one sample (claim 4), the pre-existing exit 20 (claim 5), DR-0022's
md5, and CR-003's replacement paragraph. Not confirmed: claim 6, see V-3.

## Environment, measured

Worktree: a fresh detached worktree at b5c01f0 under the scratchpad. The main
repository was not mutated.

```
node --version -> v26.6.0   (floor prefix first on PATH, checked in each shell)
npm --version  -> 11.18.0
npm ci      exit 0
npm run build exit 0, git status clean afterwards
node --test exit 0: tests 508, pass 508, fail 0, SKIPPED 0
```

Toolchain and build state, stated in full per the standing warning 12: node
v26.6.0 with dist/ built. 508 tests, 508 pass, 0 skipped. See O-1 below: `npm test`
reports 506 at this same head and both numbers are right.

**How to read the citations here.** Line numbers in `src/`, `test/`,
`assurance-modes.yaml` and `delivery/work-history/m3-p3.md` are at the head under
verification, `b5c01f0`, which is not yet merged. Line numbers in
`delivery/review/`, `delivery/plan/`, `src/gates/` and `src/witness/` are at
`origin/main`, where this report sits, and those files are untouched by the
branch.

## Claim 1: the soundness predicate's PLACEMENT is load-bearing. CONFIRMED.

Round 9 claims a predicate written inside the completeness loop would have been
GREEN against member 1 (the reference mode `full`), because that loop
`continue`s past the reference. I moved the block inside the loop and measured
it.

Fixtures, each the shipped assurance-modes.yaml with exactly one edit:
member 1, `full` keeps its twelve-stage pipeline and gains `skips: [deploy-verify]`;
member 2, `local-only` gains `implement` in skips while its pipeline runs it.

At the head, as shipped (src/checks.ts:427):

```
member1 -> EXIT=1  INVALID #/modes/0/skips mode full declares stage deploy-verify in skips ...
member2 -> EXIT=1  INVALID #/modes/2/skips mode local-only declares stage implement in skips ...
```

With the identical predicate moved inside the completeness loop (one experiment,
restored from a pristine copy afterwards, md5 compared):

```
member1 -> M1_EXIT=0        <- GREEN. The sharper member survives.
member2 -> M2_EXIT=1        <- still red
```

md5 after restore: `1498de8523be02f2c2e34f4ba447bf0f` on both src/checks.ts and
the pristine copy, and `git status --porcelain -- src/checks.ts` empty.

The claim holds and the two members are structurally different in the sense the
red-witness rule requires, not merely relabelled.

## Claim 2: the DATA witness. CONFIRMED as a mechanism, with a counting error in the record.

### The gate, re-run at THE FINAL HEAD (which round 9 did not measure)

Round 9's last gate run is at `194b489`. `b5c01f0` is one work-history commit
later, and T-009 says a gate result is evidence only for the configuration it ran
under, so I ran it at `b5c01f0`:

```
node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
  --only red-witness --evidence <scratch> \
  --base 3c60acbee541711aca2b046269aa35a03f22bb8e --head b5c01f0 --phase m3-p3

gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
red-witness: status=green units=36
detail=36 witness(es) evaluated (23 own, 13 stored re-evaluated in 133729ms);
        every witness red against every declared dangerous state and green at head
witness-records.json head = b5c01f07ee14eda8d7549006dd4693c3a5544125
```

Read out of `witness-records.json` rather than summarised:

```
=== checks-mode-skips-sound  status=green textAsserting=true reasons=[]
  m0 mutation assurance-modes.yaml  rate={"red":2,"total":2}  mutatedLines=[83]
  m1 mutation assurance-modes.yaml  rate={"red":2,"total":2}  mutatedLines=[207,208]
  m2 mutation src/checks.ts         rate={"red":2,"total":2}  mutatedLines=[430]
=== modes-execution-status-derived  status=green textAsserting=true reasons=[]
  m0 mutation src/modes.ts          rate={"red":2,"total":2}  mutatedLines=[221]
  m1 mutation src/modes.ts          rate={"red":2,"total":2}  mutatedLines=[214]
  m2 mutation assurance-modes.yaml  rate={"red":2,"total":2}  mutatedLines=[80,81,82,83]
```

### Each DATA member reproduced by hand, independently of the harness

Applied to the shipped `assurance-modes.yaml` in a worktree, restored from a
pristine `cp` under a trap, md5 printed and compared after every restore
(`04d39076684bc8e2524dc97dcb22a48c` before and after, every time; `git status
--porcelain` empty):

| member | mutated document validates | named test |
|---|---|---|
| control (pristine) | exit 0 | both named tests exit 0 |
| skips-sound m0 (`full` gains `deploy-verify`) | **exit 1**, `#/modes/0/skips` | exit 1, at `actual: 1, expected: 0` (the shipped-document control) |
| skips-sound m1 (`local-only` gains `implement`) | **exit 1**, `#/modes/2/skips` | exit 1, at `actual: 2, expected: 1` (the attributability count) |
| status m2 (`full` drops `deploy-verify` from pipeline, declares it) | **exit 0** | exit 1, at `actual: [ 'deploy-verify' ], expected: []` |

The third row is the one that mattered and it holds: `MUTATED_VALIDATE_EXIT=0`,
so that member reddens through the ANNOTATION assertion and not through the
document being rejected. A member that reddened because the document became
invalid would have been witnessing something else.

### T-011: every `find` resolves to exactly one occurrence

Counted in the head tree, all six members of the two specs: 1 occurrence each.
Note that the harness does NOT require uniqueness (`applyMember` only tests
`includes`, then `read.body.split(find).join(replace)`, and the spec schema says
"every occurrence is replaced", src/gates/schemas/witness-spec.schema.json:99),
so uniqueness is a property of today's file rather than an enforced one. It holds
today.

Rule (g) accepts the two same-file members: its collapse test is
`first.file === second.file && first.find === second.find` (src/witness/run.ts:1315),
so different `find` text on one file is two members. Round 9's reading of rule (g)
is correct.

### V-2 (LOW): two statements in the work-history record are wrong

Both are in the section headed "Two witnesses, four DATA members between them"
(delivery/work-history/m3-p3.md:7113).

1. **The count is three, not four.** The section's own two tables list
   `assurance-modes.yaml` for skips-sound m0 and m1 and for status m2, and
   `src/checks.ts` / `src/modes.ts` for the other three. The gate's own records
   agree: three members across the two specs name a non-`src`/`test`/`bin` file.
2. **"No witness in this repository did a DATA dangerous state before this
   round" is false**, measured rather than argued:

```
$ git show 108eed0:witness/schemas-closed-vocabulary-disclosed.json | grep '"file"'
      "file": "schemas/assurance-modes.schema.json",
      "file": "schemas/assurance-modes.schema.json",
      "file": "schemas/role-model-config.schema.json",

$ git show 3c60acb:witness/status-state-vocabulary-closed.json          -> schemas/status-line.schema.json
$ git show 3c60acb:witness/status-state-vocabulary-single-source.json   -> schemas/status-line.schema.json
```

The first three are on THIS branch, at the round-8 head, added by this phase. The
last two are at the merge base and predate the phase. In the same gate run,
`schemas-closed-vocabulary-disclosed` reports three non-code mutation members,
each `rate={"red":2,"total":2}`.

This matters beyond bookkeeping. Round 9's non-coverage observation 2 (the
residue pin at src/witness/run.ts:782 covers `src`, `test` and `bin` only, so a
DATA state on a root-level document is outside it) is presented as a new limit
that DATA dangerous states create. Measured, five other members were already
outside that pin before this round, three of them added by this phase. The limit
is real; its novelty is not, and the record should say so, because "this is the
first one" is what stops the next reader from looking for the others.

## V-1 (MEDIUM): `skips[]` is still unconstrained in a third direction, and the shipped data and schema now claim otherwise

**The mechanism CR-002 named, in the reviewer's own words:** "It never asks the
converse: *is every stage in `skips[]` actually omitted?*"
(delivery/review/clean-room-m3-p3-r8-criteria.md:220). `skips` is DEFINED, by the
shipped document itself, as "every stage in `full`'s pipeline that this mode's
pipeline omits, AND NOTHING ELSE" (assurance-modes.yaml:22). So "actually
omitted" means omitted RELATIVE TO the reference pipeline, and there are two ways
an entry can fail that, not one:

  A. the entry is a stage this mode's OWN pipeline runs;
  B. the entry is a stage that NOTHING runs, that is, one absent from this
     mode's pipeline AND absent from `full`'s.

Round 9 implemented A only. That is exactly the predicate the reviewer suggested
in their fix-shape paragraph ("any stage present in BOTH `skips[]` and
`pipeline[]` is invalid", clean-room-m3-p3-r8-criteria.md:283), and it is
narrower than the mechanism the same reviewer stated thirteen lines earlier. This
is the shape the fix-round contract exists for: the round fixed the predicate the
reviewer wrote down, not the property the reviewer described.

**B is reachable and it is NOT hypothetical.** The stage vocabulary has thirteen
ids and `full`'s pipeline has twelve; `orchestrator-diff-review` belongs to
`local-only` alone (schemas/assurance-modes.schema.json, `$defs/stageId`). So a
one-line data edit to the SHIPPED document, adding `orchestrator-diff-review` to
`direct-pr`'s `skips[]`, is a member of B. Measured, in the head worktree,
restored from a pristine copy under a trap with md5 compared afterwards:

```
$ node bin/tiphys.ts validate --type assurance-modes --context . assurance-modes.yaml
PHANTOM_SHIPPED_VALIDATE_EXIT=0                 <- accepted, no diagnostic at all

$ node bin/tiphys.ts mode show --mode direct-pr
PHANTOM_SHIPPED_SHOW_EXIT=0
execution-status: DECLARED AND VALIDATED, NEVER EXERCISED. This mode is not full,
  ... It declares 8 skipped stage(s). ...
skips:
  orchestrator-diff-review
  verification-pass
  ...

$ node --test test/assurance-modes.test.ts
WHOLE_MODES_TESTFILE_EXIT=0                     <- the whole file is green
```

md5 of `assurance-modes.yaml` before and after: `04d39076684bc8e2524dc97dcb22a48c`
both times; `git status --porcelain` empty.

`direct-pr` does not omit `orchestrator-diff-review` relative to `full`. That is
not an inference; it is in the shipped document, and here is the command that
settles it, counting the stage in the `pipeline:` section `mode show` prints for
`full`:

```
$ node bin/tiphys.ts mode show --mode full > full-show.txt ; SHOW_FULL_EXIT=0
$ awk '/^pipeline:/{f=1;next}/^[a-z-]+:/{f=0}f' full-show.txt | grep -c orchestrator-diff-review
0
```

So the shipped CLI prints a `skips:` row that names no downgrade, and a count of
skipped stages that is one too high, at exit 0, with the whole registry green.

The same edit on `full` is likewise ACCEPTED by the validator, and there the
registered test does catch it, which is worth measuring rather than assuming
because it is the one place a B-member is guarded:

```
$ (shipped full gains `- orchestrator-diff-review` in skips[])
BFULL_VALIDATE_EXIT=0                              <- the validator accepts it
BFULL_STATUS_TEST_EXIT=1
  AssertionError [ERR_ASSERTION]: full is annotated as the un-downgraded process
  while declaring skips: orchestrator-diff-review
    actual: [ 'orchestrator-diff-review' ], expected: []
```

**Why this is MEDIUM and not LOW.** Three reasons, and I argue the other side
below.

1. It is the same mechanism as CR-002, in the same field, on the same shipped
   data document, undetected by the same set of gates. CR-002 was a MEDIUM.
2. The round wrote the STRONGER property into two shipped artifacts as though
   the code enforced it. `assurance-modes.yaml:22` now says "AND NOTHING ELSE",
   and `schemas/assurance-modes.schema.json` now says "THE CHECK RUNS IN BOTH
   DIRECTIONS". A `$comment` claiming more than its schema does is the exact
   failure V-1 of round 8 was an instance of, and the phase's own test file says
   so at test/assurance-modes.test.ts:2171. Before round 9 these documents
   claimed less and were true; after it they claim more than the check delivers.
3. `mode show`'s count is one of the two facts DR-0020's disclosure obligation
   rests on, and it is now derivable from data no check constrains.

**Arguing against MEDIUM, so severity is not asserted.** No assurance is
weakened by any B-member I built: an inflated `skips[]` makes a mode look MORE
downgraded than it is, so nothing I produced lets a phase ship with less review
than it appears to have. I did not find a way to invert the un-downgraded
sentence with a B-member; that sentence now keys off the name, and I tried it on
`full` and on `direct-pr`. On the SHIPPED document the registered test
`assert.deepEqual(skips, [])` DOES catch a B-member on `full`
(`BFULL_STATUS_TEST_EXIT=1`, captured above). It does not catch one on
`direct-pr`, where the whole modes test file exits 0
(`WHOLE_MODES_TESTFILE_EXIT=0`, captured above).

**What would close it.** One more clause in the same loop, over sets the check
already computes: an entry of `skips[]` that is absent from `referenceStages` is
a violation. That is three lines in the block at src/checks.ts:427 and it needs
the reference, so it belongs after the reference resolution rather than in the
pre-reference loop. I am not applying it; that is the implementer's call.

**What I did NOT establish.** I did not find a B-member that makes the CLI print
a statement that is false rather than merely empty, and I did not find one that
inverts the un-downgraded sentence. I looked at `full`, `direct-pr` and
`local-only` and at the one stage id outside `full`'s pipeline; I did not
enumerate B-members for a hypothetical fourth mode.

## Claim 3: the converse burden. CONFIRMED.

Keying `executionStatus` off `mode.id === "full"` is honest only while the
shipped `full` really is un-downgraded. The assertion that carries that burden is
at test/assurance-modes.test.ts:2119, inside the `id === "full"` arm, and it is
`assert.deepEqual(skips, [])` reading the CLI's own `skips:` section rather than
the source data.

Red when `full` becomes a genuine downgrade (the status witness's DATA member,
reproduced by hand above): `actual: [ 'deploy-verify' ], expected: []`, with the
document still VALID at exit 0. So the assertion is what fails, not the validator.

Both arms of that test are also guarded against vacuity in the shipped document
(`assert.ok(undowngraded > 0 && downgrades > 0)` at line 2143), so deleting `full`
from the document cannot make the new assertion pass by never being reached.

## Claim 1, second half: the `mode.id` key is what closes CR-002 member 2

Round 9 says the predicate alone leaves member 2 open. Member 2 is `direct-pr`
given `full`'s pipeline and an empty `skips[]`. The soundness predicate iterates
`skips[]`, so on an empty list it can never fire; the claim follows from the code
and I measured the outcome at the head anyway (fixture built from the shipped
document, `review-contracts` added because the schema requires it there, restored
under a trap, md5 `04d39076684bc8e2524dc97dcb22a48c` after):

```
MEMBER2_VALIDATE_EXIT=0
mode show --mode full      -> execution-status: this mode is full, ... un-downgraded process ...
mode show --mode direct-pr -> execution-status: DECLARED AND VALIDATED, NEVER EXERCISED. This mode
                              is not full, ... It declares 0 skipped stage(s). ...
```

Before round 9 that second line claimed `direct-pr` was the mode the project
follows. It no longer can, for any mode, whatever the data says about skips.

## Claim 4 (CR-001): the hardened bound is still RED. CONFIRMED.

Both declared dangerous states of `witness/checks-near-miss-prefix-bounded-time.json`
applied one at a time in a second worktree, restored from a pristine copy between
each, md5 `1498de8523be02f2c2e34f4ba447bf0f` on `src/checks.ts` afterwards:

```
CONTROL (pristine)          NM_CONTROL_EXIT=0
member 0, loadavg 6.98      NM_M0_EXIT=1  WALL=11.85 s
  bullet run: rejecting a 151-byte near miss took 11508.7 ms (best of 1: 11508.7),
  over the 1000 ms budget; the block-prefix test is backtracking rather than scanning
member 1, loadavg 6.61      NM_M1_EXIT=1  WALL=12.96 s
  bullet run: ... took 12504.9 ms (best of 1: 12504.9), over the 1000 ms budget ...
```

`best of 1` in both, so the resample band did not open and the red arm costs what
it cost before, exactly as the round claims. The ceiling is
`NEAR_MISS_BUDGET_MS * 4` and both members land at eleven to twelve times the
budget, so the margin between "pathological" and "preempted" is not a close call
here. Taking a minimum cannot manufacture a green: if the minimum is under
budget, one real run of the real workload was under budget.

## V-3 (LOW): the claim round 9 says it weakened is NOT weakened in the shipped source

test/assurance-modes.test.ts:3106 reads, in the comment that argues the hardening
is safe:

```
   THE HARDENING, AND WHY IT CANNOT CREATE A FALSE GREEN. Load can only make a
   sample SLOWER, never faster, ...
```

Its own table, thirteen lines above at test/assurance-modes.test.ts:3091, reads:

```
     quiet   loadavg 0.24  bullet min 0.28 median 0.42 max  2.62 ms
     loaded  loadavg 12.94 bullet min 0.25 median 0.31 max 12.68 ms
```

The loaded minimum is BELOW the quiet minimum, so the absolute is contradicted by
the measurement printed immediately above it. The conclusion does not depend on
the absolute: "if the minimum is under budget, some run really did complete under
budget" is true by construction and is the sentence that carries the argument.
The absolute is the shape CLAUDE.md's claim grep exists to catch ("never",
"can only"), and a source comment is the artifact a later reader trusts, so it is
worth the one-word edit. This is a LOW and it is a wording finding, not a
correctness one.

## V-4 (LOW): a citation in the new test points at the wrong line

test/assurance-modes.test.ts, in the new soundness test's opening comment, cites
`delivery/review/clean-room-m3-p3-r8-criteria.md:318` for "the reviewer measured
three members, all at exit 0 with every registry gate green". Line 318 of that
file is BLANK, and it sits inside CR-001, which is a different finding about the
near-miss time budget:

```
$ awk 'NR>=314 && NR<=319 {printf "%d| %s\n", NR, $0}' \
    delivery/review/clean-room-m3-p3-r8-criteria.md
314| ```
315| head 108eed0 : bullet 151 bytes  2.6 ms ; ordered 207 bytes  0.4 ms   (same unit sets)
316| round7 986f58a: bullet 151 bytes 11203.2 ms ; ordered 207 bytes 12464.2 ms
317| ```
318|
319| So the witness is genuine and the margin is real. The LOW is only this: on the

$ awk '/^### /{h=$0; hn=NR} NR==318{print "line 318 falls under: "hn" "h}' \
    delivery/review/clean-room-m3-p3-r8-criteria.md
line 318 falls under: 307 ### CR-001 (LOW): the near-miss time budget is a wall-clock
assertion, and the box it will run on is not always quiet
```

CR-002's three members are at delivery/review/clean-room-m3-p3-r8-criteria.md:228
(member 1), :250 (member 2) and :266 (member 3), under the heading at :217. The
two other citations of that file on this branch, both to :217, are correct, and so
are the sibling-literal citations in src/modes.ts: src/checks.ts:275 is
`const REFERENCE_MODE_ID = "full";` and test/assurance-modes.test.ts:314 is the
`no mode declares id full` assertion.

## Claim 5: the bundle's exit 20 is pre-existing. CONFIRMED at the mechanism.

I did not re-run the whole twelve-gate bundle at two heads, and I say so rather
than implying I did. I established the same thing more directly.

The runner exits 20 when a REQUIRED gate is not-applicable
(`requiredNotApplicable.length > 0` -> `EXIT_NOT_APPLICABLE`, src/gates/run.ts:1191,
and `EXIT_NOT_APPLICABLE = 20`, src/gates/result.ts:67), and the vacuity check
outranks it.

I ran `--only citations` at BOTH heads, same base, same phase:

```
b5c01f0 : status=not-applicable units=0 precondition.met=false  (42 changed paths)
108eed0 : status=not-applicable units=0 precondition.met=false  (41 changed paths)
detail identical modulo the path count: true
paths only at head: ["witness/checks-mode-skips-sound.json"]
```

The single path round 9 adds to the diff is a witness spec, which is not a
configured document, so the gate's applicability cannot have changed. The exit 20
is not round 9's.

## Claim 6

Not discharged. See V-3.

## DR-0022's owner criterion, re-derived independently

From `git archive` at `b5c01f0` and at the pre-A2 baseline `18c335a`, in a lab
outside the repository with `node_modules` symlinked in and the tree removed on a
trap (`CLEANUP done, LAB present after=NO`). Nothing staged by anyone was read:

```
NODE=v26.6.0  HEAD=b5c01f07ee14eda8d7549006dd4693c3a5544125
ARCHIVE_EXIT=0   RECORDS=20
BASELINE commonmark occurrences in src/checks.ts (expect 0): 0
HEAD     records=20 total-units=504   HEAD_EXIT=0
BASELINE records=20 total-units=504   BASELINE_EXIT=0
DIFF_EXIT=0  DIFF_LINES=0
e5c0dfd22c3b3f9215b88200d2804352  DV9-units-head.json
e5c0dfd22c3b3f9215b88200d2804352  DV9-units-baseline.json
```

The md5 matches the value round 9 recorded and the value the round-8 criteria
reviewer recorded (delivery/review/clean-room-m3-p3-r8-criteria.md:201). Three
independent derivations, one number.

## CR-003: the replacement paragraph is CORRECT

The plan text is not on this branch and I am not reporting its absence; the round
measured the scope gate reddening on it and handed it back. I checked the
paragraph it wrote instead, by enumerating the enum sites myself rather than by
re-running its script:

```
schemas/assurance-modes.schema.json  /$defs/modeShape/properties/id      ["full","direct-pr","local-only"]
schemas/charter.schema.json          /properties/delivery-mode           ["full","direct-pr","local-only"]
schemas/charter.schema.json          /properties/assurance-tier          ["full","direct-pr","local-only"]
schemas/gate-registry.schema.json    /$defs/gateShape/properties/modes/items ["full","direct-pr","local-only"]
gate-registry.yaml                   4 `modes` rows naming local-only
assurance-modes.yaml                 the declaration itself
```

Six edit sites, which is the number the replacement paragraph gives. The
amendment currently on `main` (delivery/plan/kernel-plan-m3.md:2552) names FOUR,
and one of its four ("reachable by `mode show`") is a consequence rather than an
edit, so it names three real edits and omits three. The round's "SIX edits, THREE
of them unnamed" is right, and its observation that
`schemas/assurance-modes.schema.json` fails FIRST is right: that enum is what
rejects the id before any check runs.

## O-1 (observation, PRE-EXISTING, not a finding against round 9): `node --test` and `npm test` report different totals at the same head

CLAUDE.md's gate list names `node --test` as gate 3. `package.json` defines
`"test": "node --test \"test/**/*.test.ts\""`. At `b5c01f0`, node v26.6.0, `dist/`
built, both exit 0:

| invocation | tests | pass | SKIPPED |
|---|---|---|---|
| `node --test` at the repository root | **508** | 508 | 0 |
| `npm test` | **506** | 506 | 0 |

The two extra are `greet returns a greeting for a name` and `greet rejects an
empty name`, derived by differencing the two reporters' pass lines rather than
guessed. They come from `sandbox/test/greet.test.js`, a TRACKED fixture added by
M1-P6 (`7e1b5f1`), present at the merge base and on `origin/main`, which node's
default discovery picks up and the `test/**/*.test.ts` glob does not.

This is the family standing warning 12 is about and it adds a THIRD axis to the
two that warning already names: toolchain, build state, and now INVOCATION FORM.
Round 9's table says 506 and is measuring `npm test`, which is the suite gate's
own invocation, so its number is the right one; my first number was 508 and was
also right. Two honest agents, two totals, again.

It is worth a line in CLAUDE.md rather than a fix here, and there is a second
edge behind it: if that fixture ever failed, `node --test` would go red while
`npm test`, the suite gate and CI stayed green.

## The fix-round contract, item 3 read FIRST

Round 9's non-coverage section (delivery/work-history/m3-p3.md:7424) names its
AXES before its regions, which is what T-012 asks for, and the axes are honest:
cost is a judgement rather than a measurement and says so; failure mode is
covered under CPU load only; **neither CI arm was observed**, so DR-0012
condition 4 is not discharged by anything in the work history; `test/` was
excluded from the derivation and the round records that the exclusion had a real
cost, since the unsound proxy was in the test too and was found by reading rather
than by grep.

Its derivation D1 is `grep -rn 'skips' src/ bin/` with full output and every hit
classified, including one it examined and cleared with a structural argument
(`mode-stage-order` consults `skips[]` only on the arm where the stage genuinely
is absent; that site is src/checks.ts:498 at this head, and the work history's
`:463` is its PRE-FIX line number, which the work history states). That is a good
derivation of CALL SITES.

**It is not a derivation of the INVARIANT, and V-1 is what that gap cost.**
Enumerating every place `skips` is read answers "where could the mechanism
appear?" It does not answer "in how many ways can this set be wrong?", which is
the question CR-002 actually posed. Both were in scope: region item 6 excuses only
OTHER documents' one-directional set checks, and V-1 is inside `skips[]` itself.

## What I attacked and did NOT reach

- **CI, both arms: not observed.** Same gap as the round's. I ran nothing on a
  GitHub runner and I have no run id, so T-009's two arms are open for this head
  from my side as well.
- **The full twelve-gate bundle: not run.** I ran `red-witness` and `citations`
  individually and read the aggregation rule out of the source. I did not
  independently re-derive the `suite`, `scope`, `coverage`, `clause-map`,
  `manifest-self-check`, `credential-scrub` or `agent-rules-drift` numbers.
- **The acceptance criteria table: not re-walked.** That is contract B's job this
  round.
- **`role-model-config.yaml` and `gate-registry.yaml`** were not audited for the
  same one-directional set shape. V-1 is inside `skips[]` only. The round names
  this gap too and I did not close it either.
- **The staged install and the packed tarball** were not re-derived.
- **A B-member of V-1 for a hypothetical fourth mode** was not enumerated.
- **The EPIPE the round reports on `mode show | head`** I did not reproduce or
  investigate; I accept it as recorded and out of scope.
- **Load beyond what this box was doing.** Every timing number here was taken at
  load average 6 to 7, which is lower than the 12.94 round 9 forced. I did not
  independently reproduce the loaded sampling table.

## Verdict

Round 9 does what it says on the two things that mattered most. The soundness
predicate's PLACEMENT is load-bearing and I confirmed it by building the wrong
version and watching the sharpest member survive. The DATA dangerous state is
real, accepted by the harness, red for the right reason, and the one that must
redden through the annotation does exactly that on a document that still
validates. CR-001's bound is still red at one sample. DR-0022 has not moved.

Against that: **one MEDIUM, V-1**, which is the CR-002 mechanism surviving in a
third direction that the round's own new documentation claims is closed; and
three LOWs, V-2 (a wrong count and a false novelty claim in the record), V-3 (an
absolute the round says it weakened and did not, in the source), and V-4 (a
citation pointing thirteen lines into the wrong finding).

I did not find a way to make a V-1 member invert the un-downgraded sentence or
weaken any assurance, and I say that as what I did not find rather than as what
cannot happen.
