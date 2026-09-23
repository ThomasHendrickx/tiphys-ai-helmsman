# Clean-room review: m5-orchestrator-paperwork-2

Status: STARTED 2026-09-23T17:03:29Z


## Header

- Date: 2026-09-23
- Branch: origin/claude/m5-orchestrator-paperwork-2
- Head SHA reviewed: 126aaa050537ab5c78d14a2567a0d440da9a3fc9
- Base: origin/main 6dc5b066f5609133845e72ba03d998e694ac37d1
- Contract: docs-only review per assignment (not the standard criteria/hazard contract; this is a paperwork-only diff review)
- Model family: Sonnet
- Method: git diff against origin/main...HEAD, read every changed file in full,
  reproduce DR-0053's table against /home/user/pulse with kernel 0.1.0 at
  /tmp/claude-0/-home-user/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/k01
  and kernel 0.2.0 from src/ on this branch/main, check citations resolve,
  check DR-0054 against DR-0038 and DR-0012 text, ASCII/em-dash scan.

## Files in diff

- delivery/decisions/DR-0053-kernel-0-2-0-rejects-verdicts-written-under-0-1-0.md
- delivery/decisions/DR-0054-tiphys-judges-current-and-future-work-never-history.md
- delivery/evidence/m5-p3-merge-preconditions-d74ec42.txt
- delivery/review/arbitration-m5-p3.md

209 insertions, 0 deletions, matches the four-file description given.

## Probes run (running list)


### DR-0053 numeric reproduction (7-vs-49 table)

Reproduced against pulse (/home/user/pulse) 49 verdict files
(delivery/review/*criteria*.yaml + *hazard*.yaml), kernel 0.1.0 installed at
scratchpad/k01/node_modules/@tiphys/kernel (package.json version 0.1.0), and
kernel 0.2.0 = this repository's own bin/tiphys.ts at the reviewed head
(package.json:2 "version": "0.2.0").

| kernel | command | verdicts with an INVALID line |
|---|---|---|
| 0.1.0 | `node k01/node_modules/.bin/tiphys validate --type verdict <f>`, grep 'INVALID' | 7 |
| 0.2.0 | `node bin/tiphys.ts validate --type verdict <f>`, grep 'INVALID' | 49 |

Both numbers match DR-0053's table exactly. The 7 files invalid under 0.1.0
(m3-p14-hazard-round2, m3-p14-hazard, m3-p2-hazard, m3-p3-hazard-round3,
m3-p3-hazard-round4, m3-p6-hazard, m3-p7-hazard.yaml) are a strict subset of
the 49 invalid under 0.2.0 (verified: 7 head-missing among them, consistent
with DR-0053's claim that these 7 fail "for the same reasons" under both).

Further reproduced the two-cause breakdown at 0.2.0: 49/49 fail with
"#/head required property head is missing" and 10/49 additionally (or
separately, files can have both) fail with a verdict permitted-values
rejection tied to APPROVE. DR-0053 says "10 documents" for cause 2; measured
10 exactly. DR-0053's cause-2 wording ("APPROVE where the verdict's own
findings trigger it") matches the observed message
"#/verdict value is not one of the permitted values".

Exit code alone (nonzero) is NOT the same signal DR-0053 used; a verdict with
"no context" also exits 1 via SKIPPED checks with no INVALID line (confirmed
on m1-p3-hazard.yaml under 0.1.0: exit 1, zero INVALID lines, four SKIPPED
lines). DR-0053's own table header (line 21) names the exact signal it used,
"verdicts with an INVALID line", and that is the signal that reproduces its
numbers; a nonzero-exit reading would not (49/49 exit nonzero under both
kernel versions). No finding: the document is already precise about this.


### Citation resolution

`node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full --only
citations --evidence <scratch> --base origin/main --head HEAD`: green, "linted
2 changed document(s)... 2 citation(s) resolved, 0 self-citation(s), 0
unverifiable-external". The gate's `documents`/`citationRequired` globs
(src/gates/citations.ts:233-244) cover `delivery/decisions/**/*.md` but NOT
`delivery/review/**` or `delivery/evidence/**`, so only DR-0053 and DR-0054
were linted; `arbitration-m5-p3.md` and the evidence `.txt` file are outside
the gate's document set and were checked by hand instead (see below).

Manually verified each resolving citation:

- DR-0053 line 37: `delivery/decisions/DR-0012-delegated-merge-authority.md:23`
  points at "2. Neither review carries an unresolved finding at high or
  medium severity..." (grep -n confirms line 23 is item 2). Matches DR-0053's
  text "DR-0012 condition 2 is at ...:23". Correct.
- DR-0054 line 24: `src/checks.ts:4924` is inside the same JSDoc-style comment
  block (the DR-0038 falsifiers block starting near line 4905) but the exact
  line is "relaxation." (the tail of the FALSIFIER 2 paragraph), two lines
  before the actual "THE SCOPE IS THE WHOLE COMMITTED CORPUS..." sentence at
  line 4926. Same paragraph block, off by 2 lines from the sentence it is
  cited for. See CR-003 below.

Hand-checked (non-citation-gate) references used in the two review/evidence
files, all outside backticks with path:line where present:

- `arbitration-m5-p3.md:1,4`: "DR-0012-delegated-merge-authority.md:14" -
  resolves to the paragraph beginning "Owner instruction, verbatim..." which
  is the record this arbitration is "under". Correct.
- `arbitration-m5-p3.md:41`: "src/checks.ts:3738" - resolves to
  `function canonicalScalar(raw: string)`, the normalisation function backing
  the "produced-by as a normalised string" claim. Correct in context (the
  function that performs the canonicalisation the sentence describes).
- `m5-p3-merge-preconditions-d74ec42.txt` lines 3-8 cite
  `DR-0012:22` through `DR-0012:27` for conditions 1-6: verified all six
  against `delivery/decisions/DR-0012-delegated-merge-authority.md` (grep -n
  '^[0-9]\.' shows items 1-6 at lines 22-27 exactly, one per condition).
  Correct, exact match.

Both commit shas cited throughout (`d74ec42dc6820d4cd6b501477151cd686f38767e`
the verdict commit, `3f78dce2ee965672ea55423c3fc9a33dddca1145` the reviewed
head) resolve: `git cat-file -t` returns `commit` for both, and
`git log --oneline -1` shows d74ec42 = "M5-P3: both verdicts on 3f78dce, the
reviews and the arbitration" and 3f78dce = "M5-P3 fix round 1: gate results
in the work history". Both are already ancestors of origin/main (main tip
6dc5b06 "M5-P3: a missing review verdict is red, not not-applicable (#213)").

### New arbitration-m5-p3.md vs the pre-existing in-tree copy

`delivery/review/arbitration-m5-p3-reviewed-head.md` already exists on
`origin/main`. Diffed byte-for-byte against the new
`delivery/review/arbitration-m5-p3.md`: identical except one line, which
correctly changes "This in-tree record rules on the REVIEWED head,
3f78dce..." to "Out-of-tree record for the VERDICT COMMIT d74ec42..., which
carries the in-tree record ruling on the REVIEWED head, 3f78dce...". This
matches the file's own stated purpose (committing the out-of-tree copy that
was passed to `--arbitrations` during the hand-run merge-preconditions gate,
per the open question in delivery/work-history/m5-p3.md). No unexplained
divergence.

### Branch name check

`claude/m5-orchestrator-paperwork-2` does NOT match
`^claude/m[0-9]+-p[0-9]+-` (verified with the CLAUDE.md-prescribed node
one-liner: false). Correct per the branch-naming rule; this is paperwork, not
a phase branch, so it must not and does not match the phase pattern.

### ASCII / em dash / control characters

`node scripts/check-authored-bytes.mjs` exit 0 (checked at reviewed head with
PATH set to the Node 26.6.0 toolchain first). Also hand-grepped all four
changed files for literal em dash (U+2014, UTF-8 bytes e2 80 94) and en dash
(U+2013): zero hits. All double-hyphen occurrences found are ASCII "--" used
as a plain separator (e.g. "green -- 2 verdict(s)"), not em/en dashes, and are
not a violation. `grep -qaP '[^\x00-\x7F]'` on each of the four files: all
pure ASCII.


### Supporting evidence for DR-0053/DR-0054's pulse claims

- Pulse's charter.yaml has no `review-families` key today (grep, no match),
  consistent with DR-0053's "pulse also cannot add a review-families
  declaration" being about a real, current gap, not a hypothetical.
- Pulse's 49 verdict files carry 10 distinct `produced-by:` string values
  (claude, claude-fable, claude-fable-5, claude-opus, claude-opus-5,
  claude-sonnet-5, claude-family, and three parenthetical variants),
  confirming the "several produced-by values" premise DR-0053/DR-0054 rely on
  for why a whole-corpus falsifier would currently block pulse from
  declaring a single family.

### Scope / branch-name check

`node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full --only
scope --base origin/main --head HEAD --phase m5-orchestrator-paperwork-2`:
not-applicable, "precondition scope-branch-is-a-phase-branch evaluated and
unmet: branch HEAD does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$". Correct:
this is a paperwork branch and the scope/phase-declaration machinery
correctly does not engage.


### M4-P10 / #158 mechanism check

`git log --oneline origin/main | grep 'M4-P10\|#158'` shows
`0330964 M4-P10: a review document that cannot be read is named, not silently
dropped (#158)`, confirming DR-0053's parenthetical "(M4-P10, #158, as part of
the DR-0047 anchoring)" names the real merge PR that added the required
`head` property. `delivery/work-history/m4-p10.md:336` contains the literal
string "INVALID #/head required property head is missing" as a captured
command result, corroborating the mechanism.

### Findings

**CR-001 (medium).** DR-0053 raises a pending owner action (the 0.2.1
publish go-ahead: "the 0.2.1 publish waits for the owner's go-ahead") but
this branch does not touch `delivery/STATE.md`, so the pending action is not
registered anywhere STATE.md's "Owner actions open" section, and no `A-n` id
was requested for it. CLAUDE.md's durability table is explicit: "Where the
pipeline currently stands | delivery/STATE.md | whenever a phase, decision,
or owner action changes state," and the A-n scheme states STATE.md is "the
sole allocator" for owner actions. DR-0053 being RAISED, with an explicit
owner-facing ask attached, is exactly the trigger that table names. Without
a STATE.md update (or at minimum an A-n id inside DR-0053 itself), the
owner-facing "go-ahead" request has no durable, mechanically-discoverable
home; it exists only inside a decision record's status line. Fix: either add
an `A-n` id to DR-0053's "What needs the owner" section and register it in
STATE.md's open-actions list in this same PR, or a following paperwork PR
before the session that raised DR-0053 ends, per the durability rule's own
"before the producing session ends" clause. Not high: nothing is lost, the
DR-0053 file itself IS a durable record of the ask, and DR-0054 (the more
consequential item, since it is already DECIDED) needs no further owner
action. This is a process-completeness gap, not a factual error or a hazard
in the shipped content.

**CR-002 (low).** `delivery/STATE.md` on `origin/main` still says M5-P3 is
"In flight: ... implementer dispatched 12:50 UTC" (delivery/STATE.md, "M5
standing" section, verified via `tail -60`), while `origin/main`'s tip is
already `6dc5b06 M5-P3: a missing review verdict is red, not not-applicable
(#213)`, i.e. M5-P3 has merged. This staleness PRE-DATES this branch (the
branch does not touch STATE.md at all) so it is not this branch's defect, but
since this branch's whole purpose is to land the M5-P3 follow-up evidence, a
reviewer should know STATE.md's picture of the pipeline is already out of
date independent of this PR. Noting for the record rather than blocking on
it; not this branch's responsibility to fix.

**CR-003 (low).** DR-0054's citation `src/checks.ts:4924` (line 24) resolves
inside the correct comment block (the DR-0038 falsifiers documentation
starting near line 4905) but the specific line is the tail of the FALSIFIER 2
paragraph ("relaxation."), two lines before the sentence it is actually
citing ("THE SCOPE IS THE WHOLE COMMITTED CORPUS...", at line 4926). The
citation resolves and is in the right neighborhood, so the `citations` gate
is (correctly) green; this is a precision nit, not a broken reference.

(No finding on the signal DR-0053 uses. On first read of the table I thought
the document was ambiguous between "an INVALID line" and "a nonzero exit
code"; re-reading it, line 21 of DR-0053 itself already says "verdicts with
an INVALID line" as the table's own column header, which is the exact signal
that reproduces both numbers. Recorded here rather than silently dropped,
since I want the derivation of this non-finding on the record: I confirmed
by direct measurement that a nonzero-exit reading would NOT reproduce 7 (a
verdict validated "with no context" also exits 1 via SKIPPED completeness
checks even with a satisfied schema; `m1-p3-hazard.yaml` under 0.1.0 exits 1
with zero INVALID lines and four SKIPPED lines), so the document's own
wording is the one that matters and it is already precise.)


## Probes run (full list)

1. Diffed origin/main...origin/claude/m5-orchestrator-paperwork-2: exactly
   the 4 files named, 209 insertions, 0 deletions. Matches assignment.
2. Read all four changed files in full.
3. Reproduced DR-0053's 7-vs-49 table exactly, against 49 real pulse verdict
   files, kernel 0.1.0 (installed) and kernel 0.2.0 (this repo's own
   bin/tiphys.ts). Also reproduced the 49/49 "head missing" and 10/49
   "APPROVE rejected" breakdown.
4. Confirmed the 7 files invalid under 0.1.0 are a subset of the 49 invalid
   under 0.2.0 (file-name diff of the two invalid sets).
5. Verified `head` is `required` in schemas/verdict.schema.json (line 9-12).
6. Verified M4-P10 / PR #158 is the real merge that added the required
   `head` field, via git log and delivery/work-history/m4-p10.md:336.
7. Verified DR-0012 condition line numbers 22-27 (all six conditions) exactly
   against delivery/decisions/DR-0012-delegated-merge-authority.md.
8. Verified src/checks.ts:3738 (canonicalScalar) supports the arbitration
   doc's "produced-by compared as a normalised string" claim.
9. Verified src/checks.ts:4924 (DR-0054's citation) resolves inside the
   right comment block, off by 2 lines from the exact sentence cited (low
   finding CR-003).
10. Verified src/checks.ts:4887-4930 (the DR-0038 falsifiers block) matches
    DR-0054's description of "two falsifiers" and "whole committed corpus"
    scope.
11. Read DR-0038 and DR-0012 in full; confirmed DR-0054 narrows only DR-0038's
    falsifier scope and does not touch anything else in either record.
12. Ran the `citations` gate (mode full) against this exact head: green, 2/2
    citations resolved, matching the 2 real path:line citations found by
    grep across the two DR files (the only 2 files the gate's
    `documents`/`citationRequired` globs cover; delivery/review and
    delivery/evidence are outside its declared roots, so those were checked
    by hand instead, see above).
13. Ran the `scope` gate (mode full) against this branch: not-applicable
    (branch is not phase-shaped), which is correct for a paperwork branch.
14. Verified `claude/m5-orchestrator-paperwork-2` does not match
    `^claude/m[0-9]+-p[0-9]+-` with the CLAUDE.md-prescribed one-liner.
15. Ran `node scripts/check-authored-bytes.mjs`: exit 0.
16. Hand-grepped all four files for literal em/en dash bytes and
    non-ASCII bytes: none found.
17. Ran `node scripts/check-id-collisions.mjs`: no collisions; confirms
    DR-0053 and DR-0054 are not reusing a retired id.
18. Diffed the new `delivery/review/arbitration-m5-p3.md` against the
    pre-existing `delivery/review/arbitration-m5-p3-reviewed-head.md` on
    origin/main: one line differs, and it is the expected out-of-tree vs
    in-tree framing change. Also confirmed via src/gates/merge-preconditions.ts
    that the DEFAULT (no --arbitrations) lookup path is exactly
    `delivery/review/arbitration-<phase>.md`, i.e. `arbitration-m5-p3.md`,
    so committing this file at that exact path is a real, useful completion
    of the "left open for a later phase" item named inside the file itself,
    not a redundant duplicate.
19. Verified commits d74ec42... and 3f78dce... exist, are commits, and are
    both already ancestors of origin/main's tip.
20. Confirmed pulse's charter.yaml has no `review-families` key today, and
    pulse's 49 verdicts carry 10 distinct `produced-by` strings, supporting
    the real-world premise behind DR-0053/DR-0054.
21. Checked delivery/STATE.md's current tail for whether DR-0053's pending
    owner action, or DR-0053/DR-0054 themselves, are reflected: they are
    not (CR-001). Also noted STATE.md's M5-P3 status is already stale
    independent of this branch (CR-002, informational).
22. Attempted a full `tiphys gates run --registry gate-registry.yaml --mode
    full` (all applicable gates, no --only) against this head; it was still
    running (suite plus every script gate) when this review concluded. See
    honest-failures.

## Honest failures / not verified here

- The full gate bundle (`--mode full`, no `--only`) did not finish inside
  this review's working window; its output is piped through `tail -40`,
  which only prints after the whole run completes, so nothing was visible
  before I stopped waiting on it. I substituted direct runs of the two gates
  that actually apply to a docs-only diff under this repo's own declared
  roots (`citations`, `scope`), both green/not-applicable as expected, plus
  the standing ASCII/authored-bytes and id-collision scripts, all green.
  I did not independently confirm `manifest-self-check`, `coverage`,
  `credential-scrub`, `clause-map`, `red-witness`, `agent-rules-drift`,
  `brief-drift`, `check-agents-references`, `license`, `typecheck`,
  `gate-classes` on this exact head. None of these plausibly react to a
  4-file delivery/-only diff (no src/, schemas/, roles/ or gate-registry.yaml
  changes), and `citations` (the one gate whose remit most directly touches
  new prose documents) is green, but I am stating this as unverified rather
  than assuming it.
- I did not attempt to reproduce merge-preconditions end-to-end for the
  M5-P3 verdict commit (i.e. re-run the actual gate with --arbitrations
  pointing at a fresh scratch copy of the new file and confirm it still
  reports condition-6 green). I instead verified the STATIC facts the
  evidence file depends on: the DR-0012 line numbers, the commit shas'
  existence and ancestry, and the default-path behavior of the arbitration
  lookup. A full re-run was out of scope for a paperwork-only review and
  would mostly re-test M5-P3's own gate code, not this branch's content.
- Mutation-testing two new tests (part of the standard contract) does not
  apply: this diff adds zero test files and zero src/ changes.
- I did not check whether an `A-n` id should have been minted for DR-0053's
  pending owner action beyond noting its absence (CR-001); I do not have
  write access to allocate one, and it is the kind of judgment call the
  finding itself defers to a fix round or the orchestrator.

## Verdict

FIX-ROUND-NEEDED (paperwork-completeness, not a factual or citation defect).
The factual content of all four files is well-supported: DR-0053's central
7-vs-49 claim reproduces EXACTLY against the real pulse corpus and both
kernel versions, every path:line citation checked resolves to what it claims
to support (one, CR-003, is loosely aimed but still in the right paragraph),
the new arbitration-m5-p3.md is a correct and useful completion of a
previously-open item, ASCII/em-dash/citation gates are clean, and nothing in
the diff contradicts a decided record beyond what DR-0054 explicitly and
narrowly supersedes (DR-0038's whole-corpus falsifier scope; DR-0038 is
otherwise left standing, as stated). The one real gap is CR-001 (medium):
DR-0053 creates an owner-facing ask (the 0.2.1 publish go-ahead) that this
branch does not register in delivery/STATE.md or as an A-n id, which is the
durability rule's own trigger ("whenever ... an owner action changes
state"). That is a one-line-ish fix (add the A-n and a STATE.md entry, or
fold the ask into STATE.md's existing "Owner actions open" list) and does
not call into question anything already shipped or any number already
reproduced; it is why the verdict is FIX-ROUND-NEEDED rather than APPROVE
with only low findings.
