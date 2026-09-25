# M5-P1 Clean-room Review Criteria

Phase: M5-P1, pulse value proof
Branch: origin/claude/m5-p1-pulse-value-proof
Head: 3d61080d180c5e9d53867e192a42f7a3301de6e4
Base: origin/main at 9813a86bc51f7757e21e19dbf2dd19deb6383abe (correctly
re-fetched from the real GitHub remote; the local clone at
/home/user/tiphys-ai-helmsman carries a stale local branch "main" at 3b40118
that is NOT the same ref as its own origin/main tracking ref, which was the
source of a misleading first diff. Fetched directly from
https://github.com/ThomasHendrickx/tiphys-ai-helmsman instead.)
Toolchain: node v26.6.0 (scratch toolchain on PATH)
Worktree: full clone at
/tmp/claude-0/-home-user/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/m5p1-review/wt
(a plain clone, not a git-worktree, because every existing worktree already
had this branch name checked out and locked; git worktree add/remove for the
conflicting worktrees was denied as destructive by the sandbox, so a clone
was the safe route to get a local branch of the exact required name.)

## Setup notes

- Worktree branch naming: local branch `claude/m5-p1-pulse-value-proof`
  created in the clone, matching the phase declaration's own branch field.
- git diff origin/main...HEAD after the correct fetch: 7 files changed, 1851
  insertions(+), 26 deletions(-): delivery/STATE.md,
  delivery/decisions/DR-0060-*.md, delivery/plan/phase-declarations/m5-p1.json,
  delivery/verification/m4-exit-test-pulse.md,
  delivery/verification/pulse-re-probe-m5.md, delivery/work-history/m5-p1.md,
  test/retirement-inventory.test.ts. No pulse repository content or ref
  update appears in the diff.

## Acceptance criteria (delivery/plan/value-delivery-plan.yaml:62-91)

### p1-trigger

Criterion: node scripts/check-cutover-entry.mjs --fleet <fleet home> exits 0
with drain, exclusion, retirement and pre-freeze-ruleset satisfied.

Evidence in delivery/verification/m4-exit-test-pulse.md:48-89 (Part 1, Step
1). The captured run shows all four arms satisfied, exit 0, against a copy
of the real kernel fleet home (not a scratch tiphys init fleet), with an
honest caveat about what "drain" is worth on a rehydrated clone (worktrees/
half empty by construction). MET, well supported.

### p1-probe

Criterion: node scripts/probe-pilot-readonly.mjs --out
delivery/verification/pulse-re-probe-m5.md exits 0, names every target,
observed head, transport and excluded write operation.

Evidence at delivery/verification/m4-exit-test-pulse.md:91-125 and the
target file itself (98 lines). Third run exits 0, OVERALL satisfied, names
pulse and pulse-fleet, both heads, and the corrected explanation of why the
first two runs refused (proxy env var, not the attach, contradicting an
earlier draft, and the correction is stated). MET.

### p1-value

Criterion: delivery/verification/m4-exit-test-pulse.md names one pulse
phase, reviewed head, merged PR, post-merge push run and deploy
verification, every artifact resolving, every conclusion tied to an exit
code or API result.

Part 3 (pulse M3-P5, PR #25) is the operative record. Spot-checked against
the live pulse repository via the GitHub REST API (see below); every
decisive claim I checked matched exactly. Row 5 (deploy verification) is
NOT MET as originally written; DR-0060 is the owner decision that accepts
pulse's CI push run in its place, and it is recorded honestly as a
relaxation, not a re-labelling. MET, with DR-0060 doing legitimate work.

### p1-boundary

Criterion: git diff on this phase contains no pulse repository content or
ref update; the report states the owner performed the reboot action.

git diff origin/main...HEAD confirmed clean of pulse content. STATE.md and
the work history both state the owner performed the reboot (A-14) and that
this phase only read pulse, never wrote to it (DR-0037). MET.

## Spot-checks against the live pulse repository (read-only REST, $GH_TOKEN)

All matched the documents exactly:

- GET /repos/ThomasHendrickx/pulse/pulls/25: merged true, merge_commit_sha
  35d2e55..., head 98fbadc..., merged_at 2026-09-24T17:12:07Z, base main,
  merged_by ThomasHendrickx. Matches m4-exit-test-pulse.md:405-409.
- GET /repos/ThomasHendrickx/pulse/commits/35d2e55 and .../commits/98fbadc:
  both trees equal 8edba117..., parents dff0824 and 98fbadc. Matches
  m4-exit-test-pulse.md:410-413.
- GET /repos/ThomasHendrickx/pulse/actions/runs/36035853808: head_sha
  1796ff8..., event push, status completed, conclusion success. Matches.
- GET /repos/ThomasHendrickx/pulse/actions/runs/36032643312 (the 35d2e55 push
  run): conclusion cancelled. Matches the cancelled-run claim.
- GET /repos/ThomasHendrickx/pulse/deployments?sha=35d2e55...: one Production
  deployment, id 6643693281; its status success, creator vercel[bot].
  Matches DR-0060's row.
- GET /repos/ThomasHendrickx/pulse/contents/charter.yaml?ref=1796ff8:
  release-verification mode reserved, matching DR-0060 and the exit-test
  document's row 5 analysis.

## Gates run (this worktree, mode full, --phase m5-p1, --base origin/main
--head HEAD)

- scope: GREEN. 7 changed paths audited against
  delivery/plan/phase-declarations/m5-p1.json at merge base 9813a86. Two
  entries ADDED at head, named by the gate for sign-off:
  filesToTouch delivery/decisions/DR-0060-...md and
  filesToTouch test/retirement-inventory.test.ts.
  SIGNED OFF: both are legitimate. The DR file is a normal owner-decision
  artifact raised during the phase (durability table). The test edit is the
  required update to an append-only-registry test that had hardcoded "A-14"
  as an open-action exemption (CLAUDE.md convention 5); M5-P1 closes A-14 in
  STATE.md, so the test asserting the list is empty is the correct
  companion edit, not scope creep. Verified: node --test
  test/retirement-inventory.test.ts, node v26.6.0: 56 tests, 56 pass,
  0 fail, 0 skipped.
- citations: GREEN. Linted 4 changed documents at 3d61080: 43 citations
  resolved, 0 self-citations, 0 unverifiable-external.

## Claim-grep (fix-round contract, applied to the work history even though
this phase is not a fix round, because it is the applicable durable
discipline for overclaiming)

grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|
recovers|anyway|always|never|no way to' delivery/work-history/m5-p1.md:
one hit, line 479, "the row cannot be filled with a GitHub Actions run,
because none exists." Adjacent evidence: GET /actions/workflows lists zero
workflows, GET /actions/runs?head_sha=... total 0. The claim is settled by
the adjacent captured command. Wrap-insensitive form (tr + grep) also finds
exactly one hit ("cannot be"), so nothing is hidden by hard-wrap.

check-authored-bytes.mjs: exit 0.
check-id-collisions.mjs: no collisions; DR-0060 and the surrounding ids are
clean; next free DR-0061, next free T-048.

## One finding

STATE.md's short "Owner actions open" summary bullet for A-14 (line ~121,
unchanged by this branch, inherited verbatim from origin/main) still reads
"it closes when M5-P1 merges, not here" -- true of `main` before this branch
merges, but on THIS branch the full owner-action register entry for A-14
(further down in the same file, in the section this phase DID edit) is
already updated to "DONE". So within the same commit, one part of STATE.md
says A-14 is still open pending merge and another part says it is DONE.
Low severity: it is a self-resolving staleness (the short bullet is
accurate again the moment this phase merges, since STATE.md is read at
`main` from then on), does not affect any acceptance criterion, and does
not misstate anything that matters to a decision. Listed as a low finding
rather than folded into "resolved", since it was not actually fixed on this
branch.

## Verdict

APPROVE. All four acceptance criteria are met, spot-checked claims matched
live pulse data exactly, DR-0060 is faithfully applied and honestly scoped,
scope and citations gates are green, and the one finding is low severity
and non-blocking.

## Validation

node bin/tiphys.ts validate --type verdict m5-p1-criteria.json: exit 0
(schema-level checks pass; several cross-document checks SKIPPED "no
context", expected for a standalone verdict file not yet paired with its
counterpart review).

No commit or push was made from the review worktree.
