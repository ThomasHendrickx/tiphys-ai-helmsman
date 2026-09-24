# Clean-room review, M5-P5 (context diet), CRITERIA contract

- date: 2026-09-23
- pull request: #215
- branch: claude/m5-p5-context-diet
- head reviewed: 681efcd9bcc4da12440aea40fdcc18719f0d5a67 (checked out detached)
- merge base with origin/main: b16f200
- contract: CRITERIA (acceptance criteria p5-size, p5-no-weak-port,
  p5-current-state, p5-boundary, p5-gates, plus the brief's common duties)
- model family: Opus (claude-opus-5-5)
- method: re-execution on node v26.6.0 (scratch prefix first on PATH, checked
  with `node --version` in the same shell), `dist/` built before the suite;
  reading of every diet entry against its baseline text at 6dc5b06 and its
  claimed destination; line-by-line reading of the CLAUDE.md diff; citation
  resolution by a node one-liner that prints each target line; mutation of
  three new tests plus one data mutation, all in a scratch clone.

Status: complete.

## Governing text

The plan entry is `delivery/plan/value-delivery-plan.yaml` lines 319 to 393
(quoted: that file is byte-identical on main and the branch, so it also
resolves as delivery/plan/value-delivery-plan.yaml:356, the acceptance block).
Rule 3b of the repository rules is at `CLAUDE.md:128` on the branch (quoted
form, because the branch changes CLAUDE.md). The owner decision this phase
must not contradict is delivery/decisions/DR-0054-tiphys-judges-current-and-future-work-never-history.md:1,
byte-identical on both sides.

## Working notes (appended as the review proceeds)

- Scope: `git diff --name-only origin/main...HEAD` lists 7 paths: CLAUDE.md,
  delivery/STATE.md, delivery/plan/cutover/retirement-inventory.json,
  delivery/plan/cutover/retirement-inventory.md, delivery/work-history/m5-p5.md,
  test/behaviors.json, test/retirement-inventory.test.ts. All on the
  declaration or standing extras. No declaration entry added. None under the
  five protected trees.
- Size: `wc -c CLAUDE.md AGENTS.md delivery/STATE.md` = 72294 + 36192 + 34622
  = 143108, ceiling 186903.
- Diet quotes: every history, authority, rule-kept and replacement quote of the
  eleven CLAUDE.md entries re-checked by an independent node script: each
  pointer quote is IN RANGE and each kept quote occurs exactly once.
- diet-claude-md-05 (T-014) read against T-014 lines 11 to 76: the three
  ambiguities and the salvage near-miss are all in T-014 (lines 25 to 28, 44 to
  50). The three questions stay in CLAUDE.md in full. Force preserved.
- diet-claude-md-06 (T-026) read against T-026 lines 45 to 69: the incident is
  there. Both isolation rules stay in CLAUDE.md verbatim. The lead-in is gone,
  so "Two rules follow" and "the unisolated agent" lost their antecedent, and
  CLAUDE.md no longer names T-026 anywhere (grep: no hit).

## Verdict

**FIX-ROUND-NEEDED.** One medium, five low. No high.

The phase does what its criteria ask, and every criterion is met on
re-execution. No binding rule is lost from CLAUDE.md: every removed block's
kept rule is present verbatim, and every history quote is at its named range.
The one medium is about a guard, not a lost rule. The arm that stops a
CLAUDE.md rule being disposed as STATE-style "superseded-status" with a
one-word quote has no red witness. That is the phase's own top hazard reached
by an unwitnessed route, and the fix is one test.

## Findings

### CR-001 (medium): the STATE-only disposition arm has no red witness

- Claim: `test/retirement-inventory.test.ts` line 943 refuses `superseded-status`
  and `archived` on any file other than delivery/STATE.md. Line 985 sets the
  `superseded-by` quote floor to ONE word. So that arm alone stops a CLAUDE.md
  rule being disposed by one shared keyword, which is the semantic-rule-loss
  hazard.
- Evidence: in a scratch clone at the head, line 943 changed to
  `if (false && STATE_ONLY.includes(kind) ...)`. `node --test
  test/retirement-inventory.test.ts`, node v26.6.0: tests 43, pass 43, fail 0,
  skipped 0, exit 0. Restored from a copy, `cmp` clean. None of the nine
  `m5-p5-*` behaviors names this arm.
- Why it matters: under the red-witness rule an arm without a red witness does
  not count as guarding. The current register does not use the route (all
  eleven CLAUDE.md entries are history-moved, corrected or
  mechanically-enforced), so nothing is lost today. The next diet is the
  consumer.
- Fix: add a test that turns a CLAUDE.md diet entry into `superseded-status`
  with a one-word `superseded-by` (and one into `archived`), and asserts the
  "allowed only for delivery/STATE.md" finding. Show it red under the mutation
  above. Raise the line-985 floor to `MIN_RULE_WORDS`. Register the test.

### CR-002 (low): the owner-action guard checks ids, not runnable text

- Claim: `checkState` (test lines 1053 to 1055) compares the SET of `A-n` ids.
- Evidence: scratch probe with the same regex. Deleting the whole A-15 register
  bullet (819 bytes, the only copy of `git tag -a v0.2.0` and
  `gh release create`) loses no id, because the standing summary still says
  "A-15". The test title says "keeps every owner-action id", which is honest.
- The current content is correct: diffing main's register section against the
  branch's shows only the closed A-7 text shortened (the full text is pointed
  at by `git show`) and the answered CR-002 note removed. A-15, A-9, A-10 and
  A-8 keep their runnable text; A-14 is on the M5-P1 branch and is marked so.
- Fix: for each id under "Owner actions open", require a register bullet whose
  bold lead begins with that id. Witness it by deleting the A-15 bullet only.

### CR-003 (low): a kept STATE.md citation into CLAUDE.md resolves silently to the wrong line

- `delivery/STATE.md` line 447: "the silent-resolution trap `CLAUDE.md:155`
  describes". At the head CLAUDE.md line 155 is the root-level yaml sentence.
  The cited sentence ("The citation that reddens is not the dangerous one") is
  line 188. It was already off at the baseline (line 219 there).
- The citations gate linted 2 changed documents (16 citations, exit 0).
  STATE.md is not linted, so nothing reddens. The phase repointed the sibling
  at line 75 (`CLAUDE.md:1089`, correct) and not this one.
- Fix: repoint it to `CLAUDE.md:188`.

### CR-004 (low): removed lead-ins leave dangling antecedents, and T-026 is no longer findable from CLAUDE.md

- diet-claude-md-06: "Two rules follow, both cheap:" now follows the three
  watchdog questions, and "the unisolated agent's freshness" has no
  antecedent. `grep -c T-026 CLAUDE.md` gives 0. It was 0 at the baseline too,
  but the story was inline then.
- diet-claude-md-08: "So quoting `declared N ...`" now follows the upload-guard
  sentence. Standing warning 12 now reads "At `1945d69`,
  test/doctor.test.ts:1086", a historical head with a current line number.
- No rule is lost. Both isolation rules are verbatim, and T-026 lines 45 to 69
  hold the incident.
- Fix: one lead-in sentence with the reason and a T-026 citation. Reword
  warning 12 to "the test now at ...:1086 (line 934 at 1945d69)".

### CR-005 (low): register items that read current are not in the open list

- The standing "Owner actions open" lists A-14, A-15, A-10, A-9 and A-8, and
  says the register holds the full text of every open action. The register
  still carries "A-6, NEW and blocking one criterion", "A-2 ... Kernel half:
  fleet home NOT" and "4b. A-n REQUESTED" (the same six refs as A-10).
  Identical on main, so carried, not introduced.
- Fix: give A-6 and the A-2 kernel half an explicit status, and fold 4b into
  A-10.

### CR-006 (low): DR-0044 applied in part

- DR-0044 lines 54 to 66 include "Add the token estimate T-028 asks for". The
  new CLAUDE.md concurrency section does not carry it, while STATE.md line 266
  says the reversal "was applied by M5-P5". DR-0044 stays binding on its own
  terms (its line 77), so this is not a loss.
- Fix: one sentence in the section, or a work-history note that this item
  stays binding from the record only.

## Criteria walk

| id | met | evidence (re-executed) |
|---|---|---|
| p5-size | yes | `wc -c`: 72294 + 36192 + 34622 = 143108, ceiling 186903 |
| p5-no-weak-port | yes, caveat CR-001 | completeness test green and independently re-derived from `git diff -U0 6dc5b06 HEAD -- CLAUDE.md`; all quotes re-checked; STATE.md ranges cover every removal (0 uncovered segments, my script); sibling-grep refusal witnessed |
| p5-current-state | yes, caveats CR-002, CR-005 | first heading STATE.md line 8; no NEWEST BLOCK, `- as of:`, `## Standing at`; M4 closure line 523, residue, `git show 6dc5b06` and `git log -p` at 569 to 574 |
| p5-boundary | yes | 7 changed paths, none in the five trees; scope gate green in a scratch clone on the phase branch name, 7 paths, merge base b16f200 |
| p5-gates | yes | build exit 0; `npm test` 1450 tests, 1450 pass, 0 fail, 0 skipped, exit 0; check-agents-references 23; agent-rules-drift 3+21; brief-drift 21; clause-map 74; citations 16 in 2 docs |

## Diet entries -05 and -06 against their destinations (owner focus)

- **-05, T-014.** Removed: the paragraph saying the newest-mtime wording needs
  judgment (gate evidence outside the tree, a fresh agent with no directory, a
  finished agent's stale directory), and that acting on a false stale reading
  would kill a healthy round. T-014 carries all of it: the three ambiguities at
  lines 44 to 50, the salvage near-miss at 25 to 28, the six watchdogs at 16 to
  23. The three questions that make it operational stay in CLAUDE.md in full,
  and each ambiguity maps to one of them (evidence outside the tree to question
  1's `/tmp` clause, no directory yet to question 2's dispatch baseline,
  finished to question 3). The section still ends with the T-014 citation.
  Preserved.
- **-06, T-026.** Removed: the incident narrative. T-026 lines 45 to 69 carry it
  in more detail. Both rules and the watchdog corollary stay verbatim. The
  force is preserved; the lead-in and discoverability are not (CR-004).
- The seven retired inventory rows each name their diet entry. The rows they
  point to as `superseded-by` are live PORT rows with the same AGENTS.md
  probes (`THREE THINGS TO ANSWER IN WRITING`: 1 hit;
  `verification-dispatch-isolation`: 2 hits), so the port checks survive the
  retirement.

## DR-0054 check

Nothing in the diff lets a rule judge history. The new tests constrain FUTURE
edits to CLAUDE.md, AGENTS.md and STATE.md against a fixed baseline. Retired
rows are moved, not deleted. The M4-P23 numbers in the inventory document are
left and labelled. Stale citations into CLAUDE.md from protected historical
documents are recorded as residue rather than rewritten. No contradiction.

## Mutation tests run

| mutation | named test | result |
|---|---|---|
| owner-action lost arm disabled (line 1055) | a STATE.md with a surviving daily block or a lost owner action is refused | red, exit 1, 1 of 2 failed |
| completeness never reports (line 1022) | a block removed from CLAUDE.md with no disposition reddens the completeness check | red, exit 1, 1 of 5 failed |
| diet-claude-md-05 history pointer moved to T-014:1-2 (data) | every diet disposition carries evidence ... live inventory passes | red, names diet-claude-md-05 |
| STATE-only arm disabled (line 943) | none | 43 of 43 green: CR-001 |

All ran in a scratch clone of the head. Each file was restored from a copy and
compared with `cmp`.

## Probes run, including those that found nothing

- behaviors.json: the nine `m5-p5-*` names match nine test titles exactly.
- Every `path:line` in CLAUDE.md printed against its target: `CLAUDE.md:128`,
  src/gates/citations.ts:201, test/gate-registry.test.ts:2090,
  `delivery/STATE.md:188`, test/doctor.test.ts:1086, src/gates/scope.ts:110 and
  :877, test/gates.test.ts:3530, T-010:1, T-014:1, T-039:1, DR-0044:1. All
  correct.
- STATE.md citations into other files: line 75 (`CLAUDE.md:1089`) correct; line
  447 wrong (CR-003); kernel-plan-m3.md:2538 and :663, m3-p4.md:3596,
  citations.ts:185, suite.ts:1166 and kernel-plan-v1.md:366 all on topic.
- The inventory document's citations `test/retirement-inventory.test.ts:882`,
  :920, :1009 and :1034 land on checkDiet, the probe-key refusal,
  uncoveredRemovals and checkState. `CLAUDE.md:795` and :61 are correct.
- Inventory rows: 0 live rows changed in content, 7 moved to `retired`, 2 added
  for the new DR-0044 anchors. Row `rule` line fields (for example
  `CLAUDE.md:484`) were already stale before this phase; the checker matches by
  text, so nothing depends on them.
- The DR-0044 replacement text was checked against DR-0044 lines 17 to 19 and
  56 to 64: one workflow, check and queue, script pattern stays, threshold
  "more than 2".
- CI checks out with `fetch-depth: 0` (.github/workflows/gates.yml line 58).
  The release workflow's `npm test` job also uses fetch-depth 0, and macOS
  smoke does not run this test file. So the shallow-clone failure the work
  history discloses does not bite CI.
- An apparent splice in STATE.md's standing reminders turned out to be my own
  `sed` printing two ranges back to back. The file is intact (reminder at line
  300, bottleneck item at 497).
- `validate --type verdict` on this verdict: no INVALID line, five SKIPPED
  "no context" lines, exit 1. The committed M5-P3 criteria verdict gives the
  identical output and exit code, so exit 1 is the validator's no-context
  behaviour, not a schema failure.

## What I could not check

- The full `scripts/m2-exit-test.sh` PR bundle: this session's sandbox refused
  to run the bash harness. I ran the named gates one by one through
  `tiphys gates run --registry` instead (the harness uses `--manifest`), so the
  bundle-level `declared/applicable` line is the implementer's, not mine.
- Bare `node --test` from the repository root (the plan's literal wording). I
  ran `npm test`, which is what the suite gate runs.
- Whether A-6 is actually open. Nothing I can reach from this container settles it.
- Whether every rule-like bullet inside the two big status ranges
  (diet-state-01, lines 7 to 1017; diet-state-14, 2135 to 2681) lives
  elsewhere. I sampled five (the DR-0027 governing rule, the green-bundle rule,
  the push-rule procedure change, the fresh-implementer rule, the sixteen
  unreviewed phases). Each is in a decision record, CLAUDE.md, a skill or a
  tuition entry. The rest were not read one by one.
- The criteria contract does not reach defects outside the criteria. The
  hazard reviewer's attack is the other half.
