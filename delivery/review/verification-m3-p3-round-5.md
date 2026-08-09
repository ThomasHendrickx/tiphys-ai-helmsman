# M3-P3 Round 5 Independent Delta Verification

Status: COMPLETE
Verifier: independent delta verifier, round 5
Head under review: 18c335a2fc4be0ff68bbff8528416fd82146349f
Round 4 head: 6af8e81

**VERDICT: CHANGES REQUIRED.**

One finding, **V-5 (medium)**: the round's own fix reintroduces, at all four
of its own new sites plus one pre-existing round-4 site, a defect in the
class the enumeration itself named as a real risk category (`quotableUnits`
gluing text across a genuine block boundary rather than merely extending a
continuing item). A list item's content followed by an interrupter (fence,
ATX heading, setext underline, thematic break, or a round-4-glued nested
sub-item) and then, WITH NO INTERVENING BLANK LINE, a fully dedented
(column-0) line: the extractor now fuses that dedented line into the item's
unit, even though a real CommonMark parser (verified against `commonmark`
0.31.2 from npm, an independent implementation, not this codebase's own
extractor) confirms the list ends at the interrupter and the dedented line
is a wholly separate top-level paragraph. Demonstrated end to end through `tiphys
validate`: the FUSED, incoherent two-block string is ACCEPTED (exit 0) as a
mode's condition, while the two individually correct texts, which were each
independently valid at the round-4 head, are both REJECTED. Not currently
exploitable against any shipped decision record (checked). Everything else
this round claims is independently reproduced true. Full detail below.

Everything else round 5 claims is independently confirmed: the closure
argument (only `flush()`/`discard()` end a unit, only `flush()` emits one)
is true of the code as written, not merely asserted; all nine per-site
rulings for the ENUMERATED sites hold up, including the two sites argued to
legitimately flush unconditionally; the witness member-0 mutation reproduces
red exactly as captured; the round-3 witness drift and the sweep's
structural blindness to fixture-meaning drift both reproduce exactly as
claimed, and no mechanism that would catch that drift was found on
independent search either; every mechanical gate reproduced green with its
own exit code; DR-0004/DR-0012/DR-0013 unit counts and DR-0012's six
conditions all re-derive identically. V-5 is the one place this round's own
methodology (enumerate every site, argue each one) stopped one property
short: it asked "does this site need to ask `continuesListItem`" for every
`flush()` call, but never asked "does leaving `current` open without
flushing, at a site that doesn't set `blankPending`, silently disable the
next line's own boundary check" for the FIVE sites that glue content in
without flushing (the four new ones, plus round 4's pre-existing nested-item
glue at the same shape). That is the same one-level-short pattern this
project has now paid for in every round of this phase.

**DR-0012's merge conditions, re-derived on this head:**

1. Two independent clean-room reviews on different model families: outside
   this verification's scope to confirm (no review artifacts from a second
   model family were located in this branch's history; this is an
   orchestrator-level bookkeeping question, not a defect in round 5).
2. No unresolved high or medium finding: **NOT MET.** V-4 from round 4 is
   confirmed fixed, but this verification's own V-5 (medium, below) is a new
   unresolved finding. Condition 2 forbids merging regardless of every other
   condition being satisfied, exactly as it did for V-4 at round 4.
3. Both reviewers given the phase's acceptance criteria: not assessable from
   this verifier's brief.
4. **CI green on the exact head: NOT OBSERVED**, the fifth consecutive round
   (including this one) to disclose this gap. No `pull_request` or `push`
   run against `18c335a` was witnessed by this verification. This is a
   standing, previously-disclosed gap, not a new defect, and it is the one
   condition this report cannot certify from local evidence alone.
5. Scope audit passes: **MET**, reproduced independently at `18c335a` in
   `../wt-m3p3` (`claude/m3-p3-assurance-modes`), exit 0, 36 changed paths
   audited, matching the work history's own capture.
6. Disagreement arbitration: not applicable, no disagreement to arbitrate
   in this verification.

So on THIS report's own evidence, condition 2 and condition 5 are
affirmatively met; condition 4 is unwitnessed (not failed, unwitnessed) and
1/3/6 are outside a delta verifier's reach. The phase's readiness to merge
ultimately still needs a CI witness on this exact head per T-009, which is
the orchestrator's action, not this round's.

## Log

- Started verification. Worktree confirmed at 18c335a on branch verify-m3p3-r5, node v26.6.0, working tree clean.
- Round 4 report (`verification-m3-p3-round-4.md`) is not in this branch's history
  (same durability gap the round-4 report itself disclosed). Found it on
  `origin/claude/verifications-m3-p3-r3-r4` (commit c2f940a), fetched, read in
  full. V-4 (medium): fence/ATX/setext/thematic-break interrupters inside a
  list item wrongly flushed the accumulator, splitting one item into a
  fragment-pair, demonstrated end to end through `tiphys validate` with two
  interrupter kinds plus two sanity controls (junk-condition reject,
  correct-whole-quote reject). Root cause: 4 of 6 unit-ending sites in
  `quotableUnits` never asked whether a list item was open.
- Read round 5's work history section (lines 4127-4642) and the current
  `quotableUnits` in `src/checks.ts` (lines 938-1128) side by side.
  Independently re-derived the enumeration: 8 `flush()` calls (not counting
  the docstring's prose mention of the word), 1 `discard()`, 2 `current = []`
  (bodies of flush/discard only), 1 `units.add` (inside flush only). Matches
  the work history's counts exactly (its line numbers differ by a few because
  of comment insertions but the same eight call sites map 1:1).
  `git diff 6af8e81 2ca96c9 -- src/checks.ts` shows EXACTLY the claimed
  4-site change (fence/ATX/setext-flush-arm/thematic-break each gated behind
  `continuesListItem`) plus the new predicate and docstring; nothing else in
  the function touched. Sites 1 (blank line), 7 (nested marker), 8 (top-level
  boundary) were already gated in round 4 and are untouched here.
- Reproduced the witness end to end: mutated SITE 2 alone
  (`if (continuesListItem(...))` -> `if (false)`) via a scripted string
  replace (not `git checkout --`, per standing warning), ran
  `node --test --test-name-pattern "a fence, an ATX heading, a setext
  underline or a thematic break inside a list item ends no unit, so the item
  stays whole" test/assurance-modes.test.ts`: EXIT 1, tests 1, pass 0, fail 1.
  Restored the file from a backup copy, `git status --porcelain src/checks.ts`
  empty afterward. Baseline (unmutated) run of the same
  `--test-name-pattern` command: EXIT 0, tests 1, pass 1, fail 0. This
  independently confirms the round's own member-0 capture rather than trusting
  the pasted assertion text.
- Independently re-derived the closure argument for real, by grepping every
  reference to `current` inside the function's line span (938-1128):
  declaration, the flush-body alias/reset, the discard-body reset, three
  `.push` calls, one `.length` read. No other spelling anywhere in the
  function empties or reads the accumulator, and no code outside `flush`
  writes to `units`. The closure argument is TRUE of the code as it stands,
  not merely asserted.
- Priority 2, attacked the `indent > 0` threshold with a probe script
  (deeper nesting two levels down, multi-digit ordered markers, tab
  indentation, and the divergence case the round itself names: a fence
  indented only 1 column under an item whose true content column is 3).
  Every case merges MORE (longer units), never fewer; no case produced a
  shorter/split unit that should have stayed whole, and no case revealed a
  unit that should be a boundary and was not. For the one genuine
  CommonMark-divergent case (partial indentation), reproduced the SAME
  leniency already present at the round-4 head (6af8e81) for an ordinary
  paragraph continuation line at the same partial indent: round 5 is
  extending an existing, already-shipped threshold to four more line types
  for consistency, not introducing a new divergence. Confirmed by running
  the identical probe against a worktree checked out at 6af8e81 (removed
  after use).
- Priority 2, tried the four interrupters the round explicitly did NOT
  model (HTML block, pipe table, block quote, link reference definition)
  inside a list item, at both the current head and at 6af8e81. Byte-identical
  output at both heads for all four: none is recognised as a boundary or as
  excluded content either before or after round 5; all four are swallowed as
  literal text into the surrounding unit, exactly as before. Round 5 changed
  nothing about how these four behave, positively or negatively.
- Priority 3, reproduced the round-3 witness drift directly: built the OLD
  (pre-round-5) `HEADING_RECORD` fixture (heading directly under the list
  item, no list-ending paragraph) and ran it through the CURRENT
  `quotableUnits`. Result: `units.has(INDENTED_HEADING)` is still `false`
  (the assertion would still pass) but for the WRONG reason -- the heading
  line is discarded as item content by the new `continuesListItem` guard
  (SITE 3), not recognised as a top-level heading the way V-2's fix intends.
  Matches the round's own claim exactly.
- Priority 3, independently re-ran the mutation-target sweep over all
  `witness/*.json` files: 97 mutation members, 21 distinct target files,
  zero under `test/`. Confirms the sweep is structurally blind to a semantic
  drift living in a test fixture, independent of the round's own script.
  Read `src/witness/run.ts` and `src/witness/spec.ts` end to end for any
  mechanism that reads a member's file content against the ASSERTION it is
  meant to redden (golden/snapshot comparison, semantic diff, anything past
  literal substring match): found none. The only content-aware machinery
  present (`deriveTextAssertions` and friends) is the rule-(g) exemption
  detector, an unrelated mechanism that classifies whether a TEST is
  text-asserting for the coverage gate, not whether a WITNESS spec's target
  line still means what its `find` implies. No mechanism found that would
  catch this class.
- Priority 4: ran every gate independently, own exit codes, see Gates below.
- Found V-5 while extending the Priority-2 threshold attack past "does this
  ever merge less" into "does the line immediately following a guarded
  interrupter, with no intervening blank, ever get swallowed when it should
  not be". Derivation and evidence below.

## V-5 (MEDIUM): an interrupter (or the round-4 nested-item glue) followed, with no blank line, by a fully dedented line fuses two unrelated blocks into one unit

**Not a low. Grading it a low would mean the phase merges on an unresolved
defect that this project's own docstring names, in its own words, as "the
whole hazard": admitting into the quotable-unit set a string that does not
correspond to a real, coherent clause in the cited document, demonstrated as
an actual ACCEPT (exit 0) through the real CLI, not a theoretical one. That
is the same class DR-0012 condition 2 was written to stop, and the same
reasoning V-4 used at round 4 for a "not currently exploitable" finding
(medium, not high, not low).**

### The mechanism

`continuesListItem`'s four guarded sites (fence, ATX, setext, thematic break)
and the round-4 nested-list-item glue (`markerIndent >= listContentColumn`)
all share one shape: when they decide the interrupter is CONTENT of the open
item, they leave `current` non-empty, set `blankPending = false`, and
`continue` (or fall through) WITHOUT calling `flush()`. That is correct for
the interrupter's OWN line. What none of the five sites does is re-arm the
boundary test for the line that comes AFTER them.

`atBoundary`, the sole gate for "did a top-level, zero-indent line end the
list" (site 8: `atBoundary && listContentColumn !== null && indent === 0`),
is defined as `current.length === 0 || blankPending`. A blank line inside an
item correctly sets `blankPending = true`, so the line after a blank is
always evaluated for list-ending. An interrupter never sets any equivalent
signal, so the FIRST line after it inherits `blankPending = false` and
`current.length > 0` (the item's earlier text is still sitting in the
accumulator) -- `atBoundary` is `false`, the site-8 check never fires no
matter how the next line is indented, and a fully dedented (column 0) line
falls through to the generic "content of the block in progress" arm,
`current.push(line)`, joining it into the SAME unit as the item, when no
blank line happens to separate the two.

### Ground truth: a real CommonMark parser disagrees with the merge

Verified against an independent implementation (`commonmark` v0.31, npm,
not this repository's own extractor) for all three single-line interrupters:

```
input: "1. Item opens here.\n\n   ```\n   fence content\n   ```\nA fully dedented paragraph, no blank line before it, right after the fence closed.\n"
<ol><li><p>Item opens here.</p><pre><code>fence content\n</code></pre></li></ol>
<p>A fully dedented paragraph, no blank line before it, right after the fence closed.</p>

input: "1. Item opens here.\n\n   # An aside heading\nA fully dedented paragraph immediately after the heading, no blank.\n"
<ol><li><p>Item opens here.</p><h1>An aside heading</h1></li></ol>
<p>A fully dedented paragraph immediately after the heading, no blank.</p>

input: "1. Item opens here.\n\n   ***\nA fully dedented paragraph immediately after the break, no blank.\n"
<ol><li><p>Item opens here.</p><hr /></li></ol>
<p>A fully dedented paragraph immediately after the break, no blank.</p>
```

In all three, the real parser closes the list item AT the interrupter and
renders the dedented line as a separate, top-level `<p>`, never as item
content. This is the ground truth round 4 matched (see below) and round 5
does not.

### Reproduced at the extractor, five structurally different sites (well past the two-member bar)

```
fence:      ["Item opens here. A fully dedented paragraph, no blank line before it, right after the fence closed."]
ATX:        ["Item opens here. A fully dedented paragraph immediately after the heading, no blank."]
thematic:   ["Item opens here. A fully dedented paragraph immediately after the break, no blank."]
setext:     ["Item opens here. An aside A fully dedented paragraph immediately after, no blank."]
nested item (round-4, pre-existing): ["Outer item. Inner sub item. A fully dedented paragraph immediately after, no blank."]
```

Each collapses the item and the following orphan paragraph into ONE unit.
The nested-item case PRE-DATES round 5 (reproduced identically at the
round-4 head `6af8e81`, in a worktree since removed): this is not a defect
invented whole by round 5, it is round 5 reusing, at four more call sites, a
gap that already existed at one call site since round 4 and was never
caught there either.

Controls, at the SAME shape but WITH a blank line separating the interrupter
from the dedented paragraph, and the round-4 baseline with no interrupter at
all, all split correctly into two units (matching round 4 and matching the
real parser):

```
fence + blank before dedented paragraph:  ["Item opens here.", "A fully dedented paragraph, WITH a blank line before it."]
no fence, blank, dedented paragraph (round-4 shape): ["Item opens here.", "A fully dedented paragraph directly after the blank, no fence involved."]
```

And at the round-4 head (`6af8e81`, worktree since removed), the IDENTICAL
no-blank fence/ATX/thematic inputs above all correctly split into two units,
proving the merge is new behaviour at this head for the fence/ATX/thematic
sites specifically (the nested-item site's version of the same gap already
existed at that head, as shown above).

### End to end through `tiphys validate`, exit 0, with a reject/accept pair that mirrors round 4's own reversal

Scratch record `DR-9995`, one real list item with a fence and no trailing
blank, immediately followed by an unrelated top-level paragraph
(`e2e-fusion.mjs`, using the CLI directly, not a modified test file):

```
$ node bin/tiphys.ts validate --type assurance-modes --context "$D" fused-condition.yaml
status: 0
```

The FUSED string (item text + a single space + the wholly unrelated orphan
paragraph, exactly as `quotableUnits` produces it) is ACCEPTED as a whole
quoted item of `DR-9995`, zero diagnostics. Two controls, both of which were
independently valid quotes of the SAME document at the round-4 head, are now
REJECTED in the same context:

```
$ node bin/tiphys.ts validate ... orphan-alone-condition.yaml
status: 1
INVALID #/modes/0/conditions/0 mode full cites DR-9995 for a condition that is not a whole quoted item of that record: "An unrelated top-level paragraph that must never be part of ..."

$ node bin/tiphys.ts validate ... item-alone-condition.yaml
status: 1
INVALID #/modes/0/conditions/0 mode full cites DR-9995 for a condition that is not a whole quoted item of that record: "The real item text of this scratch record."
```

So the check now accepts a spliced, incoherent two-block string that no
reader of `DR-9995` would recognise as one condition, and rejects both of
the genuinely coherent single-block texts it should accept. That is the
inverse defect shape from V-1/V-4 (those fragmented a whole into
misleadingly narrow pieces; this fuses two unrelated wholes into one
misleadingly broad piece), but it lands on the same side of the check's own
stated hazard line: "admitting one that should not be... is the whole
hazard."

### Why this is not simply the round's own "safe direction" argument applying again

The round's docstring argues merging is safe when the joined material
genuinely belongs to ONE logical container: an item's own continuation
paragraphs, or its own nested sub-items. That argument does not extend to
this shape, because the two halves being joined here are NOT one logical
container by any reading, including a real CommonMark parser's: one is a
list item, the other is an unrelated top-level paragraph that a blank line
away would unambiguously never be considered part of the list. The "fewer,
longer, safe" resolution the round applied only handles ambiguity WITHIN a
container; this defect creates a unit that spans OUTSIDE it, which is the
exact boundary the round's own safety argument depends on staying intact.

### Not currently exploitable against any shipped decision record

```
$ for f in delivery/decisions/*.md; do <check each fence's closing line for a
  non-blank, non-indented line immediately after it>; done
(no output)
```

No file in `delivery/decisions/` has a fence, heading, thematic break or
nested item immediately followed (no blank) by a column-0 line, so this is
latent today, in the same sense V-1 and V-4 were latent. It is graded
MEDIUM rather than HIGH for that reason, matching this project's own
established convention for this exact severity question.

### Two structurally different reproduction paths, both required and both met

(1) The extractor-level probe across five sites (fence, ATX, setext,
thematic, nested-item), (2) the end-to-end `tiphys validate` accept/reject
demonstration through the real CLI on a real scratch decision record. Both
independently confirm the same mechanism.

## Gates, run independently at `18c335a`, own exit codes

All commands run in a shell with `node --version` == v26.6.0 confirmed.

| Check | Where run | Result | Exit |
|---|---|---|---|
| `npm ci` | wt-m3p3-delta4 (verify-m3p3-r5) | ok | 0 |
| `npm run build` | wt-m3p3-delta4 | ok, `git status --porcelain` clean after (only my own untracked report file) | 0 |
| `node --test` | wt-m3p3-delta4 | 503 tests, 503 pass, 0 fail | 0 |
| `scope` | `../wt-m3p3` (`claude/m3-p3-assurance-modes`, same head) | green, 36 changed paths audited | 0 |
| `clause-map` | wt-m3p3 | green, 18 clause-map rows checked, 56 pending a phase not yet in force | 0 |
| `agent-rules-drift` | wt-m3p3 | green, 17 rendered gate rows compared | 0 |
| `suite` | wt-m3p3-delta4 | green, 501 tests reported (30 files; 507 behaviors resolve) | 0 |
| `red-witness` | wt-m3p3-delta4 | green, 31 witness(es) evaluated (18 own, 13 stored re-evaluated) | 0 |
| ASCII check 1 (`[^\x00-\x7F]`, `-a`) | wt-m3p3-delta4, `git ls-files` minus the two exemptions | zero hits | xargs 123 (no match, expected) |
| ASCII check 2 (control bytes, `-a`) | same | zero hits | xargs 123 (no match, expected) |
| `tiphys validate --type assurance-modes` on the shipped `assurance-modes.yaml` | wt-m3p3-delta4 | exit 0, confirms DR-0012's six conditions resolve | 0 |

No usage error was mistaken for success anywhere above; every gate ran with
its documented flags and its own printed exit code was what is recorded
(the scope-gate ENOENT trap the round-4 report warned about was avoided by
`mkdir -p` on the evidence directory before the first invocation, and it did
not recur).

## Unit counts, re-derived (not read)

```
DR-0004-elevated-permissions.md  => 18 units
DR-0012-delegated-merge-authority.md => 36 units
DR-0013-schema-validator-implementation.md => 38 units
```

Matches the round's own capture exactly. `grep -rn "granted-by: DR-0013"`
over every `*.yaml` in the repository (excluding `node_modules`) returns
nothing (exit 1): nothing shipped relies on DR-0013's now-collapsed
sub-bullet. Zero `DR-0019` hits and DR-0020's record present, confirmed
independently via the same greps round 4 used.

## What this verification did NOT cover

- **No CI run was observed**, on either the `pull_request` or `push` arm
  (T-009's both-arms requirement). This is the fifth consecutive round with
  this same gap. DR-0012 condition 4 (CI green on the exact head) is
  therefore UNWITNESSED by this report, not failed; it needs its own
  observation before this head can be certified fully mergeable even after
  V-5 is fixed.
- **V-5's full extent was not exhaustively mapped.** I found it by extending
  the Priority-2 threshold attack, checked the four round-5 sites plus the
  pre-existing round-4 nested-item site, and stopped there. I did NOT check
  whether the indented-code-block exit path (`inIndentedCode` clearing
  mid-loop, which falls through to re-evaluate the current line rather than
  `continue`-ing past it) has an analogous gap, nor whether a SECOND
  interrupter immediately following the first (no blank between either)
  compounds or changes the picture. A fixer should re-run the same kind of
  enumeration this round used, but for "which sites leave `current` open
  without arming a boundary signal for the NEXT line", rather than assume my
  five sites are the complete set the way round 5 assumed its four were.
- **I did not attempt a fix.** No patch to `continuesListItem`,
  `atBoundary`, or the five sites is proposed here; this report is
  diagnostic only, per a delta verifier's brief.
- **The four unmodelled block forms** (block quotes, HTML blocks, tables,
  link reference definitions) were re-confirmed byte-identical before and
  after round 5 (see log) but were not re-examined for the SAME no-blank-
  after-a-boundary shape, since they are not boundaries at all today (they
  never call `flush()` and never set `blankPending`), so V-5's mechanism
  does not apply to them as written.
- **`src/gates/coverage.ts:356` and `scripts/check-clause-map.mjs:139`**,
  the line-without-block-state mechanism carried forward from earlier
  rounds' findings on other phases' declarations, were not re-derived here;
  they are outside M3-P3's declaration and outside this brief.
- **The rule-(g) exemption question and the four exempt single-member
  witness specs** from earlier rounds were not re-examined; nothing in
  round 5 touches that mechanism.
- **Whether a second, independent model-family review exists for this exact
  head** (DR-0012 condition 1) and whether both reviewers were given the
  phase's acceptance criteria as their contract (condition 3) are
  orchestrator-level bookkeeping questions outside a delta verifier's
  reach; I did not attempt to locate or evaluate other review artifacts
  beyond the round-3/round-4 delta reports already cited.
- **`package.json` `"version": "0.0.0"` against the disclosures' `v0.1.0`**,
  named in round 5's own open list, was not independently investigated;
  it is carried forward as-is.
- I did not build a decision record inside this repository's real
  `delivery/decisions/` tree to prove V-5 against a file this repository
  will actually ship; the demonstration uses a synthetic `DR-9995` scratch
  context, sufficient to show the mechanism and the accept/reject reversal,
  not proof that any shipped file is at risk today (checked and confirmed
  absent instead, see above).
