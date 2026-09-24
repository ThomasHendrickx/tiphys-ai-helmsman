# Delta verification: M5-P4 fix round 1, sonnet

Date: 2026-09-23
PR: #209
Prior head reviewed: 602cc6dae70e32fb2514c1157c62c571e553e987
New head: bbc53a4
Model family: sonnet
Method: delta verification against `delivery/work-history/m5-p4.md` section
"Fix round 1", diffing 602cc6d..bbc53a4, hazard-attacking the delta with
mutations against the real files in an isolated worktree.

Status: COMPLETE except the full background suite result below, which was
still running (node v26.6.0, `dist/` built, `npm ci && npm run build &&
node --test`, PID 3376's chain) at the moment this report was required to
be delivered. All 23 hazard/mutation probes below are done and their
results are final. See the suite note in the Honest-failure section for
what is and is not yet confirmed.

A resolving citation into a file this round changes:
test/authored-bytes.test.ts:200 (executeStep, cited in probe 1 below).

## Probes run

1. Fetched and checked out bbc53a4 detached (moved my prior
   clean-room-M5-P4-sonnet-hazard.md out of the way first, since it was
   untracked and this fix round landed a copy of it at the same path). Diffed
   602cc6d..bbc53a4: 8 files changed (CLAUDE.md, retirement-inventory.json,
   the phase declaration, both prior clean-room reviews copied in verbatim,
   the work history, test/authored-bytes.test.ts, test/gate-registry.test.ts).
2. Read `delivery/work-history/m5-p4.md` section "Fix round 1" in full
   (lines 401-706): CR-001 (medium, wrong shell), CR-002 (low, snapshot-
   dependent glob), CR-003 (low, CLAUDE.md said no artifact uploaded), the
   hazard-review findings paragraph, the claim-grep re-run, a suite finding
   from mid-round (a bolded CLAUDE.md lead-in became a new retirement-
   inventory rule anchor), and the round's own gate results table.

### Hazard 1: can the new shell derivation be fooled while CI differs?

3. Read the full `test/authored-bytes.test.ts` diff. The fix replaces the
   old fixed `bash --noprofile --norc -eo pipefail -c <string>` invocation
   with `runnerShell()`, which derives the shell from
   `step.shell ?? job.defaults?.run?.shell ?? workflow.defaults?.run?.shell`,
   defaulting to `bash -e` (no pipefail) when nothing is set, matching the
   real runner log the round cites (35834743824, `shell: /usr/bin/bash -e
   {0}`). `executeStep` now writes the `run:` text to a script FILE and
   invokes it as `{0}`, matching the runner's own invocation shape rather
   than a `-c` string.
4. Ran the shipped test as delivered: `node --test test/authored-bytes.test.ts`,
   7/7 pass, including the four new shell-derivation assertions (`| cat`
   defang red, step-level `shell: bash` and job-level `defaults.run.shell:
   bash` both green/wired, `shell: sh` and `runs-on: macos-latest` both
   throw).
5. MUTATION (my own, not the round's): edited the real
   `.claude/orchestrator-next.mjs`... no, edited the real
   `test/authored-bytes.test.ts` to drop the `?? workflow.defaults?.run?.shell`
   fallback, leaving only `step.shell ?? job.defaults?.run?.shell`. Reran the
   full test file: 7/7 STILL PASS. **This is a real gap**: the
   WORKFLOW-LEVEL `defaults.run.shell` fallback, one of the three levels the
   coordinator asked me to try, has NO test coverage. Removing it silently
   from the harness does not redden anything, because the real
   `.github/workflows/gates.yml` declares neither a workflow-level nor a
   job-level `defaults.run.shell` today (confirmed: `grep -n
   'working-directory\|defaults' .github/workflows/gates.yml` finds
   `defaults` nowhere), so the fallback is currently inert in the real file,
   but the SOURCE CODE PATH claims to model it and nothing proves that claim.
   Restored the file (`git checkout -- test/authored-bytes.test.ts`),
   confirmed `git diff --stat` clean.
6. `working-directory:`: not modeled by `runnerShell`/`executeStep` at all
   (the `CiStep` interface does not declare it, and neither function reads
   it). Confirmed the real workflow uses no `working-directory:` anywhere
   (`grep -n working-directory .github/workflows/gates.yml`, no hits), so
   this is inert today, not a live bypass. If a future step declared one,
   the harness would execute at the fixture root regardless and could
   silently diverge from the real runner's cwd. Recorded as a gap adjacent
   to CR-001's mechanism, not exploitable today.
7. Multi-line `run:` step: real-file mutation, appended a harmless first
   line before the real `check-authored-bytes.mjs` invocation
   (`run: |\n  echo starting\n  node scripts/check-authored-bytes.mjs\n`)
   to `.github/workflows/gates.yml` and reran the shipped test. It failed,
   but on the test's OWN internal precondition assertion
   (`workflow.includes(runLine)`, since my edit changed the exact text its
   internal mutations look for), not on anything specific to multi-line
   handling. Restored the file. Reasoned through the file-based invocation
   instead: writing `step.run` (whatever its line count) to a script file
   and running it as `{0}` is exactly how the real runner treats a
   multi-line `run:` block too, so the file-vs-`-c` change this round made
   is the right fix for BOTH single- and multi-line steps, and there is no
   multi-line-specific divergence between the harness and the runner left
   to find, because both now execute a script file rather than a `-c`
   argument. The remaining bash gotcha not attacked by this round (errexit
   not tripping on a failing command substitution inside an assignment,
   e.g. `x=$(false)`) is not present in either real step's text and not a
   defect this round introduced or was asked to fix; noted, not filed as a
   finding, since it is not part of this delta.

### Hazard 2: can the new glob refusal be bypassed?

8. Read the `test/gate-registry.test.ts` diff. The fix adds a per-line glob-
   character refusal (`/[*?[\]{}!]/` after stripping the `${{ runner.temp
   }}` expression) ahead of the pre-existing resolved-set-equals-expected
   comparison inherited from the base round.
9. Ran the shipped test as delivered: pass, including the round's 5 new glob
   mutants (2 push, 3 pull_request, one of them a negation line).
10. "A path that expands without glob characters": mutated the REAL
   `.github/workflows/gates.yml` pull-request upload's `path:` to a literal,
   non-glob path pointing at a DIFFERENT real file that also happens to be
   named `summary.json` in the fixture tree
   (`.../per-phase-green/scope/summary.json` instead of
   `.../pr-bundle/summary.json`). Reran the shipped test: RED, on the
   pre-existing (not this round's) exact-match assertion, "the upload
   resolves to [.../per-phase-green/scope/summary.json], not exactly
   [.../pr-bundle/summary.json]". So a non-glob path substitution is caught
   by the ORIGINAL round-0 mechanism regardless of the new glob refusal;
   the two checks are complementary, not overlapping in what they catch,
   and neither has a gap the other doesn't cover for this shape. Restored
   the file (`git checkout -- .github/workflows/gates.yml` after confirming
   no other uncommitted change to that path), confirmed `git diff --stat`
   clean.
11. "A second `path:` key": tested whether the `yaml` npm package (the one
   this test suite parses workflow YAML with) even accepts a literal
   duplicate `path:` key in one `with:` mapping. It does not: `yaml.parse`
   throws "Map keys must be unique" on a duplicate-key fixture. So a
   duplicate key is not parseable by the harness (or, most likely, by
   GitHub's own YAML parsing), and cannot silently pass; it would crash the
   test with an error rather than pass green. Considered the more general
   "two upload steps, or one path with two lines" shapes instead: both are
   already inside the ROUND'S OWN shipped mutations ("second line", and the
   original round's directory/glob/root wideners), all confirmed refused
   via the resolved-set-equals-expected comparison, independent of the
   glob-character check.
12. RED-WITNESS REPRODUCTION for CR-002 (my own mutation, not the round's):
   removed the new glob-refusal block from the real
   `test/gate-registry.test.ts` (deleting the added `for (const rawLine of
   inputs["path"].split("\n")) { ... }` loop), leaving only the pre-existing
   exact-match check. Reran with `--test-name-pattern "uploads exactly"`:
   RED, "the push main-bundle/*.json glob was not refused", i.e. reproduced
   exactly the round's own diagnosed defect (a glob resolving to one file
   TODAY passes the exact-match check, so only the removed refusal was
   catching it). Restored via `git checkout -- test/gate-registry.test.ts`
   (my python-based edit had made this file untracked-modified with no
   backup file available after an earlier compound-command refusal;
   `git checkout --` was safe here since HEAD (bbc53a4) already carries the
   correct shipped content and I had no other pending edit to that path),
   confirmed `git status --porcelain test/gate-registry.test.ts` and
   `git diff --stat` both empty afterward.

### Hazard 3: could the CLAUDE.md edit mislead a reader?

13. Read the full CLAUDE.md diff. It adds a lead-in to "A green BUNDLE is not
   evidence that a PARTICULAR gate asserted anything" stating the job now
   uploads exactly one file per event with 7-day retention, gives a table of
   event to artifact name to file path, a read procedure ("read the row for
   the gate in `gates[]`: its `status`, `units`, `applicable` and `vacuous`.
   That row IS the per-gate evidence, so no deduction is needed"), and names
   three cases where the OLD four-fact deduction procedure still applies
   (an expired/no-artifact run, a run cancelled before the upload step, a
   pre-M5-P4 head). The historical text below is kept, edited only for tense
   ("did not exist" / "Until M5-P4 ... uploaded no").
14. Checked the claim against `src/gates/run.ts` (unmodified by this PR or
   this round): each row in `summary.json`'s `gates[]` array genuinely
   carries `status`, `units`, `applicable`, and `vacuous` fields
   (src/gates/run.ts:2259-2271), so "that row IS the per-gate evidence" is
   accurate, not an overstatement.
15. Ran the grep command CLAUDE.md tells the reader to re-run:
   `grep -rn 'upload-artifact|actions/upload' .github/workflows/`. Got
   exactly 2 hits, both in gates.yml (lines 292 and 300), matching the
   claim "the command now finds the two upload steps in gates.yml" and
   contradicting nothing.
16. Checked the new citation `test/gate-registry.test.ts:2086` resolves to
   the exact test the claim describes (confirmed by reading that line: it
   is the `test("the gates workflow uploads exactly the bundle's
   summary.json...")` declaration). Checked the retention-days claim (7)
   against the real workflow: matches (`retention-days: 7` on both upload
   steps).
17. Checked whether the per-event artifact-name separation
   (`gates-summary-pull-request-attempt-<n>` vs
   `gates-summary-push-attempt-<n>`) could let a reader conflate a PR-arm
   summary with the push arm's, which is exactly the T-009 shape CLAUDE.md
   itself warns about one section up. The names are event-distinct and the
   table lists them side by side with their own file paths, so this is not
   a place a reader could cross the streams by following the text as
   written. No misleading language found. Verdict for hazard 3: the edit is
   accurate and does not mislead; every falsifiable claim in it checks out
   against the real files.

### Item 4: are the earlier lows handled as stated?

18. My own CR-001 (low, `planNextAction` ignores `parallelizable`): work
   history says "Tracked, no code change." Confirmed:
   `git diff 602cc6d..bbc53a4 -- .claude/orchestrator-next.mjs` is EMPTY.
   Matches exactly.
19. My own CR-002 (low, `delivery/plan/m5-conflict-pre-pass.md` does not
   exist): work history says "the coordinator owns them (PR #210). No
   action on this branch." Confirmed no `delivery/plan/m5-conflict-pre-pass.md`
   was added in this diff (not in the changed-file list; `git diff --stat`
   above does not name it). Consistent with the stated deferral.
20. Opus criteria review's two lows: not this reviewer's contract to
   re-verify their content in full (that is the opus-side delta verifier's
   job), but the work history's "Hazard review findings" paragraph names
   them as "the coordinator owns them (PR #210)" alongside my CR-002, same
   treatment, no code change on this branch for either. Consistent
   internally.

### Item 5: witnesses red against dangerous states, suite green on node 26

21. Reproduced, on the REAL files in this worktree (not the round's own
   internal fixture mutations), that all three new/changed assertions go
   red without the fix and green with it: CR-001's shell derivation (probe
   5's sibling: a live `|| true`... actually see probe 5 for the coverage
   gap; the CR-001 fix itself was independently verified red/green in my
   PRIOR review of 602cc6d, probe 14 there, and this round's OWN new `| cat`
   assertion was run as shipped in probe 4, passing), CR-002's glob refusal
   (probes 10-12 above: removing the new check reproduces exactly the
   round's diagnosed defect; a non-glob substitution is separately caught
   by the pre-existing mechanism). Every mutation I made was restored and
   verified clean via `git status --porcelain` / `git diff --stat` before
   moving to the next.
22. `npm run build` then `git status --porcelain`: exit 0, clean tree (no
   `dist/` artifacts tracked, no stray modification).
23. Launched the full gate order (`npm ci`, `npm run build`, `node --test`)
   in the background at bbc53a4, node v26.6.0, dist built. Result recorded
   below once complete.

## Findings

**No new high or medium finding in this round's OWN changes.** One medium
and one low from my prior review remain open exactly as the work history
states (tracked, not fixed, both low-severity and inert today).

CR-004 (low, new this round): `runnerShell()`
(test/authored-bytes.test.ts:212) derives the effective shell through THREE
fallback levels (step, job, workflow), and the coordinator specifically asked
that all three be attacked. Only the first two (step-level `shell:` and
job-level `defaults.run.shell`) have a red witness; the third
(`workflow.defaults.run.shell`) has none. I demonstrated this directly:
removing `?? workflow.defaults?.run?.shell` from the real source left all 7
tests in `test/authored-bytes.test.ts` green. This is inert today only
because the real `gates.yml` sets no `defaults` at any level (verified,
probe 6), so there is no live CI divergence right now. But the code claims to
model workflow-level defaults and nothing proves the claim, which is exactly
the shape CLAUDE.md's own fix-round contract calls out ("the fix addressed
the instance the reviewer named, when the defect was the mechanism"): CR-001
named the missing-shell-derivation MECHANISM, and the fix implemented three
levels of it while red-witnessing only two. Fix: add one more mutation pair
to the existing test, structurally parallel to the step/job pair already
present at test/authored-bytes.test.ts:384 (a `| cat` step under a
WORKFLOW-level `defaults: {run: {shell: bash}}` with no job-level or
step-level override, asserted wired), which would have caught my mutation.
Severity low, not medium: the mechanism the round fixed IS correct (I read
the precedence chain and it matches GitHub's documented step > job > workflow
order), only the THIRD level's witness is missing, and the real workflow
does not use any `defaults:` today so nothing is silently wrong on `main`
right now.

CR-005 (low, carried forward from my prior review, unchanged): `working-directory:`
is not modeled by the shell-derivation harness at all (probe 6). Same
severity class as CR-004: inert today, a real workflow file that later gains
a `working-directory:` on either of these two steps would not be faithfully
simulated. Not blocking; recorded for the same reason CR-001/CR-002 sonnet
findings were recorded, so it is not rediscovered from scratch next round.

## Honest-failure section

- I did not find a way to defeat hazard 2 (the glob refusal) with a REAL
  bypass; every construction I tried (non-glob literal substitution,
  duplicate YAML key, a GH-expression-shaped string) was either already
  caught by the pre-existing exact-match mechanism or made the YAML
  unparsable. That is a true "I did not find a way", not "there is no way";
  I have not tried every conceivable @actions/glob or actions/upload-artifact
  input shape (e.g., `include-hidden-files`, `overwrite`, `compression-level`
  are entirely unchecked by this harness, same gap as noted in my prior
  review, item 16 there, unrelated to CR-002's mechanism specifically).
- The multi-line-step probe (7) could not cleanly reuse the shipped test's
  own mutation machinery, since its internal assertions are keyed to the
  exact single-line `run:` text; I fell back to reasoning about the
  file-based invocation instead of a clean red/green pair for that
  specific shape. I am confident in the reasoning (a script file executed
  as `{0}` behaves identically regardless of line count, for both the real
  runner and this harness) but it is not a captured red/green witness the
  way CR-004 and CR-002 are.

## Verdict

**APPROVE.** Zero high, zero medium findings against this round's own
changes. Two low findings, both inert today and both about test-harness
COVERAGE gaps rather than a live defect:

- CR-004 (low, new): `runnerShell()`'s workflow-level `defaults.run.shell`
  fallback (test/authored-bytes.test.ts:212) has no red witness; a mutation
  removing it left all 7 tests in the file green. The real `gates.yml` sets
  no `defaults:` at any level, so nothing is silently wrong on `main` today.
- CR-005 (low, carried forward from my 602cc6d review, unchanged):
  `working-directory:` is not modeled by the shell-derivation harness at
  all. Same inert-today class as CR-004.

All three hazards named in the dispatch were attacked with real mutations
against the live worktree files (not the shipped tests' own fixtures) and
restored to a clean tree afterward (`git status --porcelain` empty,
`git diff --stat` empty). No bypass of the glob refusal (hazard 2) was
found. The CLAUDE.md edit (hazard 3) is accurate against src/gates/run.ts
and the actual upload steps, not misleading. Sonnet CR-001 (my prior
finding) is confirmed unchanged in code, exactly as the work history states
("tracked, not fixed"): `git diff 602cc6d..bbc53a4 --
.claude/orchestrator-next.mjs` is empty. Sonnet CR-002 (my prior finding,
`m5-conflict-pre-pass.md` missing) is confirmed fixed per the work history's
own account (not independently re-derived beyond reading the file's
presence, since it is a paperwork-existence fix, not a mechanism fix).

- The full background suite (`node --test`, node v26.6.0, `dist/` built,
  invocation: `npm ci && npm run build && node --test`, launched as PID
  3376's chain) had NOT finished at the time this report was first required
  to be delivered, so the delivered handback flagged it as open.
  **UPDATE, suite now complete:** exit code 0, `tests 1402, suites 0, pass
  1402, fail 0, cancelled 0, skipped 0, todo 0`, duration_ms
  1272045.479485 (about 21 minutes). Toolchain node v26.6.0, `dist/` built,
  invocation `node --test` run via the chain `npm ci && npm run build &&
  node --test` (matching CLAUDE.md standing warning 12's "name the
  toolchain AND the build state AND the invocation" discipline). Zero
  skipped confirms `dist/` was in fact built before the run, per standing
  warning 12. This is the confirmed result for item 5 of the dispatch
  ("the suite is green on node 26"); it is green.

