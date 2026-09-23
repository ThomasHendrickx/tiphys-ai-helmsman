# Clean-room review: origin/claude/m5-orchestrator-paperwork-4

Date: 2026-09-23
Branch: origin/claude/m5-orchestrator-paperwork-4 (docs-only)
Base: origin/main
Contract: facts, STATE.md owner actions, test/retirement-inventory.test.ts, ASCII/em-dash, citations
Model family: Claude Sonnet 5
Method: clean-room, working from a fresh worktree, no implementer context

Status: COMPLETE

## Setup

Fetched origin/main (209004bac6076318fe23d6fc89148fa9eb787c88) and
origin/claude/m5-orchestrator-paperwork-4 (33b2e911619470d9ba016fa711f3f53a45b3981f).
Checked out the branch head detached. Diff stat: delivery/STATE.md (+20/-9
edited), delivery/decisions/DR-0056-m5-p5-after-the-third-review-contract.md
(new, 48 lines), delivery/evidence/m5-p5-merge-preconditions-c9f14d9.txt (new,
2 lines). Matches the task description of three files.

## Fact checks (GitHub REST API via curl)

- PR #215: GET /repos/ThomasHendrickx/tiphys-ai-helmsman/pulls/215 returns
  merged=true, merge_commit_sha=209004bac6076318fe23d6fc89148fa9eb787c88.
  Matches STATE.md's row `| M5-P5, context diet | #215 | 209004b | gates
  35927282691 success |` and matches `origin/main` HEAD exactly.
- PR #214: pulls/214 returns merged=true, merge_commit_sha=
  b16f20008ef9c3b4b62c0007eb7d0178f08dc74d. Matches STATE.md's row
  `| paperwork: DR-0053, DR-0054, M5-P3 evidence | #214 | b16f200 | gates
  35897702941 success |`.
- Run 35897702941: GET /repos/.../actions/runs/35897702941 returns
  name=gates, event=push, head_sha=b16f20008ef9c3b4b62c0007eb7d0178f08dc74d,
  conclusion=success, status=completed. Matches PR #214's merge commit sha
  exactly (T-009's post-merge push-run-on-the-new-head requirement satisfied).
- Run 35927282691: GET /repos/.../actions/runs/35927282691 returns
  name=gates, event=push, head_sha=209004bac6076318fe23d6fc89148fa9eb787c88,
  conclusion=success, status=completed. Matches PR #215's merge commit sha
  and current origin/main HEAD exactly.
- `git log --oneline -8 origin/main` confirms 209004b is
  "Merge pull request #215 from ThomasHendrickx/claude/m5-p5-context-diet"
  and its parent chain (c9f14d9, c1be4a8, ca8d36b, d353faf, ...) matches the
  round heads DR-0056 and the arbitration file cite.
- Verdict: all four facts in STATE.md's two new table rows (PR numbers, merge
  commit shas, run ids, conclusions) check out against GitHub directly, not
  just against each other.

## DR-0056 round history against delivery/review/arbitration-m5-p5-reviewed-head.md

Read delivery/review/arbitration-m5-p5-reviewed-head.md:1 (present on main,
unchanged by this branch's diff). Its round table:

- round 0, head 681efcd: Opus criteria FIX-ROUND-NEEDED (1 medium, 5 low),
  Sonnet hazard FIX-ROUND-NEEDED (1 high).
- round 1 (fix round), head ecab915: Opus criteria FIX-ROUND-NEEDED (3
  medium, 2 low), Sonnet hazard FIX-ROUND-NEEDED (2 high).
- fresh round, head d353faf then c1be4a8: Sonnet criteria APPROVE, then
  APPROVE with no finding; Fable hazard FIX-ROUND-NEEDED (2 medium), then
  APPROVE with 5 accepted low.

DR-0056's "The situation" section states exactly this: round 0/681efcd a high
finding on the same mechanism (guards testing text existence not binding
force); fix round 1/ecab915 the same high recurring; fresh round/d353faf-c1be4a8
change from denylist to allowlist, Sonnet criteria APPROVES, Fable hazard
finds 2 mediums named CR-001 (inline markup) and CR-002 (container marker at
four-space indent inside a list item).

Cross-checked CR-001 and CR-002 against delivery/review/clean-room-M5-P5-fable-hazard.md:179
("CR-001 (medium, fixable): inline markup keeps a paragraph rule in binding
force") and :212 ("CR-002 (medium, fixable): container markers inside a
four-space list continuation are read as list text"). Both match DR-0056's
descriptions verbatim in substance.

No discrepancy found between DR-0056's round history and the arbitration
record or the underlying review file.

## Merge-preconditions evidence file check

delivery/evidence/m5-p5-merge-preconditions-c9f14d9.txt:2 claims the diff
origin/main...c9f14d9d5cc173e38e340d759aaea9420f17f5dd changes 16 paths, all
below the dual-review tier per DR-0027.

`c9f14d9` is an ancestor of the current origin/main (it is one of PR #215's
commits), so diffing it against the current origin/main is empty by
construction; the meaningful diff is against the PRE-#215 main head, which
was b16f200 (PR #214's merge commit, per STATE.md's own table). Ran:

```
git diff --name-only b16f20008ef9c3b4b62c0007eb7d0178f08dc74d c9f14d9d5cc173e38e340d759aaea9420f17f5dd
```

Output: exactly 16 paths (CLAUDE.md, delivery/STATE.md,
delivery/plan/cutover/retirement-inventory.json,
delivery/plan/cutover/retirement-inventory.md,
delivery/review/arbitration-m5-p5-reviewed-head.md,
delivery/review/clean-room-M5-P5-fable-hazard.md,
delivery/review/clean-room-M5-P5-opus-criteria.md,
delivery/review/clean-room-M5-P5-sonnet-hazard.md,
delivery/review/m5-p5-criteria.json, delivery/review/m5-p5-hazard.json,
delivery/review/verification-M5-P5-fix-round-opus.md,
delivery/review/verification-M5-P5-fix-round-sonnet.md,
delivery/review/verification-M5-P5-fresh-round-sonnet-criteria.md,
delivery/work-history/m5-p5.md, test/behaviors.json,
test/retirement-inventory.test.ts). Count (16) and the first 8 named paths
match the evidence file's list exactly.

delivery/decisions/DR-0027-reviews-target-shipped-value-not-ceremony.md
exists on the reviewed tree, confirming the citation resolves to a real
decision record (not verifying its substantive content against this specific
diff, which would need reading DR-0027's tier definitions; flagged as an
honest-failure item below, low stakes given the other facts check out).

## Owner actions preserved in STATE.md

Compared origin/main's "Owner actions open" section (A-14, A-15, A-10, A-9
and A-8, plus the full register at delivery/STATE.md:73 onward, unchanged by
this diff) against the branch's version. All four summary bullets are
present on the branch, in the same order, with the same ids:

- A-14: content extended (pulse status update), id and substance preserved.
- A-15: byte-identical.
- A-10: byte-identical.
- A-9 and A-8: byte-identical.

The "Owner decisions open" section correctly moved from listing the open
DR-0053 npm-publish question to "None", since DR-0053 and DR-0056 (this
branch's own new decision) are both now DECIDED. No owner action or open
decision was silently dropped.

## test/retirement-inventory.test.ts

Ran on the branch head (33b2e91) with node v26.6.0
(/tmp/claude-0/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/node-v26.6.0-linux-x64/bin
first on PATH, `node --version` confirmed v26.6.0 in the same shell):

```
node --test test/retirement-inventory.test.ts
```

Result: `tests 56`, `pass 56`, `fail 0`, `cancelled 0`, `skipped 0`,
`todo 0`, duration 9625ms. Full suite green, no skips.

## ASCII and em-dash check

Ran the repository's own checker on the branch head with node v26.6.0:

```
node scripts/check-authored-bytes.mjs
```

Exit 0, no output (clean). Independently verified with a byte-level Python
scan of the three changed files (decode as strict ASCII, count bytes > 127):
all three report 0 non-ASCII bytes and decode as pure ASCII. No em dash
(U+2014) or any other non-ASCII byte in any of the three files.

## Citations

Read src/gates/citations.ts:234 (the `documents` glob list) and
src/gates/citations.ts:241 (`citationRequired`). Findings:

- `citationRequired` covers only `delivery/plan/**/*.md` and
  `delivery/verification/**/*.md`. Neither delivery/decisions/**/*.md (DR-0056)
  nor delivery/STATE.md is in that set, so the zero-substantive-citations red
  arm at src/gates/citations.ts:1366 does not apply to either changed
  document even if they carried none.
- `delivery/evidence/m5-p5-merge-preconditions-c9f14d9.txt` is not in the
  `documents` glob set at all (only `.md` under those trees, or the literal
  `delivery/STATE.md`), so the citations gate does not lint it (confirmed by
  reading the "changedDocuments" filtering loop at src/gates/citations.ts:1260).
  Its bare-path mentions (`CLAUDE.md: none`, `delivery/STATE.md: none`, etc.,
  with no line numbers) are correctly not citations under rule 3b and are not
  expected to be.
- DR-0056 carries one real citation: `delivery/decisions/DR-0012-delegated-merge-authority.md:34`.
  Verified by reading that file: line 34 reads "Stop and wait rather than
  grind. If a phase needs more than two fix rounds after its first dual
  review, or if a high-severity finding recurs in the same component across
  rounds, the orchestrator stops merging that phase and leaves it for the
  owner with the evidence." This is exactly the rule DR-0056 invokes to
  justify the fresh-implementer/third-review-contract path. Citation
  resolves and is substantively on-point, not just syntactically valid.
- The STATE.md diff's added/touched lines
  (`git diff ... -- delivery/STATE.md | grep '^+' | grep -oE
  '[A-Za-z0-9_./-]+\.[a-z]+:[0-9]+'`) contain zero path:line citation tokens.
  Since STATE.md is not citationRequired, this is not a defect, only a fact
  worth recording: the standing update relies on the existing unchanged
  citations elsewhere in the file.
- No out-of-range or malformed citation found in any of the three files.

## Probes run (including ones that found nothing)

- `git diff origin/main...origin/claude/m5-orchestrator-paperwork-4 --stat`
  and full diff: confirms exactly 3 files touched, matches task description.
- GitHub REST API (`curl`, agent-proxy credential substitution per CLAUDE.md
  standing warning 6): PR #215, PR #214, run 35897702941, run 35927282691,
  all confirmed live and matching STATE.md's claims.
- `git log --oneline -8 origin/main`: confirms 209004b is PR #215's merge
  commit and its ancestor chain matches DR-0056's round heads
  (c9f14d9, c1be4a8, ca8d36b, d353faf).
- Read delivery/review/arbitration-m5-p5-reviewed-head.md (unchanged by this
  branch) and delivery/review/clean-room-M5-P5-fable-hazard.md (unchanged):
  DR-0056's round history and CR-001/CR-002 descriptions cross-checked
  against both, no discrepancy.
- `git diff --name-only b16f200... c9f14d9...`: confirms the evidence file's
  "16 path(s)" claim and the first 8 named paths exactly.
- Confirmed DR-0027, DR-0012, DR-0053, DR-0054 all exist as files on the
  reviewed tree (citation/reference targets are real documents, not
  fabricated ids).
- Searched for an em dash and any non-ASCII byte in all three changed files:
  none found (two independent methods, the repo script and a Python scan).
- Searched STATE.md's "Owner actions open" and full owner-action register
  for any action present on main but missing on the branch: found none;
  all four ids (A-14, A-15, A-10, A-9/A-8) present in the same order.
- Ran test/retirement-inventory.test.ts in isolation on node v26.6.0 from
  the branch head: 56/56 pass, 0 skipped.
- Checked whether the citations gate would lint delivery/evidence/*.txt at
  all (it does not, by design, per the `documents` glob set), so the
  evidence file's lack of path:line citations is not a gate violation.

## Honest failures / not independently re-verified

- Did not re-run the full `tiphys gates run --registry gate-registry.yaml`
  citations gate as a program against this exact head; instead verified its
  matching logic by reading src/gates/citations.ts and applying its documented
  rules by hand to the three changed files. The hand-applied result agrees
  with what the gate's own code says it would do, but this is not the same
  as an execution trace.
- Did not verify DR-0027's own substantive tier definitions (only confirmed
  the file exists and is a real decision record); the merge-preconditions
  evidence file's claim that all 16 paths are "below the dual-review tier"
  was checked for path-set accuracy (16 paths, first 8 named match) but not
  independently re-derived from DR-0027's tier rules.
- Did not re-run the fresh-round and fix-round reviews themselves (m5-p5
  work is on main already, out of scope for this docs-only branch); only
  cross-checked DR-0056's narrative against the existing arbitration and
  review files for internal consistency.
- Did not mutation-test any of the 56 retirement-inventory tests (this
  branch adds no new test; the tests are pre-existing and their suite was
  run only to confirm the branch does not break them, per the task's
  explicit ask). No new behavior was added by this branch, so there was no
  new test to mutation-test or register in test/behaviors.json, and none was
  expected.
- Did not check `git status` for a clean build after `npm run build`
  (out of scope: this is a docs-only branch touching no source, and the task
  did not ask for a build gate run).

## Findings

None. No CR-nnn findings raised. Every fact checked (PR numbers, merge
commit shas, CI run ids and conclusions, DR-0056's round history against the
arbitration record, the merge-preconditions evidence file's path count and
DR-0027 reference, STATE.md's owner-action preservation) resolved true
against live GitHub data or the unchanged files on the reviewed tree. The
retirement-inventory suite is green with no skips. All three files are pure
ASCII with no em dash. Citations resolve, and the one substantive citation
(DR-0056's DR-0012:34 reference) is on-point, not merely syntactically valid.

## Verdict

APPROVE



