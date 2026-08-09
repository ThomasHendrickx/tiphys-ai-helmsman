# Independent delta verification: M3-P3 fix rounds 1 and 2

**Verdict: CHANGES REQUIRED. One finding, V-1 (medium), a new defect in fix
round 2's own code that fails open. Two lower-severity latent-defect notes
(V-2, V-3) in the same function. Everything the two rounds claimed to fix is
independently reproduced fixed. Gates, suite and both ASCII checks are all
independently green/expected at the round-2 head.**

Head under verification: `b8715004e313cdf1cb88b485def074113a81ae33` (round 2 end)
Round 1 end: `dd4e9067d0d47f57117402b7828902b0b4e56c19`
Reviewed head before either round: `7b3afbf0f6f6baf458f2adf4e555fbf1232a33be`

Findings: **V-1 (medium)**, quotableUnits() extracts code-fenced content as a
quotable unit, so a merge-authority condition can be satisfied by illustrative
text inside a decision record's code block rather than an actual condition.
**V-2 (low, latent)**, quotableUnits() only recognizes an ATX heading
(`^#`), so an indented `#` line is not excluded and its text can become a
quotable unit. **V-3 (low, latent)**, quotableUnits() merges adjacent
non-blank, non-list-marker lines into one unit even across what a human would
read as two paragraphs, which is a false-negative (over-strict) risk for
legitimate multi-paragraph conditions, not a fail-open risk.

## Plan
1. Set up worktree, confirm node version, npm ci.
2. Reproduce the three high-severity mechanisms independently.
3. Mutate round 1 and round 2 new code to hunt for new defects.
4. Investigate the round-1-green / round-2-red witness discrepancy.
5. Spot-check the containment-mechanism derivation.
6. Run gates and report exit codes.
7. Write verdict.

(Findings appended below as established.)

## 1. The three high-severity mechanisms, reproduced independently

### 1a. Duplicate mode ids (mechanism 1)

Built a document with two `modes[]` entries sharing id `full`, the first
crippled (`clean-room-review` removed from the pipeline, `skips` emptied), and
ran it at the REVIEWED head `7b3afbf` (worktree `wt-m3p3-cr-a`, a sibling
checkout already sitting at that commit) by overwriting the shipped
`assurance-modes.yaml` in place, since `--file` does not exist at that head:

```
$ node bin/tiphys.ts mode show --mode full     # at 7b3afbf, crippled dup FIRST
mode: full
...
pipeline:
  intake
  verification-pass
  plan
  adversarial-plan-review
  implement
  fix-round               <- clean-room-review is GONE
  fix-round-verification
  merge-on-green
  deploy-verify
  migration-verify
  final-report            (11 stages)
skips:
  (none)
EXIT=0
```

Matches the arbitration's claim exactly: eleven stages, `clean-room-review`
absent, `skips` empty, exit 0. Also reproduced the arbitration's "one
correction in the phase's favour": `validate` on the SAME document at 7b3afbf
does reject it, by the enum-comparison accident:

```
$ node bin/tiphys.ts validate --type assurance-modes --context . assurance-modes.yaml
INVALID #/modes assurance-modes.yaml declares mode ids [direct-pr, full, full, local-only] and the assurance-tier enum in schemas/charter.schema.json is [direct-pr, full, local-only]; the two must be equal (check: charter-mode-enum-matches-modes)
... (delivery-mode line too)
EXIT=1
```

At HEAD (`b871500`, worktree `wt-m3p3`), the same crippled-duplicate document,
both via `--file` and via overwriting the shipped document in place:

```
$ node bin/tiphys.ts mode show --mode full --file <dup>.yaml
tiphys mode: <path> is not a valid assurance-modes document, so it is not served
INVALID #/modes ... (enum mismatch, both fields)
INVALID #/modes/0/conditions/0 mode full cites DR-0012 for a condition that is not a whole quoted item of that record: "Two independent clean-room reviews exist for the current hea..." (check: mode-conditions-quote-granted-by)
INVALID #/modes/1/conditions/0 mode full cites DR-0012 for a condition that is not a whole quoted item of that record: "Two independent clean-room reviews exist for the current hea..." (check: mode-conditions-quote-granted-by)
INVALID #/modes/1/id mode id full is declared 2 times, at modes 0, 1; an id selects one entry and these select 2 (check: mode-ids-are-unique)
EXIT=1
```

Refused, exit 1, `mode-ids-are-unique` fires. CLOSED, confirmed independently.

### 1b. `mode show` not validating (mechanism 2), on a document invalid for an unrelated reason

Built a document invalid ONLY for `merge-authority: nobody` (an enum value
outside the schema) plus the required fields that value would need removed,
nothing to do with duplicate ids:

```
$ node bin/tiphys.ts mode show --mode full --file <unrelated-invalid>.yaml
tiphys mode: <path> is not a valid assurance-modes document, so it is not served
INVALID #/modes/0 value does not satisfy the requirements its own shape triggers here
INVALID #/modes/0/escalation-bounds required property escalation-bounds is missing
INVALID #/modes/0/merge-authority value "nobody" is not one of the permitted values "owner", "owner-approves-orchestrator-merges", "delegated-under-conditions"

$ node bin/tiphys.ts mode show --mode full --file <unrelated-invalid>.yaml 2>/dev/null | wc -c
0
$ node bin/tiphys.ts mode show --mode full --file <unrelated-invalid>.yaml >/dev/null 2>&1; echo $?
1
```

Empty stdout (0 bytes), refusal on stderr, real exit code 1 (not swallowed by
a pipe). CLOSED, confirmed independently, and confirmed the refusal is not
special-cased to duplicate ids.

### 1c. Containment vs equality (mechanism 3, round-2 fix)

```
$ conditions: ["a","the","review","merge","is","of"]              # the orchestrator's exploit
validate exit=1, 6 violations from mode-conditions-quote-granted-by

$ conditions: ["Two independent clean-room reviews exist for the current hea"]   # a FRAGMENT of a real condition
validate exit=1, 1 violation

$ conditions: ["orchestrator","escalate","condition","provided","because"]       # a class of my own devising
validate exit=1, 5 violations
```

All three reddened as required. Checked which of my own class's words
actually occur in DR-0012 (to know whether they would have defeated the OLD
containment check too): `orchestrator` (11), `condition` (3), `provided` (1),
`because` (1) occur; `escalate` does not. Not load-bearing for this
reproduction (the new check is equality-by-unit regardless of what the old
one would have done), but recorded because a claim about "would have passed
under containment" should be checked rather than assumed.

All three high-severity mechanisms are CLOSED. Independently confirmed, not
merely trusted from the work history.

## 2. New defects hunted by mutation (the main effort)

Read `quotableUnits()` line by line (`src/checks.ts:810-841`) and probed it
directly (not just through the CLI) with a battery of adversarial document
shapes: empty record, no list items, a condition spanning two physical lines
with and without a marker, nested lists, a condition equal to a heading, a
condition inside a code fence, CRLF line endings, and a paren-style ordered
marker. Script:
`/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/scripts/quotable-probe.mjs`.

### V-1 (MEDIUM): quotableUnits() extracts code-fenced content as a quotable unit

The docstring and the comment in the code both claim code fences are excluded
the same way headings are: "a blank line, a heading and a code fence all END
the unit in progress and belong to none, so a condition can never match a
heading OR A FENCE" (paraphrased from the comment and the registered test's
own name for the heading half). The code only implements the FENCE MARKER
LINE'S exclusion (the `` ``` `` line itself is skipped), not the fenced
CONTENT: nothing tracks "inside a fence" state, so lines between two fence
markers are processed as ordinary prose and become part of a unit exactly
like any other paragraph.

Probe, directly against `quotableUnits`:

```
--- code fence containing text that looks like a condition ---
input:
```
This looks like an example inside a code fence and should NOT be a real condition.
```
(the fence markers surround that one line)

output: ["CI is green on the exact head being merged, not on an earlier one."]
```

(the fenced sentence used in the probe script was literally the wording
above; it came back as a member of the returned Set.)

**Demonstrated end to end through the CLI, not just at the function**, using a
scratch decision record `DR-9999-fence-test.md` with the illustrative sentence
inside a fence, cited by `granted-by: DR-9999`, with the mode's one condition
set to exactly that fenced sentence:

```
$ node bin/tiphys.ts validate --type assurance-modes --context "$D" "$D/assurance-modes.yaml"
(no output)
$ echo $?
0
```

Exit 0, zero diagnostics: the check accepted a "condition" whose only
occurrence in the cited record is inside a code fence illustrating something
else. This is the same shape mechanism 3 exists to close (a condition can be
satisfied by text of the record that is not actually one of its conditions),
reopened one layer down by the extractor rather than the comparison.

**Not currently exploitable against any record actually shipped in this
repository**: `grep -lP '```' delivery/decisions/*.md` returns nothing, so no
decision record here has a code fence today. This is why it is MEDIUM rather
than HIGH: it is a real, demonstrated fail-open in the mechanism the round
just finished hardening, but the specific shipped artifact `granted-by: DR-0012`
cannot trigger it today. It is squarely inside the scope the round-2 work
history already flags as weaker ("a project OTHER than this one, with a
decision record this repository's test does not read"): a consuming project's
decision record that legitimately uses a code fence (to show an example
command, a captured output block, a sample config) would let an author quote
the fenced example as if it were a real governance condition.

Fix shape (not applied, per instructions not to edit source): track an
"inside fence" boolean, toggled on each fence-marker line, and skip every line
while it is true instead of only skipping the marker line itself.

### V-2 (LOW, latent): only ATX headings are excluded

```
--- condition equal to heading text (heading indented with a leading space) ---
input: " # Indented Heading That Should Not Count\nSome paragraph."
output: ["# Indented Heading That Should Not Count Some paragraph."]
```

`line.startsWith("#")` requires the `#` at column 0; an indented `#` (which
GitHub-flavoured and CommonMark markdown still often render as a heading, and
which some editors produce) is not recognised, so its text (with the `#`
still attached) becomes part of a unit. Checked whether DR-0012 has any such
line: `grep -nP '^\s+#' delivery/decisions/DR-0012-delegated-merge-authority.md`
returns nothing, so this is latent against the shipped record, like V-1.

### V-3 (LOW, latent, wrong direction): adjacent paragraphs with no blank line merge into one unit

```
--- paragraph immediately followed by unrelated text with no blank line ---
input:
"5. The scope audit passes: changed files are on the phase's files-to-touch list.\nUnrelated trailing sentence not part of the list, glued on with no blank line."
output: ["The scope audit passes: changed files are on the phase's files-to-touch list. Unrelated trailing sentence not part of the list, glued on with no blank line."]
```

This is the opposite direction from V-1 and V-2: it makes the check MORE
strict than intended (a legitimately-quoted condition can fail to match
because it got glued to trailing prose that follows it with no blank line),
not a security hole. Recorded because the task asked what happens on this
shape; it is not counted as a fail-open finding. Checked DR-0012's own six
conditions are each on one physical line with a blank-line-free but
marker-delimited list (`grep -n '^[0-9]\.' delivery/decisions/DR-0012-...md`
shows six single-line items), so this does not affect the shipped document
either.

### Other shapes probed, all correct

- **Empty record**: `quotableUnits("")` returns an empty Set, so every
  condition is rejected (fails closed).
- **No list items, one plain paragraph**: works as documented, the whole
  paragraph is one unit.
- **Nested list** (`1. Top\n   - sub\n   - sub`): each level's item becomes
  its own unit at the marker line, splitting the parent's continuation
  early. This is a V-3-shaped over-strictness, not exploitable.
- **Wrapped list item across lines with no marker on the continuation**
  (the real shape DR-0012 itself does NOT use, since each condition is one
  physical line, but which the round-1 witness capture (`declared-by` block)
  shows the tool must handle for other records): correctly joined into one
  unit.
- **CRLF line endings**: `\r` is stripped before matching; both items came
  back correctly split and normalized.
- **Blank record with only headings**: returns an empty Set, correct.
- **Setext-style headings** (text underlined with `===`/`---`, no `#`): not
  detected by `quotableUnits` at all (only ATX `#` headings are excluded), so
  a setext heading's text would become a quotable unit. Checked whether
  DR-0012 uses this style: `grep -nP '^(=+|-+)\s*$' delivery/decisions/DR-0012-...md`
  returns nothing, so this repository's records do not trigger it. Recorded
  as the same class as V-2 (a heading form the extractor does not model),
  not filed as its own numbered finding since the mechanism is identical to
  V-2 and the fix is the same shape.

### `sameStringList`, `makeIdUniquenessCheck`, `mode show`: no survivor found

Mutated/probed each independently and found no additional defect:

- `sameStringList` (round-1 fix for the NUL-byte separator): confirmed
  element-wise, length-checked first; tried lists with a shared prefix of
  different lengths, a single differing element, and an empty list against a
  non-empty one; all compared correctly.
- `makeIdUniquenessCheck` (mode-ids-are-unique / role-ids-are-unique):
  confirmed a triplicate id produces violations at every index after the
  first, confirmed a non-string id is skipped rather than throwing, and
  independently exercised `role-ids-are-unique` end to end with a duplicated
  role entry (B-004's fix):
  ```
  $ node bin/tiphys.ts validate --type role-model-config /tmp/dup-roles.yaml
  INVALID #/roles/6/role role id orchestrator is declared 2 times, at roles 0, 6; an id selects one entry and these select 2 (check: role-ids-are-unique)
  EXIT=1
  ```
- `mode show`'s refusal path: confirmed it fails CLOSED (refuses, does not
  silently pass) when the context directory is missing `gate-registry.yaml`
  and `schemas/` entirely, which is the scenario the fix's own design note
  (context = the document's own directory) depends on:
  ```
  $ node bin/tiphys.ts mode show --mode full --file <doc-with-no-sibling-context>
  INVALID #/modes the charter schema could not be read, so its mode enum could not be compared with assurance-modes.yaml: .../schemas/charter.schema.json does not exist (check: charter-mode-enum-matches-modes)
  INVALID #/modes the gate registry could not be read, so no gate set reference could be resolved: .../gate-registry.yaml does not exist (check: mode-gate-sets-resolve)
  INVALID #/modes/0/granted-by no decision record DR-0012 was found under delivery/decisions or decisions of the context, so the grant it names cannot be checked (check: mode-conditions-quote-granted-by)
  EXIT=1
  ```
  No fail-open on missing context.

## 3. The round-1-green / round-2-red witness discrepancy

This settles task 3 of the brief. The orchestrator's own answer arrived mid-task
(quoted and verified below) while I was independently re-deriving the same
conclusion; I confirmed its citation and then went one step further, to the
actual line that flipped the file's classification. Recorded as its own
subsection because the orchestrator asked for it to be reported separately
from M3-P3 findings.

## Orchestrator's item: the rule-(g) exemption (orchestrator-owned, not an M3-P3 finding)

Verified the orchestrator's code citation directly:

```
$ grep -n "needsClassRules" src/witness/run.ts
1291:  const needsClassRules = spec.class === "classification" || derivation.textAsserting;
```

Confirmed `witness/checks-enum-compared-element-wise.json` is `"class": "additive"`
at BOTH `dd4e906:witness/checks-enum-compared-element-wise.json` and at HEAD
(`git show dd4e906:... | grep class` and `cat witness/...` agree: additive both
times). So the orchestrator's citation is correct: class alone did not change.

**Went one step further than the orchestrator's answer: found the exact line
that flipped `derivation.textAsserting` from false (round 1) to true (round 2)
for the whole file**, settling "I cannot explain that from the evidence I have"
with an actual cause rather than leaving it as unexplained:

```
$ git show dd4e906:test/assurance-modes.test.ts | grep -n "record\.includes\|record = readFileSync"
1419:  const record = readFileSync(
$ grep -n "record\.includes\|record = readFileSync" test/assurance-modes.test.ts
1455:  const record = readFileSync(
1592:    const record = readFileSync(
1597:      assert.ok(record.includes(word), `"${word}" does not occur in DR-0012 at all`);
```

Round 1 had exactly one `readFileSync` bound to `record` (line 1419, the
omission-direction test), and nothing calls `.includes()`/`.indexOf()` on it
directly (it is only fed to a project function that extracts numbered items,
which `deriveTextAssertions`'s own docstring says is "behaviour, not a text
assertion"). Round 2 added a SECOND `record = readFileSync(...)` (the
short-string sanity check, line 1592) that DOES call `record.includes(word)`
directly inside `assert.ok` at line 1597. `deriveTextAssertions` is computed
over the FULL SOURCE of every file containing any of a spec's named tests
(`src/witness/run.ts:1420-1422`, `resolved.files.map((path) =>
inputs.testFiles.get(path) ?? "")`), not scoped to the named test's own body.
So `textAsserting` is a FILE-LEVEL property: adding one text-assertion
anywhere in `test/assurance-modes.test.ts` in round 2 made EVERY witness whose
named test lives in that file (including `checks-enum-compared-element-wise`)
newly subject to rule (g), regardless of what that spec's OWN named test does.
Checked precisely rather than assumed: that test (line 1488,
`test/assurance-modes.test.ts`) does call `readFileSync` on
`schemas/charter.schema.json` at line 1502, but only to parse it into an
object it then mutates and writes back; nothing in the test calls
`.includes()`/`.indexOf()`/`assert.match`/a literal `assert.equal` directly on
that read's result, so by `deriveTextAssertions`'s own rule ("a read passed to
a project function is behaviour... and does not falsely redden") this test
alone would not have flipped the flag either in round 1 or round 2. The flip
came from the OTHER new test in the same file (line 1592-1597) as shown above.
That is the mechanism the implementer's work history could not name. The gate
was not defective in either round; the file's aggregate text-assertion surface
grew between rounds and rule (g)'s scope grew with it.

**This file-versus-test granularity is worth flagging in its own right**, not
as an M3-P3 finding but as a note for whoever owns `src/witness/run.ts`: it is
conservative in the direction that bit this round (more scrutiny than a naive
per-test scope would give), but it also means removing the one text-asserting
line at 1597 in some future edit would silently loosen rule (g) for every
other spec sharing the file, with no local diff signal at the specs that lose
protection.

### Q1: how many specs are additive/behaviour and not text-asserting (exempt from rule (g))

Executed the actual exported functions (`resolveNamedTests`,
`deriveTextAssertions`) from `src/witness/run.ts` against every `witness/*.json`
at HEAD, script at
`/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/scripts/classify-witnesses.mjs`:

```
$ node scratchpad/scripts/classify-witnesses.mjs "$(pwd)"
total specs: 43
exempt from rule (g) (additive/behaviour and not text-asserting): 22
```

### Q2: do any exempt specs already have colliding members

```
=== exempt specs: checking for collisions rule (g) would have caught ===
SINGLE-MEMBER (1): red-witness-base-absent-error
SINGLE-MEMBER (1): witness-member-kind-diagnostics
SINGLE-MEMBER (1): witness-spec-schema-required
SINGLE-MEMBER (1): witness-tap-reporter-pin
```

No same-file+same-find or byte-identical-patch collisions among the 18 exempt
multi-member specs: the 22 exempt specs split into 18 with two or three members
(none colliding) and 4 with exactly ONE declared member, which rule (g) would
reject on sight (`dangerousStates.length < 2`) if it applied to them. All four
are pre-existing (not M3-P3's: `src/gates/red-witness.ts`, `src/witness/spec.ts`,
`src/gates/schemas/witness-spec.schema.json`, `src/witness/run.ts` are none of
them on `delivery/plan/phase-declarations/m3-p3.json`), so this is not an M3-P3
finding.

### Q3: is the exemption defensible

Mixed, argued against each of the four single-member specs rather than in the
abstract:

- `red-witness-base-absent-error` and `witness-tap-reporter-pin` mutate a single
  boolean guard clause (`if (cond) {...}` to `if (false) {...}`) where the
  guarded property is a single existence/format check with no second
  structurally distinct way to defeat it that is evidently available. These
  look like the legitimately atomic case CLAUDE.md's rule was not written to
  forbid a single member for, though the document's text does not say so.
- `witness-spec-schema-required` and `witness-member-kind-diagnostics` do NOT
  have that excuse: both guard a `required: [...]` array with MULTIPLE field
  names in it (`witness-spec-schema-required`'s own `find` text lists six
  fields; `witness-member-kind-diagnostics`'s guards one of several fields
  checked the same way elsewhere in the same function, confirmed by
  `grep -n "if (member\[field\] === undefined)" src/witness/spec.ts` returning
  the guard used for every required member field, not just `replace`). A second
  member dropping a DIFFERENT field from the same `required` array (structurally
  identical to the mode-ids-are-unique fix round's "two members, same mechanism,
  different site" pattern this very phase used) was available and not written.
  **This is the same shape the project has already paid for four times**: a
  guard (here, the gate's own rule (g)) whose condition does not test the
  property CLAUDE.md's prose states ("at least two structurally different
  members" with no class exception written into the sentence).

Recommendation (not binding, orchestrator's call per the brief): either narrow
CLAUDE.md's sentence to say what the gate actually enforces, or widen rule (g)
to apply to every class and require the two clearly-fixable single-member specs
above to gain a second member. Leaving the sentence as an unqualified universal
while the mechanism enforces a subset is exactly the "green and worthless
guard" pattern named at the top of this document's Red-witness section.

## 4. The containment-mechanism derivation, spot-checked

Round 2 claims its own site (`src/checks.ts`) is absent from the containment
call sites, and names `scripts/check-clause-map.mjs:195` and several
`src/witness/run.ts` sites as the remaining members, classified as NOT the
mechanism where the receiver is an array (`Array.prototype.includes/indexOf`)
rather than a string body.

```
$ grep -n "\.includes(\|\.indexOf(" src/checks.ts
456:      const review = pipeline.indexOf("adversarial-plan-review");
457:      const implement = pipeline.indexOf("implement");
462:        if (!stringsAt(row.mode, "skips").includes("adversarial-plan-review")) {
```

Confirmed: both remaining hits are `Array.prototype.indexOf`/`.includes` over
`pipeline`/`skips` (string arrays from the document), which is element search
by equality, not string containment. The raw `record.includes(condition)`
site the round replaced is gone. The implementer's claim that its own site is
absent holds.

```
$ sed -n '194,199p' scripts/check-clause-map.mjs
    if (!body.includes(entry.clause)) {
      problems.push(
        `${row.id} names clause ${entry.clause}, which does not occur in ${entry.artifact}`,
      );
    }
```

Line 195 matches exactly as cited: `body` is a document read from disk,
`.includes()` is string containment, and the mechanism (a clause "discharged"
because its id occurs anywhere in the artifact, including a sentence saying it
is NOT implemented) is real and unfixed, as claimed.

```
$ sed -n '620,627p' src/witness/run.ts
  const missing: string[] = [];
  for (const name of tests) {
    let found = false;
    for (const [path, source] of testFiles) {
      if (source.includes(name)) {
```

Matches the cited `:624`. Spot-checked one more of the three
(`src/witness/run.ts:1187`, inside the destructive-command derivation) and it
also matches: `testSources.some((source) => source.includes(entry))`, a
string-containment check over test source text.

**What this spot-check did NOT cover**: I re-derived the implementer's own
step-1/step-2/step-3 greps myself rather than only reading the round's capture,
but I did not re-run step 4 (the `new RegExp(` scan) or step 5 (the shell
`grep -q`/`grep -c` scan) from scratch; I read their output and spot-checked
only that the classification table's verdicts for the sites named above are
consistent with the code as it stands at HEAD. I also did not audit whether
`test/` or `delivery/` (both explicitly excluded by the round's own derivation)
contain a comparable containment-for-equality defect; that exclusion is stated
by the implementer and I did not independently probe past it.

## Gates, run independently at HEAD

`scope`, `clause-map` and `agent-rules-drift` were run from
`scratchpad/wt-m3p3`, a sibling worktree already checked out on
`claude/m3-p3-assurance-modes` at this exact head (my own worktree is
detached and cannot hold that branch name simultaneously); `suite` and
`red-witness` likewise. Each command's own exit code, not a pipeline's:

```
$ node --version
v26.6.0

$ npm ci        # in wt-m3p3-delta
exit=0

$ npm run build # in wt-m3p3-delta, at HEAD (not mid-round)
exit=0
$ git status --porcelain   # after build, only the beacon file this report is
?? delivery/review/verification-m3-p3-fix-rounds.md

$ node --test   # in wt-m3p3-delta, full run (took ~142s wall time; the
                # default 2-minute Bash timeout was too short, matching
                # CLAUDE.md warning 11 about real-clock lease waits)
tests 496
pass 496
fail 0
cancelled 0
skipped 0
todo 0
exit=0

$ node src/gates/scope.ts --declarations delivery/plan/phase-declarations --base origin/main --head HEAD --phase m3-p3 --result ... --evidence ...
scope: green (29 changed paths audited)
exit=0

$ node scripts/check-clause-map.mjs --result ... --evidence ...
clause-map: green (18 clause-map rows checked)
exit=0

$ node scripts/render-agent-rules-gates.mjs --check
agent-rules-drift: green (17 rendered gate rows compared)
exit=0

$ node src/gates/suite.ts --result ... --evidence ... --base origin/main --head HEAD --pin-root src --pin-root bin --pin-root test
suite: green (494 tests reported)
exit=0

$ node src/gates/red-witness.ts --result ... --evidence ... --base origin/main --head HEAD --phase m3-p3
red-witness: green (24 witness(es) evaluated (11 own, 13 stored re-evaluated in 110776ms); every witness red against every declared dangerous state and green at head)
exit=0
```

One usage error surfaced and was NOT misread as success (CLAUDE.md's
three-times-bitten warning): `node src/gates/suite.ts` without `--result`
and `--evidence` printed a usage line and exited 64; supplying both flags
gave the green result above.

All seven gates/checks are independently green at the round-2 head, matching
the work history's own captures (suite count differs cosmetically, 494 vs
496, because `node --test` with no args discovers 496 while the suite gate
walks the declared root for `.test.ts`, discovering 494; the work history
already explains this gap and it reproduces identically here).

## The two ASCII checks

```
$ git ls-files -z | grep -zv '^delivery/intake/orchestrated-delivery-process\.md$' \
    | grep -zv '^test/fixtures/json-schema-test-suite/' | xargs -0 grep -laP '[^\x00-\x7F]'
(no output, xargs exit 123 = grep matched nothing)

$ git ls-files -z | grep -zv '^delivery/intake/orchestrated-delivery-process\.md$' \
    | grep -zv '^test/fixtures/json-schema-test-suite/' | xargs -0 grep -laP '[\x00-\x08\x0B\x0C\x0E-\x1F]'
delivery/review/arbitration-m3-p1.md
```

Confirmed the expected single hit, and confirmed the stated explanation
directly rather than accepting it:

```
$ git show origin/main:delivery/review/arbitration-m3-p1.md | grep -aP '[\x00-\x08\x0B\x0C\x0E-\x1F]'
(no match, exit 1)   # zero control bytes on origin/main, i.e. the fix (PR #55) is real

$ git show 45722e3117f8915cd2e45659a8e267a4ae873975:delivery/review/arbitration-m3-p1.md | grep -acP '[\x00-\x08\x0B\x0C\x0E-\x1F]'
1     # this branch's merge base still carries the byte

$ git merge-base --is-ancestor 826f27d 45722e3117f8915cd2e45659a8e267a4ae873975 \
  && echo "fix IS ancestor of merge base" || echo "fix is NOT ancestor of merge base"
fix is NOT ancestor of merge base
```

`826f27d` is the PR #55 commit named in the arbitration as the fix. It is
provably not an ancestor of this branch's merge base, so the branch predates
the fix, exactly as claimed; `origin/main` at the current tip has zero control
bytes in that file. No trust of the assertion was required, it is measured.

## Verdict

**CHANGES REQUIRED.**

- V-1 (medium): `quotableUnits()` treats code-fenced content as ordinary prose
  and extracts it as a quotable unit, so a merge-authority condition can be
  satisfied by an illustrative code example in the cited decision record
  rather than an actual condition. Demonstrated end to end through
  `tiphys validate` with exit 0 and zero diagnostics on a crafted record.
  Not exploitable against any decision record currently shipped in this
  repository (none use code fences), which is why this is medium rather than
  high, but it is a real fail-open in the exact mechanism round 2 was
  dispatched to hardened, discovered by mutating the same helper function
  the brief named as the highest-value target.
- V-2 (low, latent): only ATX (`^#`) headings are excluded from quotable
  units; an indented `#` line is not recognised as a heading and its text can
  become a unit. Not currently triggerable against DR-0012.
- V-3 (low, over-strict, not a security finding): adjacent non-blank,
  non-list-marker lines with no blank separator merge into one unit even when
  a human would read them as two paragraphs, which can cause a legitimately
  quoted condition to fail to match. Not currently triggerable against
  DR-0012's own six single-line conditions.

Everything else holds: all three high-severity mechanisms independently
reproduced fixed; the round-1/round-2 witness-gate discrepancy settled with a
specific causal line, going past the orchestrator's own (correct but less
specific) explanation; the containment-mechanism derivation's cited sites spot
-checked and confirmed; all seven gates green at the round-2 head with their
own exit codes; both ASCII checks behave as documented, including an
independently verified explanation for the one expected control-byte hit.

The recommendation is that V-1 be fixed (track fence state in
`quotableUnits()`) before this phase is considered closed, given the pattern
this repository has already paid for: a hardening round that closes the named
instance while leaving a structurally identical gap in the same function
untested. V-2 and V-3 are lower priority and could reasonably be deferred as
tracked items given they require document shapes absent from every record
this repository currently ships.

## What this verification did NOT cover

- **`test/` and `delivery/` were excluded from the containment-mechanism
  derivation**, both by the round-2 implementer and by my spot-check of it. A
  test asserting with `assert.match` on a floating (non-anchored) pattern is
  the same shape and was not searched for.
- **Steps 4 and 5 of the round-2 derivation** (the `new RegExp(` scan and the
  shell `grep -q`/`grep -c` scan) were read, not independently re-run from
  scratch; I verified only that the sites named in the classification table
  match the code as it stands.
- **`direct-pr` and `local-only` modes were not exercised through `mode
  show`'s validation path**, only `full`; the work history itself notes these
  two are never executed by anything in M3, and I did not build documents
  that isolate their specific stage lists for a fail-open probe the way I did
  for `full`'s conditions.
- **`role-model-config.yaml`'s `role-ids-are-unique` check was exercised only
  for the duplicate-id case**, not mutated further the way `quotableUnits`
  was; it shares `makeIdUniquenessCheck` with `mode-ids-are-unique`, which was
  mutated more thoroughly, so the shared code path has more coverage than the
  role-specific wiring around it.
- **The four exempt single-member witness specs identified while answering
  the orchestrator's rule-(g) question are pre-existing** (owned by M2-P1/M2-P2,
  not M3-P3) and were not otherwise audited for defects beyond the
  member-count question the orchestrator asked; I did not evaluate whether
  their single member actually reddens correctly, only whether the gate's
  rule (g) would apply to them.
- **No CI run was observed**, on either the `pull_request` or `push` arm
  (T-009's both-arms requirement). Everything above is local execution on the
  floor toolchain (Node v26.6.0), matching the arbitration's own recorded
  non-coverage for round 0 and never closed by either fix round.
- **The four remaining containment-mechanism sites and the nine remaining
  uniqueItems-without-identity arrays that both rounds reported rather than
  fixed** (owned by M2-P2, M3-P1 and M3-P2) were read but not independently
  re-derived or mutated; I trusted the round's own tables for those, since
  they are explicitly out of this phase's declared scope and my brief is
  M3-P3's delta.
- **I did not attempt to construct a decision record inside this repository's
  actual `delivery/decisions/` tree to prove V-1 against a real file**; the
  demonstration uses a synthetic `DR-9999-fence-test.md` in a scratch context
  directory, which is sufficient to show the check accepts it but does not by
  itself show any file that will ever exist in this repository is at risk
  today.
