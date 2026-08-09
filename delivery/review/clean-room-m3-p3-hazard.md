# Clean-room review, M3-P3, hazard lens

Reviewer: clean-room-b (hazard lens, does not walk acceptance criteria).
Head under review: 7b3afbf0f6f6baf458f2adf4e555fbf1232a33be
Status: COMPLETE

## Verdict: CHANGES REQUIRED

Three findings at severity HIGH or above (CR-002, CR-003, and CR-001 revised
to MEDIUM below), one LOW/latent (CR-004). CR-002 and CR-003 land squarely
inside the phase's own declared hazard class -- "the one artifact in which a
downgrade can be made invisible, and the one that encodes who may merge" --
and both are reproduced end to end with captured commands, not inferred.
Final severities:

| id | severity | one line |
|---|---|---|
| CR-001 | MEDIUM | raw NUL bytes authored into src/checks.ts, this phase's own file; functionally inert today, no gate catches it |
| CR-002 | HIGH | duplicate mode `id`s are schema-legal; `mode show` silently serves a crippled first match with exit 0 |
| CR-003 | HIGH | DR-0012's `conditions[]` are checked for count (and only for the shipped file, only by a test), never content; a fabricated grant of the right shape passes schema, checks, and the registered test |
| CR-004 | LOW (latent) | the same duplicate-id gap as CR-002 exists in role-model-config.yaml; inert only because M3 ships no resolver yet |

This report is written incrementally per T-008. Findings are numbered CR-nnn.

## Method

Not walking acceptance criteria (that is the other reviewer's job). Attacking:
1. The mode/pipeline/gate-set validation surface for invisible-downgrade shapes.
2. The escalation-bounds / merge-authority encoding for DR-0012 vs DR-0016 drift.
3. Liveness-only completion detection (C-2).
4. Duplicate-guard constraints (claimed 3 found and fixed; hunting a 4th).
5. Mutation testing of src/modes.ts, src/checks.ts, src/commands/mode.ts, and schemas.

## Log

### CR-001 (severity MEDIUM, finalized): raw NUL bytes in src/checks.ts

`src/checks.ts`, the file this phase adds four derived checks to, contains two
literal ASCII NUL (0x00) bytes, both on the same line, inside
`charter-mode-enum-matches-modes`:

```
      if (enumerated.join("\0") !== declaredIds.join("\0")) {
```

(rendered above as an escape; the bytes in the tracked file are RAW, not the
two-character escape sequence `\` `0`.)

Reproduction:
```
$ grep -caP '\x00' src/checks.ts
1
$ node -e 'const b=require("fs").readFileSync("src/checks.ts");let c=0,idx=[];for(let i=0;i<b.length;i++){if(b[i]===0){c++;idx.push(i)}}console.log(c,idx)'
2 [ 23895, 23921 ]
$ file -i src/checks.ts
src/checks.ts: application/octet-stream; charset=binary
```

`file` classifies the tracked source file as binary octet-stream. `git diff`
against origin/main for this file does NOT print "Binary files differ" in
this case (confirmed with `git diff origin/main..HEAD -- src/checks.ts`,
which shows a normal unified diff with 335 insertions) -- the NUL sits deep
enough into a large text file that git's own heuristic still treats the blob
as text, so this particular instance is reviewable, unlike the
`test/status.test.ts` incident CLAUDE.md records. That is a fact about THIS
file's size and NUL position, not a property that generalizes; a NUL earlier
in a smaller file could still trip git's binary heuristic.

Present since the phase's OWN implementation commit, not introduced by a
later merge or rebase:
```
$ git show e82a0e0:src/checks.ts | grep -caP '\x00'
1
$ git show 7b3afbf:src/checks.ts | grep -caP '\x00'
1
```
(both show the byte; e82a0e0 is "M3-P3: assurance modes and role-to-model
configuration", the phase's first commit; 7b3afbf is HEAD.)

Scope check against CLAUDE.md's own binding convention 3 (the two-grep rule),
run over `git ls-files` minus the two named exemptions
(`delivery/intake/orchestrated-delivery-process.md` and
`test/fixtures/json-schema-test-suite/**`):
```
$ git ls-files | grep -v -e 'delivery/intake/orchestrated-delivery-process.md' \
    -e '^test/fixtures/json-schema-test-suite/' > scope.txt   # 399 files
$ while read -r f; do grep -laP '[\x00-\x08\x0B\x0C\x0E-\x1F]' "$f"; done < scope.txt
delivery/review/arbitration-m3-p1.md
src/checks.ts
```
`delivery/review/arbitration-m3-p1.md` is PRE-EXISTING (from M3-P1, commit
`dd42ccb`) and unchanged by this phase's diff (`git diff --stat
origin/main..HEAD -- delivery/review/arbitration-m3-p1.md` prints nothing);
its one hit is a backtick-escaped literal inside prose ABOUT this exact
hazard class and is not this phase's responsibility. `src/checks.ts` is
this phase's own file and its own defect.

Mechanism: `charter-mode-enum-matches-modes` needs any separator to join two
sorted string arrays for an equality comparison, and the implementer typed a
literal control character instead of a space or comma. FUNCTIONAL effect is
believed nil today, because neither side's elements (`full`, `direct-pr`,
`local-only`, and the charter schema's enum values) can themselves contain a
NUL, so the join-and-compare still behaves like any other separator. This is
NOT a hazard-class hit on the mode-validation semantics the plan names; it
is the DURABILITY hazard the repo's own CLAUDE.md was rewritten for after
`test/status.test.ts`, landing in the one file this very phase edits, and
NO gate in this repo's script/CI surface currently runs the two-grep check
CLAUDE.md prescribes: `grep -rn 'x00-\\x08\|control character\|non-ASCII' scripts/
.github/` returns nothing implementing it; `scripts/m2-exit-test.sh` line 62
only mentions "pure ASCII" in a comment. So this is a real miss with no
existing automated backstop, caught only by a reviewer reading the file
byte-for-byte -- exactly the failure mode CLAUDE.md's rule 3 was written to
describe.

Severity finalized at MEDIUM: the mechanism is genuinely a control-character
authoring defect of exactly the class this repository's CLAUDE.md was
rewritten to catch after `test/status.test.ts`, it is unguarded (no gate
runs the two-grep check at all, against ANY file), and it sits in a file
whose entire purpose is being trustworthy machine logic -- but the concrete
instance is functionally inert (separator choice in a join-then-compare)
and does not itself misrepresent a downgrade, so it does not rise to HIGH on
its own. It is escalation-worthy as a SYSTEMIC gap (no gate anywhere runs
CLAUDE.md's own prescribed check) rather than as an M3-P3-specific one.

### CR-002 (severity HIGH): duplicate mode ids are schema-legal, and `mode show` silently serves the wrong one with exit 0

The plan calls M3-P3 "the one artifact in which a downgrade can be made
invisible". Duplicate `id` values in `modes[]` are exactly that: schema-legal,
undetected by `tiphys validate` when run the way an operator naturally would
(`mode show`, no `--context`, no prior `validate` call), and silently served
by `mode show` with exit 0 and no warning.

**Mechanism 1: `uniqueItems: true` on the `modes` array (schema line 29)
tests DEEP OBJECT equality, not `id` equality.** Two mode objects sharing
`id: full` but differing in any other field (e.g. a shorter `pipeline` and
an empty `skips: []`, i.e. an undeclared downgrade by the plan's own
definition) are two DIFFERENT array items under `uniqueItems`, so the schema
accepts the document. No `$defs` rule anywhere constrains `id` values to be
distinct across `modes[]`; grep confirms:
```
$ grep -n 'duplicate\|uniqueItems' schemas/assurance-modes.schema.json
29:      "uniqueItems": true,
114: [T-007's review-contracts duplicate comment only]
173/181/190/219: [uniqueItems on other array fields, none is `id`]
```

**Mechanism 2: `mode-no-undeclared-downgrade`, `mode-gate-sets-resolve`, and
`mode show` all locate "the" mode with id X via `Array.find`/`.find`, which
returns the FIRST match and is silent about a second.** `eachMode` in
`src/checks.ts` returns every row including duplicates; `modeNoUndeclaredDowngrade`
picks `reference = rows.find(row => row.id === REFERENCE_MODE_ID)` -- the
FIRST `full`. If a crippled `full` (missing `clean-room-review`, `skips: []`)
is inserted BEFORE the real `full`, the crippled one becomes the reference
that every other mode's downgrades are measured against, and the real `full`
is now merely "another mode" being checked against the crippled baseline.
`src/modes.ts`'s `readModes` and `src/commands/mode.ts`'s `cmdMode` do the
same: `read.modes.find(candidate => candidate.id === wanted)`.

**Only `charter-mode-enum-matches-modes` (which needs `--context` and
therefore CAN be skipped) happens to catch a duplicate, and only because it
compares COUNTS via a sorted join, not because anything targets duplication
directly.** Reproduction, inserting a crippled `full` (pipeline without
`clean-room-review`, `skips: []`) BEFORE the real `full` in a copy of the
shipped file:

```
$ node bin/tiphys.ts validate --type assurance-modes --context . /tmp/dup-first-crippled.yaml
INVALID #/modes assurance-modes.yaml declares mode ids [direct-pr, full, full, local-only] and the assurance-tier enum in schemas/charter.schema.json is [direct-pr, full, local-only]; the two must be equal (check: charter-mode-enum-matches-modes)
INVALID #/modes assurance-modes.yaml declares mode ids [direct-pr, full, full, local-only] and the delivery-mode enum in schemas/charter.schema.json is [direct-pr, full, local-only]; the two must be equal (check: charter-mode-enum-matches-modes)
EXIT=1
```
Without `--context` this becomes two `SKIPPED ... no context` lines and exit
1 (fails, but for the wrong stated reason, and only because the currently
shipped charter enum happens to have exactly 3 entries; a duplicate is
caught as a side effect of a count mismatch, not by any check whose stated
job is duplicate detection).

**The actual invisible-downgrade demonstration is `mode show`, which never
calls `validate` or any check in `src/checks.ts` at all** (this is
deliberate and documented: `src/modes.ts` line 13, "NO VALIDATION HAPPENS
HERE"). Given the SAME tampered file, placed at the shipped location and
queried the way the plan's own step 5 describes ("so a brief or a human can
read what a declared mode requires without parsing YAML by hand"):

```
$ cp /tmp/dup-first-crippled.yaml assurance-modes.yaml
$ node bin/tiphys.ts mode show --mode full
mode: full
merge-authority: delegated-under-conditions
granted-by: DR-0012
pipeline:
  intake
  verification-pass
  plan
  adversarial-plan-review
  implement
  fix-round
  fix-round-verification
  merge-on-green
  deploy-verify
  migration-verify
  final-report
skips:
  (none)
gate-sets:
  manifest-self-check
review-contracts:
  criteria
  hazard
escalation-bounds:
  max-fix-rounds-after-review: 2
  on-exceeded: fresh-implementer-and-third-contract
  recurrence-of-high-in-one-component: 1
conditions:
  placeholder condition
declared-by: crippled duplicate for mutation testing
EXIT=0
```

Exit 0. No mention that `clean-room-review` is absent from a mode named
`full` with an empty `skips`. No mention that a second `full` entry exists
later in the same file. A reader trusting `mode show` (exactly its stated
purpose: reading what a mode requires "without parsing YAML by hand") sees
a plausible, well-formed-looking pipeline and merge-authority block and has
no way to know the document is malformed. This is the hazard class named at
plan lines 2340-2343 realized concretely: "a mode omitting a stage `full`
contains with an empty `skips[]`... which no schema keyword can see" --
except here it additionally evades the Kind B check meant to catch it,
because `mode show` never runs any check.

No test in `test/assurance-modes.test.ts` exercises a duplicate mode id
through either `validate` or `mode show`:
```
$ grep -n 'duplicate\|dup' test/assurance-modes.test.ts src/modes.ts src/commands/mode.ts
test/assurance-modes.test.ts:943:test("two review contracts with the same id are rejected as duplicates and full's two are distinct", () => {
```
(only `review-contracts[]` duplication is tested; mode-`id` duplication is
untested end to end.)

Reverted the shipped file immediately after the reproduction:
```
$ cp /tmp/orig-assurance-modes.yaml assurance-modes.yaml
```
(confirmed clean afterward; see `git status` note in the mutation-testing
section below.)

Severity: HIGH. The mechanism is exactly the phase's own named hazard class,
it is schema-legal, it is not covered by any registered check that runs
unconditionally, and the one command whose entire purpose is showing an
operator what a mode requires (`mode show`) is the one path with zero
defense against it.

### CR-003 (severity HIGH): DR-0012's `conditions[]` are checked for COUNT, never for CONTENT -- a fabricated grant with the right shape passes schema, checks, and the registered test

Hazard item 4 in the plan's own hazard class (line 2350) names exactly this:
"`merge-authority: delegated-under-conditions` with conditions that do not
match DR-0012's, so the artifact and the grant differ." The hazard-to-criterion
table (plan lines 2372-2373) maps this to criterion 4b and states the phase's
hazard map "came out fully covered" with only ONE disclosed residue (the C-2
liveness fixed-token check). This finding shows a SECOND residue the plan
does not disclose: criterion 4b, its schema rule, and its registered test
all check the SHAPE of `conditions[]` (non-empty, and for the shipped
document specifically, count == 6) and the FORMAT of `granted-by`
(`^DR-[0-9]{4}$`) -- none of the three ever compares the conditions' TEXT
against what DR-0012 actually records.

**Schema mechanism**: `modeAuthorityRule`'s `then` (schemas/assurance-modes.schema.json
lines 95-111) requires `conditions` to be a non-empty array of non-empty
strings and `granted-by` to match the decision-record ID pattern. Neither
constraint reads `delivery/decisions/DR-0012-*.md` or compares string
content.

**Check mechanism**: `src/checks.ts` registers no check for `merge-authority`,
`conditions`, or `granted-by` at all (grep confirms -- the four M3-P3 checks
are `mode-no-undeclared-downgrade`, `mode-stage-order`,
`mode-gate-sets-resolve`, `charter-mode-enum-matches-modes`; none reads
`conditions` or cross-references the decisions directory).

**Test mechanism**: `test/assurance-modes.test.ts` lines 803-813 assert only
`full["conditions"].length === 6` and `full["granted-by"] === "DR-0012"` --
a length and an ID string, never the six sentences' text.

Reproduction, replacing DR-0012's actual six conditions in the SHIPPED
`assurance-modes.yaml` with six one-line fabrications unrelated to the
decision record, keeping count at exactly 6 so the one count-based guard
does not fire:

```
$ node bin/tiphys.ts validate --type assurance-modes --context . assurance-modes.yaml
EXIT=0

$ node --test --test-name-pattern "delegated merge authority" test/assurance-modes.test.ts
tests 1
pass 1
fail 0
```

Both green. The fabricated conditions were, verbatim:
```
      - "fabricated condition one, unrelated to DR-0012"
      - "fabricated condition two, unrelated to DR-0012"
      - "fabricated condition three, unrelated to DR-0012"
      - "fabricated condition four, unrelated to DR-0012"
      - "fabricated condition five, unrelated to DR-0012"
      - "fabricated condition six, unrelated to DR-0012"
```

Reverted immediately after the reproduction:
```
$ cp /tmp/orig-assurance-modes.yaml assurance-modes.yaml
$ git status --short
?? delivery/review/clean-room-m3-p3-hazard.md   (only this report, untracked)
```

What this does NOT cover, so the finding is not overstated: reducing the
count below 6 (or to 0) IS caught, both by the schema's `minItems: 1` (for
0) and by the registered test's `length === 6` assertion (for any count
other than 6, for the shipped file specifically). The gap is content only,
at exactly the count the shipped document already has, which is the
narrowest and therefore most dangerous form: a reviewer skimming a diff that
changes six bullet points to six DIFFERENT bullet points, all still present,
all still non-empty, would need to read and compare against DR-0012's actual
text by hand to catch this -- there is no mechanical backstop at any layer.
This is the identical shape to the C-2 residue the plan DOES disclose (a
fixed-structure check that cannot see semantic drift), applied to the field
that is, in the plan's own words, "the one artifact... that encodes who may
merge."

Severity: HIGH, for the same reason as CR-002: this is not a hazard adjacent
to the phase's stated purpose, it IS the phase's stated purpose (merge
authority), and it is fully exploitable with no detection at any of the
three layers meant to guard it.

### CR-004 (severity LOW, latent): the same duplicate-id gap as CR-002 exists in `role-model-config.yaml`, undetected because nothing consumes the document yet

`schemas/role-model-config.schema.json`'s `roles` array has `uniqueItems:
true` at the array level (deep-object equality, same limitation as
`assurance-modes.schema.json`) and the `role` enum is closed to six values,
but nothing requires the six `role` VALUES actually used across entries to be
distinct. Two entries both declaring `role: orchestrator`, one at `tier:
strongest` and one at `tier: cheaper`, validate cleanly:

```
$ node bin/tiphys.ts validate --type role-model-config /tmp/dup-role.yaml
EXIT=0
```//(fixture: the shipped file plus one appended contradictory `orchestrator`
entry at `tier: cheaper`)

Severity is LOW rather than HIGH because M3-P3's own work history discloses,
correctly, that "`role-model-config.yaml` has no resolver. No code reads
it... configuration for an M4 harness adapter that does not exist yet" --
so nothing acts on this data today and the gap is inert. It is recorded
because it is the identical mechanism as CR-002 in the sibling document this
same phase ships, it will stop being inert the moment M4 builds a resolver
that looks up a role by name and gets whichever entry happens to be first
(or last, depending on lookup implementation) rather than erroring, and
because `roles[]` is exactly the kind of registry CLAUDE.md's binding
convention 5 already warns about for append-only lists: nothing here is
append-only in the registry sense, but the "assert by name, never by
count/identity-of-first-match" lesson generalizes to "assert IDs are
distinct, never assume the schema's blunt `uniqueItems` catches it."

## Mutation testing (src/checks.ts, src/modes.ts, src/commands/mode.ts, schemas/assurance-modes.schema.json)

Ran `node --test test/assurance-modes.test.ts` (baseline: 16 tests, 16 pass,
0 fail, ~8s) after each mutation, then reverted via file restore (never
`git checkout --`, per the standing warning; backups were plain copies made
before any mutation). `git status --short` confirmed a clean tree (only this
report untracked) after every restore.

| # | Mutation | File | Result |
|---|---|---|---|
| M1 | `mode-stage-order`: `if (review > implement)` -> `if (false && review > implement)`, silencing the R-024 ordering violation | src/checks.ts | RED: 15 pass, 1 fail |
| M2 | `mode-no-undeclared-downgrade`: `undeclared` filter replaced with `const undeclared: string[] = []` | src/checks.ts | RED: 15 pass, 1 fail |
| M3 | `mode-gate-sets-resolve`: the "resolves but wrong mode" arm, `if (!modesOfGate.has(row.id))` -> `if (false && ...)` | src/checks.ts | RED: 15 pass, 1 fail |
| M4 | `charter-mode-enum-matches-modes`: the whole `if (enumerated.join(NUL) !== ...)` line replaced with `if (false)` | src/checks.ts | RED: 15 pass, 1 fail |
| M5 | `mode show`: `.find(candidate => candidate.id === wanted)` -> `.find(candidate => true)`, so any `--mode` argument shows the first mode regardless of id | src/commands/mode.ts | RED: 15 pass, 1 fail |
| M6 | schema: `review-contracts` conditional `minItems: 2` -> `minItems: 0` (T-007's rule defanged) | schemas/assurance-modes.schema.json | RED: 15 pass, 1 fail |
| M7 | `mode-gate-sets-resolve`: `requiresContext: true` -> `requiresContext: false`, so the cross-document check would silently no-op without `--context` instead of SKIP-and-fail | src/checks.ts | RED: 15 pass, 1 fail |
| M8 | `eachMode`: added first-wins dedup by `id` (silently drops every mode after the first with a repeated id) | src/checks.ts | **GREEN: 16 pass, 0 fail** -- confirms CR-002/CR-004: no test anywhere exercises a duplicate mode/role id, so a change to duplicate-handling semantics (in either direction) is invisible to the suite |

7 of 8 mutations correctly reddened the suite (each of the four registered
checks, the schema's own T-007 rule, `mode show`'s lookup, and the
fail-closed `requiresContext` contract are all guarded by at least one
witness). The one mutation that stayed green is not a false claim about
those four checks; it targets exactly the surface CR-002 and CR-004 already
identify as unguarded, and its green result is additional, independent
confirmation of the same gap via a different method (mutation vs. direct
reproduction).

Sample size note (asked for explicitly): 8 mutations across 4 checks/1
schema rule/1 command/1 helper function is not exhaustive coverage of
src/checks.ts, src/modes.ts, and src/commands/mode.ts; see "What this review
did NOT cover" below for what was left untried.

## Verifying the "three duplications found and fixed" claim, and hunting a fourth

`delivery/work-history/m3-p3.md` lines 650-659 ("One duplication found by a
witness that stayed red") names, in one paragraph, THREE constraint
instances that were originally duplicated across two schema sites and are
now consolidated to one site each: `conditions`' `minItems`,
`review-contracts`' `uniqueItems`, and `review-contracts`' `minItems`.
Verified by extracting every `minItems` / `required` / `contains` /
`pattern` / `uniqueItems` / `enum` keyword in `schemas/assurance-modes.schema.json`
with its full JSON path:

```
$ python3 -c "import json; ... walk every dict, print path for the six keyword kinds ..."
/properties/modes/minItems = 1
/properties/modes/uniqueItems = True
/$defs/mode/then/required = ['pipeline', 'escalation-bounds']
/$defs/modeAuthorityRule/then/required = ['conditions', 'granted-by']
/$defs/modeAuthorityRule/then/properties/conditions/minItems = 1        <- ONE site
/$defs/modeReviewContractRule/then/required = ['review-contracts']
/$defs/modeReviewContractRule/then/properties/review-contracts/minItems = 2   <- ONE site
/$defs/modeShape/properties/pipeline/minItems = 1
/$defs/modeShape/properties/pipeline/uniqueItems = True
/$defs/modeShape/properties/skips/uniqueItems = True
/$defs/modeShape/properties/gate-sets/minItems = 1
/$defs/modeShape/properties/gate-sets/uniqueItems = True
/$defs/modeShape/properties/review-contracts/uniqueItems = True         <- ONE site
/$defs/decisionRecordReference/pattern = ^DR-[0-9]{4}$
/$defs/escalationBounds/required = [... 'on-exceeded']
```
Each of the three keywords the work history names appears exactly once.
`grep -c '"contains"' schemas/assurance-modes.schema.json` returns 2, but
the two are DIFFERENT rules for different purposes (one is `full`'s
`fix-round-verification` requirement, the other is the `if` trigger that a
pipeline containing `clean-room-review` needs two review contracts) --
not a duplicate of one constraint. No fourth duplicated constraint site was
found in the schema by this method.

The one adjacent thing this method does NOT rule out, because it is not a
same-file keyword duplication and so was outside the work history's own
framing: the mode-`id` closed vocabulary is a **triplicated fact across
three files** (`schemas/assurance-modes.schema.json`'s `modeShape.id` enum,
`schemas/gate-registry.schema.json`'s per-gate `modes` item enum, and
`schemas/charter.schema.json`'s `delivery-mode`/`assurance-tier` enums), a
fact the schema's own `$comment` at line 160 states plainly. Only ONE of the
two OTHER copies has a live cross-document check
(`charter-mode-enum-matches-modes`, this phase's own); the gate-registry
copy relies on `test/gate-registry.test.ts`, a hardcoded-literal test from
M3-P2 (`["full", "local-only"]` and similar, never reading
`assurance-modes.yaml`), not a derived check. This is NOT flagged as a
severity-bearing CR here because: (1) `schemas/gate-registry.schema.json` is
not on M3-P3's files-to-touch list, so fixing it is out of this phase's
scope even if the drift risk is real; and (2) the practical exposure is
largely absorbed by `mode-gate-sets-resolve`, which checks the REGISTRY's
actual per-gate `modes` list content against the live mode id at validation
time, independent of the registry schema's enum -- so a stale enum mostly
manifests as "a new mode's gates cannot be declared at all" (fails closed)
rather than as an invisible pass. Recorded here as an observation for
whichever phase next touches `gate-registry.schema.json`, not as a finding
against this one.



## What this review did NOT cover

Read this section first, per the arbitration instruction: a search whose
scope is wrong returns an empty result indistinguishable from an absence of
defects.

1. **The acceptance criteria were not walked.** That is the criteria
   reviewer's contract, not this one's. One place where the two contracts'
   territory touched is noted transparently rather than duplicated:
   criterion 1's literal text ("`tiphys validate --type assurance-modes
   assurance-modes.yaml` exits 0", no `--context`) is FALSE for the command
   as literally written (it exits 1, both checks SKIPPED) -- but this is
   already disclosed and reasoned through in `test/assurance-modes.test.ts`
   lines 149-159 and cited to `delivery/work-history/m3-p3.md`, so it is not
   reported here as a new finding, only flagged so the criteria reviewer
   does not need to rediscover the citation trail.
2. **`src/gates/*.ts`, `src/pool.ts`, `src/task.ts`, `src/teardown.ts`, and
   the rest of the kernel outside this phase's own files were not reviewed
   for hazards.** The brief scoped this review to `src/modes.ts`,
   `src/checks.ts`, `src/commands/mode.ts`, and the two new schemas plus
   their YAML instances. `src/checks.ts` carries checks from earlier phases
   (`plan-verification-first-present`, `plan-dispatchable`,
   `plan-hazard-classes-addressed-by-resolves`) that were read for context
   but not mutation-tested, since they are not this phase's additions.
3. **`role-model-config.yaml`'s content was checked only for the
   duplicate-role-id gap (CR-004) and against R-075's tier rule by reading,
   not by an automated cross-check against the process document's exact
   text.** No script exists that would catch a future edit drifting the
   YAML's tiers from R-075; this document is entirely unresolved data (no
   consumer) so the practical stakes are deferred to M4, and this review did
   not build or demand such a check, per the same reasoning M3-P3 itself
   gives for not building one.
4. **The C-2/C-3 liveness-vocabulary residue (fixed-token grep for `pid`,
   `kill`, `daemon`, `background`) was verified NOT to be currently
   exploited (no stage or schema text in the two files uses liveness
   vocabulary outside those four tokens), but a hypothetical stage using
   liveness detection through OTHER words (e.g. "heartbeat", "poll",
   "still running") was not constructed as a new document and tested,
   because the plan already discloses this exact residue in the open
   (lines 2374, and again for M3-P9/AGENTS.md) and states explicitly that
   upgrading it to a semantic check is out of scope for this phase. Treated
   as confirmed-and-already-disclosed rather than re-derived.
5. **`schemas/gate-registry.schema.json`'s independent copy of the closed
   mode-id enum was read and reasoned about (see the duplication-hunt
   section above) but not mutation-tested**, because that file is not on
   M3-P3's files-to-touch list (it was authored entirely in M3-P2, confirmed
   by `git log` and an empty `git diff --stat origin/main..HEAD` for that
   path) and mutating a file this phase does not own would not be evidence
   about this phase's own defect surface.
6. **`role-model-config.schema.json`'s and `assurance-modes.schema.json`'s
   `$schema`/`$id`/Draft-2020-12 conformance were not independently verified
   against an external JSON Schema validator** (e.g. ajv-cli or the
   json-schema-test-suite fixtures already vendored in this repo); this
   review trusted the project's own `src/validate.ts` engine to interpret
   `if`/`then`/`contains`/`pattern` correctly, on the strength of that
   engine having its own separately-tested behavior from earlier phases.
7. **Windows/CRLF, non-UTF-8, or extremely large (multi-MB) `assurance-modes.yaml`
   inputs were not tried.** The path-classification hazard class
   (`readOperatorPath`, FIFOs, symlinks) is cited in the code as inherited
   from D-M3-27/CR-520 and was read but not independently re-attacked here;
   it is a generic path-handling concern the M1/M3-P1 lineage already
   covers, not specific to this phase's mode/authority semantics.
8. **Concurrent/racing invocations of `tiphys mode show` or `tiphys
   validate` against a file being edited mid-read were not tested.** No
   evidence either way; flagged as untested rather than assumed safe.
9. **Mutation coverage of `src/checks.ts`, `src/modes.ts`, and
   `src/commands/mode.ts` was targeted (8 mutations, one per named
   mechanism from the brief) rather than exhaustive.** Untried: mutations to
   `packageRoot()`'s directory-walk loop bound, `strings()`/`optionalStrings()`'s
   type-filtering behavior, the sort stability of `checksFor()`, and the
   `EX_USAGE` vs exit-1 boundary in `cmdMode`'s argument parser beyond the
   one case exercised.
