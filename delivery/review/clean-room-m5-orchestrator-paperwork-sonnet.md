# Clean-room review: claude/m5-orchestrator-paperwork (PR #212)

Date: 2026-09-23
PR: #212, ThomasHendrickx/tiphys-ai-helmsman
Head SHA reviewed: 8d16042
Contract: paperwork correctness (factual claims, citations, tuition format, claim-grep, authored-bytes)
Model family: Claude Sonnet 5
Method: clean-room, isolated worktree, GitHub REST API probes via curl (unauthenticated,
proxy-substituted per standing warning 6), local script runs on node v26.6.0

## Files under review

- delivery/STATE.md
- delivery/tuition/T-046-an-agent-killed-another-agents-tests-by-pattern.md
- delivery/verification/cutover-status-tree-digest-intermittent.md

Confirmed the diff is exactly these three files:
`git diff --name-only origin/main...HEAD` -> the three paths above, nothing else.

## Verdict: FIX-ROUND-NEEDED

Two medium findings (CR-001, CR-003) and one low (CR-002). No high findings.
The document's SUBSTANCE (run ids, shas, PR numbers, test names, exact digests,
exact test counts) all checked out exactly against the GitHub API and CI logs.
The defects found are both in the SAME general shape the project has been
burned by before: a citation that resolves but points at the wrong content,
and a registry entry (A-14) referenced but never allocated in its sole
register.

## Findings

### CR-001 (medium): T-046's C-2 citation resolves to the wrong content

delivery/tuition/T-046-an-agent-killed-another-agents-tests-by-pattern.md:21
reads: "Constraint C-2 is in the rules file's Never list, CLAUDE.md:1."

CLAUDE.md:1 is the document's title line (`# Tiphys kernel: repository
rules`), not the Never list and not C-2. The actual C-2 bullet ("Never use
pid, process liveness, signals, or `/proc` for identity or exclusion") is at
CLAUDE.md:1343, confirmed by:

```
grep -n "Never use pid, process liveness" CLAUDE.md
1343:- Never use pid, process liveness, signals, or `/proc` for identity or
```

This is exactly the failure mode CLAUDE.md itself names at CLAUDE.md:167-176
(rule 3b): a citation that is syntactically valid and resolves silently
against the wrong line. It will satisfy the `citations` gate mechanically
(the path exists, the line exists) while asserting something false about
what is at that line. Fix: cite CLAUDE.md:1343 instead.

### CR-002 (low): T-046's "not on this branch" claim about the work history file is false

delivery/tuition/T-046-an-agent-killed-another-agents-tests-by-pattern.md:18-21
says the implementer's report is the evidence, "in
`delivery/work-history/release-verify-waits-for-registry.md` on the branch
`claude/release-verify-waits-for-registry` (quoted, because it is not on this
branch)."

The file IS on this branch. PR #211 (which added that work history file) was
merged to `main` at 12:09:29Z on 2026-09-23 (merge_commit_sha
ac98d3cab25d3260405caadd21e7d048237e85fc, confirmed via
`GET /repos/.../pulls/211`), and `claude/m5-orchestrator-paperwork` is cut
from `main` after that merge. Confirmed directly:

```
test -f delivery/work-history/release-verify-waits-for-registry.md && echo EXISTS
EXISTS
```

The backtick-quoting itself is harmless (CLAUDE.md:3b permits quoting
deliberately), but the stated REASON for quoting is a factual claim that does
not check out. Low impact: this paragraph's substance (that the report is the
implementer's own, self-reported) is unaffected, and the document already has
a real resolving citation elsewhere. Fix: either drop the parenthetical or
cite delivery/work-history/release-verify-waits-for-registry.md:1 directly,
since it does resolve on this branch.

### CR-003 (medium): owner action A-14 is referenced twice but never allocated in the register

delivery/STATE.md's new section (added by this PR, starting at STATE.md:2704)
references "A-14" twice:

- STATE.md:2725: "M5-P1, pulse value proof: `claude/m5-p1-pulse-value-proof`,
  waiting on A-14."
- STATE.md:2732: "A-14: restart pulse and bump pulse-fleet to kernel 0.2.0."

Neither line is inside the "Owner action items" section, which starts at
STATE.md:1584 and is, per CLAUDE.md's identifier-schemes section, "the sole
allocator" of A-n ids: "a plan that needs a new action asks for an id rather
than picking one." That section currently registers A-9, A-15, and A-10 as
full bolded entries with a description of what the owner must do and why an
agent cannot do it. A-14 has no such entry anywhere in the file:

```
grep -n "A-14" delivery/STATE.md
2725:... waiting on A-14.
2732:- A-14: restart pulse and bump pulse-fleet to kernel 0.2.0.
```

Both hits are inside the new, informal "Owner actions open" bullet list this
PR adds at the bottom of the file, not the canonical register. This is the
exact shape CLAUDE.md's identifier-schemes section warns about (the A-3/A-4
collision story): an id used informally outside the sole allocator risks
being picked again for something else later, since nothing that reads the
allocator section would see A-14 reserved. `check-id-collisions.mjs` does not
cover A-n (it only covers T-nnn and DR-nnnn, per its own stated scope and
CLAUDE.md's text), so this is not caught by any gate.

Fix: add a proper A-14 entry to the "Owner action items" section (what the
owner must do, why an agent cannot do it, and when it was opened), matching
the format of A-9, A-10, and A-15.

## What checked out exactly (probes run, all positive)

All of the following were verified directly against the GitHub REST API
(unauthenticated `curl`, proxy-substituted per CLAUDE.md standing warning 6,
confirmed by `GET /rate_limit` returning a 15000 core limit with no
Authorization header) and against CI job logs, not by trusting the document:

1. PR numbers and merge commits in STATE.md's "Merged" table:
   - #209 "M5-P4, CI tells the truth about what it ran" -> merge_commit_sha
     8558dca9e8..., matches the table's `8558dca`.
   - #211 "Release verification waits for the registry to serve the version"
     -> merge_commit_sha ac98d3cab2..., matches `ac98d3c`.
   - #207 "M5-P2, charter intent into briefs..." -> merge_commit_sha
     5662d740ae..., matches `5662d74`.
2. All three cited `push`-event `gates` run ids resolve, are `event: push`,
   `conclusion: success`, and have the exact head_sha the table claims:
   35847665771 (8558dca, attempt 1), 35858746022 (ac98d3c, attempt 1),
   35862907311 (5662d74, attempt 2 as claimed; attempt 1 was a failure,
   matching "went red once on attempt 1").
3. Verification note's PR #211 run: 35853273549 / job 107155726142 has
   head_sha 5de114c9bc... (matches `5de114c`) and head_branch
   `claude/release-verify-waits-for-registry`. Its log shows, verbatim:
   `tests 1409`, `pass 1408`, `fail 1`, the failing test
   "a fleet with many pushed unmerged branches and no in-flight work drains
   clean and exits 0" at test/cutover.test.ts:2005 (confirmed against the
   working tree: `grep -n '^test("a fleet with many pushed'` -> line 2005
   exactly), the exact two sha256 digests quoted in the note, and the stack
   frame `at statusRun (test/cutover.test.ts:1863:10)` (statusRun's
   `assert.equal` is at line 1863 in the working tree). The digest helper
   citation test/cutover.test.ts:1767 also resolves exactly
   (`function treeDigest`).
4. PR #211's changed files (`GET /pulls/211/files`) do not include
   src/cutover.ts, src/commands/cutover.ts, or test/cutover.test.ts, matching
   the note's claim.
5. Second intermittent: run 35862907311 attempt 1, job 107187249368. Log
   shows the named test
   ("a corpus-scoped refusal names the source that corpus was read from, on
   both arms", test/single-family-exception.test.ts) passing at 12:54:08 in
   the plain suite step, then the same test named as the sole failure by the
   "M2 exit test (push)" step (confirmed step name and conclusion=failure via
   the jobs API), matching "passed earlier in the plain suite step... only the
   gate's own re-run failed it." test/single-family-exception.test.ts:1224 is
   exactly that test's declaration line.
6. Artifact `gates-summary-push-attempt-1` on run 35862907311 is exactly 1442
   bytes (`GET /actions/runs/35862907311/artifacts`), matching the note's
   claim exactly.
7. All three "in flight" branches in STATE.md exist on the remote:
   claude/m5-p3-live-review-evidence, claude/m5-p1-pulse-value-proof,
   claude/m5-p6-scale-out-proof (checked via `GET /branches/<name>`).
8. delivery/plan/m5-conflict-pre-pass.md and
   delivery/decisions/DR-0050-m5-runs-in-waves-rather-than-serially.md both
   exist, backing the "M5 runs in waves under DR-0050" claim.
9. A-15 and A-10, unlike A-14, ARE properly registered in the "Owner action
   items" section (STATE.md:1612 and STATE.md:1633), confirming the register
   convention exists and A-14 is the outlier.
10. `node scripts/check-authored-bytes.mjs` (node v26.6.0): exit 0.
11. `node scripts/check-id-collisions.mjs` (node v26.6.0): exit 0,
    "tuition: 46 id(s) taken ... highest T-046, next free T-047", confirming
    T-046 does not collide with any prior tuition id, deleted or live.
12. T-046's title and section shape (`# T-nnn: <slug>`, "What happened", "The
    mechanism", "What changes") match sibling entries
    (delivery/tuition/T-045-the-registry-check-ran-before-the-registry-served.md
    was read as the comparison).
13. Searched delivery/tuition/ for any prior entry about killing another
    agent's processes by pattern (`grep -rli "pkill\|killall\|kill.*by
    pattern"`); the only other hits (T-005, T-006) do not contain "pkill",
    "killall" or "kill...pattern" on inspection, so T-046 does not duplicate
    an existing entry.
14. The claim grep (CLAUDE.md's binding command) over all three files finds
    only "Never" (proper-noun section-name reference at T-046:21, itself
    inside the CR-001 citation) and "never" (a prescriptive rule statement at
    T-046:36, "never `pkill` or `killall` by pattern"), neither of which is an
    unsupported empirical over-claim of the kind the rule targets. Also ran
    the wrap-insensitive form (`tr '\n' ' ' | grep -o`); it found the same two
    hits, so nothing was missed by a line wrap. STATE.md's new section
    (lines 2704-2734) has zero hits from either form.
15. Local `git --version` in this container is 2.43.0, matching the
    verification note's claim about "local git 2.43.0" used to rule out
    detached maintenance jobs.
16. Branch name `claude/m5-orchestrator-paperwork` does not match
    `^claude/m[0-9]+-p[0-9]+-` (no `-p<digit>-` segment), so it correctly
    avoids the branch-naming trap CLAUDE.md documents (a paperwork branch
    that would be mistaken for a phase implementation branch).

## Honest-failure section (could not check here)

- The note's claims "Isolated on 5de114c with node v26.6.0, the test passed
  20 of 20 runs" and "Isolated on 5662d74 with node v26.6.0, it passed 5 of 5
  runs" describe local reruns done during the investigation. These are not
  independently reproducible from CI records; re-running the full suite 20+5
  times here was not attempted given the review's time budget, so these two
  counts are unverified (not falsified, just not re-derived).
- Whether the CI runner's git version detaches `maintenance run --auto` (the
  note explicitly flags this as NOT checked, "the CI runner's git version was
  not checked"): correctly declared open by the note itself, nothing to add.
- Did not attempt to reproduce either intermittent failure by contention
  (concurrent scratch-fleet git operations under load), since the note
  already states this is unresolved and recommends a diagnostic change for
  next time rather than claiming a cause; that framing is honest and was not
  re-litigated here.
- Did not run the full node --test suite against this branch (paperwork-only
  change, no source or test files in the diff; not required by the brief for
  a paperwork-only PR and the `suite` gate is not meaningfully exercised by a
  diff with zero code changes).
- Mutation-testing two new tests (part of the standard brief) does not apply:
  this PR adds no test files and no test/behaviors.json entries.

## Scope audit

`git diff --name-only origin/main...HEAD` lists exactly:
delivery/STATE.md, delivery/tuition/T-046-an-agent-killed-another-agents-tests-by-pattern.md,
delivery/verification/cutover-status-tree-digest-intermittent.md. No source,
test, or configuration files touched. Branch name does not match the
phase-branch pattern, so no phase declaration file is expected or required.

## ASCII / citations

`node scripts/check-authored-bytes.mjs` exit 0 (node v26.6.0). At least one
resolving path:line citation into a file byte-identical on both sides is
present, e.g. CLAUDE.md:1343 (used above; CLAUDE.md is untouched by this
branch, so it is byte-identical to main) and
test/cutover.test.ts:2005/1863/1767 (test/cutover.test.ts is also untouched
by this branch's diff, confirmed via `GET /pulls/211/files` showing no
cutover files touched by the one PR that could have changed it in this
window, and this branch does not touch it either per the scope audit above).

## Transliteration note (orchestrator)

When this report was copied onto the branch, one U+2014 (em dash) in the reviewer's prose was replaced with a colon, to satisfy the ASCII rule. Nothing else in the report was changed.
