# M3 plan revision 3 delta review: STARTING 22:35:34

## M3R3D-001: Section 2.5's re-derivation command, embedded as evidence in the plan, does not reproduce against the plan's own current text (the `.github/workflows/gates.yml` column undercounts by one for P2, P6, P9)

- severity: medium
- location: `delivery/plan/kernel-plan-m3.md:1107-1170` approx (section 2.5, the `for n in 1 2 ... 10` derivation block and its output table); the mismatch is between that embedded output and the actual M3-P2/M3-P6/M3-P9 `files-to-touch` blocks at `:2032-2296` (P2), and the P6/P9 sections
- what: Section 2.5 was added at revision 3 specifically to fix A-005 (revision 2's parallelism counts were asserted, not derived) by embedding the exact command and its output, per the fix-round contract's item 2 ("publish the derivation... the exact command... and its full output"). Running that exact command verbatim against the CURRENT plan file (`8d8b6ab`) does not reproduce the embedded output: the plan shows `workflow=1` for M3-P2, M3-P6, and M3-P9, but the real count is 2 for each, because each of those three phases' `files-to-touch` block carries a "Standing constraint on the `.github/workflows/gates.yml` edit" paragraph (added elsewhere at revision 3, citing DR-0017) that mentions the path a second time inside the same files-to-touch-to-acceptance-criteria span the command scans.
- evidence:
  ```
  $ for n in 1 2 3 4 5 6 7 8 9 10; do
      s=$(grep -n "^### M3-P$n:" delivery/plan/kernel-plan-m3.md | cut -d: -f1)
      e=$(awk -F: -v s=$s '$1>s{print $1; exit}' <(grep -n "^- blocked-by" delivery/plan/kernel-plan-m3.md))
      blk=$(sed -n "${s},${e}p" delivery/plan/kernel-plan-m3.md \
            | sed -n "/^- files-to-touch/,/^- \(conflicts-with\|acceptance\|hazard\|citations\)/p")
      printf "M3-P%-2s cli=%s validate=%s checks=%s pkgjson=%s workflow=%s\n" "$n" \
        "$(echo "$blk"|grep -c 'src/cli.ts')" "$(echo "$blk"|grep -c 'src/validate.ts')" \
        "$(echo "$blk"|grep -c 'src/checks.ts')" "$(echo "$blk"|grep -c 'package.json')" \
        "$(echo "$blk"|grep -c 'workflows/gates.yml')"
    done
  ```
  Real output (captured in this review, verbatim command from the plan):
  ```
  M3-P1  cli=1 validate=1 checks=1 pkgjson=1 workflow=1
  M3-P2  cli=1 validate=1 checks=0 pkgjson=1 workflow=2
  M3-P3  cli=1 validate=1 checks=1 pkgjson=1 workflow=0
  M3-P4  cli=0 validate=1 checks=1 pkgjson=0 workflow=0
  M3-P5  cli=1 validate=1 checks=0 pkgjson=1 workflow=0
  M3-P6  cli=0 validate=0 checks=0 pkgjson=1 workflow=2
  M3-P7  cli=1 validate=1 checks=1 pkgjson=1 workflow=0
  M3-P8  cli=1 validate=1 checks=1 pkgjson=1 workflow=0
  M3-P9  cli=0 validate=0 checks=1 pkgjson=1 workflow=2
  M3-P10 cli=0 validate=0 checks=0 pkgjson=1 workflow=1
  ```
  versus the plan's own embedded output (`kernel-plan-m3.md`, section 2.5), which shows `workflow=1` on the M3-P2, M3-P6, and M3-P9 rows. Root cause confirmed directly:
  ```
  $ n=2; s=$(grep -n "^### M3-P$n:" delivery/plan/kernel-plan-m3.md | cut -d: -f1)
  $ e=$(awk -F: -v s=$s '$1>s{print $1; exit}' <(grep -n "^- blocked-by" delivery/plan/kernel-plan-m3.md))
  $ sed -n "${s},${e}p" delivery/plan/kernel-plan-m3.md | sed -n "/^- files-to-touch/,/^- \(conflicts-with\|acceptance\|hazard\|citations\)/p" | grep -n "workflows/gates.yml"
  134:  section only), `.github/workflows/gates.yml` (edit), `package.json` (edit,
  140:  **Standing constraint on the `.github/workflows/gates.yml` edit, NEW at
  ```
  Same double-mention pattern confirmed for M3-P6 and M3-P9 (grep -n against their own files-to-touch blocks shows the file path at the actual list entry, then again inside a "Standing constraint... NEW at revision 3 (DR-0017...)" paragraph appended to the same field).
- impact: this does not change the higher-level conclusion the table exists to support (workflow-touching phases are still P1, P2, P6, P9, P10, still 5 phases, and DR-0011's disjointness logic is not affected because the double-count is two mentions of the SAME file in the SAME phase, not a new phase). But it is exactly the evidence-integrity property the fix-round contract's item 2 and CLAUDE.md's "evidence beats assertion... a claim with no verifiable artifact behind it is treated as unknown" exist to guard: a block presented as "the exact command... and its full output" does not reproduce when run verbatim against the document it is embedded in. It is most likely explained by the DR-0017 standing-constraint paragraphs being added to the three phases' files-to-touch blocks AFTER this derivation's output was captured and pasted in, so the plan's own text moved out from under its own cited evidence within the same revision.
- recommendation: either scope the awk/sed extraction to the file LIST portion of `files-to-touch` only (stop at the first `**` bold-paragraph marker, not just at the next `- acceptance criteria`), or re-run and re-paste the command's output now that the standing-constraint paragraphs exist, and add a one-line note that the raw per-phase table intentionally overcounts prose mentions of `gates.yml` (if that is the intended defense) so a future re-reader is not misled into thinking the command is unreliable. As shipped, a reader who reproduces the evidence gets a different answer than the one printed, which is the exact failure item 2 of the fix-round contract exists to prevent.

## M3R3D-002: Mechanism 4's resolution is described in the plan as accomplished but the governing-document edits it depends on (CLAUDE.md, STATE.md) were never made in this revision

- severity: medium
- location: `delivery/plan/kernel-plan-m3.md:6043-6119` (section 7, "The A-n owner-action namespace"); `delivery/work-history/m3-plan-revision-3.md:465-478` (section 2.1, items 1-2)
- what: the arbitration's ruling on mechanism 4 was explicit: "`A-n` is added to CLAUDE.md's identifier-scheme registry with a single owning document, and the collisions are resolved by allocating fresh ids... This is an orchestrator action on CLAUDE.md and STATE.md, not a plan edit, and **is done alongside revision 3**." The delta under review is exactly two files (`git diff --stat 70b8f05..8d8b6ab`, confirmed below); neither `CLAUDE.md` nor `delivery/STATE.md` was touched. The plan text itself is honest about this (section 7 calls it "recorded here so it is not dropped", and the work history lists it under "What was NOT applied" as deferred to the orchestrator), so this is not a false completion claim. But it means the actual fix for A-003/mechanism 4 does not yet exist anywhere except as a plan to have it: `CLAUDE.md` still has no `A-` entry in its identifier-scheme list, and `delivery/STATE.md` still lists only `A-1, A-2, A-4, A-6` with no `A-7` row. Until those two edits land, "A-7" is a number that exists only inside a DRAFT, not-yet-owner-approved plan document, and nothing prevents a concurrent process (another agent working `delivery/STATE.md`, or a different phase) from allocating a fresh `A-7` to something else in the interim, reproducing the exact collision this mechanism exists to close.
- evidence:
  ```
  $ git diff 70b8f05..8d8b6ab --stat
   delivery/plan/kernel-plan-m3.md             | 2160 ++++++++++++++++++++++++---
   delivery/work-history/m3-plan-revision-3.md |  789 ++++++++++
   2 files changed, 2703 insertions(+), 246 deletions(-)
  $ grep -n "^- \`A-" CLAUDE.md
  (no output: A-n is not in CLAUDE.md's Identifier schemes list)
  $ grep -n "A-[0-9]" delivery/STATE.md
  133:This is therefore an OWNER ACTION, listed in the section below as A-4. The
  293:2. **A-1: DONE (owner, 2026-08-05).** The toy sandbox repository is
  297:3. **A-6, NEW and blocking one criterion.** Grant this session PUSH access to
  311:4. **A-2, before M4.** Provide or approve a private remote per real fleet
  313:5. **A-4, NEW, ready to execute.** Delete the 35 stale `claude/*` branches.
  ```
  No `A-7` row exists in `delivery/STATE.md`. This confirms `M3-P10`'s `blocked-by` clause, which the plan says "now cites the ACT as well as the id" for `A-7`, points at an id that is currently registered nowhere the rest of the repository (or a concurrent session) would consult before allocating a fresh owner-action number.
- impact: does not block dispatching M3-P1 (A-7 only gates M3-P10, ten phases away, and `gates.manifest.json`'s live `A-3` is correctly left untouched, so no PRESENT collision exists in shipped artifacts). But mechanism 4 is not fully closed by this revision alone: it is closed CONDITIONALLY on a follow-up orchestrator commit to `CLAUDE.md` and `delivery/STATE.md` landing before that number is needed, and nothing in the plan or work history dates or tracks that follow-up as a concrete pending action distinct from "eventually, before M3-P10".
- recommendation: land the `CLAUDE.md` identifier-registry addition and the `delivery/STATE.md` A-7 row in the same PR that carries this plan revision to `main` (or immediately after, before any other session might allocate an `A-n` id), and record STATE.md's current pipeline-status entry with a concrete pointer to this pending action so a cold-started orchestrator does not have to rediscover it by reading section 7 of a draft plan.

## Hard constraints verification (independent, per task instructions)

```
$ git diff 70b8f05..8d8b6ab -- delivery/plan/kernel-plan-m3.md | grep -cE '^[+-]\| R-'
0
$ awk '/^## Appendix A/,/^## Appendix B/' delivery/plan/kernel-plan-m3.md | grep -c '^| R-'
74
```
Appendix A's 74 rows are byte-identical between `70b8f05` and `8d8b6ab` (direct
line-range diff of the table confirmed no change beyond an appended prose
paragraph after the table's own closing line). No requirement row moved.

```
$ grep -n '^### M3-P' delivery/plan/kernel-plan-m3.md | wc -l   # both revisions
10
```
Phase ids M3-P1..M3-P10 unchanged in both revisions, same order. No phase
renumbered.

```
$ git show 70b8f05:delivery/plan/kernel-plan-m3.md | grep -oE 'D-M3-[0-9]+' | sort -u -t- -k3 -n | tail -5
D-M3-28
D-M3-29
D-M3-30
D-M3-31
D-M3-32
$ git show 8d8b6ab:delivery/plan/kernel-plan-m3.md | grep -oE 'D-M3-[0-9]+' | sort -u -t- -k3 -n | tail -5
D-M3-33
D-M3-34
D-M3-35
D-M3-36
```
D-M3-01 through D-M3-32 are present, unique, and unrenumbered in both
revisions (checked by listing `^- D-M3-nn` definition lines: 36 unique
definitions at revision 3, none duplicated). D-M3-33..36 are the only new ids.
D-M3-19 and D-M3-28 keep their numbers while their text is corrected in place
(checked by direct diff of each entry, shown in the findings above). **No
`D-M3-nn` id is reused.**

`A-n` collision: `gates.manifest.json`'s embedded `A-3`
(`implementer-token-present-owner-action-a-3`) is outside this delta's two
files entirely (confirmed: `git diff 70b8f05..8d8b6ab --name-only` returns only
the plan and the work history) and is explicitly left untouched by the plan's
own text. The plan's own colliding id moves from A-4 to A-7. See M3R3D-002
above for the caveat that the two governing-document edits (`CLAUDE.md`,
`delivery/STATE.md`) this resolution depends on have not actually landed yet.

**All three hard constraints (no row moved, no phase renumbered, no `D-M3-nn`
id reused) are independently confirmed held.**

## Verdict

**APPROVE, with two medium findings to fix before or immediately after
dispatch (neither blocks M3-P1 specifically).**

Counts: 0 high, 2 medium (M3R3D-001, M3R3D-002), 0 low.

Revision 3 is fit to dispatch M3-P1 from. The four mechanisms from the round-2
arbitration are each closed at the mechanism, not the instance, and I verified
that characterization independently rather than accepting it: I spot-checked
roughly 10 of the 19 M2-as-delivered joints directly against `origin/main`
(`.github/workflows/gates.yml`'s single-job shape and event fork,
`phase-declaration.schema.json`'s field names, `gate-manifest.schema.json`'s
`modes` field, `src/gates/result.ts`'s `makeGateResult` M2-C-2 rewrite,
`src/gates/citations.ts`'s M2-D-21/M2-D-22 header text, `src/gates/run.ts`'s
exit-20 not-applicable-required semantics, `release-record.schema.json`'s
deliberately-absent outcome enum, and `scripts/m2-exit-test.sh`'s bundle
membership lists) and every one matched the plan's description exactly. The
most consequential claim in the delta, that DR-0018 makes M3-P2 criterion 3
and exit stage E1.6 unsatisfiable as revision 2 wrote them, is TRUE (confirmed
against `delivery/decisions/DR-0018-exit-test-src-scoped-gate-semantics.md`
directly) and both criteria are rewritten to the corrected, still-falsifiable
shape rather than loosened into vagueness. The hazard-class-to-criterion rule
(section 2.6) is applied to all ten phases with real per-phase tables, not
declared and left to three phases; the "uncheckable" reasons I sampled across
M3-P1, M3-P3, M3-P4 and M3-P7 are legitimate applications of the three-reason
taxonomy, not an escape hatch (several are honestly flagged as WEAKER than the
hazard they map to rather than claimed as full coverage, e.g. M3-P3's C-2
liveness-vocabulary grep residue). The self-caught near-miss (four hazard-map
rows deferring to checklist probes that existed only inside the map itself) is
genuinely fixed: all four probe ids (`c2-liveness-vocabulary`,
`clause-text-matches-row`, `honest-failure-substance`, `contract-avoidance`)
are enumerated with real probe text in M3-P7 step 3d, and I did not find a
fifth instance of the same circularity in the phases I sampled (M3-P1, M3-P2,
M3-P3, M3-P4, M3-P7, M3-P9). The exit test's E0.5 falsification control set
grew from one witness to three, and the three are genuinely structurally
different (a Kind A schema keyword, a Kind B check deregistration, and a
review-contract distinctness violation), which is a real answer to "one
witness is not a class" rather than three variations on removing something
from a file.

The two findings I did raise are both about evidence hygiene rather than
plan-content defects: M3R3D-001 is a derivation whose embedded output no
longer reproduces against the plan's own later edits (the conclusion it
supports is still correct, but the specific numbers printed are not what the
command now returns), and M3R3D-002 is an honestly-disclosed but still real
gap between "this plan describes the A-n fix" and "the A-n fix has actually
been applied to the two files outside this plan that it depends on." Neither
is a defect an implementer would inherit into M3-P1's own work, because
neither touches M3-P1's grounding, criteria, or files-to-touch.

## Regression check

**Mechanism 1 (re-ground against M2 as delivered): CLOSED.** Section 1.7's 19
joints were spot-checked against `origin/main` directly (see Verdict above)
and matched in every case sampled. The DR-0018 unsatisfiability claim was
independently verified true and both affected criteria (M3-P2 criterion 3,
exit stage E1.6) are rewritten to a falsifiable, corrected shape. D-M3-19 and
D-M3-28 corrected under their own numbers per the hard constraint. One
evidence-integrity nit (M3R3D-001) in section 2.5's embedded command output,
not a grounding defect.

**Mechanism 2 (hazard class names its criterion): CLOSED.** Applied to all ten
phases (verified: every phase carries a `hazard class to criterion` table,
`grep -n "hazard class to criterion" delivery/plan/kernel-plan-m3.md` returns
10 hits, one per phase). The self-caught near-miss (four invented probe
references) is fixed with real probe text at M3-P7 step 3d. Sampled tables
(M3-P1, M3-P3, M3-P4) show full or honestly-partial coverage with legitimate
uncheckable-reason citations, not a blanket "uncheckable" escape.

**Mechanism 3 (exit-test witnesses): CLOSED.** E3.1 and E0.1 name event and
head sha with a byte-string comparison and an explicit prohibition on
substituting the `pull_request` check; E3.1b adds the both-arms rule. E0.5 now
carries three controls reaching three structurally different mechanism kinds
(Kind A, Kind B, and review-contract distinctness), each with a named expected
failure stage, plus an explicit list of what remains unwitnessed. This is a
real answer to B-005, not a relabeling of the same single control.

**Mechanism 4 (`A-n` collision): PARTIALLY CLOSED.** The plan's own colliding
id is renumbered A-4 to A-7 and M2's `A-3` inside `gates.manifest.json` is
correctly left untouched. But the two governing-document edits this resolution
depends on (`CLAUDE.md`'s identifier-registry addition, `delivery/STATE.md`'s
A-7 row) were not made in this revision and do not exist on this branch or on
`main` as of this review (see M3R3D-002). The plan and work history are both
honest that this is deferred to the orchestrator, so this is not a
misrepresentation, but it is an open action that should not be allowed to
linger past this revision landing.

**The eight local findings (A-004 through A-014, excluding A-001/002/003/007
already covered above as mechanism instances): CLOSED.** Verified via the
disposition table in `delivery/work-history/m3-plan-revision-3.md` section 2
(all 20 round-2 findings listed with disposition) cross-referenced against the
plan text: A-004 (v1 outline item 2 folded in with reasoning), A-005
(parallelism counts recomputed with a published command: verified myself,
finding the command's `workflow` column undercounts due to M3R3D-001, but the
final derived counts 7/9/6/5 are correct), A-006 (M3-P8 blocked-by corrected to
M3-P6), A-008 (M2-P6 coverage-checker reason corrected and verified against
`src/gates/coverage.ts`'s real config-driven shape), A-009 (phase-declaration
path/fields corrected and verified against `origin/main`'s actual schema and
directory), A-010 (M3-P8 files-to-touch uses a directory entry instead of a
fixed T-001..T-008 list), A-012 (finding-set and verdict rows added to the
format table with real Kind-B-based reasoning), A-014 (M3-P4 criteria
reordered 2, 2b, 2c, 2d).

## What I did NOT cover

- **I did not open every one of the 19 rows in section 1.7 against
  `origin/main`.** I spot-checked roughly 10: CI job structure and event fork,
  required status context (read from the same file as the job structure),
  phase declarations, `modes` reserved field, M2-C-2, M2-P5 citation linter's
  M2-D-21/22, M2-P7 outcome enum, `src/gates/schemas/` location (via
  `git ls-tree`, not independently re-run here but consistent with other
  checks), and the main/PR bundle membership via `scripts/m2-exit-test.sh`. I
  did NOT independently re-verify: the M2-P2 red-witness harness's
  `witness/<id>.json` / `witness-records.json` pairing, the M2-P3 suite
  wrapper's bidirectional exit-code binding, the M2-P8 credential-scoping
  allowlist-versus-denylist claim, the `destructiveCommands` four-entry list
  inside `gates.manifest.json`, and the validator's `INVALID <pointer>
  <message>` contract at `src/gates/validate.ts` line 90 (I read the line
  itself but not the surrounding function). The work history's own section 1.4
  states it did not read M2's test suites or the bodies of `suite.ts` and
  `citations.ts`; I did not close that gap either.
- **I did not build a defective implementation for every one of the 13 new
  criteria.** I read roughly eight of them in full (M3-P2 3b/3c, M3-P4 2e,
  M3-P5 3b, M3-P6 9d, M3-P7 3c, M3-P1 5f/9b, M3-P9 5b) and each named a real
  dangerous-instance construction with two structurally different members
  where the rule requires it. I did not attempt this exercise against the
  remaining new criteria (M3-P1's DR-0013 renumbered items, M3-P8's items) or
  against every criterion in phases I did not focus on.
- **I did not count hazard-class prose items against table rows for every
  phase.** I did this exactly for M3-P1 (8 prose items, 10 table rows: the two
  extra rows are the two revision-3-added hazards for the clause-map and
  `addressed-by` checks, which are legitimate but are not literally sentences
  inside the phase's own `- hazard class (...)` prose paragraph, a minor
  documentation-consistency point I did not write up as a separate finding
  given time) and M3-P4 (8 items, 8 rows, exact match). I did not do this
  arithmetic for M3-P2, M3-P5, M3-P6, M3-P8, M3-P9, or M3-P10, though I read
  all ten phases' tables for the "uncheckable reason is legitimate" question.
- **I did not re-verify Appendix A's bucketing correctness**, only its
  arithmetic (74 rows, no duplicates, per-phase counts). Whether plan v1's own
  requirement-to-phase assignment is right is out of scope for a delta review
  and was also out of scope for both round-2 reports.
- **I did not audit sections 5, 6, 8 as complete sets**, consistent with what
  the work history itself declares out of scope (only D-M3-19, D-M3-28, and
  D-M3-33..36 were touched at revision 3; the other 28 decision entries and
  risks 1-10, 12 were not re-examined by the writer or by me).
- **I did not re-run the repository's own gates** (`npm ci`, `npm run build`,
  `node --test`) myself; I read and spot-checked the work history's own
  captured run (408 tests, 408 pass, clean `git status` after build) rather
  than reproducing it, since the change is two markdown files and the writer's
  own section 5 correctly states the run is evidence the branch does not break
  the repository, not evidence about the plan's content.
- **Appendix C items 2-13 remain unaudited across three revisions and two
  review rounds**, a gap the arbitration and the work history both already
  flag; I did not close it either.
