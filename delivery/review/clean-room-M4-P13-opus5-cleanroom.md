# Clean-room review: M4-P13 (migration-table re-disposition)

Branch: claude/m4-p13-migration-redisposition
Head: ca20e79
Base: 3b40118 (= origin/main at review time, verified by git rev-parse)
Reviewer framing: evidence integrity and data loss. Sole reviewer.
Started: (incremental beacon)

## 0. Shape of the subject

git merge-base origin/main <branch> == 3b401182301361700ffa0fd4b2ae099993b3d733 == origin/main. Confirmed.

The branch carries 27 commits. Only the last five are M4-P13:
  bd92a01 M4-P13: open the work history as the beacon
  706dbab M4-P13: re-disposition the thirteen M4 migration-table rows
  a6e43ff M4-P13: phase declaration, behaviour rows, and the work history
  b175c60 M4-P13: complete the work history with every capture
  ca20e79 M4-P13: the gate table at the final head, and a self-consistent claim grep

The other 22 are unmerged M4 paperwork (plan, intake, DR-0035..DR-0043, probes,
conflict pre-pass, pstack borrow review, two CLAUDE.md rule additions).

## 1. First check: is section 9 ("what the derivation did NOT cover") honest?

Yes, and item 4 is worse than it sounds.

Section 9 lists seven exclusions. Six are accurate and verifiable. Item 4 says:
"The M4 paragraph at delivery/plan/kernel-plan-v1.md:368 enumerates the seven
gate rows by id and is now inconsistent with their buckets. That is KNOWN and is
another unit's work... I did not check whether any OTHER prose paragraph
enumerates the same rows."

I ran the check it did not. There are TWO more live sites in the SAME FILE the
phase edited, and one of them is the line the work history CITES as its own
authority. See finding F-1.

The derivation in section 2.1 is count-shaped: all three greps look for a
restatement of the DISTRIBUTION (perMilestone/perKind/"M4 = 13"). The property
that must hold after a re-disposition is broader: no live artifact may assert a
BUCKET FOR A ROW that contradicts the new bucket. A count is one instance of
that; a prose sentence naming R-072 and a milestone is another. So the
mechanism the round names is narrower than the mechanism it needed, which is
the exact fix-round-contract shape.

## F-1 (MEDIUM, recorded not blocking): the plan now contradicts itself on R-072 and R-097, and the contradicting line is the one the work history cites as its authority

Measured on the branch at ca20e79:

  delivery/plan/kernel-plan-v1.md:390
    "- D-15: ... the productized form of R-072/R-097 (bootstrap checks for
     onboarded projects) remains M4."
  delivery/plan/kernel-plan-v1.md:523   "| R-072 | M5 | ..."
  delivery/plan/kernel-plan-v1.md:552   "| R-097 | M5 | ..."

  delivery/plan/kernel-plan-v1.md:136
    "- citations: ... R-072 and R-097 (kernel repo's own concurrency group,
     early instance per plan decision D-15; the productized form stays M4) ..."

The phase edited D-12 at kernel-plan-v1.md:387 in exactly the right way, adding
a supersession sentence. D-15 is THREE LINES BELOW IT in the same bulleted list
and was left asserting M4.

Worse: delivery/work-history/m4-p13.md:256 cites kernel-plan-v1.md:390 as the
authority for moving R-072, quoting the first half of D-15 ("shipped in M1-P1
per D-15") and not the second half, which says the productized form remains M4.
The Appendix A notes at :523 and :552 do the same.

Why the derivation missed it: all three greps in section 2.1 look for a
restatement of the COUNTS. None greps the thirteen row IDs. Run the id-shaped
one and the sites appear:

  git grep -nE 'R-072|R-097' -- delivery/plan/kernel-plan-v1.md

Section 9 item 4 admits "I did not check whether any OTHER prose paragraph
enumerates the same rows." These are two concrete instances of that admission,
both inside the one plan file on the phase's files-to-touch list.

REACHES SHIPPED: NO. I checked. `git grep -nE 'R-041|R-042|...|D-15' -- src/
bin/ schemas/ roles/ tuition/` returns one false positive only (src/witness/
run.ts:1191, "M2-D-15"). No shipped artifact names any moved row or D-15.
Recorded, not blocking, per DR-0027.

## F-2 (LOW): the new cross-document test is blind to a consistent SWAP

Measured by me, in a scratch clone at ca20e79, both documents mutated
consistently: R-041 M4 -> M2 and R-048 M2 -> M4.

  node --test --test-name-pattern 'Appendix A bucket agrees'  -> pass 1, fail 0
  node --test --test-name-pattern 'units 115 with per-kind'   -> pass 1, fail 0

Counts balance, the two documents agree, and the disposition is wrong. This is
outside the invariant the test claims ("buckets follow the migration table's
milestone column") so it is a residual rather than a broken claim, but the work
history's "the property holds NOW and is checked NOW"
(delivery/work-history/m4-p13.md:299) is stronger than what was built.

REACHES SHIPPED: NO. test/ only.

## 2. What I reproduced myself (node v26.6.0 at /tmp/m4p13-node26, scratch CLONE, git checkout not archive)

| criterion | my run | result |
|---|---|---|
| 1 coverage gate units + detail | `node src/gates/coverage.ts --result ... --evidence ...` | exit 0, units 115, detail byte-identical to the plan's prediction at kernel-plan-m4.md:2207 |
| 2 changed test file | `node --test test/coverage-gate.test.ts` | 19 tests, 19 pass, 0 fail, 0 SKIPPED, exit 0 (dist NOT built in that clone) |
| 3 new cross-document test | control + 3 mutations (below) | goes red under all three |
| 4 authored bytes | `node scripts/check-authored-bytes.mjs` | exit 0 |
| 5 citations | `gates run --only citations --base origin/main --head HEAD` at ca20e79 | green, 18 documents, 504 citations, 0 unverifiable |
| 6 disposition table | `sed -n '2162,2182p' delivery/plan/kernel-plan-m4.md` | 13 rows, reason per row, already on the base branch |
| scope | `node src/gates/scope.ts --declarations ... --phase m4-p13` | RED, exactly the reason section 9 item 6 states |

Non-ASCII: 0 lines in all six phase files. Control characters: 0. Em dashes: 0.
No file classified Bin by `git diff --stat`.

Claim greps, both binding forms, run by me: 48 line-visible occurrences, 48
wrap-insensitive, 0 missed by wrap. That matches the work history's Appendix B
self-report exactly. The passive-form grep (measurement 10) returns one real
authored hit, delivery/work-history/m4-p13.md:299 ("the property holds NOW and
is checked NOW"); see F-2.

### My mutations of the new test

| mutation | seeded in | result |
|---|---|---|
| R-072 migration-table cell M5 -> M4 (their member i) | scratch clone | RED, names R-072 |
| R-026a Appendix A bucket M5 -> M4 (their member ii) | scratch clone | RED, names R-026a |
| R-042 set to M4 in BOTH documents (a CONSISTENT revert) | scratch clone | RED via the declared-exemption assertion: "R-042 is declared as decision-bucketed but Appendix A buckets it to a milestone: M4" |
| R-041 M4->M2 and R-048 M2->M4, consistently in BOTH documents (a SWAP) | scratch clone | **GREEN on both tests and on the gate** (finding F-2) |

The third is a genuine THIRD structurally different member that the work history
does not claim; the exemption-list assertion earns its place.

### The six-pins-to-one-deepEqual replacement loses nothing

I checked this specifically, because collapsing six assertions into one is where
coverage usually leaks. `import { strict as assert }`, so `deepEqual` is
`deepStrictEqual`. The old form pinned `perKind["phase"]`, `perKind["milestone"]`
and five `perMilestone` keys plus `perMilestone["parked"] ?? 0 === 0`. The new
form pins the WHOLE `perKind` and `perMilestone` objects, so an unexpected extra
key now fails where the old form ignored it. Strictly stronger.

## F-3 (MEDIUM, recorded not blocking): a row can be discharged to a decision record that does not exist, and nothing reddens

This phase makes `decision` a USED bucket kind for the first time in this
repository (per-kind `decision` goes from absent to 6). I attacked that new
surface directly.

Seeded in a scratch clone at ca20e79, R-042's bucket changed from `DR-0029` to
`DR-9999` in BOTH documents. `ls delivery/decisions/ | grep -c 9999` is 0, so the
record does not exist:

  node src/gates/coverage.ts ...            -> green, 115 units, detail UNCHANGED
                                               ("decision 6, milestone 98, phase 11")
  --test-name-pattern 'Appendix A bucket agrees'   -> pass 1, fail 0
  --test-name-pattern 'units 115 with per-kind'    -> pass 1, fail 0

All three green. A requirement is now discharged by a fabricated owner decision
and every guard agrees.

The work history over-states what the new test does. Section 6.3 says: "a
decision or parked bucket must match the migration table's cell VERBATIM, so the
six DR-0029 rows are required to say DR-0029 in BOTH documents". The first half
is true; the "so" does not follow. What is enforced is that the two documents
say THE SAME non-milestone string. The declared-list loop only asserts
`exempt.includes(id)`, i.e. that the bucket is not a milestone. It never pins the
value to `DR-0029` and never checks the record exists.

The fix is one line in the loop the phase already wrote: assert the bucket value
for each declared id, and that `delivery/decisions/<id>-*.md` resolves.

This matters here rather than in the abstract: CLAUDE.md's identifier-schemes
section records that `DR-0019` was once created and then DELETED as a
FABRICATED owner decision, caught by a delta verifier and not by any check. This
is the same failure one layer down, now with six live users.

REACHES SHIPPED: NO. The permissive `decision` pattern
(`DR-[0-9]{4}|D-[0-9]+|M2-D-[0-9]+`) is pre-existing and unchanged in
src/gates/coverage.ts:189, and an adopting project supplies its own bucketKinds,
so the kernel's generic gate is not wrong. The gap is in the new test and in
delivery/ data. Tracked, not blocking, per DR-0027.

### F-1 corroboration: the phase DECLARED D-15 and then left it wrong

delivery/plan/phase-declarations/m4-p13.json's `citations` array is:

  ["DR-0028","DR-0029","DR-0037","R-001a","R-041","R-042","R-045","R-046",
   "R-047","R-050a","R-051","R-064","R-065a","R-071","R-072","R-097",
   "D-12","D-15"]

D-15 is in the phase's own declared citation list, and the work history reads
and cites it at kernel-plan-v1.md:390. It was identified, declared, read, quoted
in half, and left contradicting the change.

## 3. Things I attacked that HELD

- **A count pinned over an append-only registry (binding convention 5).** The
  new test asserts `compared === 115` and `totalInventoryIds: 115`. I checked
  whether the inventory is append-only: `git log --all` shows exactly TWO
  commits have ever touched delivery/requirements/migration-table.md and BOTH
  carry 115 rows. It is a CLOSED extraction, not an append-only registry, and
  shipped src/gates/coverage.ts:194 already pins `expectedUnits: 115`. So the
  pin is legitimate. The exemption list is correctly asserted BY NAME and
  one-directionally, so a seventh decision-bucketed row does not redden it.
  (Nit: `compared` could derive from `KERNEL_COVERAGE_CONFIG.expectedUnits`,
  which is already in scope, instead of repeating the literal.)
- **Shipped-surface reach.** `git grep -nE 'R-041|R-042|R-045|R-046|R-047|
  R-050a|R-051|R-064|R-065a|R-071|R-072|R-097|D-12|D-15' -- src/ bin/ schemas/
  roles/ tuition/` returns ONE line, src/witness/run.ts:1191, and it is the
  unrelated token "M2-D-15". No shipped artifact names a moved row.
- **Line-number drift into a shipped citation.** schemas/report.schema.json:115
  cites `delivery/requirements/migration-table.md:39`. `git diff --numstat` is
  12/12 and 14/14, and both files are byte-count-stable at 207 and 557 lines
  base and head, so no citation into them moved. Checked because a shipped
  schema carrying a line citation into an edited delivery file is the one way a
  paperwork phase could break a shipped artifact.
- **Data loss.** `git merge-tree --write-tree 12ba558 ca20e79` exits 0, and the
  base branch's advance (6961186..12ba558) shares ZERO files with the phase's
  six. Nothing is at risk of being clobbered.
- **Section 9 item 6 (the scope gate).** I suspected this was stale because
  M3-P11 change B ships "the declaration is read from BOTH sides"
  (src/gates/scope.ts:596). It is NOT stale: change B allows AMENDING an
  existing declaration, and an absent merge-base declaration is still a hard
  red. I ran the gate and got exactly the detail the work history predicts.
- **C-1, C-2, C-3.** The phase's diff introduces no code. Grepping the added
  lines for pid, /proc, signals, detached spawn or log-tail reads returns only
  two prose hits (the words "signal" and "SIGTERM" describing a killed run).
- **The prototype probes.** delivery/verification/m4-prototype-probes.md's
  twelve measurements concern the harness, credentials, hooks, model
  observability and the pstack CAS. None of them bears on the migration table,
  and nothing in the work history contradicts one.

## 4. The suite sentence, re-run by me

The work history's sentence (section 8.2 / Appendix B) names interpreter
(node v26.6.0, scratch prefix /tmp/m4p13-node26), build state (dist built,
`git status` clean after), invocation (`npm test`), 851 tests / 851 pass /
0 fail / 0 SKIPPED, exit 0, at head a6e43ff. The base was established FIRST
(section 8.1, bd92a01, 849/849/0/0/exit 0) before any failure was attributed,
which is the part most work histories skip. `a6e43ff..ca20e79` touches only the
work history, so the number carries to the final head.

It is MISSING the fourth qualifier (measurement 9: git checkout vs `git archive`
copy). That measurement was committed at 2026-09-16 01:56, TWENTY-SIX MINUTES
AFTER this phase's head at 01:30, so the implementer could not have known it.
The evidence in the file settles it anyway: section 8.2.1 quotes working
`git diff --name-only` and `git status --short` from the same tree, so it was a
git checkout.

MY RUN, scratch CLONE (git checkout) at ca20e79, node v26.6.0, dist BUILT,
`npm test`:

  tests 851, pass 848, fail 3, skipped 0, todo 0, TEST_EXIT=1

The TEST COUNT matches exactly. All three failures are environment, and I
diagnosed each rather than averaging:

1. test/coverage-gate.test.ts:146 ->
   `Error: pattern ^(?:DR-[0-9]{4}|D-[0-9]+|M2-D-[0-9]+)$ did not complete
    within 250ms against a value of length 2` at
   src/gates/coverage.ts:260 (`boundedExec`).
2. test/coverage-gate.test.ts:529 ->
   `Error: pattern ^(?:parked)$ did not complete within 250ms against a value of
    length 5`.

   Neither pattern can backtrack. This is the wall-clock bound firing under CPU
   contention, which is exactly the mechanism the work history records in
   section 8.2.1 and which delivery/verification/wall-clock-budgets-are-load-
   dependent.md on the base branch records independently. `uptime` during my run:
   load 55 to 67 on `nproc` 4. BOTH tests pass IN ISOLATION on the same tree,
   same interpreter, same build state, at load 67.

   Worth stating because it is the obvious next worry: this phase does NOT
   increase exposure to that bound. src/gates/coverage.ts:489-495 tests EVERY
   declared kind for EVERY row (CR-992, no first-match short-circuit), so the
   execution count is 115 x 4 before and after. The `decision` pattern was
   already being executed 115 times per run before any row used it.

3. test/gates.test.ts:3571 -> `Cannot find module
   '/tmp/claude-0/m4p13work/bin/tiphys.ts'` from `runCliUnprivileged`.
   `namei -m` on that path prints `drwx------ claude-0`. This is standing
   warning 1's scratch-prefix trap in its repo-location form, and it is a
   property of where I put my clone, not of the branch.

So: I cannot reproduce 851/851 at this load, and I do not call the implementer's
green wrong. The honest sentence for this head today is that the suite is
LOAD-DEPENDENT, and 851 is the test count both of us measured.

## 5. Scope

The phase's OWN commits (6961186..ca20e79) touch exactly six paths:

  delivery/plan/kernel-plan-v1.md            (declared)
  delivery/plan/phase-declarations/m4-p13.json (declaredExtras)
  delivery/requirements/migration-table.md   (declared)
  delivery/work-history/m4-p13.md            (standing extra)
  test/behaviors.json                        (standing extra)
  test/coverage-gate.test.ts                 (declared)

`delivery/requirements/clause-map.json` is granted and unused, which section 5.3
measures rather than asserts (`grep -c M4 delivery/requirements/clause-map.json`
is 0). I reproduced that. Against delivery/plan/m4-conflict-pre-pass.md:16 the
phase is inside its grant and collides with no other wave-1 unit.

OBSERVATION (not a finding): the BRANCH is cut from `plan/pstack-borrow-review`
at 6961186, so `git diff --name-only origin/main...ca20e79` is 33 files and
12,094 insertions, of which 27 files are inherited, unreviewed-by-this-round M4
paperwork. `git diff --name-only 12ba558...ca20e79` (against the stack base tip)
is the six above. This is disclosed in the work history's header. My APPROVE
covers the six files, NOT the inherited 11,000 lines. Under DR-0031 the stack
base must land on main before this PR is opened, or the PR is not a unit of
self-contained value.

## 6. Citations

Sampled 26 `path:LINE` tokens from the work history, every one verified by
reading the line on the branch. HIT RATE 26/26 = 100%. Sample included the ones
most likely to have drifted: test/coverage-gate.test.ts:494 (the verbatim-row
pin the implementer says they corrected from :483), :988, :156, :213;
src/gates/coverage.ts:55, :235, :253, :356, :797; src/gates/citations.ts:233;
test/gates.test.ts:3530; test/gate-registry.test.ts:459; test/behaviors.json:209;
kernel-plan-m4.md:2064, :2087, :2162, :2199, :2207; kernel-plan-v1.md:368, :370,
:390, :435; DR-0029:38 and :50; m4-conflict-pre-pass.md:16; src/checks.ts:1802.

OBSERVATION (base branch, not this phase): delivery/plan/kernel-plan-m4.md:2174
cites `delivery/plan/m4-intake.md:766` for the R-064 ruleset measurement. Line
766 is the heading "## 7. Owner actions"; the measurement is at
delivery/plan/m4-intake.md:780. This phase's migration-table note for R-064
("already discharged: ruleset main-protection is enforcement active with
required_status_checks naming gates") carries NO pointer at all, so a long-lived
requirements artifact now asserts a live repository-configuration fact with the
provenance one hop away and mis-pointed. Cheap to fix; not blocking.

## 7. Verdict

APPROVE, one round, under DR-0027.

Nothing in this change reaches a shipped artifact. I checked that four ways
(no shipped file names a moved row or D-15; both edited files are line-count
stable so schemas/report.schema.json:39's citation did not move; the coverage
gate is green with an identical unit count and a detail that matches the plan's
prediction byte for byte; `decision` was already a declared, already-executed
bucket kind in unchanged shipped code).

Three findings are RECORDED for the orchestrator: F-1 (MEDIUM), F-3 (MEDIUM),
F-2 (LOW). F-1 and F-3 are each a few lines of edit and I would fold them into
the merge rather than open a round for them.
