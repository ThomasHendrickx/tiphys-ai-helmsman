# PROBE: DR-0038 third status in the gate framework

Key: third-status
Started: 2026-09-15T23:10:03Z
Scratch: /tmp/claude-0/m4-probes/third-status/
Repo (read only): /home/user/tiphys-ai-helmsman

STATUS: in progress, nothing established yet.


## 1. The status vocabulary, quoted from the type

File: /home/user/tiphys-ai-helmsman/src/gates/result.ts

    /** The four words. Nothing else is a status. */
    export type GateStatus = "green" | "red" | "not-applicable" | "error";

    export const GATE_STATUSES: readonly GateStatus[] = [
      "green", "red", "not-applicable", "error",
    ];

src/gates/result.ts:47 and :49. The module comment at :11 says "THE STATUS
VOCABULARY IS FOUR WORDS AND THEY ARE NOT INTERCHANGEABLE."

There is also an exit-code table, src/gates/result.ts:65-97:
  EXIT_GREEN=0, EXIT_RED=1, EXIT_NOT_APPLICABLE=20, EXIT_GATE_ERROR=21
with a TOTAL bijection both ways (exitCodeForStatus / statusForExitCode).
statusForExitCode returns undefined for anything else.

PRELIMINARY (to be confirmed by running): a fifth status is a FRAMEWORK change,
not a one-line enum edit, because the vocabulary is load bearing in at least
the type, the constant array, the exit-code table in both directions, and the
runner's ingest. Counting the call sites is next.

## Where the check lives (two pieces, read before running)

- Kind B derived check: src/checks.ts:3260 `dualReviewDecorrelation`,
  id `dual-review-decorrelation`, type `verdict`, requiresContext true.
- Gate runner around it: scripts/check-dual-review.mjs:1, gate id
  `check-dual-review`, unit label "review verdicts examined for decorrelation".

The three dimensions, src/checks.ts:2896:
    export const DECORRELATION_DIMENSIONS: readonly string[] = [
      "produced-by", "framing", "review-contract",
    ];
The comparison is: for each dimension, group the committed verdicts by phase,
canonicalise the value, and REDDEN when one canonical value occurs in >= 2 of
the group (src/checks.ts:3519-3529). There is NO exemption arm anywhere in
that loop, and no reference to a declared single-family condition. Confirmed by
grep next.

The runner's status map (scripts/check-dual-review.mjs:251, :335, :344):
  evaluate() returns only "error" | "red" | "green"; the runner adds
  "not-applicable" when units === 0. So the gate today emits exactly the four
  framework words and nothing else.

## 2. The gate RUN, for real. Failure arm first.

Interpreter: node v22.22.2 (/opt/node22/bin/node), container default.
Invocation: node /home/user/tiphys-ai-helmsman/scripts/check-dual-review.mjs <dir>
Repo working tree NOT modified; all fixtures under
/tmp/claude-0/m4-probes/third-status/run/.

FAILURE ARM A, empty directory:
  check-dual-review: error (0 review verdicts examined for decorrelation)
  .../empty/charter.yaml does not exist, so the declared mode's merge-authority
  is unknown and no decorrelation verdict can be reached; a merge check that
  cannot determine the regime reports error, never green
  EXIT=21

FAILURE ARM B, the repository itself:
  same error, /home/user/tiphys-ai-helmsman/charter.yaml does not exist. EXIT=21
  So THIS REPOSITORY CANNOT RUN ITS OWN check-dual-review GATE non-vacuously
  today: there is no charter.yaml at the root, and zero verdict documents.

FAILURE ARM C, usage error: EXIT=21 with the usage line.

So the probe CAN tell "it works" from "I could not test it": all three failure
arms produce distinct, non-silent output with exit 21.

MINIMUM FIXTURE that makes it run for real (four files):
  charter.yaml          kind: charter / delivery-mode: full
  assurance-modes.yaml  modes: [ {id: full, merge-authority: delegated-under-conditions} ]
  delivery/review/a.yaml  kind: verdict, phase, produced-by, framing, review-contract, ...
  delivery/review/b.yaml  same, different dimension values
Neither the charter nor the modes doc nor the verdicts are schema-validated on
this path; the check reads the fields directly.

GREEN, decorrelated pair:
  check-dual-review: 1 registered check(s) named dual-review-decorrelation ran over 2 verdict(s)
  REPORT dual-review-decorrelation 2 verdict(s) for phase m9-p1 are distinct on produced-by, framing, review-contract
  check-dual-review: green (2 review verdicts examined for decorrelation)
  EXIT=0
Gate record written: status green, units 2, no vacuous field.

## 3. Same family, different spellings: GREEN. Reproduced.

Values taken verbatim from this repository's own two most recent clean-room
reviews, delivery/review/clean-room-m3-exit-subject-criteria.md:5 and
delivery/review/clean-room-m3-exit-subject-hazard.md:5:
  produced-by: "Claude, Sonnet 5 (claude-sonnet-5)"
  produced-by: "Claude Opus 5 (Anthropic model family)"

  REPORT dual-review-decorrelation 2 verdict(s) for phase m9-p1 are distinct on produced-by, framing, review-contract
  check-dual-review: green (2 review verdicts examined for decorrelation)
  EXIT=0

The second value literally contains the words "Anthropic model family" and the
first is the same vendor, and the gate reports them decorrelated. CONTROL: with
both set to `family-alpha` the same fixture is RED, exit 1, naming
#/produced-by. So the check compares STRINGS, not families, and the only thing
it can detect is a byte-for-byte (post-canonicalisation) repeat.

## 4. Absent field: RED, and INDISTINGUISHABLE BY STATUS from a violation

Five variants run, all on the same otherwise-green fixture, changing only
`produced-by` in one of the two verdicts:

| variant | gate status | exit | pointer |
|---|---|---|---|
| absent from ONE verdict | red | 1 | #/produced-by |
| absent from BOTH | red | 1 | #/produced-by (4 lines) |
| empty string | red | 1 | #/produced-by |
| null | red | 1 | #/produced-by |
| a list | red | 1 | #/produced-by |
| (control) identical value in both | red | 1 | #/produced-by |

establishField, src/checks.ts:3099, returns four kinds: `absent`,
`unusable` (non-string, empty, whitespace-only), `uncanonical` (outside
printable ASCII after NFKC), `established`. unestablishedReason,
src/checks.ts:3163, gives each its own SENTENCE:
  absent      -> "declares no produced-by"
  unusable    -> "declares produced-by as null, which names no value"
  uncanonical -> "declares produced-by using the character U+XXXX at position N..."
and the correlation message is deliberately different in wording
(src/checks.ts:3494 comment: "so 'could not be shown decorrelated' and 'was
shown correlated' never print the same line").

**THE DISTINCTION IS IN THE STRING, NOT IN THE STATUS.** Both arms are a
`Diagnostic` pushed onto `violations[]`, both make the gate red, both exit 1.
A consumer reading the gate record cannot tell them apart without
pattern-matching the detail text, which is the mechanism src/gates/result.ts:34
says cost this project four rounds and is why `vacuous` is a structural field.

This matters for DR-0038 more than anything else measured here: the check's
existing design ALREADY wanted a distinction it could not express in the status
vocabulary, and solved it with prose. DR-0038 asks for a third thing that is
"neither green nor red", and prose is the precedent that will be reached for.

## 5. THERE IS ALREADY A THIRD STATUS WORD IN THIS REPOSITORY, AND IT IS `amber`

  schemas/report.schema.json:507
      "result": { "type": "string", "enum": ["green", "red", "amber", "not-applicable", "error"] }
  schemas/report.schema.json:555 and :564
      "result": { "type": "string", "enum": ["red", "amber", "error"] }

And the repository's own comment at schemas/report.schema.json:511 says what it
is worth today:
  "`amber` is a fourth: it is in this enum and it is not one of the runner's
   four statuses (src/gates/result.ts:46), so no producer defines an exit code
   for it at all."
test/report-contract.test.ts:1645 asserts the same sentence.

SO THE SPLIT IS EXACT AND IT IS THE SIZE OF DR-0038's MECHANISM:
 - The REPORTING layer (schemas/report.schema.json, schemas/work-history.schema.json
   by $ref) ALREADY admits a third word.
 - The GATE layer (src/gates/result.ts, src/gates/schemas/gate-result.schema.json,
   src/gates/run.ts) does not, and nothing emits `amber`.

DR-0038's third status is therefore not a new idea in this codebase. It is
making an existing reporting vocabulary word REACHABLE from a gate.

## 6. MEASURED: how big is a fifth gate status? Eleven lines to build, and it
##    then reports a FALSE GREEN.

Scratch clone: /tmp/claude-0/m4-probes/third-status/clone at f7576f4 (the probe
head), `npm ci` exit 0, baseline `npm run build` exit 0. node v22.22.2.

STEP 1, type only. Added `| "declared-exception"` to GateStatus and to
GATE_STATUSES. `npm run build` EXIT=2 with EXACTLY ONE error:
  src/gates/run.ts(2132,5): error TS7053: Element implicitly has an 'any' type
  because expression of type 'GateStatus' can't be used to index type
  '{ declared: number; applicable: number; verdict: number; green: number;
  red: number; "not-applicable": number; error: number; vacuous: number; }'.

ONE. The type system does NOT force any consumer to handle a new status:
exitCodeForStatus and statusForExitCode both fall through, and decideAggregate
uses `if` chains, not an exhaustive switch.

STEP 2, complete the edit. Added EXIT_DECLARED_EXCEPTION = 22, an arm in each
of the two exit-code functions, the counts key, and the enum value in
src/gates/schemas/gate-result.schema.json. `npm run build` EXIT=0.

  git diff --stat
   src/gates/result.ts                       | 10 +++++++++-
   src/gates/run.ts                          |  1 +
   src/gates/schemas/gate-result.schema.json |  2 +-
   3 files changed, 11 insertions(+), 2 deletions(-)

STEP 3, end to end through the REAL runner with a toy gate emitting the new
status with units 2 and DR-0038's own sentence as the detail.

  node probe/toy-gate.mjs --result ...   ->  GATE EXIT=22, record written:
    "status": "declared-exception", "units": 2,
    "detail": "reviewed twice, but not by two families: the project declares one model family"

  tiphys gates run, bundle of ONE (the exception gate alone):
    gates: declared 1 applicable 1 verdict 0 green 0 red 0 not-applicable 0 error 0 vacuous 0
    gates: toy-exception: declared-exception: reviewed twice, but not by two families: ...
    gates: no applicable gate
    RUNNER EXIT=21
  summary.json counts carried "declared-exception": 1. The aggregate exit is 21
  (fail closed, which is what DR-0038 constraint 1 wants) but the REASON IS
  FALSE: it says "no applicable gate" while applicable is 1. It falls into
  decideAggregate's `counts.verdict === 0` vacuity branch (src/gates/run.ts,
  the CR-800 comment), because `verdict` increments only for green or red.

  tiphys gates run, bundle of TWO (one ordinary green + the exception gate):
    gates: declared 2 applicable 2 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
    gates: toy-green: green: fine
    gates: toy-exception: declared-exception: reviewed twice, but not by two families: ...
    gates: every applicable gate is green
    RUNNER EXIT=0
    summary.json: "exitCode": 0, "reason": "every applicable gate is green",
                  counts."declared-exception": 1

**THAT IS THE ANSWER TO "HOW BIG IS THE MECHANISM".** The VOCABULARY is eleven
lines and it compiles and it travels. The AGGREGATE SEMANTICS is the whole job,
and getting it wrong is SILENT: the compiler said nothing, the runner printed
"every applicable gate is green" over a bundle containing a gate that had just
said the reviews were not decorrelated, and it exited 0. That is precisely the
bundle-level false green CLAUDE.md's T-009 section and M2-C-2 exist against.

decideAggregate (src/gates/run.ts:1692) is the site. Its precedence today is:
error > red > verdict==0 > requiredNotApplicable. A third status must be
placed in that order explicitly, and it must decide whether it counts toward
`verdict`. Neither is bought by the enum edit.

## 7. Item 5, THE HARD QUESTION: what stops a false single-family declaration?

FIRST, what the kernel CANNOT see today, measured:

  grep -rn 'resolved-model|model-resolution|resolvedModel|resolved-tier' \
    schemas/ roles/ scripts/ templates/ src/ bin/ *.yaml
  GREP EXIT=1   (no hits)

So nothing in the kernel ever records which model actually ran. `produced-by`
is a free-form string written by the reviewer. The kernel cannot verify a
family at all; it can only check a declaration against the project's OWN
COMMITTED ARTIFACTS.

There IS an existing home for the declaration: role-model-config.yaml:84
already carries `review-model-family: must-differ-from-sibling-review` for the
clean-room-reviewer role, and the schema's enum
(schemas/role-model-config.schema.json:73) already contains `unconstrained`.
Nothing reads it (schemas/role-model-config.schema.json:5 says so). A
single-family declaration is `unconstrained` plus the fact that makes it true.

PROPOSED CHECK, implemented and run:
/tmp/claude-0/m4-probes/third-status/probe5/declared-family-falsifier.mjs

  THE FALSIFIER: a project declaring "only one model family is available here"
  is CONTRADICTED by its own corpus when the set of distinct canonical
  `produced-by` values across EVERY committed verdict, ALL phases, has more
  than one member.

Six arms run, failure arms included:

| arm | printed | exit |
|---|---|---|
| A honest declaration, corpus consistent | DECLARED-EXCEPTION, names the family and the corpus size | 22 |
| B false declaration, an older phase used another family | RED "THE DECLARATION IS CONTRADICTED BY THIS PROJECT'S OWN CORPUS ... also record: family-beta" | 1 |
| C no declaration, produced-by repeats | RED (today's behaviour preserved) | 1 |
| D exception claimed but framing ALSO repeats | RED "the declared exception covers FAMILY only" | 1 |
| E two families actually used | GREEN | 0 |
| F charter absent | ERROR | 21 |

Arm A's sentence, verbatim from the run, is DR-0038's ask:
  "DECLARED-EXCEPTION phase m9-p1: reviewed twice, but not by two families.
   The project declares one available family (family-alpha) and its whole
   committed corpus of 2 verdict(s) uses that one value and no other.
   framing and review-contract ARE distinct."

WHAT THIS CHECK CANNOT CATCH, and the list is not short:

1. **A project that has only ever USED one family while a second was
   AVAILABLE.** The corpus records what was used, never what was available.
   Availability is not a property of any file. This is the whole class the
   declaration is about, and the check is silent on it.
2. **One family written under two strings, or two families written under one.**
   `produced-by` is prose. Writing `family-alpha` on a review actually produced
   by another family satisfies the check perfectly. Measured directly in section
   3: the two real reviews in this repository, both Anthropic, pass as
   decorrelated because they are spelled differently. The inverse is equally
   available and cheaper.
3. **A first merge.** A brand-new project's corpus is the two verdicts under
   review. There is no history to contradict, so the check is weakest exactly
   at the first use, which is when a wrong declaration does the most damage.
4. **A deleted or never-committed sibling.** The corpus is what is committed.
   Dropping the other family's verdicts before merging removes the
   contradiction.
5. **A changed declaration.** The check reads the CURRENT declaration; a
   project that used two families for ten phases and then declares one family
   is only caught while the old verdicts remain in `delivery/review/`.

So the honest statement of what it buys: it converts a false declaration from
UNCHECKABLE into SELF-CONTRADICTING, for the subset of falsehoods a project
has already written down somewhere else. It is a consistency check, not a
truth check, and DR-0038's plan should say so in those words rather than
present it as verification of the family.

## 8. Item 6: what M2-C-3 and SC-011 each FORBID here. Measured, not argued.

### M2-C-3 (cannot reach a verdict -> ERROR) forbids TWO things

(a) **It forbids calling the single-family case an error.** The check HAS
reached a verdict: it found two committed verdicts, it compared three
dimensions, two were distinct and one repeated, and it knows why. "Could not
look" is false. src/gates/result.ts:16 defines error as "the gate could not
reach a verdict".

(b) **It forbids letting a third status FALL THROUGH onto error's exit code,
which is what happens by default.** Measured, the shipped fall-through:

    green                -> exit 0
    red                  -> exit 1
    not-applicable       -> exit 20
    error                -> exit 21
    declared-exception   -> exit 21      <- fall-through
    anything-else        -> exit 21

src/gates/result.ts:70. A fifth status added to the TYPE and not to
`exitCodeForStatus` compiles clean (measured: one TS error total, and it is not
here) and then exits 21, which is indistinguishable from a crashed gate. That
is exactly the distinction M2-C-3 exists to protect, destroyed silently.
A third status needs its OWN exit code. I used 22 and it worked end to end.

### SC-011 (unmet precondition -> not-applicable with the precondition as DATA) forbids the cheap route

The cheap implementation is "declare single-family as a PRECONDITION, report
not-applicable, put the declaration in the PreconditionRecord". SC-011 makes
that legal-looking. **Measured, it is a silent green.**

`check-dual-review` is `applicability: conditional` (gate-registry.yaml:286).
The runner only names a not-applicable gate when its applicability is
`required` (src/gates/run.ts:2140). Real runs, same toy not-applicable gate
carrying a populated PreconditionRecord, beside one ordinary green:

    applicability: conditional
      gates: declared 2 applicable 1 verdict 1 green 1 red 0 not-applicable 1 error 0 vacuous 0
      gates: toy-na: not-applicable: reviewed twice, but not by two families
      gates: every applicable gate is green
      RUNNER EXIT=0

    applicability: required
      gates: required gate(s) not applicable: toy-na
      RUNNER EXIT=20

So routing DR-0038 through not-applicable on the gate AS IT IS REGISTERED TODAY
produces a bundle that exits 0 and prints "every applicable gate is green" over
a phase that was reviewed twice by one family. The PreconditionRecord is in the
record JSON and nothing in the aggregate reads it.

SC-011 therefore forbids not-applicable here on its own terms as well: the
precondition was NOT unmet. The gate applies, it ran, it examined two verdicts.
Calling it not-applicable asserts something false about the precondition, which
is the abuse src/gates/result.ts:18 names.

**Both constraints point the same way: the third status must be a FIFTH WORD
with its own exit code and its own place in `decideAggregate`, not a reuse of
`error` and not a reuse of `not-applicable`.**

## 9. Suite blast radius of the fifth status: EXACTLY TWO tests

Toolchain: node v22.22.2 (/opt/node22/bin/node, container default, BELOW the
declared floor of >=26). Build state: `dist/` BUILT (`npm run build` exit 0
before each run). Invocation: `npm test`. Clone at f7576f4.

| run | tests | pass | fail | SKIPPED | exit |
|---|---|---|---|---|---|
| BASELINE (patch reverted, rebuilt) | 849 | 845 | 2 | 2 | 1 |
| PATCHED (fifth status) | 849 | 843 | 4 | 2 | 1 |

The two BASELINE failures are pre-existing on this toolchain and are NOT the
patch's:
 - "a staged install of the built package reproduces the captured contract
   live" (test/doctor.test.ts:934). This is the exact test CLAUDE.md standing
   warning 12's 2026-08-20 note names as floor-DEPENDENT without being
   floor-GATED.
 - "a precondition command exiting nonzero is error, not a skip, whenever a
   path-shaped argv element cannot be opened..." (test/gates.test.ts:3571).
   Failure text: `Error: EACCES: permission denied, open
   '/tmp/claude-0/m4-probes/third-status/clone/src/gates/pin.ts'` from an
   unprivileged child. That is standing warning 1's `/tmp/claude-0` traversal
   trap, a property of where I put the clone, not of the branch.

THE PATCH'S OWN TWO, both in test/gates.test.ts, both pinning the vocabulary:
 - test/gates.test.ts:207 "the runner maps four fixture gates onto green red
   not-applicable and error with matching summary counts". deepStrictEqual on
   the counts object; the new key `declared-exception: 0` breaks it.
 - test/gates.test.ts:726 "a result record with a status outside the enum is
   rejected as INVALID naming the pointer". Asserts the message text
   'is not one of the permitted values "green", "red", "not-applicable", "error"'.

So: the TESTS are the guard on the vocabulary, not the type system. Two test
edits, three source edits, eleven inserted lines. That is the floor for the
vocabulary. It is NOT the cost of the mechanism, because the aggregate
semantics in section 6 is untouched by all of it and is what produces the false
green.

## 10. WHAT THIS PROBE DID NOT COVER

1. **I did not run the real `check-dual-review` gate through `tiphys gates run`
   with the registry.** I ran the script directly and ran the RUNNER with toy
   gates. The registry path (`--registry gate-registry.yaml`) needs the
   `pull_request` event and phase parameters; I did not set those up. The
   precondition arm (`--precondition`) I read but did not exercise.
2. **I did not test the `schemas/work-history.schema.json` sibling of the
   report `gateResult` $ref.** The report schema comment says the definition is
   SHARED by $ref under the key `gate-evidence`. A third status reaching the
   report layer therefore touches work histories too, and I did not measure it.
3. **I did not exercise the M2-C-2 rewrite against the new status.** `units 0`
   plus `declared-exception` is not rewritten by `makeGateResult`, which only
   rewrites green. A vacuous third status is therefore constructible today, and
   I noticed it by reading src/gates/result.ts:179 rather than by forcing it.
   That is a GAP in my probe, and it is exactly the shape M2-C-2 exists against.
4. **I did not measure the `report-parity-arithmetic` derived check against an
   `amber` gate result.** `amber` is admitted by the report schema; whether the
   derived checks handle it is untested here.
5. **I did not establish the suite on the FLOOR toolchain (node >=26).** Both
   suite numbers are v22.22.2. Two failures pre-exist there and may not on the
   floor; the ATTRIBUTION (baseline 2, patched 4, difference exactly the two
   vocabulary tests) is toolchain-independent because both arms used the same
   interpreter, but the absolute counts are not the floor's.
6. **My falsifier probe is a PROBE, not kernel code.** It parses YAML with
   line-oriented regexes and reimplements canonicalisation. It measures whether
   the COMPARISON is computable from committed files. It is not a proposed
   implementation.
7. **Nothing here establishes whether a project's single-family declaration is
   TRUE.** Section 7 item 1 is the whole class and no artifact in this
   repository reaches it.

## 11. What this probe CANNOT distinguish

Nothing material. Every claim above has a command and an exit code behind it.
The one place I am reporting a READING rather than a RUN is section 10 item 3
(the M2-C-2 rewrite not firing for a non-green status); that is read from
src/gates/result.ts:179 and I did not force it, so treat it as a claim to
re-measure rather than as established.
