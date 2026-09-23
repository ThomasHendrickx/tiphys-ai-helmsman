# Clean-room review, M5-P5 (context diet), HAZARD contract, third review contract under DR-0016

- Date: 2026-09-23
- Pull request: #215
- Branch: claude/m5-p5-context-diet
- Head reviewed: d353fafd96a32d56220e8f3e96af3f1a0b1c0cc0 (`git rev-parse d353faf`)
- Merge base with origin/main: b16f20008ef9c3b4b62c0007eb7d0178f08dc74d
- Contract: hazard, adversarial (roles/clean-room-reviewer.md:122)
- Model family: Fable (claude-fable-5-1), a different family from every earlier
  reviewer on this phase (Sonnet hazard, Opus criteria, twice each)
- Method: the head checked out detached in an isolated worktree; the four prior
  reviews and the fresh-implementer brief read in full first; then a direct
  attack on the parser and the register. Every probe is a command that was run
  against the REAL `checkDiet`, `ruleFileFindings` and `checkState` from a
  byte-identical copy of the test file (only the three path constants
  rewritten to absolute paths, so the copy reads this worktree), with the real
  register JSON, the real current CLAUDE.md and STATE.md, and the real
  baseline text of both at `6dc5b06`. A probe prints SILENT when both
  `ruleFileFindings` and `checkDiet` return empty for the mutated file, and
  LOUD otherwise. Nothing tracked was edited; the copy and every runner live in
  the scratchpad.

Status: COMPLETE.

## Verdict in one paragraph

FIX-ROUND-NEEDED, on two medium findings and no high. The class the earlier
rounds lost on is closed: all nine relocation members the two reviews built
(comment, fence, details, lazy blockquote, indented code, `## Archive`,
Setext `History`, two disclaimer paragraphs) are loud at this head, an emptied
binding heading is loud, a rule moved to a new linked file is loud, a register
edit that demotes a section is loud, a routine STATE.md standing update is
green, and six of six arm mutations redden their named tests. What remains is
narrower than what was reviewed before and is stated as such: inline markup
(`~~strike~~`, a mid-line `<s>`, a code span, a table row, a `- > ` bullet)
keeps a paragraph rule in binding force, and container markers inside the
four-space continuation of warnings 10 to 14 are not seen as containers. Both
are silent, both are ordinary editing moves, both are fixable in a few lines
with a witness. The rest is low: the post-baseline residue is not stated, a
fence-closing rule that is looser than CommonMark, a disclaimer word list that
misses common words, and two false sentences in the work history and the
inventory document.

## Setup, measured

- Node v26.6.0 from the scratch prefix, checked with `node --version` in the
  shell that ran each command. `npm ci` exit 0. `npm run build` exit 0 and
  `git status --short` afterwards shows only this report (untracked).
- `node --test test/retirement-inventory.test.ts` at d353faf: tests 56, pass
  56, fail 0, skipped 0, exit 0. Matches the work history's count.
- `git diff --name-only origin/main...HEAD`: CLAUDE.md, delivery/STATE.md,
  delivery/plan/cutover/retirement-inventory.json,
  delivery/plan/cutover/retirement-inventory.md,
  delivery/work-history/m5-p5.md, test/behaviors.json,
  test/retirement-inventory.test.ts. Seven paths. Every citation below into
  one of these is quoted (backticks, "line N"), per CLAUDE.md rule 3b; the
  resolving citations are into files the branch does not change.
- The only commit after 427531c (the commit the work history's gate table
  names) is d353faf, and `git log --stat 427531c..HEAD` shows it touches
  delivery/work-history/m5-p5.md alone, 14 insertions. The work history's
  sentence about that is true.
- `git diff --stat 6dc5b06 b16f200 -- CLAUDE.md AGENTS.md delivery/STATE.md`:
  only STATE.md differs between the diet baseline and the merge base (14
  insertions, 7 deletions), so the baseline is `main`'s CLAUDE.md as of the
  branch cut. CLAUDE.md at this head adds 37 lines that are not in the
  baseline (`git diff 6dc5b06 HEAD -- CLAUDE.md | grep -c '^+[^+]'`).

## Fix-round contract, item 3 first

The fresh round's "What the derivation did NOT cover" names five limits:
`checkState`'s needles, the other test files and the checker script, tables
inheriting their section's class, disclaimers in other words, and a
non-CommonMark parser that "where it is unsure ... reads NOT binding, which
turns a relocation into a loud removal". The last sentence is the one this
review refutes: in every case below where the parser and CommonMark disagree,
the parser reads BINDING, which is the silent direction (CR-002, CR-003). The
same sentence is repeated in `delivery/plan/cutover/retirement-inventory.md`
line 492. The list also does not name the post-baseline residue (CR-004), nor
inline markup (CR-001), which the parser does not model at all rather than
being "unsure" about.

## Part 1: the class the earlier rounds lost on, re-run

Not re-derived from the fixtures but from the arms. Runner:
`/tmp/claude-0/-home-user/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/fable-p5/mutate.mjs`,
over the harness copy, never the tracked file. Each row replaces one exact
anchor that occurs once, runs the named test on the copy, restores. Captured
output, final line `restored: byte-identical`:

```
C4 blockquote container off: exit 1; tests 1, pass 0, fail 1; red: a binding rule relocated out of binding force is caught, in every container the reviews built
H3 Setext detection off: exit 1; tests 1, pass 0, fail 1; red: a binding rule relocated out of binding force is caught, in every container the reviews built
D1 disclaimer tripwire off: exit 1; tests 2, pass 0, fail 2; red: a binding rule relocated out of binding force is caught ... | an acknowledged disclaimer covers only its own sentence, once
S2 STATE stable-section filter off: exit 1; tests 1, pass 0, fail 1; red: STATE.md status evidence is pinned or stable, never read from text a standing update rewrites
R1 completeness compares against the whole file: exit 1; tests 2, pass 0, fail 2; red: a binding rule relocated out of binding force is caught ... | a heading registered non-binding takes its section's text out of force ...
H1 unregistered heading not a finding: exit 1; tests 2, pass 0, fail 2; red: a binding rule relocated out of binding force is caught ... | a heading register that has drifted from its file is refused
```

Six of six arms redden the test the work history's mutation table names for
them. This is a spot check of the 30-row table, not a re-run of it.

The relocation test itself at this head runs the nine members as a control
(`test/retirement-inventory.test.ts` line 1684): green, meaning every member
is caught. The second hazard review's four bypasses and the criteria review's
six are all rows of that fixture list, checked by reading it.

## Part 2: attacks on the parser and the register

Probe files:
`/tmp/claude-0/-home-user/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/fable-p5/probes.test.ts`
and `probes2.test.ts` (the harness copy with probes appended), outputs in
`probes.out` and `probes2.out` next to them. The paragraph attacked is the
red-witness rule, baseline `CLAUDE.md@6dc5b06` lines 342-343 ("A test only
counts as guarding a behavior if it has been demonstrated red without the
behavior and green with it. Applies to fix-round tests too."); the list
attacked is `## Never`, baseline lines 1339-1349; the four-space item attacked
is warning 12's "AND SINCE 2026-08-20" paragraph, baseline lines 1137-1146.
Control on the unmutated file: `{"rule":[],"diet":[]}`.

A first pass of six probes wrapped only the first two lines of the paragraph
and reddened for a reason unrelated to classification (the third sentence
"Applies to fix-round tests too." is in the same baseline segment, so the
fixture split the segment). Those six were re-run over the whole paragraph
(the Q rows). The first-pass rows for them are not counted.

| # | route a future editor could take | result | what the reader sees |
|---|---|---|---|
| Q01 | `~~...~~` around the whole paragraph | SILENT | struck text |
| Q03 | `<s>` at line start, `</s>` at end | LOUD (html block) | struck text |
| Q04 | `Old: <s>...</s>` mid-line | SILENT | struck text |
| Q04b | `<s>` alone on the line above, `</s>` below | LOUD (html block) | struck text |
| Q24 | the whole paragraph in one code span | SILENT | monospace, quoted |
| Q14 | the paragraph as a table row under `former rule / why dropped` | SILENT | a table of history |
| Q10 | `- > ` bullet holding the paragraph | SILENT | a quoted bullet |
| Q22 | control: the paragraph bolded | SILENT, correct | a rule |
| Q25 | control: `> ` on line 1, lazy lines after | LOUD | the existing blockquote member |
| Q18 | `---` directly under the paragraph (Setext accident) | LOUD, unregistered heading | a heading |
| P02 | `- ~~...~~` on each Never item | LOUD (formatting) | struck list |
| P02b | one `~~` pair around the whole Never list | LOUD (formatting) | struck list |
| P05 | `    > ` on the first line of warning 12's paragraph (lazy continuation) | SILENT | a blockquote |
| P05b | `    > ` on every line of it | LOUD (formatting) | a blockquote |
| P06 | `    <s>` at the start of that paragraph | SILENT | struck text |
| P06b | `    <details>` inside that continuation | LOUD (35 heading findings: details never closes) | collapsed |
| P06c | `    ```` inside that continuation | LOUD (35 heading findings: fence never closes) | code |
| P07 | four-backtick fence, a three-backtick line inside, the list after it | SILENT | inside the fence (CommonMark) |
| P08 | three-backtick fence, a "```md" line inside, the list after it | SILENT | inside the fence (CommonMark) |
| P09 | HTML comment with `` `-->` `` in a code span, the list after it | SILENT, correct | HTML ends the comment there too |
| P11 | `## Never` kept, its list deleted | LOUD | an empty heading |
| P12 | P11 plus a `history-moved` entry whose evidence is another entry's pointer and an unrelated six-word `rule-kept` | SILENT | an empty heading |
| P13 | delete the post-baseline "Add a token estimate" paragraph (DR-0044 section) | SILENT | a rule gone |
| P13b | delete the post-baseline "Without an artifact to read" paragraph | SILENT | a rule gone |
| P13c | delete the sentence "**Before dispatching, state in writing ...**", keeping the corrected replacement quote after it | SILENT | half a rule gone |
| P13d | control: delete the corrected replacement sentence itself | LOUD (`diet-claude-md-11: replacement quote is not in CLAUDE.md`) | |
| P15 | one of 16 disclaimer words not on the list before the paragraph (Formerly, Rescinded, Revoked, Old rule does not apply, Not in force, Stale, Void since M5, Ignore the next sentence, Struck 2026-09-23, Dropped, Defunct, Out of date, Previously, Was, Disabled, Inactive) | SILENT, all 16 | a disclaimed rule |
| P15c | control: 8 words on the list (Superseded, Retired, No longer applies, Obsolete, Historical, Withdrawn, Legacy, Kept for search) | LOUD, all 8 | |
| Q26 | "Former text, kept only so searches still find it:" then the paragraph | SILENT | a disclaimed rule |
| P16 | `## Never` body replaced by "See `docs/never.md`." | LOUD | a link |
| P16b | `## Never` body replaced by an `@docs/never.md` import line | LOUD | an import |
| P17 | register edit: the root `# Tiphys kernel: repository rules` set non-binding | LOUD, 192 findings | |
| P19 | `<!-- struck -->` appended to one Never item | LOUD (false-red direction: a comment on a line masks the line) | |
| P20 | `<br>` line above the paragraph | LOUD (false-red direction: an HTML block runs to the blank line) | |
| P21 | list moved under a second `## Never` heading at the end of the file | SILENT, and not a loss: it is under a binding heading | |
| P23 | paragraph moved to a seven-space-indented line after item 11 | LOUD | a code block |
| Q27 | control: a nested `- > (old) ...` bullet added under a Never item | LOUD (the added line breaks the list segment) | |

Nested containers the brief asked about, beyond the rows above: a fence
inside a list continuation with two or three spaces is caught (`^\s*` on the
fence regex), a `<details>` with any indent is caught, a comment anywhere on a
line is caught; the one nesting that is not caught is a `>` or an inline HTML
tag at four or more spaces (P05, P06), because the blockquote and HTML-block
regexes allow at most three spaces and the four-space branch runs after them
and inherits the list kind. Lazy lines: a lazy blockquote line is handled
(Q25); a lazy line after a list is a list continuation, which is correct and
binding. Tables: Q14. A new file: P16, P16b, both loud, and no disposition
kind can name a file outside `CLAUDE.md`, `AGENTS.md` or `delivery/`.

## Findings

### CR-001 (medium, fixable): inline markup keeps a paragraph rule in binding force

- Claim. The parser classifies lines by block structure only. Inline markup
  that every Markdown reader renders as "not live" (GFM strikethrough
  `~~...~~`, an inline `<s>`, `<del>` or `<strike>` not at line start, a whole
  paragraph inside one code span) leaves the line a paragraph under a binding
  heading, and the completeness sweep's substring match still finds the
  baseline words inside it. The same holds for a paragraph rule moved into a
  table row (stated residue) and for a `- > ` bullet, where the list marker
  wins over the quote marker.
- Evidence. Q01, Q04, Q24, Q14, Q10 above: `rule=0 diet=0` for each, on the
  real functions and the real register. Q22 (bold) is green too, which is
  correct, and shows the sweep cannot tell emphasis from strikethrough because
  it does not look. CLAUDE.md today carries no `~~`, no `<s>` and no
  blockquote line (`grep -c` gives 0 for each), so nothing live is affected;
  the finding is about the route, not the tree.
- Why it matters. Strikethrough is the ordinary way a Markdown-literate editor
  marks a sentence as dead while keeping it visible, which is exactly the
  "words kept, force removed" shape the phase's hazard class names
  (delivery/plan/value-delivery-plan.yaml:379). Under this guard it is silent.
  Medium rather than high because the words are still in the file and a diff
  reviewer sees the `~~` added; medium rather than low because a routine
  editor takes this route without any intent to evade.
- Concrete fix. In `parseMarkdown` (or a small pass over `blocks()`), treat a
  live block as non-binding when, after trimming its marker, it starts with
  `~~` and ends with `~~`, or contains `<s>`, `<del>` or `<strike>` in any
  position, or consists of a single code span. Add these as three
  `RELOCATIONS` rows with `arm: "removal"` (strike, inline `<s>`, code span)
  and a fourth for the `- > ` bullet, so the existing relocation test
  witnesses them; a table row with no disclaimer word stays stated residue.
  Also apply the strike rule in `disclaimerFindings`: a `~~` block in binding
  text is a finding on its own, the same way a disclaimer word is.

### CR-002 (medium, fixable): container markers inside a four-space list continuation are read as list text

- Claim. The blockquote regex is `/^ {0,3}>/` and the HTML-block regex is
  `/^ {0,3}</`, but the continuation lines of the numbered warnings 10 to 14
  (`CLAUDE.md` lines 997, 1001, 1003, 1077, 1101) are indented four spaces, so
  a `>` or a `<s>` there falls through to the four-space branch
  (`test/retirement-inventory.test.ts` line 997) and is classified `list`,
  hence binding. CommonMark reads a `>` at the item's content column as a
  blockquote inside the item, and a reader sees a quotation.
- Evidence. P05 and P06 above, `rule=0 diet=0`. P05b (every line prefixed) is
  loud only because the `>` characters break the substring, which is the
  formatting accident the previous hazard review already warned is not
  classification. The fence and `<details>` regexes use `^\s*` and are caught
  in the same position (P06b, P06c), which shows the fix is local.
- Why it matters. The standing warnings are where superseded measurements get
  quoted, and items 10 to 14 are where the four-space column lives. The work
  history and the inventory document both say that where the parser is unsure
  it reads NOT binding; here it reads binding, and that sentence is false
  (R-087).
- Concrete fix. When the previous kind is `list` or `paragraph`, run the
  container regexes against `l.replace(/^\s+/, "")` (or against the line with
  its list content indent removed) before the four-space branch. Add two
  `RELOCATIONS` rows built from the warning-12 paragraph (`    > ` on the first
  line; `    <s>` on the first line), and correct the sentence in the work
  history's item 3 and in `delivery/plan/cutover/retirement-inventory.md` line
  492 to say which direction the parser errs in for each known disagreement.

### CR-003 (low, fixable): a fence closes on any line that begins with the opening marker

- Claim. `fence` stores only the three-character marker and the close test is
  `^\s*` plus that marker, so a "```md" line closes a fence (CommonMark: a
  closing fence carries no info string) and a "```" line closes a "````"
  fence (CommonMark: the closer must be at least as long). Everything after
  the false close, up to the next fence, is live.
- Evidence. P07 and P08, `rule=0 diet=0`, with the whole Never list inside
  the fence as a reader would see it.
- Why it matters. Low because the route needs a fenced example that itself
  shows a fence, which CLAUDE.md does contain (the backtick-in-backtick table
  row under rule 3b) but is rare. It is the same false sentence as CR-002.
- Concrete fix. Store the full run of fence characters; close only on a line
  matching `^\s*` plus a run of the same character at least that long,
  followed by optional whitespace and nothing else. One `RELOCATIONS` row
  (P08's shape) witnesses it.

### CR-004 (low, design residue to state; a larger fix is optional): text added after the diet baseline is not protected by the completeness sweep

- Claim. The sweep compares the CURRENT binding text against `6dc5b06`. A rule
  written after that commit has no baseline segment, so deleting it is silent
  unless it happens to be a `corrected` entry's replacement quote or a
  `rule-kept` quote. The protected set is frozen on 2026-09-23 and every later
  edit to CLAUDE.md enlarges the unprotected set.
- Evidence. P13, P13b, P13c: the DR-0044 token-estimate paragraph, the
  "Without an artifact to read" paragraph, and the "Before dispatching, state
  in writing" sentence each deleted, `rule=0 diet=0`. P13d (control): deleting
  the replacement sentence itself is loud. 37 added lines at this head are in
  that position now.
- Why it matters. The test's own title is honest ("every line removed ...
  since the diet baseline"), and the inventory document's "What this does NOT
  reach" paragraph does not say it, nor does the work history's "What the
  guards no longer claim". A reader of either will believe CLAUDE.md is under a
  removal guard going forward. Low because the deletion is visible in a diff
  as red lines and needs no trick; it would be medium if any document claimed
  forward protection, and none does.
- Concrete fix. State it in both documents and in the test header: "the sweep
  protects the text that existed at 6dc5b06; text added later is protected by
  review of the diff only". If forward protection is wanted, the mechanism is
  a second sweep against `git merge-base HEAD origin/main` with dispositions
  keyed by content hash rather than baseline line numbers; that is a design
  change and belongs in its own phase, not this round.

### CR-005 (low, partly inherent): the disclaimer word list misses the common words

- Claim. The tripwire is stated as a tripwire and its residue is stated. But
  the words it misses include the ones an editor reaches for first.
- Evidence. P15: 16 of 16 tried words silent (Formerly, Rescinded, Revoked,
  "does not apply", "Not in force", Stale, Void, "Ignore the next sentence",
  Struck, Dropped, Defunct, "Out of date", Previously, Was, Disabled,
  Inactive). Q26: "Former text, kept only so searches still find it" silent
  ("kept for" is on the list, "kept only" and "former" are not). P15c: 8 of 8
  listed words loud.
- Concrete fix. Add `former(ly)`, `previous(ly)`, `rescinded`, `revoked`,
  `struck`, `dropped`, `defunct`, `stale`, `void`, `inactive`, `disabled`,
  `not in force`, `does not apply`, `out of date`, `kept only` to `DISCLAIMER`,
  acknowledge whatever real hits appear, and keep the residue sentence. The
  core is inherent: a disclaimer in fresh words is prose meaning.

### CR-006 (low, inherent core, one cheap tightening): a history-moved disposition's evidence need not relate to the block it disposes

- Claim. `history-moved` requires an 8-word quote at a `delivery/` pointer
  and a 6-word `rule-kept` quote in a rule file's binding text. Nothing ties
  either quote to the removed block.
- Evidence. P12: the Never list deleted, plus an entry with `lines
  [1339, 1349]`, the correct first and last lines, `history` copied from
  `diet-claude-md-05` (T-014 lines 13-14) and `rule-kept` set to "One phase,
  one branch, one PR. Branch names are given by the plan": `rule=0 diet=0`.
- Why it matters. Low because writing such an entry is deliberate work in a
  reviewed JSON diff, not a routine edit, and semantic equivalence is the
  reviewer's reading, which the inventory document says. Stated so the next
  reviewer knows the channel is unverified beyond shape.
- Concrete fix. Refuse a `history` pointer or a `rule-kept` quote that another
  diet entry already uses (P12 reused one). It closes this fixture and costs
  four lines; it does not close the class, and the residue sentence stays.

### CR-007 (low, R-087): the work history's claim-grep sentence is false

- Claim. `delivery/work-history/m5-p5.md` lines 803-808 say the line-based
  grep over the whole file reports one matching line and the wrap-insensitive
  form one occurrence, "so no hit straddles a wrap".
- Evidence. The binding line-based command over the whole file at d353faf
  reports three lines: 597 (`neverSplit` in captured output), 805 and 806
  (the sentence reporting the result names `never` and `neverSplit`). The
  `tr` form reports four occurrences: `never` three times and `cannot be`
  once. That one is at lines 807-808, "later evidence cannot / be pinned",
  which straddles a wrap and is the restated hit the same sentence describes.
  So both numbers are wrong and the "no hit straddles" clause is the exact
  shape CLAUDE.md's claim-grep section warns about.
- Why it matters. None of the hits is a live over-claim (one identifier, one
  self-description, one quoted restatement). The sentence is still a stated
  measurement that does not match the file it sits in.
- Concrete fix. Replace the sentence with the counts above and say what each
  hit is.

### CR-008 (low): stable STATE.md sections are stable by declaration, and the red they give does not say so

- Claim. Five entries quote text inside `## How to resume cold`, `## Owner
  decisions` and `## Earlier milestones`. Rewording any of those sentences
  reddens the live test with "quote is not in the live text of
  delivery/STATE.md", a message that names neither the register entry's
  reason nor the fact that the section is registered stable. Separately,
  `OPEN_ACTION_EXEMPT` still exempts `A-14` after its register item lands, so
  a three-word A-14 item passes (R7 below).
- Evidence. R4 (resume-cold step 5 reworded): red, diet-state-01, -03, -15.
  R5 (Owner decisions first sentence): red, diet-state-06. R6 (Earlier
  milestones): red, diet-state-02. R7: green with a three-word A-14 item.
- Why it matters. Not a rule-loss risk (the direction is loud); a maintenance
  cost that will be paid by whoever next edits those sections, and the message
  should send them to the register rather than to the diet test. The A-14
  exemption is already scheduled for removal in the work history.
- Concrete fix. Extend the message for a STATE.md stable-section miss to name
  the section and say "update the entry's quote or pin it"; make the
  exemption list carry the phase that removes it, or have the test assert that
  an exempt id has NO register item yet, so the exemption self-expires.

## Honesty check of "What the guards no longer claim"

Each of its five sentences was checked against the tree:

| sentence | checked | result |
|---|---|---|
| No live entry is `mechanically-enforced` | `grep -c '"disposition": "mechanically-enforced"'` on the JSON | 0, true |
| diet-state-13 quotes the CLAUDE.md rule | the entry's `superseded-by` is `{file: CLAUDE.md, quote: "Do not open a second workflow to get around the cap"}` | true |
| STATE.md currency is not checked | no checker reads the standing section | true |
| A pin is accepted only at the diet baseline; S1 is the witness | `test/retirement-inventory.test.ts` line 1286; member B of the pinned-or-stable test | true |
| The register does not say content is true; a table of history under a binding heading with no disclaimer word reads as binding | Q14 | true, and stated |

The section is true as far as it goes. It omits the four things this review
found silent (CR-001, CR-002, CR-003, CR-004) and the disposition channel's
unrelatedness (CR-006). The item-3 sentence about the parser erring toward
NOT binding is false (CR-002, CR-003).

## STATE.md: an ordinary standing update stays green

My own update, independent of the implementer's fixture (probe R1): a new
standing header with a new date and head, the "In flight" list rewritten to
one bullet, the A-15 open bullet reworded, a merged-table row added, the
standing-reminders count changed from TWO to ONE, the re-verification
paragraph rewritten, and the Owner decisions measurement date changed.
`checkDiet` and `checkState`: GREEN, `diet=0 state=0`. R3 (the header becomes
`## M6 standing at ...`): GREEN. R8 (the whole `## Standing reminders` section
deleted): GREEN, which is correct since nothing evidences from it. R2 (a new
open action A-16 with no register item): RED, "open owner action A-16 has no
register item", the intended loud direction. R9 (`## Owner action items`
renamed): RED, "there is no '## Owner action items' register", also intended.
The only reds from stable-section rewording are CR-008.

## Scope, behaviors, ASCII, citations, build

- Scope gate, run with this worktree on a local branch named exactly
  `claude/m5-p5-context-diet` at d353faf: green, "7 changed path(s) audited
  against declaration delivery/plan/phase-declarations/m5-p5.json at merge
  base b16f200..." with four declared paths untouched (AGENTS.md, the
  declaration, the two brief tests). No declaration entry added. Exit 0.
- Citations gate at d353faf, `--base origin/main --head HEAD`: green, "linted
  2 changed document(s) ... 22 citation(s) resolved, 0 self-citation(s), 0
  unverifiable-external", exit 0. Matches the work history.
- `node scripts/check-authored-bytes.mjs`: exit 0 at this head.
- All 22 `m5-p5-*` names in `test/behaviors.json` resolve to exactly one
  `test("...")` title in `test/retirement-inventory.test.ts` (script over
  the JSON, 0 unresolved or duplicate).
- `npm run build`: exit 0; `git status --short` clean apart from this report.
- Blast radius: the only consumers of what changed are `npm test` (the diet
  tests) and readers of CLAUDE.md and STATE.md. No `src/`, `bin/`, `schemas/`,
  `roles/` or `tuition/` path changes, so the shipped kernel is untouched and
  the phase declaration's `review` gate class (`check-dual-review`) is the one
  that reads this document.

## Probes run that found nothing, or found the guard working

- The nine relocation members: all loud (existing test, green as a control).
- Emptied binding heading (P11), new linked file (P16), `@import` (P16b),
  Setext accident (Q18), seven-space code block (P23), root heading demoted in
  the register (P17): all loud.
- HTML comment with `-->` inside a code span (P09): silent, and correct,
  because HTML ends a comment at the first `-->` wherever it is.
- `<details>` and a fence inside a four-space continuation: loud (35 heading
  findings, because the container never closes, which is the safe direction).
- A comment on a rule's own line, an HTML block line above a rule: loud in the
  false-red direction; not a loss.
- A second `## Never` heading carrying the list: green and not a loss.
- Six arm mutations: all red on the named test.
- Routine STATE.md update, M6 header, standing reminders deleted: green.
- The `enforced-by` arm: no live entry uses it (0 in the JSON), so the CR-002
  of the second hazard review is closed by retreat, which the work history
  states; the fixture test's members A to D were read and each names the arm
  it reddens.

## What this review could not check

- The full `npm test` (1463 tests per the work history) and the PR bundle were
  not re-run here, per the brief's instruction to prefer single files on a
  shared CPU. The one test file this phase changes was run (56/56), plus the
  build, the scope and citations gates and the authored-bytes script.
- The 30-row mutation table was spot-checked on six arms, not re-run.
- Whether the probe list is the whole class of silent routes. It is the list
  I built from the brief's eight prompts plus what the parser's regexes
  suggested; by the fix-round contract that is a search, not a proof.
- AGENTS.md was not attacked. It is unchanged by the branch and is the shipped
  orchestrator brief; the same parser reads it, so CR-001 to CR-003 apply to
  it unchanged.
- Whether `A-6` is still open (the round-0 criteria CR-005), which nothing in
  this container settles.

## Verdict

FIX-ROUND-NEEDED. Two medium (CR-001 inline markup, CR-002 four-space
containers), six low. No high. The reviewed class is closed and the phase's
own pruning is evidenced; the two mediums are silent routes an ordinary editor
takes, each closable with a few lines and a `RELOCATIONS` row. If the
arbitration reads CR-001 and CR-002 as inside the "parser is not CommonMark"
residue already declared, note that the declared residue says the parser errs
toward NOT binding, and these are the cases where it errs the other way; the
residue sentence must change even if the parser does not.

## Output validation

- `node bin/tiphys.ts validate --type verdict delivery/review/m5-p5-hazard.json`:
  five `SKIPPED ... no context` lines (the Kind B cross-document checks, which
  need `--context`), no `INVALID` line, exit 1. The committed
  `delivery/review/m5-p3-hazard.json` gives the identical five lines and the
  identical exit code under the same command, so the exit is the skips and not
  a schema failure.
- Both files byte-checked: 0 bytes outside printable ASCII plus newline, no
  em dash. Resolving citations in this report: two, both into files the branch
  does not change; every reference into a changed file is quoted.
- Probe rows run: 68 CLAUDE.md rows (controls and the six superseded
  first-pass rows included) and 10 STATE.md rows, in `probes.out` and
  `probes2.out` in the scratch directory named above.
- The worktree was returned to a detached checkout of d353faf. The local
  branch `claude/m5-p5-context-diet` existed before this review (its reflog
  carries the implementer's commits) and sits at d353faf, so it was left as
  found.

## Re-verification at c1be4a8

- Head re-verified: c1be4a89e9a537b3afa0ba59597afdcda6248d94, fetched from
  origin/claude/m5-p5-context-diet and checked out detached. Two commits after
  d353faf: ca8d36b (test file +33/-5, inventory document, work history) and
  c1be4a8 (work history only, 92 insertions). Round described in the work
  history's "Last short round" section (lines 824 to 914 there; the file is
  changed by the branch, so quoted).
- Method: the harness copy was rebuilt from the c1be4a8 test file (same three
  path constants rewritten, nothing else) and every probe from the first
  review was re-run unchanged against it, then four new-arm mutations were run
  on that copy. Nothing tracked was edited.

### 1. CR-001 and CR-002 probes now go red

| probe | at d353faf | at c1be4a8 |
|---|---|---|
| Q01 `~~` around the whole red-witness paragraph | SILENT | LOUD: "binding text at line 311 carries strike markup" and line 312 |
| Q04 `Old: <s>...</s>` mid-line | SILENT | LOUD: strike markup at line 311 |
| Q03, Q04b `<s>` at line start (already loud) | LOUD | LOUD (html block) |
| P05 `    > ` on the first line of warning 12's paragraph | SILENT | LOUD: `CLAUDE.md@6dc5b06 lines 1137-1146` and two neighbours (rule=3) |
| P06 `    <s>` at the start of that paragraph | SILENT | LOUD (rule=3) |
| P08 "```md" line inside a fence, list after it | SILENT | LOUD: lines 1339-1349 |
| P07 "```" line inside a "````" fence | SILENT | SILENT, declared residue (CR-003 length half) |

So both mediums are closed on the exact routes that found them, by a tripwire
and a regex widening, as the owner asked. The two-space and three-space
variants were not separately probed; the regexes now accept any leading
whitespace, so the four-space case is the general one.

New-arm red witnesses on the harness copy (runner `mutate2.mjs`, output
`mutate2.out` and `mutate2b.out` in the scratch directory; final line
`restored: byte-identical`):

```
K1 strike tripwire off: exit 1; tests 1, pass 0, fail 1; AssertionError [ERR_ASSERTION]: struck through with ~~: its disclaimer arm reports nothing
K2 blockquote back to three-space indent: exit 1; tests 1, pass 0, fail 1; AssertionError [ERR_ASSERTION]: in a blockquote at four spaces of indent: its removal arm reports nothing
K3 html block back to three-space indent: exit 1; tests 1, pass 0, fail 1; AssertionError [ERR_ASSERTION]: in an HTML block at four spaces of indent: its removal arm reports nothing
K4 fence closes on any line starting with the marker: exit 1; tests 1, pass 0, fail 1; AssertionError [ERR_ASSERTION]: inside a fence past an info-string line: its removal arm reports nothing
```

The failing row named in each line is the row the mutation was written to
defang, so the witness is specific rather than a red from some unrelated row.
Each reddens the relocation test ("a binding rule relocated out of binding
force is caught ..."), which now carries five new rows (`~~`, inline `<del>`,
`>` at four spaces, `<s>` at four spaces, fence past an info-string line). The
strike class has two structurally different members (a `~~` pair; an inline
`<del>` after prose) and the work history's T1X1 row shows the second reddens
with the first commented out. I did not re-run T1X1; I read it.

### 2. The residue list is honest and complete

The work history's "complete list after this round" (lines 875 to 895 there)
was checked item by item against my probes at c1be4a8:

| residue item | my probe at c1be4a8 | matches |
|---|---|---|
| table row reads binding | Q14 SILENT | yes |
| `- > ` bullet reads binding | Q10 SILENT | yes |
| inline code span reads binding | Q24 SILENT | yes |
| strike tripped on, other inline markup not seen | Q22 bold SILENT (correct); no other inline route tried | yes, as stated |
| CR-003 length half: "```" closes "````" | P07 SILENT | yes |
| CR-004 post-baseline text unswept | P13, P13b, P13c SILENT | yes |
| CR-005 disclaimer list misses common words | P15 16 of 16 SILENT, Q26 SILENT | yes |
| CR-006 history-moved quotes need not relate | P12 SILENT | yes |
| CR-008 stable-section message, A-14 exemption | R4, R5, R6 RED with the unchanged message; R7 GREEN | yes |

Every silent probe from the first review is now either loud or on that list.
Nothing I found is missing from it. The parser-direction sentence is corrected
in three places (the work history, the inventory document at its line 492
region, the test-file header and `parseMarkdown` comment), and each now says
the parser can err either way and names the shapes. One small omission, not
a finding: the inventory document's residue paragraph carries the table, bullet,
code-span, strike, container and post-baseline items but not the fence-length
half of CR-003, the disclaimer-word gap, or CR-008; those three are in the work
history's list only. Low, documentation, and the work history is the fuller
record by design.

Claim grep at c1be4a8, run by me: the line-based command prints two lines
(597, the `neverSplit` identifier in captured output; 882, the corrected
residue sentence) and the `tr` form prints two occurrences (`always` x1,
`never` x1). That matches the work history's own paragraph exactly, so CR-007
is closed.

### 3. No new defect from the round

- `node --test test/retirement-inventory.test.ts` at c1be4a8: 56 tests, 56
  pass, 0 fail, 0 skipped, exit 0 (the five new rows live inside the existing
  relocation test, so the count is unchanged).
- The wider `^\s*<tag` and `^\s*>` regexes could mask a legitimate rule line
  that starts with a tag or a `>` at any indent. That is the loud direction
  (a masked live line reddens the completeness sweep), and the live test being
  green shows no such line exists in CLAUDE.md or AGENTS.md today. Confirmed
  separately: `grep -nEi '~~|<(s|del|strike)\b' CLAUDE.md AGENTS.md` prints
  nothing, so the STRIKE tripwire has no live hit and needed no acknowledgement.
- `STRIKE` is `/~~|<(s|del|strike)\b/i`; the `\b` keeps `<span` and `<script`
  from matching. A `~~` inside a code span in binding text would trip it: loud,
  reviewed, acceptable.
- Every STATE.md probe gives the same result as at d353faf (R1 routine update
  GREEN, R3 GREEN, R8 GREEN, R2 and R9 RED as intended, R4 to R6 RED per
  CR-008, R7 GREEN per CR-008). The round did not touch STATE.md or its checks.
- Controls unchanged: P11, P16, P16b, P17, P18, P19, P20, P23, P24 (first-pass
  form), Q18, Q25, Q27 all LOUD as before; P09 and P21 SILENT and correct as
  before.
- `npm run build` exit 0; `git status --short` shows only my two review files.
- Citations gate at c1be4a8, `--base origin/main --head HEAD`: green, "linted
  2 changed document(s) ... 22 citation(s) resolved", exit 0.
- `node scripts/check-authored-bytes.mjs` exit 0. All 22 `m5-p5-*` names in
  `test/behaviors.json` resolve to exactly one test title (the round added no
  behavior name, which is right: it added rows to an existing witnessed test).
- Not re-run here: the full `npm test` (the work history reports 1463 pass,
  0 fail, 0 skipped at ca8d36b, and c1be4a8 adds only work-history text) and
  the PR bundle; the scope gate, which was green at d353faf and the round
  changed no new path.

### Verdict at c1be4a8

APPROVE. CR-001 and CR-002 are closed with red witnesses on the routes that
found them; CR-003's one-line half and CR-007 are closed; CR-004, CR-005,
CR-006, CR-008 and the fence-length half of CR-003 are stated residue,
accepted by the owner as lows, and each is still measured as silent or as
loud-in-the-wrong-message exactly as the list says. For a routine editor the
remaining silent routes are a rule moved into a table row, a `- > ` bullet,
a code span, a disclaimer in unlisted words, deletion of post-baseline text,
and a "```" line inside a four-backtick fence. Each is visible in a diff and
none is the strikethrough-and-move shape that made the mediums medium. No new
defect was found.

### Output validation at c1be4a8

`node bin/tiphys.ts validate --type verdict delivery/review/m5-p5-hazard.json`
on node v26.6.0 prints five `SKIPPED ... no context` lines (the Kind-B checks
that need a review pair) and NO `INVALID` line, exit 1, the same output and
exit as the committed m5-p3-hazard.json gives. The JSON's `head` is the full
`c1be4a89e9a537b3afa0ba59597afdcda6248d94` and `produced-by` is
`claude-fable-5-1`. Byte check on both review files: 0 non-ASCII or control
bytes, 0 em dashes. `git status --short` lists only the two untracked review
files; the worktree is detached at c1be4a8 and nothing is committed.
