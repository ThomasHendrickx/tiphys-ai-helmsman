# Delta verification, M5-P5 fix round 1 (CRITERIA contract, Opus)

- date: 2026-09-23
- pull request: #215
- branch: claude/m5-p5-context-diet
- head verified: ecab915ca959ae373cbd5e9f2ca2b5d064deb19f (fix round 1 on 681efcd)
- merge base with origin/main: b16f200
- contract: CRITERIA, delta verification of a fix round
- model family: Opus (claude-opus-5-5)
- method: detached checkout of the head in an isolated worktree; node v26.6.0
  from the scratch prefix first on PATH (`node --version` checked in the same
  shell); `npm ci`, `npm run build`, then `npm test`; re-execution of every
  round-0 finding's probe; mutation of the new guards and of the live
  STATE.md in a scratch copy of the head (restored byte for byte after every
  mutation); re-walk of the five acceptance criteria; new-defect search
  starting at `bindingMask` and at the new STATE quotes, as the dispatch asked.

Status: complete.

## Verdict

**FIX-ROUND-NEEDED.** Three medium, two low. No high.

Every round-0 finding the round took on is closed on re-execution, including
both members of the hazard high. All five acceptance criteria are met at the
new head. The suite is 1455 of 1455 with 0 skipped.

The three mediums are all the shape the fix-round contract exists to stop:
the round fixed the named instances and the mechanism survived, one step
over.

- V-CR-001: the round saw that date-bound STATE quotes would redden the live
  test at the next standing update, and fixed those two. The mechanism is
  that a status quote points into STATE.md text that routine updates rewrite.
  Five more quotes still do. A one-word standing edit ("TWO" to "ONE") reddens
  the suite.
- V-CR-002: the binding mask stops the reviewer's exact relocation. Six other
  relocations of the Never list still pass, one of them the reviewer's own
  disclaimer moved into its own paragraph.
- V-CR-003: the work history says each arm has its own red witness. Three new
  arms reddened no test when I disabled them.

## Fix-round contract (checked first)

The round's section is `delivery/work-history/m5-p5.md` lines 260 to 497
(quoted: the branch changes that file).

1. **Mechanism named: yes.** "Every diet guard tested that a string or a
   named thing EXISTS, not that the property it stood for holds." That is a
   mechanism, not a finding, and it covers all four round-0 findings it cites.
2. **Derivation published: yes.** Two grep commands with full output (48
   lines, then 2), and a table mapping each guard family to the property it
   should test.
3. **Not-covered stated: yes, but incomplete.** It names four limits: guards
   that throw, the checker script, the closed label list ("kept for
   reference", "obsolete"), and the textual script-name check. It does not
   name these:
   - that the paragraph arm masks only the paragraph that holds the
     disclaimer, never the text the disclaimer is about (V-CR-002);
   - containers the mask does not model: fenced blocks, `<details>`, setext
     headings (V-CR-002);
   - that `superseded-by` and `pointer-in-file` quotes read the CURRENT
     STATE.md, which every standing update rewrites (V-CR-001).
   The derivation table also says every guard family is witnessed. My
   mutations show three arms that are not (V-CR-003).

## Round-0 findings, re-executed

| finding | status | evidence at ecab915 |
|---|---|---|
| hazard CR-001 member A (Never list inside an HTML comment) | closed | my probe calls the real `uncoveredRemovals` on that exact relocation: `["CLAUDE.md@6dc5b06 lines 1339-1349"]`, reported as removed. The named test goes red with the heading arm off (M1b) and with the binding comparison off (M5) |
| hazard CR-001 member B (unrelated script and test in `enforced-by`) | closed | the round-0 swap on the live diet-claude-md-02 (`scripts/check-id-collisions.mjs`, an unrelated test title) is refused: "enforced-by asserts fragment is not in the body of the named test". Without `asserts`: "enforced-by declares no asserts fragment". M2a and M2b each redden the named test |
| criteria CR-001 (STATE-only arm unwitnessed, one-word floor) | closed | M3a (the arm off): exit 1, 47 of 48, the new status-disposition test red. The floor is `MIN_RULE_WORDS` for both status quotes |
| criteria CR-002 (owner-action ids, not text) | closed | on the live STATE.md in the scratch copy: A-15 register item (lines 99 to 119, 818 bytes) deleted gives exit 1, "open owner action A-15 has no register item". Cut to its lead line gives exit 1. M4a and M4c each redden the named test. One new gap: V-CR-005 |
| criteria CR-003 (STATE.md `CLAUDE.md:155`) | closed | STATE.md line 447 now cites `CLAUDE.md:188`, and that line is "The citation that reddens is not the dangerous one". But the round's own CLAUDE.md edits broke two siblings: V-CR-004 |
| criteria CR-004 (lead-ins, T-026, warning 12) | closed | new lead-in paragraph cites T-026 line 45, which is "### Failure 2: an agent WITHOUT isolation takes the orchestrator's clone". `grep -c T-026 CLAUDE.md` gives 1. The "Without an artifact to read" sentence now comes before "So quoting". Warning 12 now says line 934 was the old location |
| criteria CR-005 (register items that read as current) | not closed, deferred with a reason | the round leaves it for the orchestrator: the text is identical on `main` and A-6's status cannot be settled from this container. I accept that as honest for a pre-existing low |
| criteria CR-006 (DR-0044 token estimate) | closed | the concurrency section now asks for a token estimate and cites DR-0044 lines 65 to 66. Those lines hold the item and the measured ranges (150,000 to 490,000, and 115,000 to 400,000) |

## Findings

### V-CR-001 (medium): STATE status quotes read the live standing text, so a routine standing update reddens the suite

- **Claim.** `checkDiet` checks each `superseded-by` and `pointer-in-file`
  quote with `inCurrent`, against the CURRENT delivery/STATE.md, on every run.
  Several quotes point into prose that the orchestrator rewrites whenever
  state changes. The round saw this for two date-bound headings and moved
  them. It left five entries tied to live status text:
  - diet-state-13: "**TWO CLAUDE.md AMENDMENTS ARE STILL QUEUED.** A third,
    DR-0044's concurrency" (Standing reminders, STATE.md line 266). The round
    LENGTHENED this quote. It is a count of queued work, and it goes false as
    soon as one amendment lands.
  - diet-state-09, -10, -11 and -12: the "Re-verified 2026-09-23 against
    `main` at 6dc5b06. Four items closed since ..." paragraph (Tracked
    obligations, lines 437 to 441). The next re-verification rewrites it.
- **Evidence.** Each plausible edit applied alone to STATE.md in the scratch
  copy, then the diet and STATE tests run (node v26.6.0):
  - S1, "TWO ... ARE" becomes "ONE ... IS": exit 1, 5 of 6 pass,
    "diet-state-13: superseded-by quote is not in delivery/STATE.md".
  - S2, the Re-verified paragraph replaced with a new date and "Nothing
    closed": exit 1, findings for diet-state-09, -10, -11 and -12.
  - S3 (control, a wording change in resume-cold step 5): exit 1 for
    diet-state-01, -03 and -15. That text is stable, so this row shows only
    how tight the coupling is.
  - STATE.md restored byte for byte after each edit.
- **Why it matters.** The live test is in `npm test`, which is the `suite`
  gate on both CI events. The next ordinary STATE.md update, a file that is
  supposed to change, reddens `main` or the paperwork PR that makes it. It is
  loud rather than silent. But the obvious fix under pressure is to edit the
  frozen diet register to match, and that makes the register's evidence
  follow the file it is meant to check. This is the mechanism the round
  itself named, "the next standing update would have reddened the live
  test". The round fixed two instances of it.
- **Fix.** Pick one and witness it with S1:
  - point every status quote at text that is not status (the "History of
    this file" section, the `git show 6dc5b06` pointer, a decision record, as
    diet-state-07 already does);
  - or check status quotes at a pinned revision, the way `history` is
    checked, rather than at the moving file.
  Whichever you pick, add a test that makes a status-count edit to STATE.md
  and asserts the diet check stays green.

### V-CR-002 (medium): the binding mask stops the named relocation, and six others of the same class pass

- **Claim.** `bindingMask` treats a line as non-binding in three cases: it
  touches an HTML comment; it is under an ATX heading whose text matches the
  label list; or its own blank-line paragraph contains "non-binding", "not
  binding" or "no longer binding". Anything outside those three cases counts
  as binding, however it is framed.
- **Evidence.** A probe test appended to the scratch copy calls the real
  `uncoveredRemovals` on relocations of CLAUDE.md's `## Never` list. Each
  keeps the words and removes them from binding force. `[]` means reported
  as NOT removed:

  | relocation | result |
  |---|---|
  | round-0 member A, inside `<!-- superseded ... no longer binding` | removed (closed) |
  | "The paragraph below is no longer binding." as its own paragraph, list after it | `[]` |
  | `## Archive` heading (the list says `archived`, not `archive`) | `[]` |
  | `## Deprecated rules` heading | `[]` |
  | "Former list, for search only:" then the list in a fenced block | `[]` |
  | `<details><summary>Superseded list</summary>` around the list | `[]` |
  | setext heading `History` / `=======` | `[]` |

  The probe was then removed and the test file restored byte for byte.
- **Why it matters.** The second row is round-0 member A with its disclaimer,
  word for word from the label list, moved into its own paragraph by one
  blank line. The round says the mechanism is fixed. What it fixed is a label
  heuristic that covers two containers. The not-covered section admits other
  WORDS. It does not admit the paragraph-scope gap or the containers the mask
  does not model. A later diet that moves rules into an "Archive" section, a
  natural thing to write, loses them with every test green.
- **Fix.** Either close the class further, with a witness for each new
  member:
  - a non-binding paragraph masks through the next heading;
  - add archive, deprecated, obsolete and legacy to the heading list;
  - model setext headings and `<details>`;
  - treat fenced content as non-binding for a baseline-binding run.

  Or state these limits by name in the test's header comment and in the
  work history, and drop "the round fixes the mechanism" in favour of "the
  mask covers these containers". The second option is acceptable only if a
  reviewer is told to read every new container in a pruned file.

### V-CR-003 (medium): three new arms have no red witness

- **Claim.** The work history says "each arm has its own red witness" and
  "Every arm reddens on its own". Three arms added in this round redden
  nothing.
- **Evidence.** My mutation runner disables one arm at a time in the scratch
  copy and runs `node --test test/retirement-inventory.test.ts` on node
  v26.6.0. The file was restored byte for byte after each run.

  | mutation | result |
  |---|---|
  | P: paragraph arm off (`NON_BINDING_PARAGRAPH` never masks) | exit 0; tests 48 pass 48 fail 0 skipped 0 |
  | M2c: "enforced-by script is not run by any workflow or manifest gate" off | exit 0; tests 48 pass 48 fail 0 skipped 0 |
  | M6: `textAt` binding filter off (an authority read from non-binding text) | exit 0; tests 48 pass 48 fail 0 skipped 0 |
  | M1b heading arm off (control) | exit 1; 46 pass, 2 fail |
  | M1a comment-start masking off (control) | exit 1; 47 pass, 1 fail (the rule-kept test) |
  | M2a, M2b, M3a, M4a, M4c (controls) | each exit 1, the named test red |
  | M5 completeness binding comparison off (control) | exit 1, the relocation test red |

- **Why it matters.** This is round-0 criteria CR-001's shape, graded medium
  there: an arm that exists and that no test shows guarding anything. The
  derivation table lists all three as tested properties ("a copy only in
  non-binding text gets its own finding", "authority reads binding text",
  "script run by a workflow or the manifest"). The paragraph arm is also the
  arm V-CR-002 bypasses.
- **Fix.** One fixture per arm, each shown red with only its own arm off:
  - a kept-rule quote inside a paragraph that calls itself "no longer
    binding";
  - an `enforced-by` script that exists but no workflow and no manifest
    names, built at run time so this file does not name it;
  - a `corrected` authority whose quote sits inside an HTML comment in the
    authority file.

  Correct the two sentences in the work history.

### V-CR-004 (low): the round's CLAUDE.md insertions left two citations into CLAUDE.md resolving silently to the wrong line

- **Claim.** The round added 11 lines to CLAUDE.md above line 795 and 12
  above line 1089 (the T-026 lead-in, the "Without an artifact" sentence and
  the warning-12 note). It did not re-derive inbound citations after that.
  - delivery/STATE.md line 75 says "standing warning 14 at `CLAUDE.md:1089`".
    At 681efcd that line was the warning's heading. At ecab915 line 1089 is a
    fence line, and the warning is at line 1101.
  - `delivery/plan/cutover/retirement-inventory.md` line 112 says "Corrected
    in this phase at `CLAUDE.md:795`". At ecab915 line 795 is "found two
    failures in M3-P6 that neither branch's CI could see.", and the corrected
    rule starts at line 806.
- **Evidence.** `sed -n` on both heads, as above. The citations gate at
  ecab915 is green: "linted 2 changed document(s) ... 18 citation(s)
  resolved", exit 0. So the inventory document's wrong citation resolves in
  range and says nothing. `git grep -nE 'CLAUDE\.md:[0-9]+'` over CLAUDE.md,
  AGENTS.md, STATE.md, the inventory document, `roles/` and `.claude/skills/`
  gives 5 hits. The other three are correct: `CLAUDE.md:128` (twice) and
  `CLAUDE.md:61`, all above the insertions.
- **Why it matters.** This is round-0 CR-003's class, silent in-range
  resolution, created again by the round that closed CR-003.
- **Fix.** Repoint to `CLAUDE.md:1101` and `CLAUDE.md:806`. Re-run the `git grep`
  above as the last step of any round that edits CLAUDE.md, and record its
  output in the work history.

### V-CR-005 (low): the open-action exemption is a phrase any bullet can carry

- **Claim.** `openActionFindings` skips every open bullet whose text contains
  "not yet on `main`". It does not check that the bullet is A-14, or that any
  register marker supports the claim.
- **Evidence.** On the live STATE.md in the scratch copy: A-15's register
  item deleted, and its open bullet reworded to "The tag is not yet on
  `main`." Result: exit 0, no finding, with A-15's runnable text gone.
  Restored byte for byte.
- **Why it matters.** It is a presence check, the round's own named
  mechanism, inside a guard the round added. It is low because the wording
  has to be written on purpose, and a tag or release is a natural thing to
  describe as "not on main".
- **Fix.** Tie the exemption to a register-side marker for the same id (the
  A-14 HTML comment at STATE.md lines 125 to 126 already is one), or to an
  explicit id list. Witness it with the probe above.

## Criteria walk at ecab915

| id | met | evidence (re-executed) |
|---|---|---|
| p5-size | yes | `wc -c`: CLAUDE.md 73276, AGENTS.md 36192, delivery/STATE.md 34622, total 144090; ceiling 287544 x 0.65 = 186903.6; 49.9 percent below the baseline |
| p5-no-weak-port | yes, caveats V-CR-002 and V-CR-003 | the live-register and completeness tests are green in the 1455-test suite; `check-retirement-inventory` gives 318 rows against 318 anchors, 9 retired, exit 0; the sibling-grep refusal is green; both hazard CR-001 members are refused (table above) |
| p5-current-state | yes, caveat V-CR-001 (a future red, not a current defect) | first `## ` heading is STATE.md line 8, "## M5 standing at 2026-09-23 ..."; exactly one standing section; M4 closure at line 523, residue at 538, `git show 6dc5b06` and `git log -p` at 569 to 574; the live checkState test is green |
| p5-boundary | yes | `git diff --name-only origin/main...HEAD` lists 7 paths: CLAUDE.md, delivery/STATE.md, delivery/plan/cutover/retirement-inventory.json, delivery/plan/cutover/retirement-inventory.md, delivery/work-history/m5-p5.md, test/behaviors.json, test/retirement-inventory.test.ts. None is under the five trees. The scope gate, run on branch name claude/m5-p5-context-diet at ecab915 with `--phase m5-p5`: green, 7 changed paths audited against the declaration at merge base b16f200, no declaration entry added |
| p5-gates | yes | node v26.6.0. `npm run build` exit 0. `npm test` exit 0 (dist built): tests 1455, pass 1455, fail 0, skipped 0. `gates run --registry gate-registry.yaml --mode full --only <gate>`, each green with 1 applicable: brief-drift 21 rows, clause-map 74 rows, check-agents-references 23 references, agent-rules-drift 3 preflight steps and 21 gates, citations 18 citations in 2 documents. Scripts: check-authored-bytes exit 0, render-agent-rules-gates --check exit 0, check-id-collisions no collisions (next free DR-0056) |

## Mutation tests I ran

Runner: `vmut.mjs` in my scratchpad. Each run replaces one exact string that
occurs exactly once, runs the test file, and restores from the pristine copy.
Final line of the run: "restored: byte-identical". The full table is under
V-CR-003. Eight of eleven mutations go red with the named test. Three stay
green, and those three are V-CR-003.

My M1a result (1 red) differs from the work history's M1a (2 red). My
mutation removed only the masking of the line where a comment starts, so the
lines inside the comment stayed masked. The work history's M1a disabled more.
Both results fit the code, so this is not a finding.

## New-defect search, bindingMask first

- The masked lines in the three live files match what the work history says:
  CLAUDE.md lines 262 and 296 (the generated gate-list markers); STATE.md
  lines 125 to 126 (the A-14 comment) and 563 to 578 (History of this file);
  AGENTS.md none. At 6dc5b06 the masks are CLAUDE.md 293 and 327 only. So the
  mask hides no live binding rule today.
- Direction: a masked baseline run is compared with the whole current file,
  which is the looser check. Only the two gate-list marker lines are masked
  at the baseline, so nothing depends on that today.
- An unterminated `<!--` masks the rest of the file. That fails red, the safe
  direction.
- The paragraph arm can mask a binding paragraph that uses "not binding" in
  another sense. That would be a false red, loud. Not a finding.
- STATE quotes: V-CR-001.

## Probes that found nothing

- The five new behavior names, plus the nine from round 0, each match
  exactly one test title in test/retirement-inventory.test.ts.
- diet-claude-md-02's `asserts` ("control byte 0x00") appears in the named
  test's own body. The live register passes.
- STATE.md line 188, cited from CLAUDE.md warning 14, is inside the A-4 item.
  Correct.
- CLAUDE.md citations to T-026 line 45, T-014 line 1, DR-0044 lines 65 to 66,
  and test/doctor.test.ts:1086 are all on topic.
- The claim grep over the fix-round section (lines 260 onward), with "each
  arm" and "every arm" added, gives lines 271, 407 and 440. Lines 271 and
  440 are the claims V-CR-003 refutes. Line 407 describes the method.
- The rule on citations resolving only into byte-identical files is followed
  here: delivery/plan/value-delivery-plan.yaml:356 (the acceptance block) and
  roles/clean-room-reviewer.md:59 are both unchanged by the branch.

## What I could not check

- The full `scripts/m2-exit-test.sh` PR bundle. I ran the named gates one at
  a time through the registry runner, so the bundle-level
  `declared/applicable` line (15 declared, 10 applicable) is the
  implementer's, not mine.
- Bare `node --test` from the repository root. I ran `npm test`, which is
  what the suite gate runs.
- Whether the six mask bypasses are the whole class. They are the ones I
  built. By the fix-round contract, that is a search, not a proof.
- Whether A-6 is still open (round-0 CR-005). Nothing I can reach from this
  container settles it.
- This contract does not reach the hazard reviewer's half. My V-CR-002 and
  V-CR-005 probes are hazard-style attacks, run only because the dispatch
  asked me to look at bindingMask first.
