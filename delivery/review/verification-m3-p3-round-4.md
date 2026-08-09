# Verification: M3-P3 round 4 (independent delta verifier)

Head under review: 6af8e81515183602c60df93161895cc8da901f48
Verifier worktree: wt-m3p3-delta3, branch verify-m3p3-r4
Status: COMPLETE

**VERDICT: CHANGES REQUIRED.**

One finding, **V-4 (medium)**: a live recurrence, in the exact function this
round hardened, of the exact defect this round was dispatched to fix (a
fragment of a list item passing as the whole item), triggered by an
interrupter class (fenced code / ATX heading / thematic break nested inside
an item's own content) the round did not consider. Demonstrated end to end
through `tiphys validate`, exit 0, with two structurally different
interrupters, plus sanity controls proving the check is genuinely running in
the scratch context and that it simultaneously rejects the one CORRECT
whole-item quote. Not currently exploitable against any decision record
shipped in this repository. Full detail below.

Everything else this round claims is independently reproduced true: the
witness-break-caught-only-by-red-witness claim (reproduced by injecting the
exact break and watching build/test/suite stay green while red-witness alone
goes red); the DR-0019-to-DR-0020 renumber (wording untouched, zero DR-0019
citations in any shipped artifact); the four published unit counts (DR-0004
22->18, DR-0013 loses its sub-bullet, DR-0012 unchanged at 36 with all six
conditions resolving); every mechanical gate green with its own exit code,
including scope run correctly on the phase's own branch; both ASCII checks
clean with `-a`; and the argument for extending the fix to nested sub-items
is sound and does not conflict with anything else in the repository.

**DR-0012's merge conditions are NOT met on this head**: V-4 is an
unresolved medium finding, which condition 2 forbids outright regardless of
every other condition being satisfied.

## Log

- Start: node v26.6.0 confirmed, npm ci exit 0.
- NOTE: `delivery/review/verification-m3-p3-round-3.md` referenced by the
  dispatch does not exist anywhere in git history (checked `git log --all
  --diff-filter=A -- 'delivery/review/verification-m3-p3-round-3.md'`, no
  output). STATE.md corroborates: "Awaiting independent confirmation by the
  round-3 delta verifier" (line ~450), and the round-4 work history narrates
  a round-3 delta verifier's finding (the list-item continuation V-1) without
  ever citing a committed file for it. This is itself a durability-rule gap
  (CLAUDE.md's table requires a review to be a committed file before its
  producing session ends) but it is not new to round 4, so it is recorded
  here as an observation, not scored against round 4.
- Read `delivery/work-history/m3-p3.md` FIX ROUND 4 section in full instead
  (lines 3578-3903) since it is the only committed record of what round 3's
  verifier found and what round 4 did about it.
- DR-0019 to DR-0020 renumber: confirmed via git history (`719f04f` created
  DR-0019, `f775c56` deleted it; `bec92d2`/`1a683fe` renumbered the
  closed-vocabulary record to DR-0020, never previously allocated). Confirmed
  zero `DR-0019` hits in schemas/, src/, test/, bin/, scripts/, *.yaml, *.json
  at HEAD. Confirmed wording is byte-identical apart from the id in the
  round-4 commit 1124736's diff of schemas/src/test.
- Independently swept ALL 49 witness/*.json specs, 93 mutation-kind
  dangerousStates members: every `find` occurs in its target file EXACTLY
  ONCE at HEAD (script: `/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/scripts_sweep.mjs`,
  output: "total mutation members checked: 93, problems (occurrences != 1):
  0"). This independently confirms and generalizes the implementer's own
  sweep (it reported one stale hit, now fixed; my sweep at the current head
  finds zero). The 3 `kind: patch` specs (M2-P4/M2-P5/M2-P1 owned, not this
  phase's) were not included in the count since they apply via `git apply`
  rather than a literal find, which is a structurally different (and not
  literal-text-coupled) mechanism; noted, not swept the same way.
- REPRODUCED the round-4 self-reported witness break. Reverted
  `witness/checks-code-block-content-not-quotable.json` dangerousStates[1]'s
  `find` to the round-3 text (confirmed absent from src/checks.ts at HEAD via
  grep -c, 0 occurrences). With that one-line JSON edit and nothing else
  touched: `npm run build` exit 0, `node --test` 502/502 pass exit 0, the
  `suite` gate green (500 tests reported) exit 0. `red-witness` gate: RED,
  exit 1, `witness checks-code-block-content-not-quotable: red: rule (d):
  declared dangerous state does not intersect the phase diff (member 1,
  mutation of src/checks.ts touches no line inside a changed hunk)`. (The
  tool's "member 1" is 0-indexed per `src/witness/run.ts:1281`, i.e. array
  index 1, the second dangerousStates entry, exactly the one edited; resolved
  by reading the source rather than assuming a mismatch.) Reverted the file
  with `git show HEAD:witness/checks-code-block-content-not-quotable.json >
  witness/checks-code-block-content-not-quotable.json` (not `git checkout
  --`, per the standing warning) and confirmed a clean baseline red-witness
  run is green (30 witnesses, exit 0) with the file restored. **Confirmed
  independently: the claim is true.** Build, full test suite and the suite
  gate are all blind to a witness spec whose `find` has silently stopped
  matching; only red-witness catches it.
- Independently re-derived the round-4 unit counts against the ACTUAL
  `quotableUnits` in two different worktrees (this HEAD, and a detached
  worktree at the round-3 head `6a36b38`, since removed): DR-0004 22 units
  (round-3 head) -> 18 units (HEAD); DR-0013 47 units with
  `"strict mode enabled"` present as its own unit (round-3 head) -> 38 units
  with that sub-bullet absent as its own unit (HEAD); DR-0012 36 units at
  BOTH heads, all six shipped conditions resolve at both heads. All four
  published numbers confirmed by re-derivation, not by reading the claim.
- DR-0020 renumber (Priority 3): confirmed via `git log --diff-filter=A/D`
  that DR-0019 was created (719f04f) then deleted (f775c56) before this
  phase touched it, and that DR-0020 was never previously allocated
  (`git log --all --diff-filter=A -- 'delivery/decisions/DR-0020*'` shows
  only the renumber commits). Confirmed ZERO `DR-0019` hits in
  schemas/, src/, test/, bin/, scripts/, *.yaml, *.json at HEAD (grep exit
  1). Confirmed via `git show 1124736` that every schemas/src/test wording
  around a DR-00xx citation is byte-identical before and after, only the
  digits changed. `delivery/decisions/DR-0020-closed-vocabulary-at-v0-1-0.md`
  is present and is the record the citations mean (it explains its own
  renumber in a "Why this is DR-0020 and not DR-0019" section). The historic
  `DR-0019` mentions that remain are confined to work-history/review
  narrative prose (the record of what happened), never to a shipped
  artifact, which is the DR-0020 record's own explicit intent, verified by
  reading it rather than assumed.
- Scope, clause-map, agent-rules-drift run in the correctly-named sibling
  tree `../wt-m3p3` (branch `claude/m3-p3-assurance-modes`, same head
  `6af8e81`): `scope: green (35 changed paths audited)` exit 0,
  `clause-map: green (18 clause-map rows checked)` exit 0,
  `agent-rules-drift: green (17 rendered gate rows compared)` exit 0. (First
  scope attempt hit an unrelated evidence-directory ENOENT from my own
  missing `mkdir`; re-ran clean after creating it, still green, not
  reported as a finding since it was my own harness error, not the gate's.)
- Both ASCII checks (with `-a`) return zero hits at HEAD, confirmed with
  `grep -acP` explicitly. `delivery/review/arbitration-m3-p1.md` has 0
  control bytes at HEAD (`grep -acP '[\x00-\x08\x0B\x0C\x0E-\x1F]'` = 0,
  grep exit 1), and `1a683fe` (the merge of `origin/main` that round 4
  pulled in) is confirmed an ancestor of HEAD and contains PR #55's fix
  commit `826f27d` in its history.
- `npm ci`, `npm run build` (git status clean after), all green, exit 0,
  at true HEAD `6af8e81`.

## Priority 1 finding: V-4, a live recurrence of the exact mechanism this round fixed

**MEDIUM. The round-4 fix and its extension are correctly reasoned, but the
same underlying defect (a fragment of a list item passes as the WHOLE item)
still exists for a class of interrupters the round did not consider: a
fenced code block, an ATX heading, a setext heading, or a thematic break
appearing INSIDE a list item's own content, at the item's content column,
with more item content after it. All four confirmed at the extractor;
fence and thematic break additionally confirmed end to end through
`tiphys validate`.**

`quotableUnits`'s loop calls `flush()` unconditionally the moment it sees a
fence-open, an ATX heading, or a thematic break (`src/checks.ts` around
lines 998-1025), regardless of `blankPending`/`atBoundary` state. That
unconditional flush is exactly the mechanism round 4 removed for the BLANK
LINE case (`blankPending`) and for the NESTED MARKER case
(`markerIndent >= listContentColumn` joins instead of flushing), but it
was never removed for these three interrupters. The result: a list item
whose content is (paragraph, then an indented fence, then another
paragraph) -- all one CommonMark list item -- is split into TWO quotable
units by this extractor: the paragraph before the fence, and the paragraph
after it. That is a fragment standing in for a whole item, the identical
defect V-1(round-4) fixed, reopened by an interrupter the round did not
name.

Demonstrated at the extractor, two structurally different interrupters
(script `/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/probe2.mjs`):

```
input: "1. item text\n\n   ```\n   fence content\n   ```\n\n   more item text after fence\n"
output: ["item text","more item text after fence"]

input: "1. item text\n   ```\n   fence content\n   ```\n   more item text after fence\n"  (no blank at all)
output: ["item text","more item text after fence"]

input: "1. item text\n\n   # heading text\n\n   more item text\n"
output: ["item text","more item text"]

input: "1. item text\n\n   ***\n\n   more item text\n"
output: ["item text","more item text"]

baseline (blank-line continuation, the round-4-fixed shape, for contrast):
input: "1. item text\n\n   more item text\n"
output: ["item text more item text"]   (correctly ONE unit)
```

**Demonstrated end to end through `tiphys validate`, exit 0, twice, with two
structurally distinct interrupters (fence and thematic break):**

Scratch context 1 (fence interrupter), `DR-9999-fence-interrupt-test.md`:
```
1. Run the first command, which opens this item.

   ```
   tiphys gates run --registry gate-registry.yaml --mode full
   ```

   Continuation text after the fence closes, still part of item 1.
```
mode `full`'s sole condition set to `"Run the first command, which opens
this item."` (the item's first paragraph alone, a fragment) and
`granted-by: DR-9999`:
```
$ node bin/tiphys.ts validate --type assurance-modes --context "$D" "$D/assurance-modes.yaml"
(no output)
$ echo $?
0
```

Scratch context 2 (thematic-break interrupter), `DR-9998-break-interrupt-test.md`
(`1. First fragment...\n\n   ***\n\n   Second fragment...`), condition set to
the fragment `"First fragment of the real condition."`:
```
$ node bin/tiphys.ts validate --type assurance-modes --context "$D2" "$D2/assurance-modes.yaml"
(no output)
$ echo $?
0
```

Both accepted, zero diagnostics.

**Sanity controls, run to make sure the scratch harness was really
exercising the check and not accidentally passing for an unrelated
reason:** a condition that is pure junk (occurs nowhere in DR-9999) is
correctly REJECTED in the same context (`exit=1`,
`mode-conditions-quote-granted-by`), proving the check runs. More
tellingly: the CORRECT, WHOLE, CommonMark-faithful text of item 1
(paragraph + command + continuation, joined as one string) is also
REJECTED (`exit=1`) in the same context, because the extractor never
produces that string as a unit at all -- it only ever produces the two
fragments. So the check simultaneously accepts a fragment that should be
rejected and rejects the one true whole-item quote that should be
accepted, which is the worse of both directions at once.

**Not currently exploitable against any decision record shipped in this
repository**: `grep -lP '```' delivery/decisions/*.md` and
`grep -nP '^\s+#' delivery/decisions/*.md` and
`grep -nP '^\s*(\*{3,}|_{3,})\s*$' delivery/decisions/*.md` all return
nothing over the 19 files in `delivery/decisions/`, so no shipped record
today has this shape. This is exactly V-1(round-2)'s and V-1(round-4)'s own
severity argument, applied to a third occurrence of the same class, which
is why this is graded MEDIUM and not HIGH, and why it is the same DR-0012-
condition-2-blocking grade that stopped rounds 2 and 3.

**Root cause is a comment that overstates its code, the same failure mode
the round's own docstring names.** `src/checks.ts`'s docstring (the
sentence right after the round-4 addition) claims "What is modelled now,
explicitly, as block state carried across lines: fenced code..., ATX
headings..., ... thematic breaks..., list items WITH ALL OF THEIR CONTENT".
That sentence is false in exactly the shape demonstrated above: a list
item's content that happens to contain one of these three block forms does
not carry its surrounding paragraphs with it. The docstring also asserts,
two paragraphs later, "a thematic break... ends a unit" as an example of
markdown being unambiguous, without distinguishing a top-level thematic
break (correctly a boundary) from one nested inside an open list item's
own content column (which this shape shows is still swallowed the same way
a top-level one is, when it should instead be item content per CommonMark,
the same way a nested list marker now correctly is).

**Two of the three interrupters are also cited in this exact review as
`safe` because they were the OLD mechanism this project already paid for
(round-3's own docstring overclaim caught the same way, one level up), so
this is not a new class of mistake for this codebase, it is the same
mistake shape recurring at a narrower scope than the round's own dispatch
covered.**

## Priority 1: was the nested-sub-item extension a defensible over-reach

**Judged as CORRECT and not an over-reach that introduces risk.** The
argument -- "a nested list is item content in exactly the way a
continuation paragraph is, so flushing at a nested marker leaves the
parent's first paragraph standing as a whole unit while the parent carries
more" -- is CommonMark-accurate and is the identical shape as the named
finding with one noun changed. Refusing to extend it would have been the
textbook version of this project's own repeated failure mode (fixing the
instance, not the mechanism).

- **Direction is safe.** The extension only REMOVES units (fewer, longer),
  which is the stated-safe direction for this check: a false reject
  (a legitimate sub-bullet condition must now quote its enclosing item
  whole) is a loud diagnostic; a false accept is silent. Confirmed by the
  round's own before/after diff (`["Top","sub one","sub two"]` collapses to
  `["Top sub one sub two"]`), independently re-run here.
- **Nothing currently relies on the removed capability.** Checked whether
  any shipped `assurance-modes.yaml` grants by DR-0013:
  `grep -rn "granted-by: DR-0013" **/*.yaml` (repo-wide, excluding
  node_modules) returns nothing (grep exit 1); the shipped document only
  grants `full`, `direct-pr` and `local-only` by DR-0012. Checked the test
  suite for any assertion that a DR-0013 sub-bullet MUST remain separately
  quotable: `grep -n "strict mode enabled" test/assurance-modes.test.ts`
  shows only the round-4 test itself, which asserts the NEW behavior
  (`dr0013.has("strict mode enabled") === false`). No test or shipped
  artifact relies on the old behavior.
- **The cost is stated honestly**, in the docstring and in the work
  history, not buried.
- **Where the extension falls short is the actual finding (V-4 above):**
  it generalized "things that flush the accumulator" for the blank-line
  case and the nested-marker case, but not for the other three call sites
  in the same loop that ALSO flush unconditionally (fence-open, ATX
  heading, thematic break). The reasoning that justified the extension --
  "content of the item, the same way a continuation paragraph is" --
  applies with equal force to a fenced block or a heading that is genuinely
  part of the item's content, and was not carried through to those sites.

## Priority 4: gates and checks, own exit codes, correct trees

All commands run with `node --version` == v26.6.0 confirmed in the same
shell.

| Check | Where run | Result | Exit |
|---|---|---|---|
| `npm ci` | wt-m3p3-delta3 (verify-m3p3-r4) | ok | 0 |
| `npm run build` | wt-m3p3-delta3 | ok, `git status --porcelain` clean after | 0 |
| `node --test` | wt-m3p3-delta3 | 502 tests, 502 pass, 0 fail | 0 |
| `scope` | **wt-m3p3** (`claude/m3-p3-assurance-modes`) | green, 35 changed paths audited, matches work history's own capture exactly | 0 |
| `clause-map` | wt-m3p3 | green, 18 clause-map rows checked | 0 |
| `agent-rules-drift` | wt-m3p3 | green, 17 rendered gate rows compared | 0 |
| `suite` | wt-m3p3-delta3 | green, 500 tests reported (30 files; the 500-vs-502 gap is the suite gate's own test-file-walk vs `node --test`'s full discovery, already explained by earlier rounds and reproduced identically here) | 0 |
| `red-witness` | wt-m3p3-delta3 | green, 30 witnesses evaluated (17 own, 13 stored re-evaluated), every witness red against its dangerous state(s) and green at head | 0 |
| ASCII check 1 (`[^\x00-\x7F]`, with `-a`) | wt-m3p3-delta3, `git ls-files` minus the two named exemptions | zero hits | grep exit 1 (no match, expected) |
| ASCII check 2 (control bytes, with `-a`) | same | zero hits | grep exit 1 (no match, expected) |

No usage error was mistaken for success anywhere above: every gate command
was run with its required flags present and its own printed exit code
recorded, per CLAUDE.md's three-times-bitten warning. (One harness-only
ENOENT surfaced on my FIRST scope-gate attempt, from my own missing
`mkdir -p` on the evidence directory; re-run clean, still green, not
counted as a finding since it was not a call into gate code that ran with
proper arguments.)

Both ASCII checks: `delivery/review/arbitration-m3-p1.md` measured
separately at 0 control bytes at HEAD; `1a683fe` (the `origin/main` merge
round 4 pulled in) confirmed an ancestor of HEAD via
`git merge-base --is-ancestor`, and PR #55's fix commit `826f27d` confirmed
present in history. The claim that the merge is what cleared the inherited
byte is measured, not assumed.

## What this verification did NOT cover

- **No CI run was observed**, on either the `pull_request` or `push` arm
  (T-009's both-arms requirement). This is the fourth consecutive round
  with this same gap, unchanged from every prior round's own disclosure.
- **`src/gates/coverage.ts:356` (`extractIdRows`) and
  `scripts/check-clause-map.mjs:139` (`parseInventory`)**, the two other
  sites round 3 reported carrying the same line-without-block-state
  mechanism, were READ but not independently re-derived or mutated here.
  They are on other phases' declarations (not M3-P3's) and STATE.md already
  lists them as "awaiting independent confirmation by the round-3 delta
  verifier", a document that (see the log above) does not exist as a
  committed file; I did not attempt to produce that confirmation, since my
  brief is M3-P3's round-4 delta specifically.
- **Block quotes, HTML blocks, tables and link reference definitions**
  remain unmodelled by `quotableUnits`, as the round's own docstring states.
  I confirmed they are latent (absent from every current decision record)
  but did not build end-to-end reproductions for them the way I did for the
  fence/heading/thematic-break class (V-4), since the round itself already
  discloses these four honestly as not-modelled, whereas V-4's three
  interrupters were claimed as modelled and are not, in the shape shown.
- **The fourth branch, setext, was checked at the extractor and confirmed
  to share the mechanism** (`"1. item text\n\n   Sub Heading\n   -----\n\n
  more item text\n"` produces `["item text Sub Heading","more item text"]`,
  fragmenting exactly like the other three; it also has its own extra quirk
  worth naming for whoever fixes this class: because `currentIsListItem` is
  true, the branch takes the `flush()` arm rather than `discard()`, so the
  setext line's own text ("Sub Heading") is retained IN the fragment rather
  than excluded as heading text the way an ATX heading's text is). I did
  not build a fourth end-to-end `tiphys validate` reproduction for setext
  specifically (two independent end-to-end reproductions, fence and
  thematic break, are what the project's own two-structurally-different-
  members convention requires, and I met that); a fixer should still treat
  setext as a fourth confirmed member, not an assumed one, since the
  quirk above means its fix may not be identical to the other three.
- **`direct-pr` and `local-only` modes** were not separately exercised
  through `mode show`'s validation path in this round of verification; as
  every prior round has noted, M3 never executes them, and this was not
  the focus of round 4's changes.
- **`role-model-config.yaml`'s `role-ids-are-unique` check** and the
  `sameStringList`/`makeIdUniquenessCheck` helpers were not re-probed here;
  round 4 did not touch them and an earlier round already exercised them
  thoroughly.
- **The four exempt single-member witness specs and the rule-(g) scope
  question** from the earlier delta verification were not re-examined; that
  question is closed as far as round 4 is concerned (nothing in round 4
  touches `src/witness/run.ts`'s rule (g) itself).
- **I did not attempt to construct a decision record inside this
  repository's actual `delivery/decisions/` tree to prove V-4 against a
  real file**, matching the standard the round-2/round-3 verifier already
  set for V-1: the demonstration uses synthetic `DR-9999`/`DR-9998` scratch
  contexts, sufficient to show the check accepts the fragment and rejects
  the true whole-item quote, but not proof that any file this repository
  will ever ship is at risk today (checked and confirmed absent instead).
- **The durability gap noted at the top of the log** (no committed
  `delivery/review/verification-m3-p3-round-3.md`, despite STATE.md and the
  round-4 work history both narrating a round-3 delta verifier's findings)
  was recorded as an observation, not scored as a round-4 defect, and I did
  not attempt to reconstruct or backfill that missing file.
