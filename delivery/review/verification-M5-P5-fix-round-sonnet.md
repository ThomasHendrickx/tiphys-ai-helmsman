# Delta verification: M5-P5 fix round 1 (context diet), hazard contract

Date: 2026-09-23
PR: #215
Branch: claude/m5-p5-context-diet
Head verified: ecab915ca959ae373cbd5e9f2ca2b5d064deb19f (fix round 1 on 681efcd)
Round-0 head: 681efcd9bcc4da12440aea40fdcc18719f0d5a67
Contract: HAZARD
Model family: Sonnet
Method: clean-room delta verification, no implementer session access. Checked
out ecab915 detached in isolated worktree, diffed against
origin/main...ecab915 and against 681efcd, re-executed the round-0
mutations, attacked the new guard with the gaps the implementer itself named.

Status: COMPLETE.

## Setup

Fetched origin/claude/m5-p5-context-diet and origin/main, checked out ecab915
detached. Node v26.6.0 first on PATH, verified `node --version` in the same
shell (`v26.6.0`). `npm ci` exit 0. `npm run build` exit 0, `git status
--short` clean afterward (only this report file, untracked). Diff shape,
`git diff 681efcd...ecab915ca959ae373cbd5e9f2ca2b5d064deb19f --stat`: CLAUDE.md
(+18), delivery/STATE.md (+2/-1), retirement-inventory.json (+15/-15),
retirement-inventory.md (+45/-14), delivery/work-history/m5-p5.md (+239),
test/behaviors.json (+7/-1), test/retirement-inventory.test.ts (+384/-4).
Seven files, all on the phase's own declaration/extras, matching round-0's
scope reading.

`node --test test/retirement-inventory.test.ts` at ecab915: tests 48, pass 48,
fail 0, skipped 0. Matches the work history's own claim
(delivery/work-history/m5-p5.md:472).

## Part 1: re-run the two round-0 mutations, confirm red

Both were re-derived independently against the real, checked-out committed
files at this head (CLAUDE.md and delivery/plan/cutover/retirement-inventory.json),
not read from the test fixtures, using a standalone script copying the current
`bindingMask`/`uncoveredRemovals` logic verbatim from test/retirement-inventory.test.ts:870-921
and test/retirement-inventory.test.ts:1141-1178.

**Member A (relocate the whole "Never" list into an HTML comment marked
non-binding).** Script:
/tmp/claude-0/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/verify-p5r1/mutA.mjs.
Result:

```
sanity, unmutated missing count: 0
member A (HTML-comment relocation) missing after mutation: 1 [ 'CLAUDE.md@6dc5b06 lines 1339-1349' ]
```

Now RED (round-0 reported `missing after semantic-gutting mutation: 0 []`;
this head reports 1). Confirmed on the real CLAUDE.md and the real
retirement-inventory.json at ecab915, reverted, no diff left over.

**Member B (mechanically-enforced entry's `enforced-by` swapped to a real but
unrelated script and test).** Edited the real, committed
delivery/plan/cutover/retirement-inventory.json in place: `diet-claude-md-02`'s
`enforced-by.script` changed from `scripts/check-authored-bytes.mjs` to
`scripts/check-id-collisions.mjs` and `enforced-by.test` to
`"a diet entry naming a block that is not at its baseline range is refused"`
(the same swap round-0 used). Ran:

```
node --test --test-name-pattern="every diet disposition carries evidence" test/retirement-inventory.test.ts
```

Result: 1 fail, not 1 pass as round-0 reported.

```
actual: [
  "diet-claude-md-02: enforced-by test's file test/retirement-inventory.test.ts does not run scripts/check-id-collisions.mjs",
  'diet-claude-md-02: enforced-by asserts fragment is not in the body of the named test'
]
```

Now RED. Reverted with a saved-copy restore
(`cp .../retirement-inventory.json.orig delivery/plan/cutover/retirement-inventory.json`),
`git status --short` confirmed clean afterward.

Both round-0 mutations are confirmed red at this head. Round 1's binding-text
check (member A) and file-runs-script/asserts-in-body checks (member B) both
fire.

## Part 2: attack the new guard with the gaps the implementer names

The work history's own "What the derivation did NOT cover" section
(delivery/work-history/m5-p5.md, fix round 1 section) names two residual
risks in writing: the label lists are closed (a paragraph or heading
disclaiming itself in different words still reads as binding), and the
`enforced-by` file check is textual (a test file that names the script in a
string counts as running it). The dispatch brief asks for exactly these plus
a fenced code block and a blockquote. All four were tried against the real,
committed CLAUDE.md and retirement-inventory.json at this head, using the
same standalone copy of `bindingMask`/`uncoveredRemovals`
(/tmp/claude-0/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/verify-p5r1/mutGaps.mjs)
plus a live edit for the enforced-by attack.

### CR-001 (this review), high: closed label list lets a relocated rule read as still-binding

Four variants, each moving the real "Never" list (CLAUDE.md:1339-1349 at the
diet baseline, the same block round-0 and the round-1 fix both used) out of
its live section and into a new location that a human reader would call
non-binding, but whose label is not one of the six words
`bindingMask`'s `NON_BINDING_HEADING`/`NON_BINDING_PARAGRAPH` regexes match
(`superseded|retired|archived|historical|history|non-binding|not binding|no
longer binding`):

```
=== sanity (unmutated) ===
missing: 0

=== Gap 1: heading 'Deprecated' ===
missing: 0 []

=== Gap 1b: heading 'Obsolete guidance' ===
missing: 0 []

=== Gap 1c: paragraph 'This text is obsolete and kept for reference only.' ===
missing: 0 []

=== Gap 2: rule moved into a fenced code block ===
missing: 0 []
```

All four report zero missing segments: `uncoveredRemovals`, the completeness
sweep that is supposed to catch exactly a relocation that keeps the words
(the same property round-0's finding and round-1's fix are both about), does
not see any of these as a removal. A "Never" list, including the C-1/C-2/C-3
constraints and "never merge your own work", moved under a heading titled
"Deprecated" or "Obsolete guidance", or into a plain paragraph saying "This
text is obsolete and kept for reference only", or into a fenced code block
with no comment at all, passes silently. The fenced-code case is the
starkest: `bindingMask`'s fence-tracking exists only to stop a heading marker
INSIDE a fence from being read as a real heading (test/retirement-inventory.test.ts:888,
`const h = fence ? null : ...`); the fence itself never masks its own
contents as non-binding, so wrapping a whole rule block in three backticks,
which is the single most common way a reader marks something as "quoted, not
live" in a markdown-literate project, does not register as a relocation at
all.

Control (blockquote): moving the same block behind `> ` on every line DID
redden (missing: 1). That is not the guard recognizing a blockquote as
non-binding; the `> ` prefix on every line changes the literal joined text,
so it fails the substring match against the baseline block for an unrelated
reason (formatting, not classification). Recorded as a probe that did not
find a gap, with the caveat that it is not evidence the guard understands
blockquotes either.

Why this is the same mechanism as round-0's CR-001, not a new one: round 1's
own doc comment (test/retirement-inventory.test.ts:788-790) states the fix as
"not under a heading labelled superseded, retired, archived, historical,
history or non-binding, and not in a paragraph that calls itself non-
binding". That is a closed enumeration standing in for an open concept
(text a reader would recognize as not currently binding). The round closed
the two specific words the round-0 mutation used ("superseded" in an HTML
comment, "Historical notes" as a heading) and left the concept itself, which
CLAUDE.md's own fix-round contract calls out by name as the dominant failure
shape in this project: the fix addressed the instance, not the mechanism.

Fix direction: either widen the closed list substantially (deprecated,
obsolete, vestigial, dead, moot, no longer applies, for reference only, kept
for history, out of date, stale, legacy, inert, disabled, ...; still a list,
still incomplete, but cheaper than the alternative) or invert the design:
require every binding block explicitly, for example by treating only text
under a recognized live heading structure as binding and masking everything
else by default, which is a bigger change; and separately, mask fenced code
block contents as non-binding by default (a code fence is not where CLAUDE.md
keeps live prose rules; every genuine command block in CLAUDE.md is already
handled as a citation target, not as rule text the diet's binding-text check
needs to see).

### CR-002 (this review), high: mechanically-enforced discharges with the correct script and an unrelated test in the same file

The work history names this risk directly ("The `enforced-by` file check is
textual: a test file that names the script in a string counts as running
it"). Constructed the concrete case: edited the real, committed
delivery/plan/cutover/retirement-inventory.json in place, changing
`diet-claude-md-02`'s `enforced-by` from
`{script: "scripts/check-authored-bytes.mjs", test: "authored-byte checker
rejects NUL SOH and non-ASCII tracked bytes", asserts: "control byte 0x00"}`
(the real, correct entry, covering the grep -a / NUL-blindness rule) to
`{script: "scripts/check-authored-bytes.mjs", test: "authored-byte checker
accepts ordinary tracked ASCII", asserts: "plain ASCII"}`. The script name is
untouched and real; the test is a real, different test in the SAME file
(test/authored-bytes.test.ts), one that asserts the OPPOSITE property (a
clean file is accepted, not that a control byte is rejected); `asserts` is a
literal substring cherry-picked from that unrelated test's own body
(`"ordinary.txt": "plain ASCII\n"`). Ran:

```
node --test --test-name-pattern="every diet disposition carries evidence" test/retirement-inventory.test.ts
```

Result: 1 pass, 0 fail. `checkDiet` reports zero findings for this entry.
Reverted from a saved copy, `git status --short` clean afterward.

This passes every one of the round's three `mechanically-enforced` checks at
once: `scriptOk` is true and `ciText().includes(base)` is true because the
script really is `scripts/check-authored-bytes.mjs` and really is CI-run;
`allTests().get(test)` resolves to exactly one site because the test title is
real; `fileSrc.includes(base)` is true because the module-level constant
`test/authored-bytes.test.ts:9` (`const checker = fileURLToPath(new
URL("../scripts/check-authored-bytes.mjs", ...))`) names the script at the
top of the file regardless of which test in the file is picked; and
`site.body.includes(by.asserts)` is true because the entry controls its own
`asserts` string and can pick any substring already present in the
unrelated test's body. None of the four checks verifies that the NAMED TEST
is the one that actually exercises the rule; they verify only that a real
script, a real test in the right file, and a real substring of that test's
own text, all exist and are consistent with each other. Round-0's member B
(cross-file swap) is now caught (Part 1 above); this is the same class,
narrowed to stay inside the correct file, which is exactly the shape of
attack a reviewer who reads the round's own residual-risk note would try
next.

Fix direction (matching the work history's own framing): grep the named
test's OWN body, not the whole file, for the script's basename
(`site.body.includes(base)`, not `fileSrc.includes(base)`), which would
refuse this exact case (the unrelated test's body never mentions
`check-authored-bytes.mjs`). That closes this member without closing the
class: an unrelated test that DOES incidentally invoke the same script
(sharing a fixture helper, for example) in its own body would still pass.

### Probes that did not find a gap

- Blockquote relocation: caught, for an unrelated reason (see CR-001 above),
  not evidence the guard handles blockquotes correctly.
- Did not find a way to make the `history-moved` `history` pointer (raw,
  non-binding by design per test/retirement-inventory.test.ts:1025) exploit
  anything beyond what CR-001/CR-002 already cover; it is deliberately not a
  binding-text check, and that is stated as intentional in the code comment.

## Part 3: does the fix introduce any other defect

- `node --test test/retirement-inventory.test.ts` at ecab915 (unmutated):
  tests 48, pass 48, fail 0, skipped 0. Matches the work history.
- `node scripts/check-retirement-inventory.mjs`: "318 row(s) against 318
  derived rule anchor(s), 9 retired, commands EXECUTED", "every rule in the
  three roots is resolved", exit 0. Matches.
- `node scripts/check-authored-bytes.mjs`: exit 0. `node
  scripts/check-agents-references.mjs`: "green (23 references resolved)",
  exit 0. Both match.
- Citations gate re-run directly: `node bin/tiphys.ts gates run --registry
  gate-registry.yaml --mode full --only citations --evidence <dir> --base
  origin/main --head HEAD`: "citations: green: linted 2 changed document(s)
  at ecab915ca959ae373cbd5e9f2ca2b5d064deb19f: 18 citation(s) resolved, 0
  self-citation(s), 0 unverifiable-external", "every applicable gate is
  green". Matches the work history's fix-round-1 gate table exactly (18,
  not round-0's 16).
- `npm run build` exit 0, `git status --short` clean apart from this report
  file, both before and after every mutation was reverted.
- Did not independently re-run the full `npm test` (1455 tests) given the
  brief's instruction to prefer single test files under shared CPU; the
  retirement-inventory file (the only one this fix round touches) was run
  directly and matches. Recorded as an honest-failure item below rather than
  silently assumed.
- Did not re-run the PR bundle (`m2-exit-test.sh --bundle pr`) independently;
  the citations, retirement-inventory, authored-bytes and agents-references
  results above are the gates most exposed by this round's changes and were
  re-run directly.

## Scope audit

`git diff origin/main...ecab915ca959ae373cbd5e9f2ca2b5d064deb19f --name-only`:
CLAUDE.md, delivery/STATE.md, delivery/plan/cutover/retirement-inventory.json,
delivery/plan/cutover/retirement-inventory.md, delivery/work-history/m5-p5.md,
test/behaviors.json, test/retirement-inventory.test.ts. Same seven paths as
round 0, all on the declaration or the standing extras (test/behaviors.json,
the phase's own work history). No new path introduced by the fix round.

## Behaviors.json names

All five new names added by this round
(`m5-p5-diet-non-binding-relocation-is-removal`,
`m5-p5-diet-non-binding-rule-kept-refused`,
`m5-p5-diet-unrelated-enforcer-refused`,
`m5-p5-diet-status-disposition-state-only-and-floored`,
`m5-p5-state-open-action-runnable-text-kept`) checked by direct grep against
`test("..."` titles in test/retirement-inventory.test.ts: all five resolve
exactly, one occurrence each.

## ASCII and citation conventions

This report is pure ASCII, no em dashes. Citation:
test/retirement-inventory.test.ts:1097 (outside backticks), the
`fileSrc.includes(base)` line CR-002 above attacks; this file is one the
branch changes at this fix round, satisfying CLAUDE.md rule 3b's
quote-into-changed-files guidance.

## Probes run (including ones that found nothing)

- Re-derived round-0's member A and member B mutations independently
  (own script, not the test fixtures): both red.
- Four label-list/fence variants against the completeness sweep: all four
  silently pass (CR-001 this review).
- One in-file, correct-script, cherry-picked-assert variant against the
  mechanically-enforced disposition check: silently passes (CR-002 this
  review).
- Blockquote relocation: caught, for a formatting reason unrelated to
  classification.
- `history-moved`'s raw (non-binding) pointer check: no exploit found beyond
  what CR-001/CR-002 already cover.
- Re-ran citations, authored-bytes, agents-references, retirement-inventory
  script gates directly: all match the work history's fix-round-1 numbers.
- Checked all five new behaviors.json names resolve: they do.
- Scope audit: seven paths, unchanged from round 0, all on the declaration or
  standing extras.

## Honest-failure section

- Did not independently re-run the full `npm test` suite (1455 tests) or the
  PR bundle, per the brief's instruction to prefer single test files under
  shared CPU. Ran the one file this round touches directly (48/48 pass) and
  the standalone gate scripts most exposed by the change; did not check every
  other test file in the suite for a regression.
- Did not exhaustively enumerate every word a reader might use to disclaim a
  section (CR-001's fix direction lists roughly fifteen candidates as a
  starting set, not a closed one); demonstrated four working variants, which
  the red-witness rule's "at least two structurally different members"
  standard for a class is satisfied by (heading-label, paragraph-label,
  fenced-block, each a different location/mechanism).
- Did not attack the `exact-duplicate` or `corrected` disposition kinds with
  a binding-text bypass; CR-001's `bindingText`/`bindingMask` gap applies to
  every disposition kind that calls `inCurrent` or `atPointer` with
  `binding: true` (exact-duplicate, history-moved's rule-kept, corrected's
  replacement, the STATE-only quotes), not only the two demonstrated here,
  because they share the same underlying function; did not individually
  re-demonstrate it for each kind, since the mechanism is identical and the
  demonstrated fix direction (widen the label list, or invert the masking
  design) closes all of them at once.

## Verdict

FIX-ROUND-NEEDED. Two high findings, both against the hazard class this
phase exists to fix (semantic-rule-loss): CR-001 (this review), a closed
label list that lets a relocated rule (into a differently-worded disclaimed
heading, a plain disclaiming paragraph, or a bare fenced code block) read as
still-binding and pass the completeness sweep silently; CR-002 (this review),
a mechanically-enforced disposition that can name the correct, CI-run script
and a real but unrelated test in the same file, with a cherry-picked
`asserts` substring, and pass every check in the disposition-specific guard.

Both are the same mechanism round-0's CR-001 named (a guard that tests
presence, not binding force, or relevance, not existence) surfacing through
members the round's own fix did not close, which its own work history
identifies as open risk in writing. The round genuinely raised the bar (the
two round-0 mutations are now red, five new arms are red-witnessed, three
criteria findings are closed), and no evidence was found that the delivered
diet register in this PR currently exploits either gap; both are findings
about the guard's coverage, consistent with the HAZARD contract's own
framing ("can this pass while the thing it guards is broken").


