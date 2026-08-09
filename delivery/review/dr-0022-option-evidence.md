# DR-0022 option evidence: measured, not argued

- status: COMPLETE, 2026-08-09
- branch: `probe-dr0022`, throwaway, at `18c335a` (round 5 head, regression present)
- toolchain: node v26.6.0 (verified in the shell that ran every command below)
- oracle: `commonmark` 0.31.2 (BSD-2-Clause), installed dev-only in this tree
- **nothing here is intended to be merged**

## Progress log

- [x] worktree verified, DR-0022 and the round-1/2, round-5 verifications read
- [x] step 1: exploit set built, oracle written, current implementation scored
- [x] step 2: option A prototype (two variants; A2 is the one that works)
- [x] step 3: option B prototype
- [x] step 4: comparison, option C prototyped and measured, recommendation

## Step 1: the exploit set and the baseline

### How the correct answer is derived

`probe/oracle.mjs` parses each document with `commonmark` 0.31.2 and reads the
units off the AST. The definition it models is the one `src/checks.ts` states in
its own docstring: a quotable unit is every top-level PARAGRAPH and every
OUTERMOST LIST ITEM, marker stripped and whitespace normalized; a list item's
unit is the WHOLE item including its continuation paragraphs and nested
sub-items; code (fenced or indented), headings (ATX or setext), thematic breaks,
HTML blocks and link reference definitions belong to no unit.

**One shape the AST does not settle, declared rather than hidden**: a block
quote. The oracle treats its contents like the document's, so the quoted
paragraph is a unit and the `>` marker is NOT part of it. "A block quote is not
quotable at all" is equally defensible. What is NOT defensible is the current
behaviour, which admits the marker-carrying string `> A quoted sentence...` and
rejects the same sentence without the marker: that is neither of the two
reasonable answers.

Forty shapes, `probe/exploit-set.mjs`. Runner: `node probe/run-set.mjs current`.

### Baseline: the current implementation at `18c335a`

```
current: 32/40 shapes match the oracle exactly
  fail-open (admits a unit the oracle does not have): 8
    S15-v4-setext-in-item, S17-v5-fence-then-dedent, S18-v5-atx-then-dedent,
    S19-v5-thematic-then-dedent, S20-v5-setext-then-dedent, S28-block-quote,
    S29-html-block, S31-link-reference-definition
  over-strict only (misses a unit): 0
```

Every one of the eight failures is in the ADMITTING direction, which the
docstring itself calls "the whole hazard".

### Two corrections to the record, found by measurement

**1. Round 5's V-5 over-claims. The nested-item member of it is NOT a defect.**
The round-5 verification lists five sites for V-5 and states the fifth (a nested
sub-item followed with no blank by a dedented column-0 line) "PRE-DATES round 5
... a gap that already existed at one call site since round 4". Measured against
the oracle, S21 PASSES: the fusion is CORRECT, because CommonMark lazy
continuation makes the dedented line part of the sub-item's paragraph.

```
input : "1. Outer item.\n   - Inner sub item.\nA fully dedented paragraph immediately after.\n"
commonmark 0.31.2 renders:
<ol><li>Outer item.
<ul><li>Inner sub item.
A fully dedented paragraph immediately after.</li></ul></li></ol>
```

The dedented line is INSIDE the `<li>`. So V-5 has four members, not five, and
the "two structurally different members" bar it claims is still met, but the
report's own oracle check was not run on that fifth member.

**2. V-3 (round 2, "adjacent paragraphs merge", filed as over-strict) was never
a defect either.** S26 passes: CommonMark lazy continuation says the glued line
IS part of the item.

```
input : "5. The scope audit passes.\nUnrelated trailing sentence glued on with no blank line.\n"
commonmark renders it as ONE <li> containing both sentences.
```

Both corrections point the same way: **three of the eleven findings across five
rounds were about shapes where a hand-reading of markdown disagreed with
CommonMark, and the hand-reading was wrong.** That is a cost of the hand-rolled
approach that no round has counted, because a round can only find defects it
already believes in.

### One shape that passes by luck, not by agreement

S37 (a fence indented 1 column under an item whose content column is 3). Oracle
and implementation both return `["The item opens here."]`, but for opposite
reasons: CommonMark ENDS the list and makes a top-level fenced block; the
implementation KEEPS the list open and treats the fence as item content. The sets
coincide only because the fence's content is excluded either way. The
implementation's own docstring names this divergence and calls it deliberate. It
is recorded here so the 32/40 is not read as 32 agreements of substance.

### The full per-shape result

| shape | from | current |
|---|---|---|
| S01 backtick fence, top level | V-1 | PASS |
| S02 tilde fence | V-1 sibling | PASS |
| S03 fence with info string | V-1 sibling | PASS |
| S04 indented code block | V-1 sibling | PASS |
| S05 unclosed fence | round 3 | PASS |
| S06 tilde run inside a backtick fence | round 3 | PASS |
| S07 list-item continuation paragraph | V-1 (round 3) | PASS |
| S08 lazy continuation of item text | round 1 | PASS |
| S09 item, blank, indented code (DR-0004's shape) | round 4 | PASS |
| S10 nested sub-item | round 4 | PASS |
| S11 two levels of nesting | round 4 | PASS |
| S12 two sibling items | control | PASS |
| S13 fence inside item, content after | V-4 | PASS |
| S14 ATX heading inside item, content after | V-4 | PASS |
| S15 setext heading inside item, content after | V-4 | **FAIL, admits** |
| S16 thematic break inside item, content after | V-4 | PASS |
| S17 fence then dedented line, no blank | V-5 | **FAIL, admits** |
| S18 ATX heading then dedented line, no blank | V-5 | **FAIL, admits** |
| S19 thematic break then dedented line, no blank | V-5 | **FAIL, admits** |
| S20 setext then dedented line, no blank | V-5 | **FAIL, admits** |
| S21 nested item then dedented line, no blank | V-5 (claimed) | PASS, see correction 1 |
| S22 same as S17 but WITH a blank | V-5 control | PASS |
| S23 indented ATX heading | V-2 | PASS |
| S24 setext heading, top level | V-2 sibling | PASS |
| S25 ATX heading, top level | control | PASS |
| S26 item then glued column-0 line | V-3 | PASS, see correction 2 |
| S27 two paragraphs, blank separated | control | PASS |
| S28 block quote | unmodelled | **FAIL, admits `>`-carrying string** |
| S29 HTML block | unmodelled | **FAIL, admits** |
| S30 pipe table | unmodelled | PASS |
| S31 link reference definition | unmodelled | **FAIL, admits** |
| S32 empty document | control | PASS |
| S33 headings only | control | PASS |
| S34 CRLF | round 2 | PASS |
| S35 paren ordered marker | round 2 | PASS |
| S36 tab-indented continuation | round 5 | PASS |
| S37 fence at partial indent under an item | round 5 | PASS (by luck, see above) |
| S38 item with three paragraphs | round 4 | PASS |
| S39 thematic break between paragraphs | control | PASS |
| S40 blank then dedented paragraph after item | round 4 control | PASS |

**S15 is a new finding this exploit set produced that no round reported.** A
setext heading inside a list item leaves its own TEXT ("An aside") glued into the
item's unit, because round 5's site 4 sets `blankPending = false` and `continue`s
while the heading's text is already sitting in `current`. It is the same class as
V-5 and was not named by the round-5 verification, which checked the setext site
only for the dedent shape.

**S30 is worth naming for the opposite reason.** A pipe table is documented in
`src/checks.ts` as one of four unmodelled hazards. It is not a hazard: CommonMark
core has no tables, so the three table lines ARE one paragraph and the extractor's
treatment of them as prose is exactly right. One of the four "unmodelled" shapes
is a non-problem.

---

## Step 2: option A, the commonmark-based extractor

### Two prototypes, because the first one failed a real test

**Option A (`probe/option-a.ts`, 107 lines)** walks `commonmark`'s AST and reads
each paragraph's INLINE TEXT. It scores 40/40 on the exploit set. **It also
breaks a shipped condition**, which is the single most useful result in this
report:

```
$ node ... check every condition in assurance-modes.yaml against DR-0012
mode full granted-by DR-0012, 6 conditions
  [0] current=RESOLVES optionA=FAILS
      "Two independent clean-room reviews exist for the current head, ..."
```

Because inline text drops markup. The record's source is

```
1. Two independent clean-room reviews ..., each written to `delivery/review/` and committed.
```

and option A yields `... each written to delivery/review/ and committed.`, with
the backticks gone. Measured across all 19 records in `delivery/decisions/`:
option A produces a DIFFERENT unit set in 11 of them, 105 units changed, always
by stripping `**bold**` and `` `code` ``. Taking option A as written would be a
silent contract change requiring every consuming record's quoted conditions to
be re-typed without their markup.

**Option A2 (`probe/option-a2.ts`, 121 lines, 78 code lines)** keeps the same
AST classification but SLICES EACH PARAGRAPH FROM THE SOURCE by its
`sourcepos`, so the unit is the bytes as written. That is the variant this
report measures from here on.

```
optionA2 vs oracle 1 (commonmark AST) : 40/40
optionA2 vs oracle 2 (markdown-it)    : 40/40
real decision records where A2 differs from CURRENT: 0/19
mode full (DR-0012): 6/6 conditions resolve under A2
unit counts under A2: DR-0004=18  DR-0012=36  DR-0013=38
```

The three unit counts are the ones the round-5 verification recorded (18/36/38),
re-derived here rather than read. A2 is a byte-for-byte drop-in on every record
this repository ships.

### The oracle is not circular, and that was checked

Scoring option A against an oracle that shares its code shape proves little, so
a SECOND oracle was built on a different library and a different derivation:
`probe/oracle2.mjs` consumes `markdown-it` 14.1.0's FLAT TOKEN STREAM in
CommonMark-strict mode with a depth counter, not a recursive tree walk.

```
two independent oracles agree on 40/40 shapes
```

### Differential fuzz: 15,000 generated documents, three seeds

`probe/fuzz.mjs` generates random markdown from a block grammar (paragraphs with
lazy continuations, backtick and tilde fences, ATX and setext headings, thematic
breaks, tab- and space-indented code, HTML blocks, link reference definitions,
block quotes, nested lists with four marker styles and tab-separated markers),
adjudicates ground truth by requiring BOTH oracles to agree, and discards the
rest.

| seed | adjudicated | current | optionA | optionA2 | optionC |
|---|---|---|---|---|---|
| 20260809 | 4975 | 1759 (35.4%) | 4975 (100%) | 4975 (100%) | 1760 (35.4%) |
| 11 | 4974 | 1758 (35.3%) | 4974 (100%) | 4974 (100%) | 1759 (35.4%) |
| 4242 | 4978 | 1758 (35.3%) | 4978 (100%) | 4978 (100%) | 1758 (35.3%) |

**The current implementation is wrong on roughly 65% of generated markdown
documents.** The curated 32/40 flatters it badly, because a curated set only
contains shapes someone already thought of.

The fuzz also FOUND A REAL BUG IN A2 that reading did not: 48 divergences in
3000 documents, all multi-line block quotes, where slicing by `sourcepos` kept
the `>` on continuation lines. Fixed by stripping `quoteDepth` markers from
continuation lines; re-run clean. That is recorded rather than quietly patched,
because "the prototype needed a fix the author did not anticipate" is itself
evidence about how hard this problem is.

**The two oracles themselves disagree on about 0.5% of generated documents**
(22 to 26 per 5000), and the disagreement is real, not a bug in either:

```
input: "[zeta]: https://example.invalid/epsilon\n    eta delta beta.\n..."
commonmark 0.31.2 : <p>eta delta beta.</p>
markdown-it 14.1.0: <pre><code>eta delta beta.</code></pre>
```

Whether an indented line right after a link reference definition is a lazy
paragraph continuation or an indented code block is genuinely contested between
two conformant implementations. Any option that depends on markdown structure
inherits that ambiguity; only option B does not.

### The four "unmodelled" shapes, resolved

| shape | current | option A2 | note |
|---|---|---|---|
| block quote | admits the `>`-carrying string | quotes the paragraph without the marker | see the policy note above; one line to flip |
| HTML block | **admits its content** | excluded | closed |
| pipe table | correct | correct | never was a hazard: CommonMark core has no tables, so a table IS a paragraph |
| link reference definition | **admits the definition line** | excluded | closed |

### Suite, CLI and build with A2 swapped into `src/`

`src/checks.ts` had its `quotableUnits` body replaced by a delegation to a new
`src/quotable-ast.ts`. The original was copied out of the tree first (no
`git checkout --`, per the standing warning) and md5-verified on restore.

```
$ node bin/tiphys.ts validate --type assurance-modes --context . assurance-modes.yaml
validate exit=0                      # the shipped document still validates

$ npm run build
BUILD EXIT=0                         # tsc -b clean, no @types/commonmark needed

$ node --test
tests 503  pass 493  fail 1  skipped 9
```

Baseline for comparison, same tree restored, same toolchain:

```
$ node --test
tests 503  pass 503  fail 0  skipped 0
```

The 9 skips are `dist/`-absent skips from running the suite before the build,
not an option-A effect. **Exactly one test fails, and it is the most important
finding in step 2.**

### The one failing test asserts an answer both CommonMark parsers call wrong

`test/assurance-modes.test.ts:2379`, the registered V-4 witness, "a fence, an ATX
heading, a setext underline or a thematic break inside a list item ends no unit,
so the item stays whole". Its fixture is:

```
3. The setext item opens here.

   The setext aside that must not be a unit.
   ----------------------------------

   and the setext item ends here.
```

and its expected whole unit is
`${SETEXT_ITEM_OPEN} ${SETEXT_ASIDE} ${SETEXT_ITEM_CLOSE}`: it requires the
setext heading's OWN TEXT to be part of the item's quotable unit, in a string
the fixture itself names "that must not be a unit". Both parsers disagree:

```
=== commonmark 0.31.2 ===            === markdown-it 14.1.0 (commonmark) ===
<ol start="3"><li>                   <ol start="3"><li>
<p>The setext item opens here.</p>   <p>The setext item opens here.</p>
<h2>The setext aside ...</h2>        <h2>The setext aside ...</h2>
<p>and the setext item ends ...</p>  <p>and the setext item ends ...</p>
</li></ol>                           </li></ol>
```

It is an `<h2>`. Its text belongs to no unit. This is exploit shape S15, and NO
ROUND FOUND IT, because the test IS the specification and the test encodes the
defect. The witness for the V-4 fix is green and guarding the wrong answer,
which is precisely the pattern CLAUDE.md records four times.

**Consequence for option A: it costs an edit to one registered witness test.**
That edit is not a concession, it is the fix; but it must be declared, because a
phase that adopts option A will show a red witness until the test is corrected.

### Dependency cost, measured

```
$ npm ls commonmark --all
@tiphys/kernel@0.0.0
`-- commonmark@0.31.2

$ npm ls --all      (commonmark subtree)
+-- commonmark@0.31.2
| +-- entities@3.0.1
| +-- mdurl@1.0.1
| `-- minimist@1.2.8
```

- depth: 2 (commonmark, then three leaves; nothing deeper)
- transitive dependencies: 3
- packages added: 4
- install size: **920,729 bytes (0.88 MiB)** measured with `du -sb`
  (commonmark 673,094; entities 171,119; minimist 54,477; mdurl 22,039)
- licenses: commonmark BSD-2-Clause, entities BSD-2-Clause, mdurl MIT,
  minimist MIT. All permissive, none copyleft, all compatible with the
  existing runtime surface (ajv MIT, yaml ISC).
- `mdurl` and `entities` serve the HTML renderer and inline entity decoding;
  `minimist` serves only the package's own `bin/commonmark` CLI. All three are
  copied regardless, because `npm run build:runtime-deps` walks
  `dependencies` transitively.
- **no `@types/commonmark`**: the lazy `createRequire` pattern the repository
  already uses for `ajv` and `yaml` means the package is never imported by
  specifier, so `tsc -b` is clean with a 6-line local interface.
- runtime cost: 3.10 ms per pass over all 19 records, against 1.65 ms for the
  current implementation. Twice as slow, and irrelevant at this scale.

### What option A makes worse or newly ambiguous

1. **Option A as first written breaks a shipped condition** (inline markup
   stripped). Only the sourcepos variant A2 avoids it, and the difference is
   invisible unless someone runs the shipped document through it. Anyone
   adopting option A must adopt A2 specifically.
2. **A new module must not import `commonmark` at the top level.** A top-level
   import made `test/scope-gate.test.ts` CR-1047 fail at module load with
   `ERR_MODULE_NOT_FOUND`, because that test copies `src/` to `/tmp` where no
   `node_modules` sits above it. Measured, not anticipated. `src/validate.ts`
   already documents this hazard for `ajv` and `yaml`; the same lazy
   `createRequire` fixes it and the test passes.
3. **`sourcepos` is a less-travelled code path** than commonmark's rendering
   path, and A2 depends on it entirely. The block-quote bug the fuzz found was
   in A2's use of it, not in the library, but the exposure is real.
4. **The block-quote policy question does not go away**, it only becomes
   explicit and one line long.
5. **The 0.5% oracle disagreement is inherited.** Where two conformant parsers
   differ, option A is right only in the sense of "agrees with commonmark".

---

## Step 3: option B, the explicit-marker contract

### The form chosen, and why the other two were rejected

**One fenced code block whose info string is exactly `tiphys-conditions`,
holding a YAML sequence of strings.** `probe/option-b.ts`, 144 lines, 84 code
lines.

- **YAML front matter, rejected.** The kernel would be claiming a namespace it
  does not own: a consuming project's records may already carry front matter for
  a docs site or static generator, and front matter is invisible in most
  renderers.
- **A delimited HTML-comment section, rejected for the opposite reason.** It
  renders to nothing. The conditions under which merge authority is delegated
  are the part of the record a human most needs to see; a governance fact that
  is invisible in the rendered document drifts from the prose with nobody
  noticing.
- **A fenced block with an info string, chosen.** It renders as a visible
  verbatim block in every renderer, it is greppable by its info string, every
  markdown parser already excludes it from prose, and its content parses with
  the `yaml` dependency this package already ships under DR-0013. **No new
  dependency.**

**What is honest about the parsing claim**: option B does not remove markdown
parsing, it removes all of it EXCEPT fenced-delimiter tracking, which is needed
so a `tiphys-conditions` block shown as an EXAMPLE inside an outer fence is not
read as a real declaration. One rule, one piece of state, against the eight-site
block machine it replaces.

### Applied to DR-0012, the only record a mode cites today

```
$ git diff --stat delivery/decisions/DR-0012-delegated-merge-authority.md
 delivery/decisions/DR-0012-delegated-merge-authority.md | 14 ++++++++++++++
 1 file changed, 14 insertions(+)
```

Inserted before "## Limits the orchestrator holds itself to":

````
The six conditions above are the prose. The block below is the same six, declared
in the machine-readable form the kernel reads (`tiphys-conditions`). A mode may
cite only an entry of this block, and the block is the record's own statement of
what it grants.

```tiphys-conditions
- "Two independent clean-room reviews exist for the current head, produced on different model families, each written to `delivery/review/` and committed."
- "Neither review carries an unresolved finding at high or medium severity. Low findings may be merged with, provided each is either fixed or explicitly recorded as a tracked item with a reason."
- "Both reviewers were given the phase's acceptance criteria as their contract, and both walked or executed them. A review that only read is not sufficient for a code phase."
- "CI is green on the exact head being merged, not on an earlier one."
- "The scope audit passes: changed files are on the phase's files-to-touch list plus the two standing pre-authorized extras."
- "Where the reviews disagree, the orchestrator arbitrates with evidence and records the arbitration in the merge commit or in the review file. A disagreement is never resolved by preferring the more convenient verdict."
```
````

Measured, with option B swapped into `src/checks.ts` and DR-0012 carrying the block:

```
declaredConditions ok=true count=6
mode full: 6/6 conditions resolve under option B

$ node bin/tiphys.ts validate --type assurance-modes --context . assurance-modes.yaml
validate exit=0
```

`assurance-modes.yaml` needs NO edit at all: the conditions it already ships are
copied verbatim into the block.

### What a consuming project must do

For every decision record that any mode's `granted-by` names, add one
`tiphys-conditions` block listing the conditions that record grants, verbatim as
the mode cites them. Nothing else. Records that no mode cites are untouched.
Today that is one record in this repository, and it is one record per delegated
grant in any consumer.

### Absent or malformed: it fails closed, in every arm

Seventeen probes, each returning a specific reason and never an accept:

| probe | result |
|---|---|
| A. no marker at all (a plain prose record) | REFUSE, "declares no tiphys-conditions block" |
| B. well formed | ACCEPT n=2 |
| C. two marker blocks | REFUSE, "declares 2 ...; exactly one is permitted" |
| D. unclosed marker block | REFUSE, "is never closed" |
| E. malformed YAML | REFUSE, quoting the YAML parse error and position |
| F. a mapping, not a sequence | REFUSE, "must hold a YAML sequence of strings, and holds object" |
| G. empty sequence `[]` | REFUSE, "declares no conditions, which would let any mode cite it for none" |
| H. empty block | REFUSE, "... and holds nothing" |
| I. non-string entry (`- 42`) | REFUSE, naming entry 0 |
| J. empty-string entry | REFUSE, naming entry 0 |
| K. duplicate entry | REFUSE, naming entry 1 |
| L. marker shown as an EXAMPLE inside an outer fence | REFUSE, the example is not read as a declaration |
| M. a real block AND an example inside an outer fence | ACCEPT n=1, the real one |
| N. tilde-fenced marker | ACCEPT n=1 |
| O. marker indented inside a list item | ACCEPT n=1 |
| P. info string with extra words (`tiphys-conditions yaml`) | REFUSE |
| R. marker inside a block quote | REFUSE |

An empty accept is impossible by construction: every non-ok path carries a
reason and `quotableUnits` returns an empty Set, which makes every declared
condition a violation.

Rough edge worth naming: probe P's refusal message says "declares no
tiphys-conditions block", which is confusing for an author who wrote
```` ```tiphys-conditions yaml ```` for editor highlighting. The message should
name the near miss. That is a diagnostic fix, not a mechanism fix.

### How many exploit shapes stop being questions

```
exploit shapes that option B treats identically (no marker, refuse): 39/40
  differs: S05-unclosed-fence  (refuses with a DIFFERENT, specific reason)

the same 40 shapes WITH a marker block appended, correct extraction: 39/40
  FAIL S05-unclosed-fence  (the unclosed fence swallows the marker -> refuse)
```

**39 of 40 shapes stop being questions.** Lists, paragraphs, headings, thematic
breaks, indentation, lazy continuation, nested items, block quotes, HTML blocks,
tables, link reference definitions, CRLF, tabs: none of it is read. Only the one
shape that concerns fenced delimiters interacts, and it fails closed.

The 0.5% oracle disagreement between two conformant CommonMark parsers also
stops applying, because nothing about paragraph or list structure is consulted.

### What option B costs, measured

```
$ node --test          (option B swapped into src/checks.ts)
tests 503  pass 498  fail 5  skipped 0

failing:
  conditions shorter than the record's own words are rejected, ...
  code block content in the cited record is not a quotable unit, ...
  heading text in the cited record is not a quotable unit, ...
  a list item's continuation paragraph and its nested sub-items are ...
  a fence, an ATX heading, a setext underline or a thematic break inside ...
```

Five registered tests fail, all of them witnesses for the prose-extraction
mechanism option B deletes. They are not defects, they are the contract change
made visible: five witness specs plus their `test/behaviors.json` rows have to be
retired and replaced by witnesses for the marker contract's fail-closed arms.
That is more test churn than option A, which needs one test corrected.

### The new hazard option B introduces, and it is not small

**Prose and declaration can drift.** With the block sitting alongside the
numbered prose list, an author can edit one and not the other, and nothing
detects it. The current mechanism cannot drift because there is only one copy of
the conditions. Detecting the drift means asking whether each block entry is a
whole quoted item of the prose, which is the parsing problem again.

The honest form of option B therefore REPLACES the prose list with the block
rather than sitting beside it. That has its own price: the most-read section of
a governance document becomes a verbatim code block, it cannot carry links,
emphasis or nested structure, and the record reads worse for the human whose
judgement it exists to bind.

Runtime: 0.15 ms per pass over all 19 records, against 1.65 ms for the current
implementation and 3.10 ms for A2. Ten times faster and irrelevant.

### One capability option B has that neither A nor the current mechanism can have

`src/checks.ts`'s own docstring states the limit: "it is the NO-FABRICATION
direction only. It cannot see an OMISSION, because which paragraphs of a prose
decision record are its conditions is not derivable". A record that DECLARES its
conditions removes that limit. Demonstrated:

```
record declares three conditions c1, c2, c3

cites all three    fabricated=[]     omitted=[]      -> ok
OMITS one          fabricated=[]     omitted=["c3"]  -> VIOLATION
fabricates one     fabricated=["zz"] omitted=["c3"]  -> VIOLATION

Under option A/A2 the record has no declared list, so `omitted` is not
computable at all: DR-0012 has 36 units, of which which-are-conditions is
undetermined.
```

Today the omission direction is covered by a repository-specific test that ships
with the record, which is explicitly not a kernel capability. Option B would make
it one. This is a real point in option B's favour and it is not in DR-0022's
statement of the options.

---

## Step 4: the honest comparison

### Option C, measured rather than assumed

Option C was prototyped too, because "the base rate says it produces another
defect" is an argument and this report is supposed to replace arguments with
measurements. `probe/option-c.ts` is the current implementation plus the
MINIMAL FIX for V-5 exactly as the round-5 verification's mechanism statement
implies: the four `continuesListItem` interrupter sites set `blankPending = true`
instead of `false`, so the next line is re-evaluated for the list-ending
boundary.

```
optionC: 35/40 shapes match the oracle exactly   (current: 32/40)
  fail-open: 5  S15, S20, S28, S29, S31
```

It closes S17, S18 and S19. It does NOT close S20, where it swaps one wrong
answer for a different wrong answer:

```
S20 setext then dedented line, no blank
  oracle : ["A fully dedented paragraph immediately after.", "Item opens here."]
  current: ["Item opens here. An aside A fully dedented paragraph immediately after."]
  optionC: ["A fully dedented paragraph immediately after.", "Item opens here. An aside"]
```

**The obvious fix for the named finding ships a new defect at the fourth of its
four sites.** That is round 6, predicted in advance instead of discovered
afterwards, and it is the sixth consecutive instance of the phase's own pattern.

And at scale it changes essentially nothing:

```
optionC: 1760/4975, 1759/4974, 1758/4978 adjudicated documents correct
current: 1759/4975, 1758/4974, 1758/4978
```

**One document in five thousand.** Three seeds, and the improvement is within
noise of zero.

### The comparison table

| | current (round 5) | **option A2** (commonmark + sourcepos) | option B (explicit marker) | option C (one more hand round) |
|---|---|---|---|---|
| exploit set, 40 curated shapes | 32/40, 8 fail-open | **40/40** | 39/40 stop being questions; the 40th fails closed | 35/40, 5 fail-open |
| differential fuzz, 15k documents, 2 oracles | **35.3%** | **100%** | not applicable: structure is never read | **35.4%** |
| new defect found by this report | S15 (setext text glued into the item) | none found | none found | S20 (new wrong answer at the fourth site) |
| shipped `assurance-modes.yaml` | validates | validates, **unchanged** | validates, **unchanged** | validates |
| DR-0012's 6 conditions resolve | 6/6 | **6/6** | 6/6 (after a 14-line record edit) | 6/6 |
| unit sets on all 19 real records | baseline | **byte-identical to baseline** | replaced wholesale | byte-identical except the V-5 shapes |
| runtime dependency cost | 0 | **+4 packages, 920,729 B (0.88 MiB), depth 2, BSD-2-Clause + MIT** | **0** | 0 |
| dev dependency cost | 0 | 0 (`@types/commonmark` not needed with lazy `createRequire`) | 0 | 0 |
| consumer-facing cost | none | **none** | every cited record gains a `tiphys-conditions` block; the contract changes | none |
| code size (code lines, comments excluded) | 153 | **78** | 84 | 155 |
| registered tests to change | 0 | **1** (and it currently asserts a wrong answer) | **5** witnesses plus their `behaviors.json` rows | 1 to 2 |
| suite result when swapped in | 503/503 | 502/503, the 1 failure being the wrong assertion | 498/503 | not swapped in |
| omission direction (a mode dropping a condition) | undetectable | undetectable | **detectable** | undetectable |
| what it leaves unsolved | everything above | the block-quote policy choice (declared, one line); inherits the ~0.5% disagreement between conformant parsers; adds a third runtime dep to a published package | prose and declaration can DRIFT unless the prose list is deleted, and then the most-read section of a governance record becomes a code block; still needs fence tracking | the whole class; the base rate is now 6 for 6 |

### What I would choose

**Option A2, which is NOT the option A that DR-0022 describes, and the
difference is load-bearing.**

I agree with the orchestrator's direction and disagree with its specification.
Option A as stated ("extract quotable units from its AST") is what
`probe/option-a.ts` does, and it BREAKS DR-0012 condition 0 the moment it runs,
because reading inline text drops the backticks around `` `delivery/review/` ``.
Eleven of nineteen shipped records change under it. If the owner approves
"option A" and an implementer writes the obvious thing, the phase gets a sixth
defect on its first day. The decision record should say **AST for the block
structure, `sourcepos` slicing for the text**, and a phase adopting it should
carry "unit sets on all 19 records are byte-identical to the current
implementation" as a falsifiable acceptance criterion, because that is the
property that makes the change free.

The reasoning for A2 over B:

1. **A2 costs consumers nothing.** Byte-identical on every record this
   repository ships, 6/6 conditions still resolve, `assurance-modes.yaml`
   untouched, one test corrected. Option B costs every consuming project an edit
   to every cited record, retires five witnesses, and changes a shipped
   contract on top of DR-0020's closed-vocabulary decision.
2. **Option B's drift hazard is unforced and undetectable.** Prose conditions
   and declared conditions can disagree with nothing to catch it, and the only
   fix is deleting the prose list, which makes the most-read section of a
   governance record a verbatim code block with no links and no emphasis.
3. **The dependency is smaller than it reads.** 0.88 MiB, four packages, depth
   two, all permissive, a pure parser with no network or filesystem surface, and
   `@types/commonmark` is not needed because the repository's existing lazy
   `createRequire` pattern is required here anyway for an unrelated reason.
4. **The divergence argument in DR-0022 is now measured, not asserted.** The
   project treats commonmark as ground truth and the hand-rolled version agrees
   with it on 35% of documents. Two of the eleven findings this phase produced
   were about shapes where the hand-reading was WRONG and CommonMark was right
   (corrections 1 and 2 above), and one defect nobody found (S15) is currently
   asserted as correct by a registered witness. That is the recurring invisible
   cost the recommendation names, now with a number on it.

Option B's genuine advantage, the omission direction, is additive rather than
alternative: an optional `tiphys-conditions` block could be layered on top of A2
later, closing the omission direction for records that opt in, without any
consumer being forced to change. That path is open under A2 and closed under B,
because B has already spent the contract change.

**Option C should not be taken.** Not on the base rate, which is an argument, but
on the measurement: the minimal correct-looking fix for V-5 scores 35/40 with a
NEW wrong answer at its fourth site, and moves the 5000-document fuzz by one
document.

Two things I considered and rejected:

- **Vendoring commonmark.js** into the repository to avoid the supply-chain
  surface. Rejected: it is 673 KB of code that would then never receive an
  upstream fix, and the "our copy diverges from the reference" problem returns in
  a new form, which is the exact failure the option exists to end.
- **Keeping the hand-rolled extractor and adding the fuzz as a gate.** Rejected:
  the fuzz needs an oracle, the oracle is commonmark, so the dependency arrives
  anyway, as a dev dependency, to test code that would still be wrong.

### The one measurement that should decide it

**The differential fuzz: 35% against 100%, over 15,000 generated documents,
adjudicated by two independent CommonMark implementations that had to agree
before a document counted.**

Every other number in this report is about shapes someone thought of, and five
rounds have shown that the shapes nobody thought of are where this function
fails. The fuzz is the only measurement here that is not bounded by the
imagination of the person who wrote it, and it says the hand-rolled extractor is
wrong on about two thirds of markdown, that one more hand-rolled round moves that
by one document in five thousand, and that a real parser moves it to zero.

If the owner wants a second number to weigh the dependency against, it is this
one: **option A2 produces byte-identical unit sets on all 19 shipped decision
records and all 6 shipped conditions.** The dependency buys correctness on
everything that has not been written yet, and costs nothing on everything that
has.

---

## What this evidence did NOT cover

- **No CI run was observed on either arm.** Everything here is local execution on
  node v26.6.0. T-009's both-arms requirement is untouched by this report, and
  the sixth consecutive round of this phase would still owe it.
- **The prototypes were swapped in and run, but never reviewed.** `probe/option-a2.ts`
  has had one bug found in it by fuzzing and none by reading. It is decision
  evidence, not a merge candidate, and it needs the full phase treatment
  (witnesses, red-witness demonstration, clean-room review) before any of it
  reaches `src/`.
- **The fuzz grammar is not the space of real markdown.** It emits no inline
  markup at all (no emphasis, links, inline code, entities, autolinks), no
  reference links, no ordered lists with large or offset start numbers, no
  loose/tight list distinctions, no setext underlines of `-` adjacent to a list
  (the one genuinely ambiguous case CommonMark resolves by lookahead), and no
  documents longer than about 30 lines. **In particular, because it emits no
  inline markup, the fuzz CANNOT distinguish option A from option A2** and gives
  them the same 100%. The difference between them was found only by running the
  real records, and it is the most consequential finding in this report.
- **The oracle's block-quote policy is a choice I made, not a derivation.** Both
  "the quoted paragraph is a unit, without its marker" and "nothing in a block
  quote is quotable" are defensible; I picked the first and every block-quote row
  in every table above depends on that pick. The current implementation's answer
  (admit the marker-carrying string) is neither, which is the part that does not
  depend on the choice.
- **Option B's line count is for the reader only.** The full option B also needs
  a schema change, five new witness specs, `behaviors.json` rows, a documented
  authoring contract for consuming projects, and a decision about whether the
  prose list is deleted. None of that is prototyped or counted, so its 84 code
  lines understate it by more than option A2's 78 understate A2.
- **`@types/commonmark` was never installed or measured**, because the lazy
  `createRequire` pattern removed the need. If a future implementer imports the
  package by specifier instead, that dependency returns and is not costed here.
- **Only `commonmark` was evaluated as the parser.** `markdown-it` was installed
  as an independent oracle, not assessed as a candidate implementation, and its
  own dependency cost was not measured. If the owner's concern is dependency
  weight specifically, comparing the two is work this report did not do.
- **No performance measurement at consuming scale.** 3.10 ms per pass over 19
  records is the only timing taken; a project with hundreds of decision records
  was not simulated.
- **`test/behaviors.json`, `gates.manifest.json` and the witness specs were not
  updated for any option.** The suite numbers above are what happens when the
  implementation changes and the registries do not, which is deliberately the
  worst case and is why they are quoted as failures rather than as a plan.
- **The two corrections to the record (V-5's fifth member and V-3) were derived
  from the oracles, not from the CommonMark spec text.** Two implementations
  agreeing is strong, but the spec is the authority and I did not read it.

---

## How to reproduce

```
cd <this worktree>
export PATH="<scratchpad>/toolchain/node-v26.6.0-linux-x64/bin:$PATH"
node --version                       # v26.6.0
npm ci && npm install --save-dev commonmark@0.31.2
npm install --no-save markdown-it@14.1.0     # second oracle only

node probe/run-set.mjs current   [--verbose]
node probe/run-set.mjs optionA
node probe/run-set.mjs optionA2
node probe/run-set.mjs optionC
node probe/fuzz.mjs 5000 <seed>
```

Fourth seed, run after restoring the tree, as a reproduction check:

```
seed 555, 3000 iterations, 14 documents with no agreed ground truth
current : 1055/2986   optionA: 2986/2986   optionA2: 2986/2986   optionC: 1056/2986
current: 32/40   optionA: 40/40   optionA2: 40/40   optionC: 35/40
$ node bin/tiphys.ts validate --type assurance-modes --context . assurance-modes.yaml
exit=0                               # tree restored, nothing left swapped in
```

Files: `probe/exploit-set.mjs` (the 40 shapes), `probe/oracle.mjs` (commonmark
oracle), `probe/oracle2.mjs` (markdown-it oracle), `probe/run-set.mjs`,
`probe/fuzz.mjs`, `probe/option-a.ts`, `probe/option-a2.ts`, `probe/option-b.ts`,
`probe/option-c.ts`. `src/checks.ts` and DR-0012 are restored to `18c335a` and
md5-verified; the only tracked changes are `package.json` and
`package-lock.json` carrying `commonmark` as a DEV dependency.
