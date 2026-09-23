# Delta verification, M5-P5 fresh-implementer round (CRITERIA contract, Sonnet)

- date: 2026-09-23
- pull request: #215
- branch: claude/m5-p5-context-diet
- head verified: d353fafd96a32d56220e8f3e96af3f1a0b1c0cc0 (fresh-implementer round,
  DR-0016, started at ecab915ca959ae373cbd5e9f2ca2b5d064deb19f)
- merge base with origin/main: b16f20008ef9c3b4b62c0007eb7d0178f08dc74d
- contract: CRITERIA, delta verification of a fresh-implementer round
- model family: Sonnet (claude-sonnet-5)
- method: detached checkout of the head in an isolated worktree, then a named
  local branch `claude/m5-p5-context-diet` reset to the same head so the scope
  gate can derive the phase id; node v26.6.0 from the scratch prefix first on
  PATH (`node --version` checked in the same shell); `npm ci`, `npm run build`,
  `npm test`; re-execution of the fix-round contract check, of every round-0
  and round-1 finding this round claims to close, and of at least four rows of
  the implementer's own mutation table, by editing the real committed files
  (test/retirement-inventory.test.ts and delivery/STATE.md) in place and
  restoring byte for byte after each; a full acceptance-criteria walk at the
  head; a check of the diet-claude-md-02 reclassification against the real
  test bodies in the repository.

Status: complete.

## Verdict

**APPROVE.** No high or medium finding. One low, about the fix-round
contract's own self-reported claim-grep count, not about the guards.

This round replaced the CLASS both prior rounds' findings named (a guard that
reads a closed list of exceptions, or reads text its owner rewrites, instead
of the document's structure and a source that does not move), not the
instances. I re-derived five of the round's own mutation rows independently by
editing the real, committed CLAUDE.md/test file/STATE.md and running the real
test file, and all five behaved exactly as the round claims: three relocation
containers (fence, unregistered ATX heading, disclaimer paragraph) that
defeated round-1's closed label list now redden the completeness/heading/
disclaimer checks; the sibling-test attack that defeated round-1's
mechanically-enforced check now reddens; a real edit that changes STATE.md's
volatile status prose in the way a routine standing update would stays green,
while a real deletion of an open owner action's runnable text still reddens
four tests. All five acceptance criteria are met at this head, the suite is
1463 of 1463 with 0 skipped under `npm test`, and every gate I re-ran
independently (citations, scope, brief-drift, clause-map,
check-agents-references, agent-rules-drift, check-authored-bytes,
check-id-collisions, check-retirement-inventory) is green with counts matching
the work history.

## Fix-round contract (checked first, per this repository's own rule that the
reviewer's first check precedes any row)

The round's section is delivery/work-history/m5-p5.md:502 to 822 (quoted: the
branch changes that file).

1. **Mechanism named: yes.** "the guards decided what counts as evidence by a
   closed list of exceptions, or by reading text whose owner rewrites it,
   instead of by the document's structure and a source that does not move"
   (delivery/work-history/m5-p5.md:547). This is a mechanism, not an instance,
   and it covers every round-0/round-1 finding the round answers: the four
   relocation gaps (a closed label list), the STATE volatile quotes (text the
   owner rewrites), the enforced-by sibling attack (a closed list of one file
   check instead of the named test's own body), and the phrase-based
   owner-action exemption (a closed phrase instead of an id).
2. **Derivation published: yes, with full output.** Two `grep` commands over
   every place the diet checker reads a file
   (delivery/work-history/m5-p5.md:577 and :632), both with full output, plus
   a classification table mapping each read site to what constrains it
   (delivery/work-history/m5-p5.md:618). A third command re-verifies every
   `CLAUDE.md:N` citation across the affected files
   (delivery/work-history/m5-p5.md:666), with full output and a line reading
   what each target is.
3. **What the derivation did NOT cover: yes.** Six items named
   (delivery/work-history/m5-p5.md:683 to 701): `checkState`'s own needles are
   shape checks and the routine-update test proves one update, not every
   possible one; `check-retirement-inventory.mjs` and every other test file
   were not searched; tables inherit their section's class rather than being
   distinguished from a table of history by syntax; disclaimer words outside
   the list read as binding (the safe direction: a miss there means the text
   stays counted as force, not that force silently disappears); the parser is
   not a full CommonMark implementation and defaults to non-binding when
   unsure, which turns an ambiguous relocation into a loud removal rather than
   a silent one; a pinned STATE quote shows what the file said at the diet
   baseline, not its current truth.

The claim grep, run against the fresh-round section
(delivery/work-history/m5-p5.md:502-822):

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' <section>
96:1709:  const s = neverSplit(currentText("CLAUDE.md") ?? "");
304:(`never`), so no hit straddles a wrap. That one hit is the identifier
305:`neverSplit` inside the captured derivation output above, which is a function
$ tr '\n' ' ' < <section> | grep -oEi '...'
never
never
never
cannot be
```

**CR-001 (this review), low: the round's own claim-grep self-report
undercounts.** delivery/work-history/m5-p5.md:803-804 says "the wrap-
insensitive `tr` form reports one occurrence (`never`)". My independent run of
the same command over the same section, and again over the whole file, found
four: three case-insensitive substring matches of "never" (two are the
identifier `neverSplit` printed twice, once in captured derivation output and
once naming it; one is the literal word in backticks describing that
identifier) and one "cannot be" (a wrapped hit inside the very sentence that
narrates an EARLIER "cannot be" claim already fixed:
delivery/work-history/m5-p5.md:807-808, "One earlier hit in this section
('later evidence cannot be pinned') was restated with its witness"). Every one
of the four is inert on inspection (a code identifier, a quoted identifier
name, or a self-referential narration of an already-fixed claim), so the
CONCLUSION the round draws ("no hit straddles a wrap [that is a live
overclaim]") still holds on my own re-count. But the printed number is wrong:
"one occurrence" undercounts by three. This is the same shape of error the
claim-grep rule exists to catch, one level up: a count asserted about a
mechanical check, itself not mechanically verified before being printed.
Fix: quote the actual `tr` output, or the count, verbatim, the way the round
already does for every other captured command in this section.

Nothing else in the claim grep is a live overclaim. Restated as the honest
form this repository's rule asks for: no unwitnessed "this cannot happen" or
"this always catches" sentence appears in the section; the two "never"
instances that are not the `neverSplit` identifier are the section's own
heading-body test name string (harmless) and there are no other hits.

## Round-0 and round-1 findings, re-executed against d353faf

| finding | round | status | my evidence |
|---|---|---|---|
| hazard CR-001 (round-1, this review's numbering V-CR-001 in p5r2): closed label list lets four relocations (fence, unregistered ATX heading `## Archive`, unregistered Setext heading, disclaimer paragraph) pass silently | round 1 | closed | mutated the real test/retirement-inventory.test.ts to re-admit fences as binding (`LIVE_KINDS` plus `"fence"`): test "a binding rule relocated out of binding force is caught, in every container the reviews built" reddens with "inside a fenced block: its removal arm reports nothing". Mutated `headingFindings`'s unregistered-heading check off (`false && !registered.has(...)`): same test reddens with "under an unregistered ATX heading: its heading arm reports nothing". Mutated `disclaimerFindings`'s push off (`if (false) f.push(...)`): same test reddens with "after a disclaimer in its own paragraph: its disclaimer arm reports nothing". All three restored byte for byte, `cmp` clean. |
| hazard CR-002 (round-1): mechanically-enforced discharges with the correct script and an unrelated test in the same file | round 1 | closed, and moot for the live register | mutated the fix (`site.body.includes(name)` reverted to the old whole-file-style check `w.ci().includes(name)`, then fully disabled): test "a mechanically-enforced disposition must name a CI-run script inside the named test's own body" reddens at its member-A assertion (line 1828, the sibling-test case round-1's hazard reviewer built). Separately: `python3` read of delivery/plan/cutover/retirement-inventory.json shows zero live entries with `disposition: mechanically-enforced` (26 diet entries: 14 superseded-status, 8 history-moved, 3 corrected, 1 archived), so the class this hazard targets has no live instance to exploit today, matching the round's own claim. |
| criteria V-CR-001 (round-1 verification, p5r2): STATE status quotes read the live standing text, so a routine standing update reddens the suite | round 1 | closed | `python3` read of the diet register: diet-state-09 through diet-state-13 each carry `superseded-by.rev: "6dc5b06"` (the diet baseline) or, for diet-state-13, point at live CLAUDE.md binding text rather than STATE.md status prose. Live-edited the real delivery/STATE.md, changing "TWO CLAUDE.md AMENDMENTS ARE STILL QUEUED" to "ONE ... IS": `node --test test/retirement-inventory.test.ts` (node v26.6.0): 56 of 56 pass, 0 fail. Restored, `cmp` clean. Separately deleted the real A-15 register bullet (22 lines, the tag/release runnable text): 4 of 56 tests redden, including "open owner action A-15 has no register item". Restored, `cmp` clean. |
| criteria V-CR-002/V-CR-003 (round-1 verification): the binding mask covered only the exact relocation named, and three new arms had no red witness | round 1 | closed | the structural parser (parseMarkdown, test/retirement-inventory.test.ts:927) classifies fences, HTML comments, `<details>`, other raw HTML, blockquotes and indented code as NOT structurally live at all (LIVE_KINDS, test/retirement-inventory.test.ts:913), replacing round-1's closed label-list approach; the RELOCATIONS fixture table at test/retirement-inventory.test.ts:1665 reproduces all nine members both round-0 and round-1's reviews built (HTML comment, fence, details, lazy blockquote, indented code, unregistered ATX heading, unregistered Setext heading, disclaimer-in-list-words, disclaimer-in-other-words) as one parametrized test, and my three independent arm-disable mutations above each reddened it on their own arm, confirming per-arm witnessing rather than one shared witness for the whole class. |
| criteria V-CR-004: shifted CLAUDE.md citations | round 1 | closed | `sed -n '1101p' CLAUDE.md` reads "14. THIS CONTAINER CANNOT DELETE A REMOTE REF..." (standing warning 14's start, matching delivery/STATE.md:75's citation); `sed -n '806p' CLAUDE.md` reads "CORRECTED 2026-09-16 BY MEASUREMENT (M4-P23)..." (matching delivery/plan/cutover/retirement-inventory.md:112's citation). Both correct at this head. |
| criteria V-CR-005: owner-action exemption was a phrase, not an id | round 1 | closed | `grep -n OPEN_ACTION_EXEMPT test/retirement-inventory.test.ts` shows `const OPEN_ACTION_EXEMPT = ["A-14"];` (test/retirement-inventory.test.ts:846), an explicit id list, not a phrase match. |
| diet-claude-md-02 reclassification from mechanically-enforced to history-moved | this round | honest | `grep -rn check-authored-bytes test/` (excluding the diet test itself) shows the script's basename appears only ONCE in test/authored-bytes.test.ts, at module scope (test/authored-bytes.test.ts:9, a top-level `const checker = ...`), never inside any individual `test(...)` body. Since this round's fix requires `site.body.includes(name)` (the named test's OWN body, test/retirement-inventory.test.ts:1374), no real test in that file can discharge `mechanically-enforced` honestly, and the round's own register entry (delivery/plan/cutover/retirement-inventory.json, diet-claude-md-02) says exactly this in its `note` field and points to T-010 instead. This is the smaller, honest guard the fix-round contract asks for. |

## Acceptance criteria walked at d353faf

| id | met | evidence (re-executed) |
|---|---|---|
| p5-size | yes | `wc -c CLAUDE.md AGENTS.md delivery/STATE.md`: 73276 + 36192 + 34622 = 144090. Ceiling 287544 x 0.65 = 186903.6; 144090 is well under it, matching the work history's own number exactly. |
| p5-no-weak-port | yes | `node --test test/retirement-inventory.test.ts` (node v26.6.0): 56 tests, 56 pass, 0 fail, 0 skipped, twice (once before, once after all mutations were reverted). `node scripts/check-retirement-inventory.mjs`: "318 row(s) against 318 derived rule anchor(s), 9 retired, commands EXECUTED", "every rule in the three roots is resolved", exit 0. Every round-0/round-1 hazard finding re-executed above as closed, and the class of attacks both reviews built is reproduced and witnessed inside the suite itself (the RELOCATIONS table). |
| p5-current-state | yes | first `## ` heading at delivery/STATE.md:8, "## M5 standing at 2026-09-23, 17:40 UTC, `main` at 6dc5b06"; exactly one standing section (`grep -n '^## '` lists Owner action items, Owner decisions, Standing reminders, Tracked obligations, M4 closure, Earlier milestones, History of this file after it, no second standing block). Owner action items section (delivery/STATE.md:71-97, 254-...) carries the full runnable text for A-9, A-15, A-10, with A-14 preserved as an HTML-comment placeholder pending its own branch's merge (delivery/STATE.md:125-126), so no owner action is lost. |
| p5-boundary | yes | `git diff origin/main...HEAD --name-only` lists 7 paths: CLAUDE.md, delivery/STATE.md, delivery/plan/cutover/retirement-inventory.json, delivery/plan/cutover/retirement-inventory.md, delivery/work-history/m5-p5.md, test/behaviors.json, test/retirement-inventory.test.ts. None under the five protected trees (delivery/evidence, delivery/review, delivery/decisions, delivery/tuition, .claude/skills). The scope gate, re-run on a local branch named `claude/m5-p5-context-diet` reset to this head: green, "7 changed path(s) audited against declaration delivery/plan/phase-declarations/m5-p5.json at merge base b16f200 ... (4 declared path(s) not touched)". |
| p5-gates | yes | node v26.6.0. `npm ci` exit 0. `npm run build` exit 0, `git status --short` clean apart from this report file, both before and after the suite run. `npm test` (dist built): tests 1463, pass 1463, fail 0, cancelled 0, skipped 0, todo 0, exit 0, matching the work history's own count exactly. Individually re-run: citations gate green, "22 citation(s) resolved" in 2 changed documents; scope gate green, 7 paths; brief-drift green, "21 row(s) compared"; clause-map green, "74 rows checked, 0 pending"; `node scripts/check-agents-references.mjs` green, 23 references; `node scripts/check-authored-bytes.mjs` exit 0; `node scripts/check-id-collisions.mjs` exit 0, no collisions, next free T-047 and DR-0056; `node scripts/render-agent-rules-gates.mjs --check` green, 24 rendered gate rows. |

## Mutation table: rows re-derived independently (at least four, per the dispatch)

All five below were run against the real, committed files at d353faf, not
against copied fixtures, by editing the tracked file in place with the Edit
tool, running the real test file with node v26.6.0, then restoring the exact
original bytes and confirming with `cmp`.

| row | what I disabled/changed | file | result |
|---|---|---|---|
| C2 (fence container) | `LIVE_KINDS` gains `"fence"`, so fenced content becomes structurally live again | test/retirement-inventory.test.ts:913 | RED: "inside a fenced block: its removal arm reports nothing" |
| H1 (unregistered heading) | `headingFindings`'s unregistered-heading push gated `false &&` | test/retirement-inventory.test.ts:1093 | RED: "under an unregistered ATX heading: its heading arm reports nothing" |
| D1 (disclaimer tripwire) | `disclaimerFindings`'s push gated `if (false)` | test/retirement-inventory.test.ts:1130 | RED: "after a disclaimer in its own paragraph: its disclaimer arm reports nothing" |
| E1 (script named in own body) | reverted `site.body.includes(name)` to the whole-file-style `w.ci().includes(name)`, then fully disabled it | test/retirement-inventory.test.ts:1374 | RED at the member-A sibling-test assertion (line 1828) |
| S1 (STATE evidence pinned, not live) | real edit: "TWO CLAUDE.md AMENDMENTS ARE STILL QUEUED" to "ONE ... IS" | delivery/STATE.md:266 | GREEN (56/56) as expected: a routine standing update does not redden the pinned check |
| S4/O2-style dangerous-state control | real deletion of the A-15 register bullet (22 lines, the only copy of the tag/release commands) | delivery/STATE.md:99-119 | RED: 4 of 56 tests, including "open owner action A-15 has no register item" |

Each mutation was reverted with `cp` from a byte-identical saved copy and
verified with `cmp` before the next one; `git status --short` showed only this
report file, untracked, throughout.

## Probes run, including ones that found nothing

- `python3` count of `delivery/plan/cutover/retirement-inventory.json`'s
  `diet[]` dispositions: 26 entries, 14 superseded-status, 8 history-moved, 3
  corrected, 1 archived, 0 mechanically-enforced. No live entry exercises the
  hazard-CR-002 code path today.
- `git grep -nE 'NON_BINDING|not yet on' test/`: the round-1 phrase exemption
  survives only in a fixture proving it is gone (test/retirement-inventory.test.ts:1986-1990),
  not in the checker itself.
- Re-checked all five CLAUDE.md line citations the work history names as
  re-verified (CLAUDE.md:128, :188, :806, :1101, :61): all five resolve to the
  stated content.
- Diet baseline `DIET_BASELINE = "6dc5b06"` and `STATE_ONLY = ["superseded-status", "archived"]`
  confirmed at test/retirement-inventory.test.ts:840 and :819, matching the
  work history's claims.
- `OPEN_ACTION_EXEMPT = ["A-14"]` confirmed at test/retirement-inventory.test.ts:846.
- Re-ran the citations gate directly: "citations: green: linted 2 changed
  document(s) at d353faf...: 22 citation(s) resolved, 0 self-citation(s), 0
  unverifiable-external", exit 0, matching delivery/work-history/m5-p5.md:814.
- Attempted `bash scripts/m2-exit-test.sh --bundle pr ...` directly: refused by
  this session's sandbox (the same limitation round-0's Opus criteria review
  recorded). Ran the constituent gates individually instead, as listed above.

## What I could not check

- The full `scripts/m2-exit-test.sh` PR bundle end to end (declared 15,
  applicable 10, verdict 10, green 10, not-applicable 5, per the work
  history): this session's sandbox refuses the bash harness, matching the
  limitation both round-0 reviewers recorded. I re-ran citations, scope,
  brief-drift, clause-map, check-agents-references, agent-rules-drift,
  check-authored-bytes and check-id-collisions individually instead, all
  green with counts matching the work history.
- A second, independent `npm test` run on the named branch checkout (as
  opposed to the detached-HEAD checkout, which is content-identical): I
  started it in the background to double-check invocation-independence, and
  it had not produced output by the time this report was finished. The first
  run, on the same commit content via detached HEAD, gave 1463 tests, 1463
  pass, 0 fail, 0 skipped, exit 0, matching the work history exactly; I did
  not wait for the second, redundant run to complete.
- Whether A-6 is still open (round-0 criteria CR-005, deferred honestly by
  round 1 and untouched by this round): nothing reachable from this container
  settles it, same as both prior reviews.
- I did not independently attempt novel relocation members beyond the nine
  the round's own RELOCATIONS fixture and my five mutations cover (for
  example, a disclaimer word not on the DISCLAIMER regex's list, or a nested
  nonstandard HTML container); the round's own not-covered section already
  names disclaimer-word coverage as an open, deliberately-safe-direction gap,
  and I did not find reason to add to that list within this contract.

## ASCII and citation conventions

This report is pure ASCII, no em dashes. Citations used in prose, outside
backticks, into files the branch changes: delivery/work-history/m5-p5.md:547,
:577, :632, :666, :683, :803, :807, test/retirement-inventory.test.ts:913,
:1093, :1130, :1374, :1665, :1684, :819, :840, :846, delivery/STATE.md:266,
:99, delivery/plan/cutover/retirement-inventory.json (no line citation
needed; quoted content only).

## Re-verification at c1be4a8

Coordinator's request, after the Fable hazard review of d353faf found two
mediums (CR-001 inline markup, CR-002 four-space containers) plus a low
matching this review's own CR-001 (the claim-grep miscount). The owner chose
a last short round rather than another full fix-round cycle. New head
`c1be4a8` (full sha `c1be4a89e9a537b3afa0ba59597afdcda6248d94`), fetched from
`origin/claude/m5-p5-context-diet` and checked out detached, then reset onto
a local branch `claude/m5-p5-context-diet` for the scope gate to evaluate.
Method as before: real files, real commands, node v26.6.0 fetched fresh into
a scratch prefix, `npm ci` then `npm run build` (exit 0, clean `git status`
apart from this review's own two output files).

### 1. My low (claim-grep count) is fixed

`delivery/work-history/m5-p5.md:899-901` now states the line-based command
prints two lines (597, 882) and the wrap-insensitive `tr` form prints two
occurrences, the same two hits. Independent re-run of both forms over the
whole file confirms exactly two hits at exactly those two lines: line 597 is
`const s = neverSplit(currentText("CLAUDE.md") ?? "");`, an identifier, not a
claim; line 882 is "The parser does NOT always err toward not-binding", a
negated sentence stating a limitation, not an overclaim. The round's old,
miscounted paragraph is gone from the file (its text was replaced, matching
the round's own account that "its old text is gone, which is why its hits no
longer appear"). This finding is closed.

### 2. Acceptance criteria at c1be4a8

- p5-size: `wc -c CLAUDE.md AGENTS.md delivery/STATE.md` gives 73276 + 36192
  + 34622 = 144090 bytes, byte-identical to d353faf (this round touched
  neither file). Ceiling unchanged (186903), still well under.
- p5-boundary: `git diff origin/main...HEAD --name-only` lists the same 7
  paths as at d353faf (CLAUDE.md, delivery/STATE.md, the two cutover
  inventory files, the work history, test/behaviors.json,
  test/retirement-inventory.test.ts). None under the five protected trees.
  Scope gate re-run on the named branch, reset to c1be4a8: green, 7 changed
  path(s) audited against the m5-p5 declaration at merge base b16f200 (4
  declared paths not touched, no entry added or removed).
- p5-current-state / STATE.md: STATE.md is not among the 3 files this round
  touched (retirement-inventory.md, work-history/m5-p5.md,
  retirement-inventory.test.ts, per `git diff --stat` between d353faf and
  c1be4a8). Heading structure, owner-action register and the A-14 placeholder
  are unchanged from d353faf.
- p5-no-weak-port / p5-gates: see suite and gate results below.
- Owner actions: the diet register JSON (`retirement-inventory.json`) is
  unchanged by this round (not in the 3-file diff); 26 diet entries (14
  superseded-status, 8 history-moved, 3 corrected, 1 archived, 0
  mechanically-enforced), same as at d353faf. `OPEN_ACTION_EXEMPT` is still
  `["A-14"]` (test/retirement-inventory.test.ts:848). No owner action lost.

### 3. Test-line citations

All 10 `test/retirement-inventory.test.ts:N` citations in
`delivery/plan/cutover/retirement-inventory.md` were re-checked by reading
the named line directly: 1243 (`checkDiet`), 1340 (the sibling-keyword
refusal), 936 (`parseMarkdown`), 1050 (`bindingMask`), 1090
(`headingFindings`), 1116 (`disclaimerFindings`), 1475 (the completeness
sweep's missing-segment check), 1556 (`checkState`), 1515
(`openActionFindings`), 848 (`OPEN_ACTION_EXEMPT`). All resolve to the
claimed function or check. The two citations this round adds to the work
history itself, `test/retirement-inventory.test.ts:1116` (line 836) and
`test/retirement-inventory.test.ts:936` (line 842), also resolve correctly.
Every citation the round's own text points at is accurate; no shift was
missed.

### 4. Mutation re-tests and regression check

Three of the round's own red-witness rows were independently re-derived by
editing the real committed `test/retirement-inventory.test.ts` in place
(never a copy), always restored byte-for-byte (`cmp` against a saved
original):

- CR-001 (strike tripwire): commenting out the `STRIKE` check inside
  `disclaimerFindings` reddens "struck through with ~~: its disclaimer arm
  reports nothing", matching row T1.
- CR-002 (four-space containers): reverting the blockquote-open regex to
  `/^ {0,3}>/` reddens "in a blockquote at four spaces of indent: its
  removal arm reports nothing", matching row I1.
- CR-003 (fence closing): reverting the fence-close regex to match any line
  starting with the marker (dropping the `+\s*$` bare-run requirement)
  reddens "inside a fence past an info-string line: its removal arm reports
  nothing", matching row F1.

All three mutations produce exactly the failure the work history's own table
claims for that row, and all three restores were confirmed byte-identical to
the committed file.

RELOCATIONS now carries 15 members (10 pre-existing plus the 5 the round
lists: `~~` strike, inline `<del>`, `>` at four spaces, `<s>` at four spaces,
and a fence past an info-string line), independently counted by reading
`test/retirement-inventory.test.ts:1679-1696`.

The residue the round leaves stated (CR-003's length half, CR-004, CR-005,
CR-006, CR-008) is still listed, unweakened, in "What the guards no longer
claim" at delivery/work-history/m5-p5.md:875-895; nothing on that list was
quietly removed or overstated as fixed.

Gates independently re-run at c1be4a8, node v26.6.0, dist built, from a
scratch-fetched node-v26.6.0-linux-x64 toolchain:

- `npm run build`: exit 0, `git status --short` clean apart from this
  review's own two output files.
- `npm test` (invocation `node --test "test/**/*.test.ts"`, dist built):
  tests 1463, pass 1463, fail 0, cancelled 0, skipped 0, todo 0, duration_ms 478366 (about 8 minutes on this toolchain), exit 0. Matches the work history's own count exactly.
- `scope` (registry gate, on the named local branch reset to c1be4a8):
  green, 7 changed paths audited, matches the boundary evidence above.
- `citations`: green, 22 citations resolved across 2 changed documents,
  0 self-citations, 0 unverifiable-external.
- `clause-map`: green, 74 rows checked, 0 pending a phase not yet in force.
- `agent-rules-drift`: green, CLAUDE.md's gate block matches the registry
  (3 preflight steps, 21 gates).
- `brief-drift`: green, 21 rows compared.
- `check-agents-references`: green, 23 references resolved (22 also to an
  anchor).
- `node scripts/check-authored-bytes.mjs`: exit 0.
- `node scripts/check-id-collisions.mjs`: no collisions (T-nnn highest
  T-046, DR-nnnn highest DR-0056).
- `node scripts/check-retirement-inventory.mjs`: 318 rows against 318
  derived rule anchors, 9 retired, commands EXECUTED, every rule in the
  three roots resolved, exit 0.
- `node scripts/render-agent-rules-gates.mjs --check`: green, 24 rendered
  gate rows compared.

### Verdict

APPROVE. The two mediums the Fable hazard review found are closed and each
is independently reddened on the real committed file by reverting its fix.
My own low is fixed and independently reconfirmed. Every acceptance
criterion still holds, byte-identical where the round did not touch the
file and re-derived where it did. All ten pre-existing test-line citations
and the two the round adds resolve correctly. Nothing else in the scope
audit, the gate set, or the suite regressed. The round's own residue list
(CR-003's length half, CR-004, CR-005, CR-006, CR-008) is honestly carried
forward, unweakened.

### What I could not independently check

Same limitation as the first review: the full `scripts/m2-exit-test.sh` PR
bundle could not be run because this session's sandbox refuses the
multi-command git/bash shapes that script issues; the constituent gates
were run individually instead, which is a strictly more granular check of
the same claims. The macOS smoke job and the actual GitHub Actions
`pull_request`/`push` runs were not observed (no CI access from this task).
