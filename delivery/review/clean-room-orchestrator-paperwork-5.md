# Clean-room review: PR #219, orchestrator paperwork 5 (kernel 0.2.1 records)

- reviewed head: d5a70aa24fa3003f90fd6ad2b1566788a9f9bd4c
- branch: claude/m5-orchestrator-paperwork-5
- base: main at 2c49ab39d25b08783c8dd6422e96adc38de222f2
- produced-by: claude-sonnet-5
- framing: hazard-attack, criteria-contract combined (quick review)
- date: 2026-09-24

## Scope confirmed

`git diff --stat origin/main d5a70aa` shows exactly 5 files, all under
`delivery/`: STATE.md, DR-0057-a-non-phase-branch-merges-with-condition-5-not-applicable.md,
two evidence-capture .txt files, and work-history/orchestrator-paperwork-5.md.
This matches PR #219's own description ("Documents only, all under
`delivery/`"), fetched live via the GitHub API (5 changed files, +366/-10),
and the coordinator's framing of the PR. No code, test, or schema path is
touched, so no build/test run was required for this checklist and none was
run.

## Item 1: factual claims checked against the API and the repo

All checked live this session, no discrepancy found:

| claim | check | result |
|---|---|---|
| v0.2.1 tag exists, peels to 2c49ab3 | `mcp__github__get_tag` | matches: tag object, peeled commit 2c49ab39d25b08783c8dd6422e96adc38de222f2, tagged 2026-09-24T08:52:19Z |
| v0.2.1 GitHub release published at the stated timestamp | `mcp__github__get_release_by_tag` | matches: published_at 2026-09-24T08:52:21Z, body names 2c49ab3 and run 35976386843 |
| release workflow run 35976386843 succeeded on 2c49ab3 | `mcp__github__actions_get` | matches: conclusion SUCCESS, head_sha 2c49ab3..., event workflow_dispatch |
| PR #216 head 8a00c96, merged | `mcp__github__pull_request_read` (get) | matches: merged true, head.sha 8a00c96ce3..., merged_at 2026-09-24T07:43:17Z |
| PR #218 head a957a95, merged | `mcp__github__pull_request_read` (get) | matches: merged true, head.sha a957a9590..., merged_at 2026-09-24T08:37:54Z |
| npm `@tiphys/kernel` latest is 0.2.1 | `npm view @tiphys/kernel dist-tags --json` | matches: `{"latest":"0.2.1"}`; `npm view ... versions --json` lists 0.0.0, 0.1.0, 0.2.0, 0.2.1 |
| the two merge-preconditions captures read 7 green / condition-5 red | read both files in full | matches exactly, both captures: verdict-selection, conditions 1-4 and 6, and branch-protection all green; condition-5 red with "reads not-applicable, not green" on both |
| PR #219's own diff matches its description | `mcp__github__pull_request_read` (get, #219) | matches: 5 changed files, description lists the same four artifact groups the diff shows |

Not independently re-verified this round (would have needed the eight
gates/macOS-smoke run ids and the #217 push run, all already checked once by
the orchestrator's own work history with full run ids, conclusions and head
shas): those are taken on the work history's word, consistent with the
~10-minute budget and the fact that the two claims most load-bearing for this
PR's own new content (the tag, release, npm dist-tag, and the two merged PRs
that DR-0057 is about) were all independently re-checked and matched.

## Item 2: DR-0057 represents the condition-5 decision honestly

Read DR-0057 in full. It:

- states plainly that condition-5 read red on both merges, not green, and
  quotes the exact mechanism (`src/gates/merge-preconditions.ts:533`
  treats every non-green scope status as unmet, and the scope gate reported
  not-applicable because neither branch has a phase declaration);
- calls the decision a judgment under DR-0012/DR-0016, not a passed gate;
- names what was checked BY OTHER MEANS in place of the automated check
  (reviewer diff confirmation, verdict-selection admitting only verdicts
  naming the reviewed head, CI green on the exact audited head and on the
  post-merge push head), each with a citation;
- has a section titled "What the orchestrator had assumed, and was wrong
  about," admitting the release bump was wrongly assumed to be below the
  dual-review tier, and correcting itself against the gate's own source
  (`src/gates/merge-preconditions.ts:876`, `:853`, `:893`);
- has a section titled "The tool gap" that states outright "merge-preconditions
  has no arm for a non-phase branch that touches the dual-review tier," and
  records it as an open, undecided follow-up rather than closing it.

This is not framed as a pass. It is framed as a documented exception, with the
mechanism named, the workaround stated, and the gap left open for a future
gate change. No finding here.

## Item 3: A-17 against the pulse M4-exit-test file, and A-14

Read `delivery/verification/m4-exit-test-pulse.md` at
`origin/claude/m5-p1-pulse-value-proof:5971cc4` in full. Checked A-17's three
claims in STATE.md against it:

1. **Reviewed head vs. merged head.** The source file's table: last reviewed
   head `dd6adff` (round-2 hazard verdict, FIX-ROUND-NEEDED, one medium
   HZ-M3P4-R2-01); PR #22 merged head `ec51961`, two commits later
   (`5a48bc8`, `ec51961`), neither named by any verdict. A-17's summary states
   this exact gap. Match.
2. **No CI.** Source file: "Pulse has no CI workflow (`GET /actions/workflows`
   lists zero), and no run exists for `b7036d7`." A-17 states pulse has no CI
   and no post-merge push run. Match.
3. **No charter-shaped deploy verification.** Source file: "Deploy
   verification from the pilot's own pushed evidence: NOT MET... Vercel's
   `success` shows the build deployed; it does not run the charter's
   candidate check." A-17 states the same: a Vercel production deploy was
   observed, which is not the charter's candidate check. Match.

A-17's overall framing ("the M4 exit test is NOT discharged... The next call
is the orchestrator's") also matches the source document's own top-line
status and its closing line ("Whether rows 3 to 5 are accepted as they stand
... is not this phase's call. It goes to the orchestrator.").

**A-14 is not closed by this PR.** The source document's own header states
"A-14 is done (2026-09-24)" on the pulse-value-proof branch itself (the
reboot and the pulse M3-P4 run/merge happened), which is a fact about that
other branch, not something this PR asserts. Read against STATE.md's diff:
A-14's register text was edited to explicitly say it is not closed by PR
#219 and closes when M5-P1 merges to main. That is the correct scoping: A-14
(the owner reboot + kernel bump) is different from, and is not resolved by,
this paperwork PR, and A-17 (the M4 exit test discharge) is a new, separate,
open item. No finding.

## Item 4: STATE.md rewrites nothing beyond what the PR says

Diffed `origin/main..d5a70aa -- delivery/STATE.md` in full and compared
against PR #219's own description. Every hunk matches a line item the
description names: the standing header moved to 2c49ab3; three new merge-log
rows (#217, #216, #218); the 0.2.1 release paragraph; the "In flight" section
losing the 0.2.1 item (superseded by the release) and M5-P1's entry pointing
at A-17; the new A-17 register entry; A-14's text updated to state it is not
closed here; A-15 refreshed with newer evidence; the DR-0057 line under
"Owner decisions open"; and the "Kernel 0.2.1 follow-ups" list of seven
tracked obligations. No section outside these was touched. No finding.

## Verdict

**APPROVE.** No findings. All four checklist items confirmed, all facts
checked matched, DR-0057 is honestly framed as judgment plus tool gap, A-17
accurately reflects the source verification file and correctly leaves A-14
open (closed instead by the M5-P1 branch), and STATE.md's diff contains
nothing beyond what the PR describes.
