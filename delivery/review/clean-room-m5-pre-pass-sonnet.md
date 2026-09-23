# Clean-room review: PR #210 (m5 conflict pre-pass + DR-0050)

Reviewer: Sonnet 5, clean-room, independent.
Reviewed head: 5101d8a44c3aed2b228c0d62272f0853b46f96fb, branch
claude/m5-plan-readiness-y2jjo5.
Files added: delivery/plan/m5-conflict-pre-pass.md,
delivery/decisions/DR-0050-m5-runs-in-waves-rather-than-serially.md.
No tracked file edited by this reviewer. Nothing posted, nothing merged.

## Method

Fetched origin/claude/m5-plan-readiness-y2jjo5 (this PR), origin/main, and
the four pushed wave-A implementer branches: claude/m5-p1-pulse-value-proof,
claude/m5-p2-intent-to-outcome, claude/m5-p4-ci-truth,
claude/m5-p6-scale-out-proof. claude/m5-p3-live-review-evidence and
claude/m5-p5-context-diet do not exist yet (wave B and C have not started),
which matches the pre-pass's own wave table.

Checked out the PR head detached (the branch was already checked out in the
non-worktree clone), ran `npm ci` and `npm run build` with Node v26.6.0 first
on PATH (from
/tmp/claude-0/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/node-v26.6.0-linux-x64/bin),
then `node scripts/check-authored-bytes.mjs` and the citations gate.

## (1) Is the pre-pass's disjointness claim true

Two separate checks, as the dispatch asked: declared-list overlap, and
actual-diff overlap.

**Declared-list overlap (what the pre-pass itself computed).** Independently
re-derived by reading all six delivery/plan/phase-declarations/m5-p*.json
files on main and computing the pairwise intersection of filesToTouch plus
declaredExtras, minus test/behaviors.json and each phase's own declaration
file, exactly as delivery/plan/m5-conflict-pre-pass.md:12 describes:

```
m5-p1 m5-p5 delivery/STATE.md
m5-p1 m5-p6 delivery/STATE.md
m5-p2 m5-p3 roles/clean-room-reviewer.md
m5-p3 m5-p4 test/gate-registry.test.ts
m5-p3 m5-p5 test/clean-room-brief.test.ts
m5-p5 m5-p6 delivery/STATE.md
```

This is an exact match, six for six, against the pre-pass's own "Literal
overlap" table (delivery/plan/m5-conflict-pre-pass.md:14). Every other pair
is genuinely disjoint over the declared lists. **This half of the claim is
true and complete.**

**Actual-diff overlap (what the dispatch also asked for, and what the
pre-pass's own derivation does not cover).** Ran
`git diff --name-only origin/main...origin/claude/<branch>` for the four
pushed branches and cross-checked each real diff against every OTHER phase's
declared file list (P3 and P5 have no branch yet, so only four of six phases
could be checked this way; that is stated rather than silently assumed).

One hit that the pre-pass's table does not name:
**claude/m5-p4-ci-truth actually touches
delivery/plan/cutover/retirement-inventory.json** (217 lines added, commit
1790990 "M5-P4: retirement inventory rows for the new orchestrator-next
declarations"), and that exact file is on **M5-P5's** declared filesToTouch
(delivery/plan/value-delivery-plan.yaml:348,
delivery/plan/phase-declarations/m5-p5.json). At the time the pre-pass was
written (last commit 5101d8a, 2026-09-23 06:52:01Z), no implementer branch
existed yet: the earliest wave-A implementer commit is
db9ec53 at 06:54:13Z (M5-P1), roughly two minutes later, so the pre-pass
satisfies binding convention 5's "written before dispatch" requirement, and
this specific overlap could not have been known when it was written. It is
real now.

retirement-inventory.json is **not** one of the three append-only registries
CLAUDE.md rule 5 names (test/behaviors.json, gates.manifest.json,
delivery/requirements/clause-map.json), so it does not get the
union-resolved exemption the pre-pass correctly applies to
test/behaviors.json elsewhere.

Mechanism, not just the instance: the pre-pass's derivation is a one-time
snapshot of the phase declarations as they stood on `main` before dispatch.
An implementer is permitted to add an entry to its own phase declaration
mid-phase (additive-only scope grant, src/gates/scope.ts:110), and
M5-P4 did exactly that (git diff origin/main...origin/claude/m5-p4-ci-truth
-- delivery/plan/phase-declarations/m5-p4.json shows the added
"delivery/plan/cutover/retirement-inventory.json" entry). The frozen
pre-pass document has no mechanism to reflect a grant added after it was
written, so any pre-dispatch pre-pass will go stale exactly this way the
first time an implementer needs one file outside its original declaration.
That is a general property of "written once before dispatch," not a
one-off mistake in this document.

Practical risk today is low: M5-P4 is wave A and fully merges before M5-P5
(wave C) starts, so there is no concurrent-edit collision, only a fact P5's
implementer needs to know (the retirement-inventory disposition audit must
cover M5-P4's added rows too, not just the rows that existed when M5-P5's
plan section was written). But the document's own words ("Every other pair
is literally disjoint") are not accurate against the live branches, and
"What this pre-pass did NOT cover" (delivery/plan/m5-conflict-pre-pass.md:66)
only names the test-file-reads-another-phase's-file gap, not this one.

Everything else checked out clean: P1's actual diff (STATE.md, two
verification files, work history) matches its declaration exactly; P2's
actual diff matches its declaration plus test/behaviors.json; P6's kernel
half touches src/cli.ts, src/commands/conflicts.ts, test/conflicts.test.ts,
its own declaration file and test/behaviors.json, exactly as declared, and
has not yet touched delivery/STATE.md (that is deferred to its hemma half in
wave D, so the three-way STATE.md overlap the pre-pass names is not
currently active in wave A either).

One out-of-scope observation, not a finding against this PR: M5-P6's branch
also carries nine files under witness/ that are on neither its own
declaration nor any other phase's, so its own scope gate has an undeclared-
file question to answer when it opens its PR. No other M5 phase declares
anything under witness/, so this does not create a cross-phase overlap and
is not this pre-pass's business; it belongs to M5-P6's own clean-room
review.

## (2) Are the wave dependencies consistent with the plan

Yes. Cross-checked delivery/plan/value-delivery-plan.yaml:1 phase sections
against the pre-pass's "Waves" table (delivery/plan/m5-conflict-pre-pass.md:47):

- M5-P1's plan text ("no code dependency... merges when its evidence is
  complete... waits on an owner reboot of pulse",
  delivery/plan/value-delivery-plan.yaml:27-56) matches the pre-pass's wave A
  placement and its stated merge-timing caveat almost verbatim.
- M5-P2 and M5-P3 declare conflicts-with each other in the plan
  (delivery/plan/value-delivery-plan.yaml:163,247). The pre-pass keeps them
  in different waves (P2 in A, P3 in B, starting after P2 merges), which
  satisfies the plan's own declared conflict.
- The pre-pass also serialises P3 after P4 (wave B starts when "M5-P2 and
  M5-P4 merged"), which the plan's conflicts-with field does not itself
  declare, but the pre-pass's semantic-coupling item 1
  (delivery/plan/m5-conflict-pre-pass.md:26) gives the reason: P4 makes
  assurance-modes.yaml equal the registry's full-mode set and P3 edits
  gate-registry.yaml without declaring assurance-modes.yaml. This is a
  stricter rule than the plan states, not a contradiction of it.
- M5-P6's plan text ("kernel half touches src/commands/conflicts.ts,
  src/cli.ts and test/conflicts.test.ts only, which no other phase touches...
  hemma half needs P2 to P5 merged", delivery/plan/value-delivery-plan.yaml:
  395-420) matches the pre-pass's split into a wave-A kernel half and a
  wave-D hemma half gated on "M5-P5 merged," which functionally implies P2
  through P4 are already merged too, since waves are sequential.

No inconsistency found between the plan's phase sections and the pre-pass's
wave assignments.

## (3) parallelizable: false versus the pre-pass

All six M5 phases carry `parallelizable: false` in the plan
(delivery/plan/value-delivery-plan.yaml:94,164,248,316,392,470). DR-0050
states this directly and explains the override: the owner instruction
"do execute parts in parallel as much as possible" (2026-09-23) overrides the
flag for M5, under DR-0011's existing permission for phases a recorded
pre-pass proves disjoint. No contradiction between the plan field and the
pre-pass; DR-0050 is the record that reconciles them, which is the correct
place for it per binding convention 5 and DR-0011's own conditions.

One point worth naming for completeness, not a defect: DR-0011's recorded
condition 1 says "any overlap cancels the parallel start"
(delivery/decisions/DR-0011-early-parallelism.md:48), written for a single
simultaneous dispatch. The M5 pre-pass does not cancel on overlap; it either
separates the overlapping phases into different, sequential waves (P2/P3,
P3/P4, P3/P5), or, for the one pair that is not separated by wave number
(the STATE.md triple across P1, P5 and P6), it substitutes a named manual
merge-resolution step (delivery/plan/m5-conflict-pre-pass.md:53) reviewed by
a human, since delivery/STATE.md is not append-only. That is a reasoned,
disclosed departure from DR-0011's literal "cancels" wording, consistent
with DR-0050's explicit owner override, and it is written down rather than
silently assumed, which is what convention 5 requires. Verified against the
live branches that this triple overlap is not currently active: only M5-P1
has touched delivery/STATE.md so far (62 lines added); M5-P6's kernel-half
branch has not touched it (git diff on that path is empty), consistent with
that edit being deferred to its wave-D hemma half.

## (4) Does DR-0050 misstate anything

No outright misstatement found. Line 94 cites `parallelizable: false`
exactly, and it is the M5-P1 phase's `parallelizable: false` line as claimed.
DR-0049 (cited under relates-to) exists on main. No id collision: `git log
--all --oneline -- 'delivery/decisions/DR-0050*'` shows only this branch's
two commits, nothing on main or elsewhere under that number.

The one soft spot: DR-0050 says the pre-pass "splits M5 into four waves, and
merge order stays dependency order" and cites DR-0011's "proves phases
disjoint" permission, without itself naming that real declared-list overlaps
exist (the six pairs above). That is not inaccurate, since DR-0050 points a
reader straight at the pre-pass document, which does name and handle every
one of them, including the STATE.md triple's manual-resolution requirement.
Treated as a low-severity completeness suggestion below, not a finding that
blocks merge.

## (5) ASCII, em dashes, citations

- `node scripts/check-authored-bytes.mjs`: **exit 0**, clean, Node v26.6.0,
  npm 11.6.2 (via npm ci), on this checked-out head.
- Em dash check (`grep -naP` for U+2014) on both new files: **0 hits** in
  each.
- Citations gate, run directly against this exact head with `--only
  citations`:

  ```
  node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --only citations --evidence <scratch> --base origin/main --head HEAD
  ```

  Output: `gates: declared 1 applicable 1 verdict 1 green 1 red 0
  not-applicable 0 error 0 vacuous 0` and `gates: citations: green: linted 2
  changed document(s) at 5101d8a...: 4 citation(s) resolved, 0
  self-citation(s), 0 unverifiable-external`. This is a direct per-gate run
  (not a bundle-level deduction), so all four facts from CLAUDE.md's
  "green scoped to the run" section are satisfied by construction: the gate
  ran, it is the only gate requested, it is green, and it names the exact
  head.
- `npm run build`: exit 0, no errors.

## Findings

**CR-001 (medium).** The pre-pass's "Literal overlap" table and its "Every
other pair is literally disjoint" claim are derived only from the phase
declarations as they stood on `main` before dispatch, and are therefore
already stale against the live branches: M5-P4's actual diff touches
delivery/plan/cutover/retirement-inventory.json (an additive scope grant it
added to its own declaration mid-phase), which is also on M5-P5's declared
list, and retirement-inventory.json is not an append-only-exempt registry.
Practical risk is low today (P4 is wave A and merges well before P5's wave C
starts), but the document's disjointness claim, read literally, is false as
of this head, and "What this pre-pass did NOT cover" does not mention this
class of gap (a mid-phase additive scope grant creating a new real overlap).

Fix: add one row to the "Literal overlap" table (or a short note under it)
naming the M5-P4-actual / M5-P5-declared overlap on
delivery/plan/cutover/retirement-inventory.json, and add one line to "What
this pre-pass did NOT cover" stating that the derivation is a pre-dispatch
snapshot and does not track scope grants implementers add after their branch
starts; recommend the orchestrator re-check declared-vs-actual overlap once
before each new wave opens, using the same method this review used.

**CR-002 (low).** DR-0050's "one consequence stated rather than left to be
found" section names only the M5-P6 branch-splitting consequence, not the
delivery/STATE.md three-way overlap (M5-P1, M5-P5, M5-P6) that the linked
pre-pass handles by manual merge resolution rather than wave separation. Not
inaccurate, since the pre-pass itself fully discloses and handles it, but a
reader of DR-0050 alone would not learn this is the one overlap pair not
resolved by sequencing.

Fix (optional, non-blocking): add one sentence to DR-0050's consequence
section pointing at delivery/plan/m5-conflict-pre-pass.md's STATE.md
handling, so the owner-facing decision record carries the one overlap that
needs a human at merge time, not only the pre-pass appendix.

**CR-003 (low, out of scope for this PR).** claude/m5-p6-scale-out-proof
carries nine files under witness/ that are on neither its own phase
declaration nor any other M5 phase's declared list. This creates no
cross-phase overlap (no other M5 phase touches witness/), so it does not
affect this pre-pass's disjointness claim, but M5-P6's own clean-room review
will need to resolve whether those paths belong on its declaration before
its scope gate is asserted green.

## Verdict

**FIX-ROUND-NEEDED**, on CR-001 (medium). CR-002 and CR-003 are low and do
not block on their own, but CR-001 is a real, currently-true gap in the
document's central claim, with a cheap, concrete, two-sentence fix. No high
findings.

## Delta verification, 2026-09-23

New head: d0bc5ccf7b264cd644db549b5b544ff6bd00824c (2026-09-23 08:20:16Z),
same branch, same two files plus this report now committed.
`git diff 5101d8a d0bc5cc` shows exactly three changes: the amendment to
delivery/plan/m5-conflict-pre-pass.md, the amendment to
delivery/decisions/DR-0050-m5-runs-in-waves-rather-than-serially.md, and
this review file added verbatim (byte-identical to the copy this reviewer
kept locally, confirmed with `diff`, exit 0). No other tracked file touched.

**CR-001: closed.** The pre-pass now carries a row
"P4 P5 delivery/plan/cutover/retirement-inventory.json" under a new
"Amendment after dispatch, 2026-09-23" heading, and the sentence this review
flagged now reads "Every other pair was literally disjoint **at dispatch**"
(past tense, scoped), rather than the unscoped present-tense claim. A new
bullet under "What this pre-pass did NOT cover" names the general mechanism:
"Declarations as they change after dispatch... A phase that adds a file to
its own declaration later (allowed, since grants are additive) can create an
overlap this table does not show," and directs the orchestrator to re-derive
overlap from live branches with `git diff --name-only
origin/main...origin/<branch>` before each wave starts. That is the same
method this review used, generalized into a standing instruction rather than
a one-off fact, which is what the fix asked for (mechanism, not instance).
The amendment also explicitly re-confirms the practical point this review
made: it does not change the waves, since P4 merges in wave A before P5
starts in wave C.

Re-checked the underlying facts, not just the prose, since this is a delta
verification and prose can be corrected without being true:

```
git diff --stat origin/main...origin/claude/m5-p4-ci-truth -- \
  delivery/plan/cutover/retirement-inventory.json
```
still reports 217 insertions, so the overlap the amendment names is the same
real one this review found, not a different or narrower one substituted in.
The declared list for M5-P5 still includes
`delivery/plan/cutover/retirement-inventory.json`
(delivery/plan/phase-declarations/m5-p5.json, files-to-touch), confirmed by
re-reading that file at d0bc5cc. Both halves of the claimed overlap are
still true.

**CR-002: closed.** DR-0050's consequence section is now "Two consequences,"
and the second names the delivery/STATE.md three-way overlap exactly:
"delivery/STATE.md is edited by M5-P1, M5-P5 and M5-P6, and waves do not
separate all three. Whichever of them merges second merges main into its
branch first and resolves that file by hand, and the resolution is
reviewed." This matches the pre-pass's own existing handling of that overlap
(delivery/plan/m5-conflict-pre-pass.md, merge-order paragraph, unchanged by
this amendment) rather than inventing a new, different resolution, so the
owner-facing decision record and the pre-pass now agree and neither
overstates the other.

**CR-003: still open, and correctly left alone.** It was scoped to
claude/m5-p6-scale-out-proof's own undeclared witness/ files, which is a
different branch and a different phase's own review; this amendment (to
delivery/plan/m5-conflict-pre-pass.md and DR-0050 only) had no reason to
touch it and did not. No new finding against that observation.

Re-ran the mechanical checks against d0bc5cc, isolated by checking this
report's file out separately first so the amended tracked copy and this
reviewer's local copy would not collide (`diff` confirmed the tracked copy
is byte-identical to what was written before the amendment, so this report
is genuinely unmodified by the coordinator, matching the instruction):

- `npm ci` and `npm run build`: both exit 0, Node v26.6.0, clean.
- `node scripts/check-authored-bytes.mjs`: **exit 0**.
- Citations gate, direct `--only citations` run against this exact head:

  ```
  gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 \
    error 0 vacuous 0
  gates: citations: green: linted 2 changed document(s) at \
    d0bc5ccf7b264cd644db549b5b544ff6bd00824c: 5 citation(s) resolved, \
    0 self-citation(s), 0 unverifiable-external
  ```

  5 resolved, up from 4 at 5101d8a: the one new citation is the amendment's
  "delivery/review/clean-room-m5-pre-pass-sonnet.md:1" in the pre-pass,
  correctly formed outside backticks with a line number per binding
  convention 3b, and it now resolves because this report is committed on
  the same branch. Still green, still a direct per-gate run, not a
  bundle-level deduction.

**Verdict: APPROVE.** Both findings this review raised are closed with
matching, re-verified facts, not just re-worded prose. CR-003 remains open
but was always out of scope for this PR. No new finding from this delta
pass. Build, authored-bytes and citations are all green at d0bc5cc by direct
re-run.
