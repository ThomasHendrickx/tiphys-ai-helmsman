# Clean-room review: M3-P3 (DR-0022 option A2), CORRECTNESS lens

- Head under review: `218fc12`
- Reviewer worktree: `scratchpad/wt-m3p3-a2-cr-a`, branch `review-a2-crit`
- Toolchain: node v26.6.0 (scratch prefix), npm from same
- Lens: CORRECTNESS. A second reviewer runs supply-chain/regression separately; not read.
- Status: COMPLETE. Verdict CHANGES REQUIRED: 2 medium, 1 low (CR-001, CR-002, CR-003).
- The log below is the incremental beacon trail; the findings begin at "# Findings".

## Log

- [t0] Worktree verified: `git branch --show-current` = `review-a2-crit`, head `218fc12`, `node --version` = v26.6.0.
- [t1] `npm ci` exit 0; `npm run build` exit 0, `git status` clean apart from this report.
- [t2] FIRST ATTACK LANDED: `startOffset`/`SKIPPABLE_PREFIX` leaks list markers into the unit when
  two block markers share one line (`- - x`, `- 1. x`, `1. - x`, `- > x`). Details below as CR-001.
- [t3] Acceptance criterion RE-DERIVED INDEPENDENTLY: old `src/checks.ts` taken from git at
  `18c335a` via `git archive` (md5 `4f9ed9b66f6a7e1e04efdb2450c7da9e`, identical to the round's
  staged `oldsrc/checks.ts`), new from this worktree. 20/20 records byte-identical. CONFIRMED.
- [t4] The 40-shape exploit set re-run against the shipped `src/checks.ts`: 40/40, 0 fail-open,
  0 over-strict. CONFIRMED.
- [t5] Extension set of 45 NEW shapes scored against the project's OWN oracle (`probe/oracle.mjs`):
  35/45. Ten failures, all one mechanism (CR-001).
- [t6] OPEN QUESTION SETTLED: `suite` 501 vs `node --test` 503. `npm test` runs
  `node --test "test/**/*.test.ts"` and reports 501; the gate walks root `test` for `.test.ts`
  and reports 501. A BARE `node --test` uses Node's own default discovery, which also matches
  `sandbox/test/greet.test.js` (a fixture of the sandbox example project). That file declares
  exactly 2 tests and runs green alone. 501 + 2 = 503. Not a defect in either counter.
- [t7] Fabrication rejection re-verified live (7 variants, each its own exit code): all rejected.
  Omission direction confirmed NOT covered by the check (documented) and covered by a test.
- [t8] Mutation campaign in progress. M01 (`carriesProse` always true) SURVIVES.
- [t9] Mutation campaign (targeted file `test/assurance-modes.test.ts`, 30 tests) partial results.
  ELEVEN of the first seventeen mutants SURVIVE. Full-suite confirmation runs queued.

```
M01 carriesProse always true                            | exit=0 | pass 30 fail 0   SURVIVES
M02 carriesProse always false                           | exit=1 | pass 17 fail 13  killed
M03 NOT_QUOTABLE emptied                                | exit=0 | pass 30 fail 0   SURVIVES
M04 startOffset trusts the column (the pre-fix state)   | exit=0 | pass 30 fail 0   SURVIVES
M05 startOffset never trusts the column                 | exit=1 | pass 17 fail 13  killed
M06 startOffset fallback strips nothing                 | exit=0 | pass 30 fail 0   SURVIVES
M07 sourceSlice ignores endColumn                       | exit=0 | pass 30 fail 0   SURVIVES
M08 sourceSlice ignores startOffset                     | exit=1 | pass 17 fail 13  killed
M09 sourceSlice does not strip continuation > markers   | exit=0 | pass 30 fail 0   SURVIVES
M10 sourceSlice joins lines with no space               | exit=0 | pass 30 fail 0   SURVIVES
M11 quotableUnits splits on LF only (CRLF/CR broken)    | exit=0 | pass 30 fail 0   SURVIVES
M12 collectUnits does not deepen quote depth            | exit=0 | pass 30 fail 0   SURVIVES
M13 paragraphsBeneath does not deepen quote depth       | exit=0 | pass 30 fail 0   SURVIVES
M14 paragraphsBeneath skips nested lists                | exit=1 | pass 29 fail 1   killed
M15 sameStringList always equal                         | exit=1 | pass 28 fail 2   killed
M16 normalizeProse does not trim                        | exit=0 | pass 30 fail 0   SURVIVES
M17 conditions compared by containment again            | exit=1 | pass 26 fail 4   killed
```

M04 is the sharpest: it restores EXACTLY the truncation defect this round reports fixing
(`startOffset` trusting `sourcepos[0][1]` instead of verifying it), and no test notices.
- [t10] Gates, each with its OWN exit code (not a pipeline's), node v26.6.0 in every shell.
  Registry runner, `--only <id>`: manifest-self-check 0, credential-scrub 0, agent-rules-drift 0,
  coverage 0, citations 0, clause-map 0. `scope` run in `../wt-m3p3` where
  `git branch --show-current` prints `claude/m3-p3-assurance-modes`: EXIT=0, green, 37 paths.
  NOTE for the orchestrator: `--base` MUST be `git merge-base HEAD origin/main` (= 3c60acb).
  Local `main` in these worktrees is STALE at c2e2009, and using it makes scope red with 57
  out-of-scope paths that are actually main's own. That is a measurement artifact, not a finding.
- [t11] Both ASCII checks with `-a` over `git ls-files` minus the two path exemptions (428 files):
  non-ASCII grep EXIT=1 (no match), control-character grep EXIT=1 (no match). Clean.
- [t12] Tabs, CRLF, lone CR, wide markers, setext/thematic interaction: a 20-shape focused probe
  scores 20/20 against the oracle. The slicing IS correct for these; it is merely untested.
- [t13] `red-witness` gate EXIT=0. Whitespace-only condition that clears the schema is rejected
  by the check (fail-closed, as documented). Setext correction independently confirmed against
  `commonmark`'s own HTML renderer.
- [t14] Drafting the finding sections now.

---

# Findings

## CR-001 (MEDIUM) A unit keeps its block markers when two block markers open on one line

**Mechanism, not the instance.** `startOffset` (src/checks.ts:925) verifies the parser's start
column by requiring the text it would skip to BE a block prefix, and `SKIPPABLE_PREFIX`
(src/checks.ts:895) models that prefix as *zero or more block-quote markers, then indentation,
then AT MOST ONE list marker*:

```
/^(?:[ \t]*>[ \t]?)*[ \t]*(?:(?:[0-9]{1,9}[.)]|[-*+])[ \t]*)?$/
```

CommonMark allows a container prefix to open any number of blocks on one line, in any order. The
regex is anchored, so a prefix carrying TWO list markers, or a block quote opened AFTER a list
marker, fails the verification even though the column was correct. Control then falls to the
recovery path, which strips only leading block-quote markers; on a line that begins with a LIST
marker it strips nothing at all and returns offset 0, so the raw markers become part of the unit.

The class is exactly the one the round says it closed. The round fixed the case where the column
is WRONG. It did not consider the case where the column is RIGHT and the verifier cannot recognise
it, which sends a correct column down the recovery path.

**Reproduction.** Extension of the 40-shape exploit set, scored against the project's own oracle
(`probe/oracle.mjs`), on 45 new shapes deliberately carrying NO inline markup so that the oracle's
inline-text reading and a correct source slice must agree exactly and any divergence is a SLICING
defect rather than the A-versus-A2 distinction. Command and its own exit code:

```
$ node crA/probe/extend.mjs
FAIL  X01  (two list markers on one line, dash dash)
      md     : "- - nested item text\n"
      oracle : ["nested item text"]
      actual : ["- - nested item text"]
FAIL  X03  (ordered marker nested in unordered, one line)
      md     : "- 1. ordered inside\n"
      oracle : ["ordered inside"]
      actual : ["- 1. ordered inside"]
FAIL  X04  (unordered nested in ordered, one line)
      md     : "1. - dash inside\n"
      oracle : ["dash inside"]
      actual : ["1. - dash inside"]
FAIL  X05  (block quote opened inside a list item, one line)
      md     : "- > quoted inside an item\n"
      oracle : ["quoted inside an item"]
      actual : ["- > quoted inside an item"]
FAIL  X07  (two markers on one line, second line continues)
      md     : "- - first line here\n    second line here\n"
      oracle : ["first line here second line here"]
      actual : ["- - first line here second line here"]
...
extension: 35/45 shapes match the oracle exactly
failing ids: ["X01","X02","X03","X04","X05","X07","X08","X10","X39","X40"]
extend.mjs exit=0
```

Second, independent witness (a class, not one shape). A markup-free differential fuzz over 6,000
generated documents, seed 20260809:

```
$ node crA/probe/fuzz-slice.mjs 6000 20260809
documents: 6000   divergences: 2444
  2436	extra unit carries a leading block marker
  8	extra unit, no leading marker
```

The eight in the second class are the same mechanism with the leaked markers landing INSIDE the
joined unit rather than at its head, for example
`"delta iota eta - > epsilon"` where the oracle says `"delta iota eta epsilon"`.

**Why this is a defect and not a policy choice.** Three of the module's own statements contradict
the shipped behaviour:
- `quotableUnits`' contract sentence: "every top-level PARAGRAPH and every OUTERMOST LIST ITEM,
  each with its marker stripped and its whitespace normalized" (src/checks.ts:1035).
- `collectUnits`' declared policy: "the quoted paragraph is a unit and the `>` marker is NOT part
  of it" (src/checks.ts:1000).
- The project's own grading. In `delivery/review/dr-0022-option-evidence.md` the old
  implementation's shape S28 is recorded as "**FAIL, admits `>`-carrying string**". `> quoted` at
  top level is now correct; `- > quoted` is not. One member of the class was fixed and a
  structurally different member was left, which is the "one witness is not a class" shape.

**Both directions are live.** The unit set gains a marker-carrying string (the direction the
project grades fail-open) AND loses the real prose (so a correctly quoted condition is rejected).

**What the derivation did NOT cover.** I did not attempt to determine whether any consuming
project's decision record uses the shape. In THIS repository it is latent: the sweep

```
$ git ls-files '*.md' | xargs grep -nP '^\s*(?:>\s?)*(?:[0-9]{1,9}[.)]|[-*+])\s+(?:[0-9]{1,9}[.)]|[-*+]|>)\s'
(no output)   exit=0
```

finds no such line in any tracked markdown, and all 20 shipped decision records extract correctly
(see the acceptance-criterion section). So no shipped document is affected today. `src/checks.ts`
is nevertheless a KERNEL deliverable whose whole promise is exact whole-unit equality on records it
has never seen, which is why this is medium and not low.

## CR-002 (MEDIUM) Both defects this round fixed have no red witness, and 14 of 20 mutations of the new code survive

**Mechanism.** The red-witness rule is binding: a test guards a behavior only when it has been
demonstrated red without it, and it applies to fix-round tests too. Round 6 reports finding and
fixing two defects inside the new implementation (the empty-paragraph shape in `carriesProse`, and
the trusted-column truncation in `startOffset`). Neither fix acquired a test or a witness spec, so
each can be reverted in place with the suite and every gate still green. That is the T-011 shape
one level down: a fix that stops being a fix while nothing notices.

**Reproduction.** Twenty mutations of the new code, each applied to a pristine copy of
`src/checks.ts` (md5 `0d3504eadfc894d85e06b9a81d2f0db6`, restored by `cp` after every run, never by
`git checkout --`), each scored by `node --test test/assurance-modes.test.ts` (30 tests, ~28s), its
own exit code:

```
M01 carriesProse always true                            | exit=0 | pass 30 fail 0   SURVIVES
M02 carriesProse always false                           | exit=1 | pass 17 fail 13  killed
M03 NOT_QUOTABLE emptied                                | exit=0 | pass 30 fail 0   SURVIVES
M04 startOffset trusts the column (the pre-fix state)   | exit=0 | pass 30 fail 0   SURVIVES
M05 startOffset never trusts the column                 | exit=1 | pass 17 fail 13  killed
M06 startOffset fallback strips nothing                 | exit=0 | pass 30 fail 0   SURVIVES
M07 sourceSlice ignores endColumn                       | exit=0 | pass 30 fail 0   SURVIVES
M08 sourceSlice ignores startOffset                     | exit=1 | pass 17 fail 13  killed
M09 sourceSlice does not strip continuation > markers   | exit=0 | pass 30 fail 0   SURVIVES
M10 sourceSlice joins lines with no space               | exit=0 | pass 30 fail 0   SURVIVES
M11 quotableUnits splits on LF only (CRLF and CR break) | exit=0 | pass 30 fail 0   SURVIVES
M12 collectUnits does not deepen quote depth            | exit=0 | pass 30 fail 0   SURVIVES
M13 paragraphsBeneath does not deepen quote depth       | exit=0 | pass 30 fail 0   SURVIVES
M14 paragraphsBeneath skips nested lists                | exit=1 | pass 29 fail 1   killed
M15 sameStringList always equal                         | exit=1 | pass 28 fail 2   killed
M16 normalizeProse does not trim                        | exit=0 | pass 30 fail 0   SURVIVES
M17 conditions compared by containment again            | exit=1 | pass 26 fail 4   killed
M18 empty unit is still added                           | exit=0 | pass 30 fail 0   SURVIVES
M19 startOffset offset bound off by one                 | exit=0 | pass 30 fail 0   SURVIVES
M20 SKIPPABLE_PREFIX accepts anything                   | exit=0 | pass 30 fail 0   SURVIVES
```

The two that matter most:

- **M04 IS the pre-fix state.** `if (offset <= text.length && SKIPPABLE_PREFIX.test(...))` becomes
  `if (offset <= text.length)`. That is precisely the code the round replaced, and the round's own
  reproduction (`"> [eta]: https://example.invalid/theta\nepsilon eta.\n"` yielding the corrupt
  `"silon eta."`) is not in any test. M20 (`SKIPPABLE_PREFIX` accepts anything) is the same defect
  reached from the other side and also survives.
- **M01 IS the other pre-fix state.** `carriesProse` becomes `return true`, restoring the shape the
  round found by differential fuzz (a link reference definition followed by a setext `-`
  underline), and nothing reddens.

**Derivation that these survive the WHOLE suite, not only the file I ran.** `quotableUnits` has
exactly one consumer in the shipped code and exactly one in the tests:

```
$ git grep -n "quotableUnits" -- . | grep -v '^delivery/'
src/checks.ts:802,1142,1210
test/assurance-modes.test.ts:71,1624,1627,1633,1750,1877,2206,2283,2301,2409,2430,2508
```

and no witness spec names any of the new internals:

```
$ python3 -c "... print every dangerousStates.find in witness/checks-*.json ..."
(no member matches startOffset, SKIPPABLE_PREFIX, sourceSlice, carriesProse, or the split regex)
```

**What that derivation did NOT cover:** it is a name search over `src`, `test`, `witness`,
`scripts` and `.github`. It would miss a test that reaches the extractor purely through the
`tiphys validate` CLI on a fixture whose text never contains the string `assurance-modes` or
`quotableUnits`. I did not enumerate CLI invocations exhaustively; a full-suite run under M04 is
the direct measurement and is recorded below if it completed before I finished.

**Also unguarded, and each is a behaviour the docstrings assert at length:** CRLF and lone-CR line
splitting (M11), block-quote continuation marker stripping (M09), the end-column bound (M07), the
inter-line join (M10), and block-quote depth accounting (M12, M13). I measured each of these to be
CORRECT at head (a 20-shape tab/line-ending probe scores 20/20), so this is a witness gap, not a
second behaviour defect.

## CR-003 (LOW) `NOT_QUOTABLE` has no observable effect, and its docstring claims a role it does not perform

**The round's claim is CONFIRMED and the reason is stronger than "no test covers it".** Emptying
the set cannot change any answer, for a structural reason: all four excluded types are LEAF blocks
in `commonmark`'s AST. `code_block`, `html_block` and `thematic_break` have no children at all, and
a `heading`'s children are INLINE nodes rather than `paragraph`. Both walkers only ever emit a unit
for a `paragraph` child, so recursing into these four types reaches nothing that can produce a
unit. Captured, `commonmark` 0.31.2, node v26.6.0:

```
$ node -e '<parse a document with all four block types and print each child list>'
heading         children: ["text","code","text","strong"]
code_block      children: []
code_block      children: []
html_block      children: []
thematic_break  children: []
probe EXIT=0
```

Measured: M03 (`NOT_QUOTABLE` emptied) leaves `node --test test/assurance-modes.test.ts` at exit 0,
30 pass, and the 40-shape exploit set, my 45-shape extension and the 6,000-document fuzz are all
unchanged by it.

**Judgement asked for by the brief: keep it, but fix the prose.** Deleting it would be wrong,
because it is the only thing that makes the exclusion INTENTIONAL rather than accidental: today
these blocks are excluded by an implementation detail of one parser version, and a `commonmark`
release that gave `html_block` block children, or a project that used a Markdown extension, would
silently start admitting non-prose. Keeping a defensive set that documents the intent is
defensible. What is NOT defensible is `quotableUnits`' docstring saying "HTML block: excluded, like
any other non-prose block" and `NOT_QUOTABLE`'s own docstring implying the set performs the
exclusion, when the exclusion is performed by the AST's shape. The claim-grep discipline applies:
the true sentence is "these types cannot contribute a unit under `commonmark` 0.31.2 whether or not
they are in this set; the set exists so that a parser change cannot make them contribute one."

Secondary observation, same area: `witness/checks-heading-forms-not-quotable.json` and
`witness/checks-code-block-content-not-quotable.json` declare BYTE-IDENTICAL `dangerousStates`
arrays. Two behaviors are witnessed by the same two mutations, so the pair proves the shared
`paragraph`/`else` branches and proves nothing specific to headings versus code blocks. It is not a
false green (both do redden), but it is not two classes either.

## Not a finding: the 501 versus 503 counter gap, EXPLAINED

The round observed it, did not explain it, and did not call it harmless. It is fully accounted for.

`package.json`'s test script is `node --test "test/**/*.test.ts"`. That reports **501**:

```
$ npm test
i tests 501   i pass 501   i fail 0   i skipped 0   i todo 0
EXIT=0
```

A BARE `node --test` uses Node's OWN default discovery, which matches any file under a directory
named `test` as well as `*.test.*`. The repository has exactly one such file outside `test/`:

```
$ git ls-files | grep -E '(^|/)(test|test-[^/]*|[^/]*[-_.]test)\.(ts|mts|cts|js|mjs|cjs)$' | grep -v '^test/'
sandbox/test/greet.test.js
```

It is a fixture of the `sandbox/` example project and declares exactly two tests:

```
$ node --test sandbox/test/greet.test.js
OK greet returns a greeting for a name
OK greet rejects an empty name
i tests 2   i pass 2   i fail 0
node --test sandbox EXIT=0

$ node --test                 # bare, default discovery
i tests 503   i pass 503   i fail 0
EXIT=0
(its first two reported tests are the two greet tests)
```

**501 + 2 = 503.** The `suite` gate walks the declared root `test` for suffix `.test.ts` and
reports 501 from 30 files, which agrees with `npm test` exactly. Neither counter is wrong; the two
numbers come from two different discovery scopes, and the gate's is the one that matches the
repository's own test script. Round 5's work history already stated this cause ("the gate walks the
declared root for `.test.ts` while `node --test` with no argument discovers more"); round 6 did not
connect the two records. Nothing to fix beyond noting it.

## Not a finding: the corrected setext expectation is RIGHT

The brief asked me to judge the corrected assertion rather than re-report the original. Confirmed
independently against `commonmark` 0.31.2's own HTML renderer, not against the implementation:

```
$ node -e 'const cm=require("commonmark"); ... render the item ...'
<ol start="3">
<li>
<p>The setext item opens here.</p>
<h2>An aside underlined inside the item</h2>
<p>and the setext item ends here.</p>
</li>
</ol>
```

`An aside underlined inside the item` over a `-` run inside a list item is an `<h2>`. Heading text
belongs to no unit, so the item's one unit is
`"The setext item opens here. and the setext item ends here."`, which is what the corrected row
demands and is consistent with the fence, ATX and thematic-break rows beside it. The old assertion
also contradicted the sibling assertion twelve lines below it in the same test. The correction is
right, and correcting the TEST rather than the implementation was the right call.

## Verified and holding: what I attacked and could not break

### 1. The owner's acceptance criterion: 20/20 byte-identical

RE-DERIVED, not accepted. The old implementation was taken from git rather than from the round's
staged copy:

```
$ git archive 18c335a src | tar -x -C crA/old18
$ md5sum crA/old18/src/checks.ts
4f9ed9b66f6a7e1e04efdb2450c7da9e     (identical to the round's own oldsrc/checks.ts)
$ node crA/records.mjs
records: 20
  IDENTICAL  DR-0001-license.md  15 units
  ... (all twenty)
  IDENTICAL  DR-0022-quotable-units-after-five-rounds.md  47 units
byte-identical unit sets: 20/20
EXIT=0
```

Including DR-0022 itself, which arrived by merge and which the dead implementer never saw.

### 2. The 40-shape exploit set: 40/40

```
$ node crA/probe/run-set.mjs current
current: 40/40 shapes match the oracle exactly
  fail-open (admits a unit the oracle does not have): 0  []
  over-strict only (misses a unit)                  : 0  []
EXIT=0
```

### 3. The four previously unmodelled block forms are modelled CORRECTLY, not merely differently

- **Block quote.** Top-level and nested to depth three are correct, markers stripped, lazy
  continuations correct, blank quote lines correct (X06, X09, X14, X15, X22, X23, T05, T06, T10).
  The one exception is a quote opened AFTER a list marker on the same line, which is CR-001.
- **HTML block.** Excluded at top level, inside a list item and inside a quote (X35, X36).
- **Link reference definition.** Excluded, including the two shapes that defeated earlier versions:
  a definition followed by a lazy continuation (X25, X26), and a definition followed by a setext
  `-` underline, which leaves an EMPTIED paragraph whose `sourcepos` still spans the removed text
  (`carriesProse` handles it). Multiple stacked definitions also correct (X27).
- **Pipe table.** Correctly treated as prose, at top level, inside an item and inside a quote
  (X37, X38). CommonMark core has no tables, so this is right.

### 4. The slicing survives tabs, CRLF, lone CR, wide markers and multi-byte text

A 20-shape focused probe scores 20/20 against the oracle: double tabs after markers and inside
quotes, tab-indented continuations, CRLF in paragraphs / items / quotes, lone-CR documents, MIXED
line endings in one document, nine-digit ordered markers, paren markers, and astral-plane
characters (X28, X29, X30 pass too, because `sourcepos` columns and `String.prototype.slice` are
both UTF-16 code-unit offsets and therefore agree). The round's claim that `sourcepos` columns are
CHARACTER offsets and not display columns is correct; I re-measured the tab cases it cites.

### 5. DR-0012's six conditions still resolve, and fabrication is still rejected

```
$ node bin/tiphys.ts validate --type assurance-modes --context . assurance-modes.yaml
(no output)                                                        EXIT=0
$ node bin/tiphys.ts validate --type assurance-modes assurance-modes.yaml
SKIPPED charter-mode-enum-matches-modes no context
SKIPPED mode-conditions-quote-granted-by no context
SKIPPED mode-gate-sets-resolve no context                          EXIT=1
```

Eight fabrication variants, each written to its own file and validated with its own exit code:

```
F1-all-six-junk        (the fix-round-2 exploit: a,the,review,merge,is,of)  EXIT=1  6 findings
F2-single-fabricated   (one condition rewritten to say the opposite)        EXIT=1  1 finding
F3-fragment            (a real condition truncated to a prefix)             EXIT=1  1 finding
F4-paraphrase          (one word removed)                                   EXIT=1  1 finding
F5-trailing-word       (a real condition plus an extra sentence)            EXIT=1  1 finding
F6-case-change         (CI -> ci)                                           EXIT=1  1 finding
F7-substituted-6th     (replaced with other prose from the same record)     EXIT=1  1 finding
H2-quoted-whitespace   (a "   " condition that CLEARS the schema)           EXIT=1  1 finding
PRISTINE                                                                    EXIT=0  0 findings
```

The OMISSION direction is, as documented, NOT covered by the check: deleting the sixth condition
outright leaves `validate` at EXIT=0. That is deliberate and stated in the docstring, and it is
covered one layer up by the registered test at test/assurance-modes.test.ts:1444, which EXTRACTS
the numbered conditions from DR-0012 and asserts set equality both ways, so a seventh condition or
a swapped one reddens without anyone editing a count. I read that test and it contains no count.

### 6. Gates, each with its own exit code

Node v26.6.0 verified in every shell. No exit code below is a pipeline's.

```
npm ci                                                   EXIT=0
npm run build                                            EXIT=0   (git status clean after)
npm test                                                 EXIT=0   501 tests, 501 pass, 0 fail
tiphys gates run --registry --only manifest-self-check   EXIT=0
tiphys gates run --registry --only credential-scrub      EXIT=0
tiphys gates run --registry --only agent-rules-drift     EXIT=0   17 rendered gate rows compared
tiphys gates run --registry --only coverage              EXIT=0
tiphys gates run --registry --only citations             EXIT=0
tiphys gates run --registry --only clause-map            EXIT=0
tiphys gates run --registry --only red-witness           EXIT=0
tiphys gates run --registry --only suite                 EXIT=0   green 501 tests reported,
                                                                  30 files, 507 behaviours resolve
tiphys gates run --registry --only scope  (in ../wt-m3p3) EXIT=0  green, 37 changed paths audited
grep -raP '[^\x00-\x7F]' <428 tracked paths>             EXIT=1   (no match)
grep -raP '[\x00-\x08\x0B\x0C\x0E-\x1F]' <same>          EXIT=1   (no match)
```

Both ASCII checks were run with `-a` over `git ls-files` minus the two path exemptions
(`delivery/intake/orchestrated-delivery-process.md`, `test/fixtures/json-schema-test-suite/`).

**A trap for whoever runs `scope` next, recorded so it is not re-paid.** `main` in these worktrees
is STALE at `c2e2009` while `origin/main` is `ae674b6`. Running the scope gate with
`--base $(git merge-base HEAD main)` reports **red, 57 paths outside the declared scope**, and every
one of them is a path that came from `main` itself. With the correct base,
`$(git merge-base HEAD origin/main)` = `3c60acb`, the gate is green over 37 paths. The gate also
requires `--phase m3-p3`; without it, it is `error` exit 21 with detail
"gate scope requires --phase". Neither is a finding.

## CR-002, the direct measurement rather than the derivation

The name search above is a derivation. Here is the measurement it predicted, on the WHOLE suite
rather than on one file, with M04 (`startOffset` trusting the column: the exact pre-fix state)
applied to `src/checks.ts`:

```
$ npm test                      # with M04 applied
i tests 501
i pass 501
i fail 0
EXIT=0
$ md5sum src/checks.ts          # restored by cp, never by git checkout --
0d3504eadfc894d85e06b9a81d2f0db6      (identical to the pristine head)
```

**501 of 501 pass with the round's own fix reverted.** The worktree was restored and
`git status --porcelain` shows only this report file.

---

# Verdict

**CHANGES REQUIRED.** Two MEDIUM findings, one LOW. Under DR-0012 a medium blocks merge.

| id | severity | one line |
|---|---|---|
| CR-001 | MEDIUM | `startOffset`/`SKIPPABLE_PREFIX` leaks block markers into a unit when two block markers open on one line |
| CR-002 | MEDIUM | both defects this round fixed have no red witness; 14 of 20 mutations of the new code survive the full suite |
| CR-003 | LOW | `NOT_QUOTABLE` has no observable effect and the docstrings claim it performs an exclusion the AST's shape performs |

**Grading honestly in the other direction, because the brief asked for both.** The replacement is a
large improvement over what it replaces and I could not break it anywhere the old code was broken.
The owner's acceptance criterion holds at 20/20 re-derived from git. The 40-shape set is 40/40. The
four previously unmodelled block forms are modelled CORRECTLY, not merely differently, with exactly
one exception, and that exception is CR-001. Tabs, CRLF, lone CR, mixed line endings, wide markers,
lazy continuations, nested quotes and astral characters are all correct. DR-0012 resolves and every
fabrication I could construct is rejected. Every gate is green with its own exit code. The prior
that "one of the five defects is still there" was NOT borne out for the previously found classes;
what I found is a NEW member of a class the round closed only partway, plus the absence of the
witnesses that would have caught it.

**What would clear both mediums.** CR-001 is one predicate: `SKIPPABLE_PREFIX` should accept any
number of block-opening markers in any order, roughly
`^(?:[ \t]*(?:>|[0-9]{1,9}[.)]|[-*+])[ \t]?)*[ \t]*$`, with the recovery path made to strip the same
grammar rather than block quotes only. CR-001's fix and CR-002 close together if the fix arrives
with witness specs whose dangerousStates are M04, M20 and M01, and tests carrying at least two
structurally different members of the CR-001 class (a nested list marker AND a quote after a list
marker) plus the two shapes the round already reproduced in prose.

---

# What this review did NOT cover

Read this first.

1. **The supply-chain and regression lens.** By contract that is the other reviewer's. I did not
   examine `package-lock.json`, the provenance, size, transitive tree or licence of `commonmark`
   0.31.2, `npm audit`, the `build:runtime-deps` copying of `node_modules` into `dist/`, or whether
   vendoring a parser into a published package is acceptable. I did not read their report.
2. **Everything in the phase that is not `quotableUnits` and its check.** `src/modes.ts`,
   `src/commands/mode.ts`, the three schemas, `role-model-config.yaml`, `templates/charter.example.yaml`
   and the CLI wiring were read only where the conditions check touches them. The other nine derived
   checks were exercised only incidentally by the suite. A defect in `mode show`, in the
   assurance-modes schema, or in the role-model config would not have been found by this review.
3. **The witness gap is characterised, not exhausted.** I mutated 20 sites. I did not mutate the
   nine pre-existing checks, `runChecks`, `resolveRecord`'s directory search, or the CLI. There may
   be further survivors outside `quotableUnits`.
4. **The full-suite survival claim is measured for M04 only.** The other thirteen survivors were
   measured against `test/assurance-modes.test.ts` alone (30 tests) plus a name-search derivation
   that `quotableUnits` has no other test consumer. That derivation would miss a test reaching the
   extractor through the `tiphys validate` CLI on a fixture whose text contains neither
   `quotableUnits` nor `assurance-modes`. I did not enumerate CLI invocations exhaustively.
5. **My oracle is the project's own `probe/oracle.mjs`, which is `commonmark`-derived.** Any place
   where `commonmark` 0.31.2 itself is wrong, or where two conformant parsers disagree (the option
   evidence measures roughly half a per cent of generated documents), is invisible to every probe I
   ran. I did NOT run the second parser (`markdown-it`) as an independent oracle; the round did, and
   I took that on trust.
6. **The fuzz is one generator and one seed** (6,000 documents, seed 20260809, markup-free grammar).
   It deliberately over-weights the two-marker shape, so its 2,444 divergences are a proof of the
   class and NOT a rate estimate for real documents. A different grammar would probe different
   ground; in particular I generated no inline markup at all, so nothing in my fuzz can speak to
   the A-versus-A2 markup-preservation contract beyond the 20 real records.
7. **CI.** Every gate above ran LOCALLY on node v26.6.0 in this container. I observed no GitHub
   Actions run, neither the `pull_request` arm nor the post-merge `push` arm on the new `main` head,
   which T-009 requires separately and which no local run can discharge.
8. **The scope audit is one run at one base.** Green over 37 paths against
   `merge-base(HEAD, origin/main)` = `3c60acb`. I did not audit the declaration's contents against
   what the phase actually needed, only that the changed paths satisfy it.
9. **Not reviewed for process:** whether the work history's claim grep was run, whether the
   dispatch/beacon rules were followed during the round, and the salvage of the dead implementer's
   work beyond confirming that the staged `oldsrc/checks.ts` is byte-identical to git at `18c335a`.
10. **Performance and resource behaviour.** `commonmark` parses each cited record once per run with
    a per-record cache; I did not measure time or memory on a large record, and I constructed no
    pathological input (deep nesting, very long lines) to probe for quadratic behaviour.

*End of report. Head reviewed: `218fc12`. No commit and no push was made by this review.*
