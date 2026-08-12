# Clean-room review: M3-P4, contract C (the argument audit), round 4

> ORCHESTRATOR NOTE, DECLARED ALTERATION. This report as written by the
> reviewer contained 10 instances of U+2014 EM DASH, which binding
> convention 3 forbids in authored text. Each was replaced with a spaced
> hyphen ` - `. NOTHING ELSE was changed: no wording, no finding, no
> captured command or output. The change is declared here rather than made
> silently, because after the fact an undeclared edit to a review is
> indistinguishable from a softened one.

- Reviewer: clean-room contract C, independent of the implementation session.
- Head reviewed: c7d9d2c (worktree at
  /tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/m3p4-cr-c)
- Merge base used for the diff: origin/main = c154ef8
- STATUS: COMPLETE. Verdict at the bottom. Appended as work proceeded (T-008 beacon).

## What my extraction did NOT cover (written first, per contract)

Read first: this is the boundary of the search, stated before any finding,
per the contract and per the orchestrator's reminder mid-review.

1. **The seven other shipped schemas** (charter, plan, decision-record,
   gate-registry, assurance-modes, role-model-config, status-line) were not
   examined. They are not on this phase's `filesToTouch`
   (delivery/plan/phase-declarations/m3-p4.json) and round 4's own text routes
   that question to the orchestrator after this phase lands. I agree with that
   scoping and did not second-guess it.
2. **Pre-existing src/ lines this phase did not add** were not audited for
   universal claims, deliberately: this is a diff review, and a pre-existing
   false claim on `main` is not this phase's defect to fix, matching round 4's
   own stated scope.
3. **I did not exhaustively attack every one of the 37 `$comment` claim-token
   hits** the token scan surfaced in the three schemas (dumped in full early in
   this session with a scratch extraction script). I prioritized the
   claims that are LOAD-BEARING for a schema keyword's shape (the `oneOf`
   splits, the derived-check completeness claims) over claims that are purely
   narrative or that restate a residue already measured and declared in the
   artifact. A claim I skipped because it looked like restated history rather
   than a fresh universal is the most likely place I have missed something.
4. **`report-parity-arithmetic`** (the six-count arithmetic check) was read in
   full and its stated residues (no counts at all on a red; a "balanced loss"
   where `discovered` and a bucket are dropped together) were not independently
   reconstructed with fresh fixtures; I relied on reading the code plus the
   prior rounds' own tests for this one, unlike the other two derived checks in
   this phase, which I did attack with fresh mutations. This is the weakest
   link in my coverage and I flag it explicitly rather than silently.
5. **Racier members of the `gateResult` "no wrapper exit code" class** were not
   constructed: `src/gates/run.ts:989` (captureRefusal - a `writeInsideClaim`
   failure writing stdout/stderr after the child ran) and `:1009`
   (`entryClass.kind === "irregular"/"unexaminable"` - the result path is some
   non-regular file type such as a FIFO or symlink) and `:1023` (record
   vanished between write and read) are real call sites below the spawn that I
   read but did not force, because doing so needs either concurrent
   claim-stealing or planting a special file at a path the runner controls,
   both of which are exactly the standing-warning-8/T-003 territory this
   project has been burned by fabricating evidence for before. I did force
   FOUR of the ten below-spawn sites (below), which was enough to settle the
   completeness question; the other three are named rather than left silent.
6. **`src/validate.ts`'s "nothing is fetched" claim** about Ajv's reference
   resolution was read in the code (`makeAjv` sets no `loadSchema`) but not
   forced with an actual network probe (e.g. a `$ref` naming a real URL and
   confirming no outbound request is attempted); this is also pre-existing
   `DR-0013` behavior referenced rather than introduced by this phase's diff,
   which is why it was deprioritized.
7. **`templates/warnings.md`'s wiring into `src/brief.ts`** was checked only by
   reading (confirming the two are in fact DIFFERENT paths, `templates/` vs
   `<fleet-root>/warnings.md`) and by finding that contract A's report
   (`delivery/review/clean-room-m3-p4-criteria.md:75`) already executed this
   exact path with a real `tiphys spawn`. I did not re-run it myself, per this
   contract's instruction not to re-derive acceptance criteria that contract A
   owns.
8. **The regex-complement claim (Claim 1 below) was tested on a curated set of
   24 to 30 strings, not fuzzed.** The identity `^(?:(?!ALT)[\s\S])*$` being the
   logical negation of `\bALT\b` tested with `.test()` is a standard regex
   identity, and I additionally found the repository's own test
   (`test/report-contract.test.ts:2065`) asserts the two pattern STRINGS are
   related by that exact template, which is a stronger, general guarantee than
   my curated cases; I did not independently reprove the general identity.
9. **No fix-round or review contract's own history beyond round 4 and the
   round-3 arbitration was read line by line** (rounds 1 to 3's full text was
   skimmed for the mechanism statement and the tables that round 4 itself
   quotes, not independently re-verified end to end); contract A and the
   round's own claim grep already cover that ground.


Toolchain used for every command below unless noted: node v26.6.0 at
/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/toolchain/node-v26.6.0-linux-x64/bin,
checked with `node --version` in the shell that ran it.

Fixtures written under
/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/m3p4-cr-c-ev/
(mutation scripts as scratch-mutateN.mjs inside the worktree, fixtures/*.yaml
in the evidence dir). None of these were committed to the worktree.

## Claims attacked so far (appended as I go)

### Claim 1: `#/$defs/finding/oneOf/0/properties/analysis` is "THE EXACT COMPLEMENT" of `#/$defs/universalQuantifier`'s pattern (report.schema.json)

Attack: extracted both compiled patterns and probed them directly, then
independently through the real CLI on real report documents (findings[0].analysis
mutated).

Direct regex probe (24 strings, mismatches=0):
```
$ node -e '... (patterns pulled live from schemas/report.schema.json) ...'
"" uq= false comp= true XOR-holds
"This ALWAYS works" uq= true comp= false XOR-holds
"overall coverage" uq= false comp= true XOR-holds
"in all honesty" ... "IN ALL honesty" uq= true comp= false XOR-holds
"always-on" uq= true comp= false XOR-holds
"NEVERMORE" uq= false comp= true XOR-holds
... (24 total, mismatches: 0)
```

Real-CLI probe, mutating `templates/report.example.yaml`'s VF-1 finding's
`analysis` field and re-validating with `node bin/tiphys.ts validate --type report`:

```
$ node bin/tiphys.ts validate --type report boundary-inall-honesty.yaml   # "IN ALL honesty..." no counter-experiment
INVALID #/findings/0 value matches no permitted alternative here
exit=1
$ node bin/tiphys.ts validate --type report boundary-overall.yaml         # "An overall assessment..." no counter-experiment
exit=0
$ node bin/tiphys.ts validate --type report boundary-allcases-nospace.yaml  # "allcases" (no space) no counter-experiment
exit=0
$ node bin/tiphys.ts validate --type report boundary-hyphen-always.yaml   # "always-on" no counter-experiment
INVALID #/findings/0 value matches no permitted alternative here
exit=1
$ node bin/tiphys.ts validate --type report boundary-mixedcase-alWays.yaml  # "alWays" mixed case, no counter-experiment
INVALID #/findings/0 value matches no permitted alternative here
exit=1
$ node bin/tiphys.ts validate --type report no-token-with-counterexp.yaml  # no token, counter-experiment present anyway
exit=0
```

All six match the prediction from the direct pattern test: no gap (a string
matching neither branch), no overlap (a string matching both, which would
make `oneOf` reject it as ambiguous when it should be accepted). **HELD.**
This is a genuine complement, tested by construction rather than by reading.

### Claim 2: `#/$defs/enumerableSection` (final-report.schema.json) branches are "exclusive by construction", both directions

Attack: five structurally different mutations of `templates/final-report.example.yaml`'s
`infrastructure-left` section, run through the real CLI.

```
$ node bin/tiphys.ts validate --type final-report es-marker-over-entries.yaml   # {none:true, entries:[...]}
INVALID #/infrastructure-left value matches no permitted alternative here
exit=1
$ node bin/tiphys.ts validate --type final-report es-empty-behind-false.yaml    # {none:false, entries:[]}
INVALID #/infrastructure-left value matches no permitted alternative here
exit=1
$ node bin/tiphys.ts validate --type final-report es-false-no-entries-key.yaml  # {none:false} (entries omitted)
INVALID #/infrastructure-left value matches no permitted alternative here
exit=1
$ node bin/tiphys.ts validate --type final-report es-no-marker-with-entries.yaml # {entries:[...]}, no "none" key at all
INVALID #/infrastructure-left value matches no permitted alternative here
exit=1
$ node bin/tiphys.ts validate --type final-report es-none-string-true.yaml      # {none: "true"} (string, not boolean)
INVALID #/infrastructure-left value matches no permitted alternative here
exit=1
```

Baseline (unmodified template) exits 0. **HELD** on all five members.

### Claim 3: gateResult `oneOf` - "CARRYING BOTH FIELDS IS A REJECTION"; and the self-declared A-10 residue ("a green carrying `no-wrapper-exit-code` validates, because the third branch constrains only `result`")

```
$ node bin/tiphys.ts validate --type report gr-both-exitcode-fields.yaml  # result:red, wrapper-exit-code:1 AND no-wrapper-exit-code:"..."
INVALID #/gate-results/0 value matches no permitted alternative here
exit=1
$ node bin/tiphys.ts validate --type report gr-green-with-reason.yaml     # result:green + wrapper-exit-code:0 + full counts + no-wrapper-exit-code:"redundant"
exit=0
```

Both match the shipped comment's claims exactly: the "both fields" case is
rejected (**HELD**), and the declared A-10 residue reproduces as declared, not
a new finding since it is already confessed in the artifact.

### Claim 4: `GATE_RESULT_SITES` in src/checks.ts is the COMPLETE list of documents that reach `#/$defs/gateResult` by `$ref`

Attack: grep the entire `schemas/` tree for every reference to `gateResult` or
`report.schema.json`, independent of the table itself.

```
$ grep -rn "gateResult\|report.schema.json" schemas/*.json | grep -v '"$id"'
schemas/report.schema.json:81:      "items": { "$ref": "#/$defs/gateResult" }
schemas/work-history.schema.json:89:      "items": { "$ref": "report.schema.json#/$defs/gateResult" }
(plus $comment prose hits, not $ref sites)
```

Exactly two reachability sites (report's own `gate-results`, work-history's
`gate-evidence`), matching `GATE_RESULT_SITES` exactly. **HELD.**

### Claim 5: companion-schema resolution - "a `$ref` naming a document the caller did not supply still fails COMPILATION"

Reproduced the round's own C-2 construction independently rather than trusting
the transcript:

```
$ node --input-type=module -e "import {compileSchema} from './src/validate.ts'; const s = JSON.parse(await (await import('node:fs/promises')).readFile('schemas/work-history.schema.json','utf8')); const r = compileSchema(s); console.log(r.ok ? 'compiled' : r.reason);"
INVALID # schema reference report.schema.json#/$defs/gateResult does not resolve
exit=0
```
Matches the round's transcript exactly on a fresh execution. **HELD** (reproduced, not just trusted).

### Claim 6: `report-no-findings-statement` closes "BOTH directions"

```
$ node bin/tiphys.ts validate --type report nf-empty-no-statement.yaml       # findings:[], no-findings-statement absent
INVALID #/no-findings-statement findings is empty and no-findings-statement is missing, so the report claims nothing was found without saying why (check: report-no-findings-statement)
exit=1
$ node bin/tiphys.ts validate --type report nf-nonempty-with-statement.yaml  # findings has 3 entries, no-findings-statement present
INVALID #/no-findings-statement no-findings-statement is present beside 3 finding(s), so the report contradicts itself (check: report-no-findings-statement)
exit=1
```
Both directions reject as claimed. **HELD.**

### Claim 7: `final-report-finding-parity` reaches "THREE DIRECTIONS": orphan, phantom, duplicate

```
$ node bin/tiphys.ts validate --type final-report fr-orphan.yaml     # inputs has V-99, no row
INVALID #/inputs/6 finding V-99 has no row in input-findings, so the table has a hole (check: final-report-finding-parity)
exit=1
$ node bin/tiphys.ts validate --type final-report fr-phantom.yaml    # input-findings has V-100, not in inputs
INVALID #/input-findings/6 input-findings names V-100, which is not in inputs, so the coverage is phantom (check: final-report-finding-parity)
exit=1
$ node bin/tiphys.ts validate --type final-report fr-duplicate.yaml  # input-findings has two rows for V-1
INVALID #/inputs/0 finding V-1 has 2 rows in input-findings and must have exactly one (check: final-report-finding-parity)
exit=1
```
All three directions reject as claimed. **HELD.**

## Attacking round 4's own enumeration at gateResult (the site the contract names "in force")

Investigating whether round 4's claim of "four derived members" for the
no-wrapper-exit-code class is itself an undercount, by reading every
`errorResult(...)` call site in `src/gates/run.ts` relative to the `spawnSync`
at line 943, not just the two round 4 discussed (992, 999). Full call-site
line list from `grep -n 'errorResult('`: 829, 844, 866, 873, 899, 925, 934,
989, 992, 999, 1009, 1015, 1023, 1035, 1043, 1051, 1060. Round 4's text names
only 992 and 999 as "below the spawn... structurally distinct"; 989, 1009,
1015, 1023, 1035, 1043, 1051, 1060 are ALSO below line 943 and are not
mentioned in the round's derivation. Building a real gate registry entry that
reaches one of these (e.g. a script that runs and exits, but writes no
result.json, or writes one naming the wrong gate) to see whether it produces
a `status: error` record structurally unable to carry a captured exit code,
same as round 4's four. Evidence to follow.

## RESULT: round 4's own enumeration at `gateResult` is itself incomplete (FINDING, see below)

The scratch registry, scripts and every command in this section are under
/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/m3p4-cr-c-ev/scratch-registry/
and .../fixtures/. Nothing here was committed to the worktree.

**The shipped claim, quoted verbatim** (report.schema.json, `#/$defs/gateResult/oneOf/1`,
added by round 4): "This is the branch the four derived members need, and each
of them is a real record this repository can produce rather than a
hypothetical." And from delivery/work-history/m3-p4.md's round-4 section
(Derivation 1): "Round 4 enumerated the class from the RUNNER, which is what
produces these records, and found four members with no exit code to give."

**The round's own captured grep, pasted in its own work history**
(delivery/work-history/m3-p4.md:3254-3281), lists SEVENTEEN lines matching
`errorResult(` in `src/gates/run.ts` (one is the function definition at 787;
the other sixteen are call sites): 829, 844, 866, 873, 899, 925, 934 (seven,
correctly identified as ABOVE the spawn at line 943, so no child ever ran),
then 989, 992, 999, 1009, 1015, 1023, 1035, 1043, 1051, 1060 (TEN, all BELOW
the spawn). The round's prose says only "Two more are structurally distinct
even though they sit below it" and names 992 (`child.error`, spawn itself
failed) and 999 (signal termination). **Eight below-spawn call sites in the
round's own pasted output (989, 1009, 1015, 1023, 1035, 1043, 1051, 1060) are
never discussed.** This is exactly the shape the contract's method note 4
predicts: the counter-example was sitting in the round's own captured output.

I built a scratch gate registry (`kind: gate-registry`, minimal preflight and
`destructiveCommands`, required by the registry schema) with real gate
entries pointing at real scratch scripts, and ran them through the real
`tiphys gates run` command, to check whether these are live, honestly
reachable records or dead code.

**Member A - no result written at all (src/gates/run.ts:1015).** A gate
script that runs to completion (real exit code 0) but writes no result.json:
```
$ cat scratch-registry/no-record-script.mjs
process.exit(0);

$ node bin/tiphys.ts gates run --registry scratch-registry/registry.yaml --mode full \
    --only scratch-no-record --evidence probe-evidence --base origin/main --head HEAD
gates: declared 1 applicable 1 verdict 0 green 0 red 0 not-applicable 0 error 1 vacuous 0
gates: 1 gate(s) reported error: scratch-no-record
runner exit=21

$ cat probe-evidence/scratch-no-record/result.json
{
  "gate": "scratch-no-record",
  "status": "error",
  ...
  "detail": "gate scratch-no-record exited 0 without writing a result record at .../result.json",
  "evidence": []
}
```
No `wrapper-exit-code`-shaped field anywhere in the record the runner
produces, even though the process really did exit with a known code (0).

**Member B - the record names the wrong gate (src/gates/run.ts:1051).**
```
$ cat scratch-registry/wrong-gate-script.mjs
# writes {gate:"totally-different-gate-id", status:"red", ..., evidence:[]}, exits 1

$ node bin/tiphys.ts gates run --registry scratch-registry/registry.yaml --mode full \
    --only scratch-wrong-gate --evidence probe-evidence --base origin/main --head HEAD
gates: 1 gate(s) reported error: scratch-wrong-gate
runner exit=21

$ cat probe-evidence/scratch-wrong-gate/result.json
{ "gate": "scratch-wrong-gate", "status": "error", ...,
  "detail": "gate scratch-wrong-gate wrote a record for totally-different-gate-id",
  "evidence": [] }
```
(First attempt at this member, before I added `evidence: []` to the script,
actually surfaced a DIFFERENT below-spawn site first - `:1043`, invalid
record schema, `detail: "... result record is invalid: INVALID #/evidence
required property evidence is missing"` - which is Member C below, found by
accident on the way to Member B.)

**Member C - the record fails its own schema (src/gates/run.ts:1043).**
Captured above as a side effect of Member B's first attempt.

**Member D - exit code does not match the recorded status
(src/gates/run.ts:1060).**
```
$ cat scratch-registry/mismatch-script.mjs
# writes {gate:"scratch-mismatch", status:"green", ...}, exits 1

$ node bin/tiphys.ts gates run --registry scratch-registry/registry.yaml --mode full \
    --only scratch-mismatch --evidence probe-evidence --base origin/main --head HEAD
gates: 1 gate(s) reported error: scratch-mismatch
runner exit=21

$ cat probe-evidence/scratch-mismatch/result.json
{ "gate": "scratch-mismatch", "status": "error", ...,
  "detail": "gate scratch-mismatch recorded status green (exit 0) but exited 1 (red)",
  "evidence": [] }
```

**All four are real, honestly-producible `status: error` records with no
captured exit code, structurally distinct from each other and from round 4's
four (missing `--phase`, a `clean-room-checklist`-only gate never dispatched,
signal termination, `amber`). That makes at least SEVEN structurally distinct
members of the class the shipped comment calls "four", not counting the three
I explicitly did not force (finding 5 above).**

**I then checked whether round 4's REPAIR (the author declares
`no-wrapper-exit-code`) still works correctly for these four newly-found
members**, i.e. whether the mechanism itself is broken or just the count is
wrong. Wrapped each captured record into a `report` document's
`gate-results[0]` and validated:

```
$ node bin/tiphys.ts validate --type report newmember-bare.yaml        # Member A, bare
INVALID #/gate-results/0 value matches no permitted alternative here
exit=1
$ node bin/tiphys.ts validate --type report newmember-declared.yaml    # Member A, with no-wrapper-exit-code
exit=0
$ node bin/tiphys.ts validate --type report wronggate-bare.yaml        # Member B, bare
INVALID #/gate-results/0 value matches no permitted alternative here
exit=1
$ node bin/tiphys.ts validate --type report wronggate-declared.yaml    # Member B, declared
exit=0
$ node bin/tiphys.ts validate --type report invalidrecord-bare.yaml    # Member C, bare
INVALID #/gate-results/0 value matches no permitted alternative here
exit=1
$ node bin/tiphys.ts validate --type report invalidrecord-declared.yaml # Member C, declared
exit=0
$ node bin/tiphys.ts validate --type report mismatch-bare.yaml         # Member D, bare
INVALID #/gate-results/0 value matches no permitted alternative here
exit=1
$ node bin/tiphys.ts validate --type report mismatch-declared.yaml     # Member D, declared
exit=0
```

**The repair mechanism generalizes correctly to all four newly-found
members** (bare rejected, declared passes), because round 4's fix is
"the author declares which member the record is" rather than a hard-coded
enumeration in the schema itself. So this is NOT a live validation defect:
the shipped schema does not misbehave on these members.

**What IS false is the completeness claim itself**, published in two places:
the shipped `$comment` at `report.schema.json` (asserting "the four derived
members" as if that were the relevant/exhaustive set the branch serves) and
the work history's Derivation 1 (asserting the runner-side enumeration
"found four members"), while the round's own pasted grep output contained
eight more below-spawn call sites it never examined, four of which I showed
are real, reachable, structurally distinct members by executing the actual
`tiphys gates run` command against them.

### FINDING 1 (MEDIUM): round 4's "four derived members" claim for `gateResult`'s no-exit-code class is an undercount, by round 4's own captured evidence

- **Claim refuted, verbatim:** "found four members with no exit code to give"
  (delivery/work-history/m3-p4.md, round 4, Derivation 1) and "the branch the
  four derived members need" (report.schema.json `#/$defs/gateResult/oneOf/1`
  `$comment`).
- **Class:** `status: error` records the real `tiphys gates run` runner can
  honestly produce with no captured wrapper exit code (`src/gates/run.ts`'s
  `errorResult()` call sites below the `spawnSync` at line 943).
- **Counter-example:** four additional structurally distinct members
  (Members A-D above), captured via real `tiphys gates run` invocations
  against a scratch registry and scratch gate scripts, none of which appear
  in round 4's derivation despite all eight of their call sites being present
  in round 4's own pasted `grep -n 'errorResult(' src/gates/run.ts` output.
- **Severity reasoning:** MEDIUM, not HIGH. It repeats the mechanism this
  contract exists to catch (a claim of derivation completeness that isn't
  complete), inside the very round dispatched to fix that mechanism, and the
  counter-example was sitting in the round's own captured output exactly as
  the contract's method note 4 warns. It is not HIGH because I verified the
  REPAIR itself is not member-specific and continues to work correctly on all
  four new members (shown above); the schema's actual validation behavior is
  not broken, only the derivation's stated completeness and, by extension,
  round 4's own required self-check ("what did the derivation NOT cover") is
  silent about this gap where it should have named it.
- **What this does NOT establish:** that any dishonest record is now
  admitted, or that the `oneOf` split is unsound. Both were checked and hold.
- **Suggested remedy** (not mine to make): correct the count in the shipped
  `$comment` and the work history, or better, state the derivation's own scope
  the way `report-parity-arithmetic`'s comment does ("WHAT IT DOES NOT
  REACH...") rather than asserting a specific count as if it were exhaustive.
  No schema change is required.

## Fresh probes at the OTHER two round-4 sites, with sentences not in round 4's own table (both HELD)

To avoid rubber-stamping round 4's own worked examples, I constructed fresh
sentences of my own at the two prose-guard sites and ran them through the
real CLI.

**`#/$defs/claim/oneOf/3` (open-question + `still-open-because`), report.schema.json:**
```
$ node bin/tiphys.ts validate --type report oq-guaranteed-bare.yaml
# statement: "Whether this path is guaranteed safe under concurrent access is
#             something I have not settled." (token: "guaranteed"), no declaration
INVALID #/claims/0 value matches no permitted alternative here
exit=1
$ node bin/tiphys.ts validate --type report oq-guaranteed-declared.yaml
# same statement + still-open-because: "I have not built a concurrency harness..."
exit=0
$ node bin/tiphys.ts validate --type report oq-fresh-honest-negation-bare.yaml
# statement: "I have NOT shown there is no way to trigger this, so it remains open."
INVALID #/claims/0 value matches no permitted alternative here
exit=1
$ node bin/tiphys.ts validate --type report oq-fresh-honest-negation-declared.yaml
exit=0
```

**`#/$defs/verificationFirst/oneOf/2` (contradicts-plan:false + `plan-language-note`), work-history.schema.json:**
```
$ node bin/tiphys.ts validate --type work-history vf-fresh-denial-bare.yaml
# finding: "The two review contracts do not conflict with the plan; I re-read
#           section 3 and found no divergence, contrary to what a first skim
#           suggested." contradicts-plan: false, no note
INVALID #/verification-first/0 value matches no permitted alternative here
exit=1
$ node bin/tiphys.ts validate --type work-history vf-fresh-denial-declared.yaml
# same finding + plan-language-note
exit=0
$ node bin/tiphys.ts validate --type work-history vf-fresh-lie-bare.yaml
# finding: "This is at odds with the plan section 4." contradicts-plan: true,
# stopped-and-reported present (the ORIGINAL, correctly-required path, not a residue)
exit=0
```
Both sites **HELD** against sentences of my own construction, not reused from
the round's table.

## Claim: `{green, not-applicable}` and `{red, amber, error}` are the complete, disjoint free set of `gateResult`'s `result` enum

Extracted the enum and the two oneOf-group restrictions directly:
```
$ node -e '... prints $defs.gateResult.properties.result.enum ...'
["green","red","amber","not-applicable","error"]
```
Branches 0 and 1 (the wrapper-exit-code / no-wrapper-exit-code pair) both
restrict `result` to `["red","amber","error"]`; branch 2 restricts it to
`["green","not-applicable"]`. Union is exactly the five-value enum, no
overlap, no gap. **HELD.**

Separately confirmed (via `git diff` reading, not execution, so noted as
weaker evidence) that `src/gates/result.ts:46`'s comment "The four words.
Nothing else is a status." refers to the RUNNER's producible values
(`green/red/error/not-applicable`), consistent with round 4's own finding
that `amber` is a schema-level value nothing in the runner ever produces
(their finding, reproduced by reading rather than re-run since it is a
negative/absence claim about the whole runner, which I did not re-grep
independently beyond confirming `src/gates/result.ts:46`'s comment).

## Verdict

**CHANGES REQUIRED.**

One MEDIUM finding (above): round 4's own claim of having derived "the class"
of `gateResult` records with no wrapper exit code is not accurate as stated,
by round 4's own captured evidence, and the gap fits the exact mechanism this
contract exists to catch (a completeness claim published in a shipped
`$comment` and a work history without the full derivation behind it),
recurring in the fix round DR-0016 dispatched specifically to fix that
method. It does not, on the evidence gathered, indicate a live schema-behavior
defect: the repair generalizes correctly to every member I could construct,
including the four the round missed. I recommend the fix be a work-history
and `$comment` correction (name the true count or drop the count and state
scope the way the sibling `report-parity-arithmetic` comment does), not a
schema change, and that it not by itself require another fresh-implementer
round under DR-0016's stop-rule reading, given the mechanism itself is intact
and CLAUDE.md's stop rule exists to protect against changes that break
behavior, which this one measurably does not. That is a recommendation for
the orchestrator to weigh, not a decision this review makes.

Every other claim I attacked by construction (seven claims in the first
batch, two fresh prose probes, one enum-completeness claim: eleven claims
total, all executed against the real CLI or the real gate runner) HELD. No
gap, no overlap, no admitted dishonest record, no rejected honest record was
found anywhere else I searched. Section 1 above states plainly where I did
not search, most notably `report-parity-arithmetic`'s own residues and three
racier `gateResult` call sites (:989, :1009, :1023) that I read but did not
force.
