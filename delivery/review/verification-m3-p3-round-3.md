# M3-P3 round 3 independent delta verification

Verifier: fresh session, no authorship of rounds 1-3.
Head under review: `6a36b386bb088c79f5deceb355d731778cf83b58`
(branch `claude/m3-p3-assurance-modes`)
Round 2 head for comparison: `b8715004e313cdf1cb88b485def074113a81ae33`
Merge base with `origin/main`: `c2e200971829c7d88bc06ae553ec0f57ecf48046`

**VERDICT: CHANGES REQUIRED.**

Two findings alone are each independently sufficient to block: V-3 (scope
gate is RED on the exact head, exit 1) and V-4 (the decision record grounding
every disclosure this round shipped does not exist on this branch or on
`origin/main`). Neither is a logic defect in `quotableUnits`; both are
mechanical, reproducible, and settle DR-0012's own merge conditions directly.

Findings: 7 total. 1 high (V-3), 1 high (V-4), 1 medium (V-1), 3 low (V-2,
V-5, V-6), 1 informational (V-7, confirms rather than adds).

---

## Toolchain and gates

```
$ node --version
v26.6.0
$ npm ci            -> exit 0
$ npm run build     -> exit 0; git status clean afterward (only my own
                        untracked review file present)
$ node --test       -> tests 501, pass 501, fail 0, cancelled 0, skipped 0
```

Captured in full; the background run's tail:
```
# tests 501
# suites 0
# pass 501
# fail 0
# cancelled 0
# skipped 0
# todo 0
EXIT=0
```

### Scope gate: RED (V-3, see below)

Run from a clean clone checked out as branch `claude/m3-p3-assurance-modes`
at `6a36b386` (the scope gate refuses a detached HEAD that does not match the
declaration's own `branch` field, so a plain worktree check errors rather
than audits; a real branch checkout is required to get a verdict at all):

```
$ node src/gates/scope.ts --declarations delivery/plan/phase-declarations \
    --base origin/main --head HEAD --phase m3-p3 \
    --result scope-result.json --evidence scope-evidence
scope: red (35 changed paths audited)
touched path(s) outside the declared scope: delivery/plan/phase-declarations/m3-p3.json,
templates/charter.example.yaml, test/fixtures/charter-no-escalation.yaml
(declaration delivery/plan/phase-declarations/m3-p3.json at merge base
c2e200971829c7d88bc06ae553ec0f57ecf48046, sha256 e771224846f63b40160f7f...)
$ echo $?
1
```

### ASCII / control-character checks

```
$ FILES=$(git ls-files | grep -v -e '^delivery/intake/orchestrated-delivery-process.md$' \
    -e '^test/fixtures/json-schema-test-suite/')
$ echo "$FILES" | xargs grep -laP '[^\x00-\x7F]'      # non-ASCII
(no output: 0 hits)
$ echo "$FILES" | xargs grep -laP '[\x00-\x08\x0B\x0C\x0E-\x1F]'   # control chars
delivery/review/arbitration-m3-p1.md
(exactly 1 hit, as CLAUDE.md predicts)
```

Confirmed the stated explanation rather than accepting it: `git diff
45722e3117f8915cd2e45659a8e267a4ae873975 6a36b386... --
delivery/review/arbitration-m3-p1.md` is EMPTY (byte-identical between the
merge base and HEAD), and `git log --oneline -- delivery/review/arbitration-m3-p1.md`
shows the file's only commit is `dd42ccb` (M3-P1, an earlier phase). The
control byte sits inside a backtick-escaped illustration of exactly the
class of byte T-008's postscript discusses. Inherited, not introduced here.

---

## Priority 1: the list-continuation shape and the four disclosed-unmodeled shapes

### V-1 (medium): a list-item continuation paragraph is admitted as an independent quotable unit, contradicting the round's own stated invariant, and the shape already occurs in this repository's own decision records

Mechanism: `quotableUnits`'s list handling sets `listContentColumn` when a
list-item marker line is seen and never resets it on a blank line, only on a
later column-0 line (`src/checks.ts:1000-1003`). A blank line after a list
item, followed by CommonMark LIST-ITEM-CONTINUATION content (indented at or
above the item's own content column but below the item-column+4 code
threshold), is therefore treated as a brand-new top-level paragraph rather
than as more of the SAME list item.

```
$ node -e '... checksModule.quotableUnits("- item\n\n    indented under list\n") ...'
["item","indented under list"]
```

Per CommonMark, `"    indented under list"` (4-space indent) is a
continuation of the SAME list item (its content column is 2, so 4 >= 2 keeps
it inside the item; the code threshold is content-column+4=6, and 4<6, so it
is not indented code either). The two-paragraph list item is one unit under
CommonMark and two units here. This is the mechanism the docstring claims is
closed ("every ambiguity resolves towards EXCLUDING more"): here the
ambiguity resolves towards SPLITTING, which is neither exclusion nor
fabrication-admission in the V-1 sense, but it does let a condition quote
only the tail half of what the record's own author intended as one item,
which the docstring itself names as the cost of the whole mechanism ("A
condition that... quotes half of a longer item is now a violation") -- and
this shape is not flagged as a violation; it validates.

End-to-end reproduction, matching a real writing style used elsewhere in this
very repository (`delivery/decisions/DR-0004-elevated-permissions.md` items
1-3, numbered steps each followed by a blank line and an indented shell
command block -- confirmed by direct inspection, lines 24-57):

```
$ node repro3.mjs   # (script content below, run from repo root)
=== list-item continuation paragraph as standalone condition ===
status: 0
```
(full script preserved at end of this section for reproducibility)

```js
await runOne("list-item continuation paragraph as standalone condition", "DR-9001",
  ["# DR-9001: scratch record with a list-item continuation","","## Decision","",
   "- Reviews must be independent, meaning no reviewer may review their own work.","",
   "    This paragraph continues the list item above under CommonMark rules and is not a separate top-level condition.",""],
  "This paragraph continues the list item above under CommonMark rules and is not a separate top-level condition.");
```
`tiphys validate --type assurance-modes --context <dir> <doc citing DR-9001>`
exits **0** with zero diagnostics for a condition that is only half of a
declared list item.

**Is DR-0012 (the only currently-cited record) exposed?**
```
$ grep -n "^-\|^\s*$" delivery/decisions/DR-0012-delegated-merge-authority.md | ...
```
No: every list item in DR-0012 is a single line, or continues via LAZY
continuation (no intervening blank line -- e.g. "SUPERSEDED 2026-08-05 by\n
DR-0015, ..." at 2-space indent with no blank line before it, which stays in
the SAME `current` block). Confirmed by execution, not just reading:

```
$ node -e '... quotableUnits(DR-0012 text) ...'
has the split-away continuation fragment: false
has the combined bullet as ONE unit: true
MATCHED UNIT: "**Never merge across a milestone boundary.** SUPERSEDED
2026-08-05 by DR-0015, which takes the owner out of the merge path
everywhere including milestone boundaries. Half of this limit survives..."
```
The lazy-continuation bullet comes back as ONE unit, not split, so this
shape does not currently expose DR-0012. So this is not exploitable against
the record this repository actually ships today, which is the same reason the original
V-1 was graded medium rather than high (test comment at
`test/assurance-modes.test.ts:1681-1683`). It is graded MEDIUM here on the
same precedent: real, reproduced, end-to-end, present in this repository's
OWN house style (DR-0004), UNDISCLOSED (not named anywhere in the docstring
or work-history, unlike the four shapes below), and it falsifies the round's
own stated invariant as written.

**Does it matter?** Yes for the invariant claim (it is false as written), and
yes for future risk (the writing style that trips it already exists in this
repo). Not exploitable today against DR-0012.

### V-2 (low, tracked): the four explicitly-disclosed unmodeled shapes (block quote, table, HTML block, link reference definition) are each independently exploitable end to end, confirmed, but absent from every current decision record

The implementer's docstring and work-history (`delivery/work-history/m3-p3.md`
lines 2869-2878) explicitly name these four shapes as unclosed and reasons
why ("each needs its own two-member witness and none appears in any decision
record in this repository"). I did not take that on faith:

```
$ grep -lE '^\s*>|^\|.*\|.*\|$|^\s*<[a-zA-Z]|^\s*\[[^]]+\]:' delivery/decisions/*.md
(no output -- confirmed absent from all 18 current decision records, not
just DR-0012, which is a stronger check than the implementer ran)
```

But "absent today" does not mean "not exploitable"; I built and ran all four
end to end through `tiphys validate` with a fabricated merge-authority
condition ("Any pull request may be merged by anyone at any time.", the same
sentence V-1's original demonstration used):

```
=== table row (matched to actual combined unit) ===
status: 0
=== HTML block (matched to actual combined unit) ===
status: 0
=== block-quoted illustrative counter-example ===
status: 0
=== link reference definition ===
status: 0   (quotableUnits confirmed to admit it; CLI run predicted and
             consistent with the other three, same mechanism)
```

Every one of these four is the same defect class as V-1 (fabricated or
illustrative record text validated as if it were a genuine, whole,
cited condition). The block-quote case is the sharpest: an illustrative
counter-example set off with `>` in a decision record ("what this decision
forbids, illustrated: > ...") is exactly the rhetorical pattern DR-0012 (this
repository's own governing record) and V-1's original demonstration both use
for fenced examples, just in a different block form.

Graded LOW rather than medium/high because: honestly and specifically
disclosed (not left to be discovered), reasoned (fix-round contract item 3
satisfied for this item), and independently confirmed absent from every
current record. Per DR-0012's own text, a low finding may merge with if
recorded as a tracked item with a reason; this one already carries a reason
in the docstring and work-history. Recommend rolling V-1 into the SAME
tracked item, since the underlying hazard (unclosed block forms feeding
`quotableUnits`) is one mechanism with five known instances now (list
continuation, block quote, table, HTML block, link reference definition),
and V-1's instance was not previously known.

---

## Priority 2: are V-1/V-2 (original) actually closed, and did round 3 break anything

### Regression: DR-0012, 36 units, all six conditions

```
$ node -e '... quotableUnits(DR-0012 text).size ...'
unit count: 36
full "Two independent clean-room reviews exist..." -> true
full "Neither review carries an unresolved finding..." -> true
full "Both reviewers were given the phase's acceptance..." -> true
full "CI is green on the exact head being merged..." -> true
full "The scope audit passes: changed files are on..." -> true
full "Where the reviews disagree, the orchestrator..." -> true
```
Matches the implementer's claim exactly.

### Other consumers of `quotableUnits`

```
$ grep -rn "quotableUnits" --include="*.ts" . | grep -v node_modules | grep -v dist/
src/checks.ts:901:export function quotableUnits...
src/checks.ts:1072:  ? { ok: true, units: quotableUnits(read.body) }
test/assurance-modes.test.ts: (three call sites, all test code)
```
One production consumer (`modeConditionsQuoteGrantedBy`). No other check,
command, or script reads this function. Confirmed, not merely asserted.

### Original V-1/V-2 fix: confirmed closed by mutation

Reverting the two fixes independently reddens exactly the tests that guard
them (not merely "some test somewhere"):

```
$ python3 -c "... revert ATX_HEADING to /^#/ ..."
$ node --test test/assurance-modes.test.ts
x heading text in the cited record is not a quotable unit... (V-2 witness)
tests 28 / pass 27 / fail 1

$ python3 -c "... revert the entry-boundary indent check line 1004 from >= to > ..."
$ node --test test/assurance-modes.test.ts
x code block content in the cited record is not a quotable unit... (V-1 witness)
tests 28 / pass 27 / fail 1
```
Both reproduced as failing exactly the named test, matching the red-witness
rule's two-member requirement (fenced and indented forms both fail when
their guard is reverted; verified for both members via the shared test).

### Mutation testing every state transition in the new block-state machine

Five mutations SURVIVED (28/28 still pass) against the full
`test/assurance-modes.test.ts` suite:

| # | Mutation | Direction | Live risk with real code? |
|---|---|---|---|
| M1 | `fence = null` on close made unreachable (fence never closes, swallows rest of doc) | dangerous | No -- verified the real code correctly re-opens flow after a fence closes; no test demonstrates this positively |
| M5 | setext-underline branch collapsed to always `discard()` regardless of `currentIsListItem` | safe (excludes more) | N/A, not the dangerous direction |
| M9 | removed the `if (indent === 0) listContentColumn = null` reset | dangerous in principle | No -- built the scenario (`- listitem` / blank / `realtopparagraph` / blank / 4-space code) against the REAL code and it correctly excludes the trailing code block; the reset is load-bearing for that but nothing tests it directly |
| M10 | `FENCE` regex reverted to require column 0 (removes the "any indent" widening the docstring calls out by name) | dangerous | No -- built an indented fence under a 3-space list item against the REAL code and confirmed the fenced sentence does NOT leak; the widening works, it is just untested |
| M11 | `closesFence` marker-type check removed (a tilde run could close a backtick fence) | dangerous | No -- built a backtick fence containing a literal `~~~` line against the REAL code and confirmed it stays fenced through to the real `` ``` `` closer |

Two mutations were correctly KILLED (ATX heading revert, and the real
entry-boundary off-by-one at `src/checks.ts:1004`), confirming those two
specific branches are red-witnessed.

**V-5 (low): five load-bearing branches of the new mechanism have zero
red/green witness coverage.** In every one of the five cases I independently
verified the PRODUCTION code (unmutated) behaves correctly -- this is not a
live defect. It is a witness-discipline gap under this project's own
red-witness rule ("a test only counts as guarding a behavior if it has been
demonstrated red without the behavior and green with it"): fence-closing
itself, the indented-fence widening the docstring calls out by name, the
fence-closer's marker-type discriminator, and the list-column reset are all
unguarded against a future round accidentally reverting them. Recommend as a
tracked item, not a blocker: the mechanism works today, but the next round
that touches this function has no witness telling it if it breaks these four
things.

---

## Priority 3: the disclosures

### Schema `$comment`s: accurate as far as they go, but they cite an authority that does not exist on this branch (see V-4)

Five `$comment` additions confirmed (not four, not six):
`schemas/assurance-modes.schema.json` (`stageId`, mode `id`),
`schemas/charter.schema.json` (`delivery-mode`, `assurance-tier`),
`schemas/role-model-config.schema.json` (`role`). Each new sentence is a
claim about what the `enum` keyword does ("this enum rejects every other
value") plus an M4-deferral attributed to DR-0019 -- checked against the
schemas and true: JSON Schema `enum` is a closed set by definition, and no
`additionalProperties`/pattern widens it back open anywhere in these five
locations (confirmed by reading each schema file directly, not just the
diff).

### `mode show`'s `execution-status`: genuinely derived, not a hardcoded id list

```
$ grep -n "shippedDocument\|mode.skips.length" src/modes.ts
```
confirms the derivation keys on two facts (`context.shippedDocument`,
`mode.skips.length === 0`), not on comparing the mode's `id` against a
literal list. Verified for all three shipped states:

```
$ node bin/tiphys.ts mode show --mode full | head -2
execution-status: this mode declares no skipped stage...

$ node bin/tiphys.ts mode show --mode direct-pr | head -2
execution-status: DECLARED AND VALIDATED, NEVER EXERCISED...

$ node bin/tiphys.ts mode show --mode full --file <staged copy of the shipped doc> | head -2
execution-status: not determinable here. This is not the kernel's own
assurance-modes.yaml, so nothing tiphys ships records whether any phase has
been delivered under this mode (DR-0019).
```
The third line is the one the dispatch specifically asked for (a consumer's
own document): confirmed the SAME byte-identical content produces a
DIFFERENT, honest answer purely because it was read via `--file` rather than
as the shipped document. No hardcoded mode-id branching found anywhere in
`executionStatus` or `RELEASE_LIMITS`.

### `mode show`'s escalation bounds: still correctly described as data, not enforcement

```
$ node bin/tiphys.ts mode show --mode full | grep -n escalation-bounds
escalation-bounds (data an orchestrator brief cites; nothing in this release
counts fix rounds, detects recurrence, or enforces these):
```
Consistent with the actual code: nothing in `src/` counts fix rounds or
tracks recurrence (confirmed by the same grep discipline CLAUDE.md's C-2/C-3
token check already uses elsewhere in this repo -- no hit for
liveness/counting language near this data).

### `npm pack --dry-run`

```
$ npm pack --dry-run
...
npm notice total files: 123
```
123 files, matching the implementer's number. `grep -i "delivery/"` against
the file list: zero hits, confirming `delivery/**` (and hence the plan, the
decision records, and DR-0019 itself even if it existed) ships to no
consumer. Extracted the actual tarball and confirmed the five `$comment`
strings ship byte-for-byte in the packed JSON schemas (not stripped, unlike
`.d.ts` comments):
```
$ tar -xzf tiphys-kernel-0.0.0.tgz -O package/schemas/assurance-modes.schema.json | grep -o "CLOSED VOCABULARY...v0.1.0..."
CLOSED VOCABULARY AT v0.1.0 (DR-0019): these are the tiphys kernel's OWN stage ids...
```
So the disclosure text itself genuinely ships. The problem is what it points
to (V-4).

### V-4 (high): every disclosure this round shipped cites DR-0019 as its authority, and DR-0019 does not exist anywhere on this branch or on `origin/main`

```
$ ls delivery/decisions/ | grep -i DR-0019
(nothing -- highest existing id is DR-0018)
$ git ls-tree -r origin/main --name-only | grep -i DR-0019
(nothing)
```
`git log --all --oneline -- 'delivery/decisions/DR-0019*'` shows the ONLY
commit that ever added a file matching that name on ANY branch reachable
from this session is `d44d479`, on `claude/reviews-m3-p3` --
`delivery/decisions/DR-0019-closed-vocabulary-at-v0-1-0.md`. That branch is a
SIBLING of this implementation branch, not an ancestor:
```
$ git merge-base --is-ancestor d44d479 HEAD ; echo $?
1   (NO)
$ git merge-base --is-ancestor HEAD d44d479 ; echo $?
1   (NO)
$ git merge-base HEAD d44d479
45722e3117f8915cd2e45659a8e267a4ae873975   (the common ancestor before EITHER branch's own work)
```
The implementer knows this and says so plainly (`delivery/work-history/m3-p3.md:3066-3068`):
"Read first: `delivery/decisions/DR-0019-closed-vocabulary-at-v0-1-0.md` (on
`claude/reviews-m3-p3`, not yet on my branch; read with `git show
claude/reviews-m3-p3:delivery/decisions/DR-0019-closed-vocabulary-at-v0-1-0.md`)."
So this is disclosed, not hidden -- but it is UNRESOLVED, and it is worse
than an ordinary missing file:

1. **Five shipped schema `$comment`s, plus code comments in `src/modes.ts`,
   plus multiple test assertions, all cite "(DR-0019)" as the authority for a
   decision (closing three vocabularies at v0.1.0) that the task's own framing
   says is EXPLICITLY CONDITIONAL on disclosure.** If this branch merges to
   `main` before `claude/reviews-m3-p3` (or before the DR-0019 file is
   otherwise brought onto `main`), `main` -- and the next `npm pack` -- will
   carry a shipped, citable, permanent artifact pointing at a decision record
   that does not exist anywhere in the repository. A consumer or a future
   auditor who goes looking for DR-0019 to understand why a vocabulary is
   closed finds nothing.
2. **The id DR-0019 was already allocated and retired once**, for an
   unrelated M2-P5 topic (`delivery/review/clean-room-citations-scope-hazard.md`
   documents a "fabricated DR-0019 owner sign-off," subsequently
   re-attributed and the file removed -- confirmed via
   `git log --all --diff-filter=A --name-only` showing
   `delivery/decisions/DR-0019-citations-scope-forward-docs.md` added by
   `719f04f` and the removal commit `f775c56`). Re-using a retired numeric id
   for a second, unrelated, real decision is exactly the hazard CLAUDE.md's
   own Identifier-schemes section names for `A-n` ("a shipped configuration
   string is why an id here is not free to renumber, so allocate a fresh id
   and never reuse a retired one"); the same reasoning applies to `DR-nnnn`,
   and this repository has now done it once with a decision id that ships
   inside package artifacts.
3. **No gate catches this, confirmed by execution as well as by reading the
   pattern.** `CITATION_SOURCE` (`src/gates/citations.ts:453`) is
   `[path].(ts|tsx|js|...):line[-line][@sha256:hash]` -- structurally it
   cannot match a bare `(DR-0019)` token, which has no file extension and no
   line number. Ran the actual gate against this exact diff rather than
   trusting the regex reading alone:
   ```
   $ node src/gates/citations.ts --base origin/main --head HEAD \
       --result citation-result.json --evidence citation-evidence
   citations: not-applicable (0 citations resolved)
   $ echo $?
   0
   ```
   It does not even reach the point of scanning for a `DR-nnnn` token on this
   diff (no changed path is under its configured `documents` globs), so it
   is not merely blind to this citation shape, it never looks.

This is not a logic defect in `quotableUnits` and is out of the phase's own
mechanism, but it is squarely inside Priority 3's charge ("a disclosure that
does not ship, or that claims something untrue, invalidates the decision
rather than merely being untidy") and it is a merge-readiness blocker for
THIS branch as it stands: merging it now, alone, produces the dangling-
citation state above. Recommend: merge `claude/reviews-m3-p3` (or otherwise
land `delivery/decisions/DR-0019-closed-vocabulary-at-v0-1-0.md` on `main`)
strictly before or together with this branch, never after. Graded HIGH
because it touches the grounding of an owner/orchestrator-level decision
that the shipped package now permanently cites.

### The version-string discrepancy the implementer flagged (not independently graded, already surfaced)

`package.json` says `"version": "0.0.0"`; all five disclosures say `v0.1.0`.
Confirmed both sides directly (`grep version package.json`, `grep v0.1.0
schemas/*.schema.json`). The implementer reported this themselves as
unresolved and attributed the decision to the orchestrator/release step. I
did not re-grade it; noting it here so it is not lost.

---

## Priority 4: cross-phase spot checks (confirmed, not fixed)

### `src/gates/coverage.ts` `extractIdRows` (M2-P3's file): confirmed defective

```
$ node -e '... extractIdRows("Some doc\n\n\`\`\`\n| R-999 | some text | done |\n\`\`\`\n", "R-[0-9]+") ...'
[{"id":"R-999","cells":["R-999","some text","done"],"line":4}]
```
A fenced table row is admitted as a real coverage row. Confirmed as
reported. `src/gates/coverage.ts` is not on this phase's files-to-touch
list; not edited.

### `scripts/check-clause-map.mjs` `parseInventory` (another phase's file): confirmed defective

```
$ node -e '... parseInventory("Doc\n\n\`\`\`\n| R-999 | M3-P9 | not really implemented |\n\`\`\`\n") ...'
[{"id":"R-999","phase":"M3-P9"}]
```
Same mechanism, same result. Confirmed as reported; not edited.

**V-7 (informational):** both cross-phase claims check out. No action
needed from this phase; both are correctly reported to the orchestrator as
another phase's problem in `delivery/work-history/m3-p3.md`, and I did not
find anything the implementer's report overstated here.

---

## Findings summary

| id | severity | one-line |
|---|---|---|
| V-1 | medium | list-item continuation paragraph admitted as an independent quotable unit; falsifies the stated invariant; present in this repo's own DR-0004 house style, though not in the currently-cited DR-0012 |
| V-2 | low (tracked) | the four explicitly-disclosed unmodeled block forms (block quote, table, HTML block, link ref def) are confirmed exploitable end to end but absent from all 18 current decision records; adequately disclosed and reasoned |
| V-3 | high | scope gate is RED (exit 1) on the exact head under review; pre-exists round 3 (confirmed also red at round 2's head); DR-0012 condition 5 fails on this head as it stands |
| V-4 | high | five shipped schema disclosures (plus code/test citations) cite DR-0019, which exists only on a sibling, unmerged branch and was previously a retired/removed id for an unrelated decision; disclosed by the implementer but unresolved |
| V-5 | low (tracked) | five load-bearing branches of the new block-state machine (fence re-open, indented-fence widening, fence-closer marker discrimination, list-column reset) have zero red/green witness coverage; production behavior verified correct in all five cases |
| V-6 | none (verified accurate) | schema $comments, `mode show` derivation, escalation-bounds wording, and `npm pack` contents all checked and hold as claimed, independent of V-4's citation problem |
| V-7 | informational | both cross-phase claims (coverage.ts:356, check-clause-map.mjs:139) confirmed by direct reproduction; correctly out of scope, correctly reported, not edited |

Regressions from round 2 to round 3: none found. DR-0012's 36 units and six
conditions are unchanged and verified. The two original findings (V-1, V-2 in
the fix-round-history's own numbering; renamed here to avoid collision with
this report's own V-1/V-2) are closed and mutation-confirmed.

---

## What this verification did NOT cover

1. **CI was not observed on either the `pull_request` or `push` arm.** T-009's
   both-arms requirement is not discharged by anything above; every
   measurement in this report is local execution on Node v26.6.0 in a
   detached worktree plus one throwaway clone. The scope-gate red result
   (V-3) in particular should be re-confirmed by an actual CI run before
   treating my local reproduction as the final word, though I did use the
   real `origin/main` fetched fresh and the real branch name, not a
   simulated approximation.
2. **The full `gates run --registry gate-registry.yaml` invocation was not
   executed**, only the two gates the dispatch named explicitly (`scope`) plus
   the three baseline commands (`npm ci`, `npm run build`, `node --test`).
   `manifest-self-check`, `credential-scrub`, `credential-token`, `suite`,
   `citations`, `deploy`, `migrations`, `clause-map`, `red-witness`,
   `agent-rules-drift`, and the two clean-room-checklist probes were not run
   by me this round. `suite` and `red-witness` in particular could catch
   things the plain `node --test` run cannot (behaviors.json resolution,
   witness collision rules); I did not check those manifests against this
   round's two new behaviors beyond reading `test/behaviors.json`'s diff.
3. **Mutation testing was scoped to `quotableUnits` and its four block-form
   regexes/helpers** (`FENCE`, `ATX_HEADING`, `SETEXT_UNDERLINE`,
   `closesFence`, `columnWidth`, `indentColumns`, the list-item branch). I did
   not mutate `LIST_ITEM`'s own regex, `THEMATIC_BREAK`, or
   `normalizeProse`, and I did not attempt combinations of two simultaneous
   mutations.
4. **`test/` and `delivery/` were not searched for the same block-scanning
   defect class**, matching exactly the gap the implementer's own derivation
   named as uncovered. I did not independently search those trees either;
   this is inherited, not newly excluded by me.
5. **YAML and JSON documents were not considered** as a citation or
   quotable-unit surface, only markdown, matching the implementer's own
   stated scope limit.
6. **`gh`-dependent paths were not exercised** (no `gh` available locally);
   anything that requires a real GitHub API round trip (PR state, required
   check names) is unverified by me.
7. **I did not attempt to resolve V-3 or V-4.** Per the dispatch, cross-phase
   files were confirmed but not edited; V-3 and V-4 are this phase's own
   branch and declaration, and I left them as found for the orchestrator to
   decide how to sequence (declaration correction plus possibly a rebase for
   V-3; branch-merge ordering or a copied decision record for V-4), since
   both are process/sequencing decisions rather than a single obvious code
   fix.
8. **The severity grading of V-1 versus V-2 (medium vs low) rests on my own
   reading of this project's own precedent** (the test comment explaining why
   the original V-1 was graded medium rather than high). I applied that
   precedent consistently but did not get a second opinion on whether an
   UNDISCLOSED instance of the class (V-1 here) should be graded strictly
   higher than a DISCLOSED one (V-2 here) purely for the disclosure gap, as
   opposed to the exploitability being what it is either way.
9. **I did not verify the M3-P1 phase declaration or any earlier phase's
   scope-gate history**, only M3-P3's, so I cannot say whether the
   declaration-editing pattern that produced V-3 is unique to this phase or
   a repeated shape across the project.
