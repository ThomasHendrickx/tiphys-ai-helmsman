# Clean-room review: kernel 0.2.1 history compatibility (CRITERIA)

- Date: 2026-09-23
- PR: #216, branch claude/kernel-0-2-1-history-compat
- Head reviewed: b57bd7cb4981b7b9fd82aba4e04cdc90c5838c2e
- Merge base with origin/main: b16f20008ef9c3b4b62c0007eb7d0178f08dc74d
- Contract: CRITERIA
- Model family: Opus (produced-by claude-opus-5-5)
- Method: every criterion re-executed on node v26.6.0 (scratch toolchain,
  `node --version` checked in the same shell), in an isolated worktree
  detached at the head, `npm ci` exit 0, `npm run build` exit 0. Probes that
  needed a staged repository were run as a temporary, untracked copy of the
  branch's own test file with extra tests appended, deleted after each run;
  `git status --short` after every probe showed only this report.
- Acceptance criteria used: the brief `kernel-0-2-1.md` (scratch briefs), plus
  DR-0053, DR-0054 and DR-0055 including the DR-0055 correction section (which
  is on `origin/claude/m5-orchestrator-paperwork-3` at 60c434f, NOT on the
  reviewed branch; see CR-004).

## Verdict

**FIX-ROUND-NEEDED.** One medium finding (CR-001), five low.

The patch does what the brief asks for the three named mechanisms, and every
criterion I re-executed holds. CR-001 is the release's own open question 1,
which the work history kept fail-closed "because pulse has no such case today".
Pulse does have one: its M3-P3 review is paused with head-less verdicts already
committed for that phase. Resuming it under 0.2.1 is red at both merge gates,
and nothing but editing history clears it. That is the DR-0054 rule broken for
the one consumer this release exists for.

## Criteria walk

### 1. Pulse's 49 real verdicts validate, except the genuinely malformed, each with a reason

MET. Pulse at /home/user/pulse, `refs/heads/main` read as
d4e491b124666a77aa63024b3eedf606657e9e88 (the container refuses git commands
aimed at the pulse clone, so the ref file was read directly; the working tree
state against that ref was not checked). Each of the 49
`delivery/review/*-(criteria|hazard)*.yaml` files through
`node bin/tiphys.ts validate --type verdict <file>`, no context:

- 42 files: no INVALID line, exit 0. Output is HISTORY lines for the two
  stamp-gated rules plus SKIPPED lines, for example m1-p1-criteria prints two
  HISTORY and four `SKIPPED ... no context` lines.
- 7 files: INVALID, exit 1: m3-p14-hazard-round2, m3-p14-hazard, m3-p2-hazard,
  m3-p3-hazard-round3, m3-p3-hazard-round4, m3-p6-hazard, m3-p7-hazard. Every
  one has `kind: finding` (grep of the `kind:` line), and the INVALID lines are
  `#/kind ... does not equal the required constant "verdict"`, missing
  `criteria`, `deviations-judged`, `framing`, and `concrete-edit` where the
  schema names `concrete-fix`. The reason stated in the work history
  (a findings list validated as a verdict) matches what I measured. These are
  the same seven the work history says were invalid under v0.1.0; I did not
  re-run v0.1.0 myself.
- The ten APPROVE documents: grep of `severity:` per file shows every one is
  APPROVE beside at least one medium and no high or critical finding
  (m3-p11-criteria-round2 carries 4 medium, m3-p7-hazard-round2 carries 3).
  None is malformed under the M3-P7 shape rule. Moving medium to the gate is
  correct: DR-0012 condition 2 at
  delivery/decisions/DR-0012-delegated-merge-authority.md:23 bars a MERGE on an
  unresolved medium, and the finding shape has no "resolved" field, so an
  APPROVE whose medium was fixed in round two is a legitimate document.

### 2. The pulse fixture is red on main and green on the branch

MET. origin/main b16f200 exported with `git archive` into scratch,
`node_modules` linked, and only `test/history-compat.test.ts`,
`test/fixtures/pulse-0.1.0-verdicts/` and the git capture copied in.
`node --test test/history-compat.test.ts`: exit 1, 16 tests, 0 pass, 16 fail.
The first failure is the defect itself: `m1-p1-criteria.yaml is not well
formed` with `INVALID #/head required property head is missing` and the
APPROVE-medium pair of lines. No module-not-found error in the log. On the
branch: exit 0, 16 tests, 16 pass, 0 fail, 0 skipped. The fixture files are
ASCII (`node scripts/check-authored-bytes.mjs` exit 0 over the whole tree).

### 3. `head` optional in the schema, required for admission

MET. `head` is removed from `required` in `schemas/verdict.schema.json` and
keeps its forty-hex pattern when present. At admission a head-less verdict is
excluded by name in `partitionByAuditedHead` (src/checks.ts, used by
check-dual-review) and `readReviewCorpus` (src/gates/merge-preconditions.ts),
both through `declaresNoHead`. Red if removed, re-executed:

- M1: `if (declaresNoHead(entry.record))` disabled in merge-preconditions.ts:
  "merge-preconditions excludes a verdict that declares no head ..." exit 1,
  0 pass 1 fail.
- M1b: the same block disabled in `partitionByAuditedHead`: "a dual-tier change
  whose only reviews declare no head ..." exit 1, 0 pass 1 fail.
- Own probe: an unstamped decorrelated pair whose criteria half carries
  `head: dcbe670` (present, abbreviated): check-dual-review red, 1 of 2
  admitted. So "present and unusable" is still refused at the gate.

### 4. A real-shaped 0.2.0 verdict (head, no stamp) is admitted by merge-preconditions and check-dual-review

MET. The branch test "a real-shaped 0.2.0 verdict pair, with a head and no
stamp, is admitted ..." passes (in the 16/16 run) and asserts the staged files
have a forty-hex `head:` line and no `tiphys-version:` line before running both
gates. The code has no stamp reader on either admission path: the only
`readStamp` caller is `src/commands/validate.ts` (I read both admission loops;
the work history's grep agrees). This is what the DR-0055 correction requires.

### 5. An old stamp never escapes a current admission rule

MET at the gates. Own probe: a decorrelated APPROVE pair with a correct head
and a `medium` finding in the criteria half, stamped `0.1.0`, and the same pair
unstamped:

| stamp | check-dual-review | merge-preconditions |
|---|---|---|
| 0.1.0 | red, `verdict-pair-approves` names CR-001 at severity medium | red, `condition-2=red` |
| none | red, same line | red, `condition-2=red` |

Plus the branch test "an old-stamped verdict that breaks a current rule is
excluded by name for the rule it breaks ..." (stamp 0.1.0, no head, red at
both, no stamp text in the detail). Note for the record, not a finding against
this criterion: `tiphys validate --context` DOES honour the stamp, by design
(DR-0055 correction: "the stamp decides only which rules validate applies"),
so an unstamped or 0.1.0-stamped verdict is not run through
`verdict-pair-approves` there and prints a HISTORY line instead. An unstamped
verdict written by pulse today under 0.2.0 therefore gets the history reading
from `validate --context`, and only the gates hold it to the pair rule.

### 6. review-families reads from the declaration commit onward

MET. `scopeToDeclaration` (src/checks.ts) keeps only verdicts whose blob id is
not already under `delivery/` in a parent of the first commit whose
`charter.yaml` carries `review-families`. Branch tests pass: history with three
families before the declaration is not-applicable by declaration (exit 20), a
second family after it is red, an edited history verdict is read again and red.
Mutation M2 (`if (id !== undefined && history.has(id))` replaced by
`if (true)`, every verdict treated as history): "a second family committed
after review-families was declared still contradicts it" exit 1, 0 pass 1 fail.
The shallow-clone fail-closed claim in the source comment was not probed.

### 7. Skipped-only validate exits 0, and a real INVALID still exits 1

MET. Criterion 1's loop shows it on real data: 42 pulse verdicts with only
SKIPPED and HISTORY lines exit 0, the 7 with INVALID lines exit 1. Branch tests
for both arms pass. Mutation M3 (`return checks.violated ? 1 : 0` back to
`checks.failed`): "a verdict whose only non-pass results are SKIPPED checks
exits 0 ..." exit 1, 0 pass 1 fail.

### 8. Every new behavior has a red witness

NOT MET as written; the behaviors CAN go red, the branch does not record it.
All 18 added or repointed rows of `test/behaviors.json` resolve to a real test
title (scratch script comparing each row's text against every
`test/**/*.test.ts` title; no id removed). 12 new `witness/kernel-0-2-1-*.json`
specs cover 13 of them. Five rows have no spec and no recorded red
demonstration in the work history: `pulse-0-1-0-non-verdict-stays-invalid`,
`stamp-written-by-brief-and-summary`, `final-report-template-stamped` (new),
and `verdict-approve-with-medium-finding-rejected`,
`verdict-pair-blocking-finding-refused` (repointed to new assertions). I
reddened each one myself, restored, and re-ran green (see CR-005). The
red-witness gate itself was not re-run here (the work history reports it green
at 0636e03 with 104 witnesses; it takes over 15 minutes).

## Findings

### CR-001 (medium): a head-less verdict of the SAME phase still reddens both merge gates, and pulse's paused M3-P3 is exactly that case

**Claim.** `headGroupFor` in src/checks.ts is unchanged (work history open
question 1). Both derived checks the gates run, `dual-review-decorrelation` and
`verdict-pair-approves`, load the whole committed corpus and group it by
(phase, head). A same-phase sibling with no `head` key is reported as a
violation. So a phase that has any 0.1.0-era verdict and is reviewed again
under 0.2.1 can never go green, however good the new reviews are.

**Why it matters.** DR-0054: "No kernel rule may reject a project because of
records made before that rule applied to it." The only way out for the
consumer is to edit or delete committed history, which DR-0053 rejects, or to
rename the phase. The work history kept it because pulse "has no such case
today". Pulse does: `/home/user/pulse-fleet/dispatch-plan-mobile.yaml` (line
18) says "M3-P3 (KBC PDF) is implemented and green but its review is paused",
and pulse's `delivery/review/` already holds `m3-p3-criteria-round3.yaml` and
`m3-p3-criteria-round4.yaml`, both `kind: verdict`, `phase: M3-P3`, no `head`.
This is the patch release pulse will install to resume that review.

**Evidence.** Staged with the branch's own `stageReviewedChange` and `runGate`
helpers (real runner, full mode, `--base` supplied). The current pair is the
decorrelated fixture pair re-phased to M3-P3 with heads naming the reviewed
commit; the history is pulse's own m3-p3-criteria-round4, m3-p3-hazard-round3
and m3-p3-hazard-round4 byte for byte:

- check-dual-review: status red, exit 1, `INVALID #/head
  delivery/review/m3-p3-criteria-round4.yaml declares no head, so the reviews
  cannot be grouped by the head they reviewed ... (check:
  dual-review-decorrelation)`, and the same through `verdict-pair-approves`.
- merge-preconditions: status red, exit 1, `condition-1=red condition-2=red`.
- Control, the same current pair alone: check-dual-review green;
  merge-preconditions reaches its network condition (`no repository could be
  established`), so the review conditions are cleared.

The same result with the M3-P9 fixture as the head-less sibling.

**Concrete fix.** Treat a same-phase sibling that declares NO head the way
`partitionByAuditedHead` already does: exclude it from the group by name
(printed as history, DR-0054), and keep the refusal only for a head that is
PRESENT and unusable. Use `declaresNoHead` in `headGroupFor` so the two
readers cannot disagree. Add a test, red on this head and green after the fix:
an anchored approving pair plus a head-less same-phase verdict is green at
check-dual-review and clears the review conditions at merge-preconditions. Keep
the existing "present and unusable sibling is red" case as a second arm. The
source comment's fail-open worry (dropping a refusing third review) is already
accepted by 0.2.1 at `partitionByAuditedHead`: a verdict that does not name the
reviewed head is not evidence about it in either direction.

### CR-002 (low): criterion 4c of an owner-approved plan is reversed by an orchestrator ruling, with no plan revision and no decision record

**Claim.** delivery/plan/kernel-plan-m3.md:1809 requires a skipped
cross-document check to make the command exit nonzero. 0.2.1 exits 0. The
reversal is disclosed honestly (work history, the rewritten header of
src/checks.ts, open question 9), and SKIPPED lines are still printed by id.

**Why it matters.** CLAUDE.md's precedence rule puts the plan above this
repository's rules, and the plan is not amended anywhere. A later reader of
the plan will find a criterion the code no longer meets.

**Blast radius, checked.** No kernel code spawns `tiphys validate` and reads
its exit (`grep -rn '"validate"' src scripts bin` finds only the CLI table);
`plugin/src` does not call it; neither `gate-registry.yaml`,
`gates.manifest.json` nor the workflows run it. `mode.ts` and `checklist.ts`
always pass a context. Pulse at d4e491b has no CI workflow and no script that
runs tiphys. I found no consumer that breaks. The weakening that remains is a
consumer script using the bare exit code of a context-less validate as proof
that cross-document checks passed; that consumer now gets exit 0 with SKIPPED
lines.

**Concrete fix.** Record the amendment: a short decision record (or a dated
revision note in the plan at criterion 4c) naming the new behaviour, the reason
(the owner's report on pulse), and that `ChecksRun.failed` is kept. Add a line
to the 0.2.1 release notes that a context-less validate no longer exits 1 on
SKIPPED alone.

### CR-003 (low): stale text states rules the code no longer has

**Claim and evidence.**

- `src/commands/validate.ts`, the new comment above `readStamp`: "the merge
  gates admit a verdict on its stamp separately and never relax on it". Since
  the admission round the gates do not read the stamp at all.
- The per-check comments in src/checks.ts that still say a skipped check
  "exits nonzero" (work history open question 10 names them).
- Work history, Decisions: "An abbreviated or uppercase head keeps the old
  refusal (schema pattern, and unkeyed at the gate)". For an UNSTAMPED
  document the schema pattern is now lifted (`verdict-head-full-sha` HISTORY
  line, and the branch test "an abbreviated head is history when unstamped");
  only the gate half still refuses. The 0.2.0-written verdicts pulse is
  producing now are unstamped, so `validate` accepts an abbreviated head on
  them.

**Why it matters.** Comments here are the design record later rounds read.

**Concrete fix.** Correct the validate.ts comment to "the merge gates do not
read the stamp"; update or delete the three per-check comments; add
"superseded for unstamped documents: validate lifts the pattern, the gate
still refuses" to the Decisions bullet.

### CR-004 (low): the branch's DR-0055 contradicts the branch's code

**Claim.** The reviewed branch carries DR-0055 without its correction section.
Its point 3 reads "A verdict counted toward a merge must carry a current
stamp"; the code deliberately does the opposite. The correction exists only on
`origin/claude/m5-orchestrator-paperwork-3` (60c434f).

**Why it matters.** Under DR-0031 a pull request carries its own evidence.
Merged alone, this branch puts on `main` a decision record whose point 3 the
same merge violates.

**Concrete fix.** Take the corrected DR-0055 from paperwork-3 into this branch
(the same `git show <ref>:<path>` step used for 1770cd5), or merge paperwork-3
first and merge `main` in.

### CR-005 (low): five behavior rows have no witness spec and no recorded red run

**Claim.** See criterion 8. `pulse-0-1-0-non-verdict-stays-invalid`,
`stamp-written-by-brief-and-summary`, `final-report-template-stamped`,
`verdict-approve-with-medium-finding-rejected`,
`verdict-pair-blocking-finding-refused`.

**Evidence that they can go red** (scratch script: copy the file out, mutate,
run the one test by `--test-name-pattern`, copy back, re-run green; `git status`
clean after):

| mutation | test | mutated | restored |
|---|---|---|---|
| M5 `ownVersionForStamp` returns undefined | stamp-written-by-brief-and-summary | exit 1, 0/1 | exit 0, 1/1 |
| M6 template stamped `0.1.0` | final-report-template-stamped | exit 1, 0/1 | exit 0, 1/1 |
| M7 `medium` dropped from BLOCKING_SEVERITIES | verdict-approve-with-medium-finding-rejected | exit 1, 0/1 | exit 0, 1/1 |
| M7 same | verdict-pair-blocking-finding-refused | exit 1, 0/1 | exit 0, 1/1 |
| M8 verdict `kind` const replaced by type string | pulse-0-1-0-non-verdict-stays-invalid | exit 1, 0/1 | exit 0, 1/1 |

**Concrete fix.** Add witness specs for at least the three new rows, or record
this table in the work history as their red demonstration.

### CR-006 (low): the bare check-dual-review step is weaker than 0.2.0 on an all-head-less corpus

**Claim.** Work history open question 2, stated honestly there: without
`--base`, a corpus of only head-less verdicts is not-applicable (each named)
where 0.2.0 was red. With `--base`, which the runner supplies, it is red (the
branch test shows it). merge-preconditions stays red either way.

**Why it matters.** A consumer wiring the script by hand without `--base` sees
not-applicable, not red, for a change whose reviews say nothing about the
head.

**Concrete fix.** Either print a one-line warning in the not-applicable detail
when every excluded verdict is head-less, or document that `--base` is required
for a verdict to be refused as missing.

## The implementer's open questions

| # | question | severity for a patch pulse installs |
|---|---|---|
| 1 | `headGroupFor` unchanged | **medium, CR-001**: reachable for pulse's paused M3-P3 |
| 2 | bare step without `--base` weaker | low, CR-006 |
| 3 | `validate --context` still refuses a head-less verdict through the derived checks' own head | low. It is an explicit command on history. Measured on pulse's m1-p1-criteria with `--context /home/user/pulse`: the INVALID lines are about pulse's missing `plan.yaml`, `work-history.yaml` and `assurance-modes.yaml`, which predate this change, so pulse cannot see the head clause today anyway |
| 6 | an undecodable file under `delivery/review/` errors merge-preconditions whatever its age | low. Pre-existing. All 49 pulse verdicts decode (criterion 1), and the probe with pulse's real M3-P3 files did not error |
| 11 | neither gate schema-validates the corpus it admits | low, not for this release. Pre-existing. The dangerous admission states I built (medium finding, abbreviated head, no head, old stamp) are all refused by the gate predicates |

## Criterion 4c reversal: honest, and no consumer found that breaks

Honest: yes. The work history names the plan line, quotes the plan's rationale,
publishes the derivation (the `runChecks(` / `.failed` / `SKIPPED` grep with its
hits), states what it did not cover (`plugin/`, consumers' CI), keeps
`ChecksRun.failed` so the registry tests still see a skip as failure, and
raises it as open question 9. The SKIPPED lines are still printed by id, and
roles/clean-room-reviewer.md now says a skipped check did not run. Breaks a
consumer: none found (CR-002 blast radius). What is missing is the plan-level
record (CR-002).

## Mechanism derivation (fix-round contract item 3 first)

The work history names the mechanism correctly ("an admission rule for current
work written where it also judges history"), publishes the grep and its full
output, and lists what it did not cover: `test/` and `witness/`, CLI paths that
pass a context, consumers other than pulse, and gate readers of non-verdict
types. The missed site, CR-001, is inside the published grep output
(`headGroupFor(` at the two derived checks) and was consciously kept, so this
is a wrong judgement on a found site, not a scope hole in the search.

## Scope

Not a phase branch (`node -e` pattern test prints false), so the scope gate is
not-applicable through the runner (precondition unmet, measured). The 49
changed paths match the brief plus the DR-0055 scope addition (stamp module,
brief and summary writers, final-report schema and template, reviewer role
text) plus the two decision records taken from paperwork-3. No
`phase-declarations` file is touched. The package version is unchanged.

## Probes run

- Pulse 49-verdict loop at the head (criterion 1).
- main-versus-branch run of `test/history-compat.test.ts` (criterion 2).
- Branch files, one run: `test/dual-review.test.ts`, `verdict-head`,
  `single-family-exception`, `checks`, `assurance-modes`, `clean-room-brief`,
  `implementer-brief`, `verdict-schema`, `checklists`: exit 0, 249 tests, 249
  pass, 0 fail, 0 skipped, 0 cancelled (node v26.6.0, dist built).
- Mutations M1, M1b, M2, M3, M4 (head re-required), M5, M6, M7, M8: every
  named test red, every restore green.
- Gate probes: old-stamped and unstamped medium pair, abbreviated head,
  same-phase head-less sibling (M3-P9 fixture and pulse's real M3-P3 files).
- `node scripts/check-authored-bytes.mjs` exit 0.
- `node scripts/render-agent-rules-gates.mjs --check` exit 0, 24 rows.
- Citations gate through the runner (`--only citations --base origin/main
  --head HEAD --phase claude/kernel-0-2-1-history-compat`): green, 2 changed
  documents linted, 1 citation resolved.
- Scope gate through the runner: not-applicable, not a phase branch.
- Behaviors resolution script: 18 of 18 resolve.
- Consumer search for anyone reading validate's exit code: none in `src`,
  `scripts`, `bin`, `plugin/src`, the registry, the manifest, the workflows, or
  pulse.

## Honest failure: what I did not check

- The full suite (`npm test`, over 1450 tests) and the PR bundle were not run;
  the brief asks to prefer single files. The work history reports 1457/1457 at
  0636e03, which I did not reproduce.
- The red-witness gate was not re-run.
- v0.1.0 was not run; "the same seven were invalid under 0.1.0" is the work
  history's measurement, not mine.
- Pulse's working tree was read as files; I could not run git in that clone,
  so whether it matches d4e491b exactly is unverified.
- The shallow-clone fail-closed behaviour of `firstDeclarationCommit` was not
  probed.
- Macos and the default v22 toolchain were not run.

## Progress log (beacon)

- setup, decisions read, npm ci and build, criterion 1 loop, criterion 2
  main-versus-branch, gate probes, mutations M1 to M8, behaviors and witness
  scan, CR-001 probe with pulse's M3-P3 files, gates, report written.

## Re-verification at 1e48bff

Detached at 1e48bff480a21bca0f6d29b93a5d000cb9a28eee. origin/main is
3eeccb911a5ca20bed375783cf3fdb3f54e37934. Same contract (criteria), same
family (Opus). Toolchain: node v26.6.0 from a scratch prefix, `dist/` built
(`npm run build` exit 0), invocation named at each result.

### Verdict at 1e48bff

**APPROVE.** CR-001 (medium) and CR-002 to CR-006 (low) are closed.
One new low finding, CR-007, introduced by the round's CR-001 fix: a CURRENT
refusing review that omits `head` is now excluded as history, so a same-phase
sibling that should refuse the pair no longer does. It is named on the output,
the reviewer role requires `head`, and the fix needs an orchestrator choice,
so it is low and does not block. Merge authority stays governed by
delivery/decisions/DR-0012-delegated-merge-authority.md:23.

### Item 1: the fix-round contract

Satisfied, all three parts, read in the order the contract binds (item 3
first).

- Did-not-cover: present. It names the two derived-check sites that still
  refuse a head-less verdict through `validate --context` (the verdict's OWN
  head, open question 3), says the derivation is lexical, and says it is
  kernel-only (no consumer tree searched). Those exclusions are real and
  correctly scoped: the verdict's own head is not the sibling mechanism.
- Mechanism: named as "history is judged at admission through grouping",
  not as the pulse instance. That is the mechanism; the instance was
  `headGroupFor`.
- Derivation: the grep is published with its full output, and each hit is
  classified.

### Item 2: CR-001 is closed (my own staging, re-run)

Built with the branch's `stageReviewedChange` and `runGate` helpers, in an
untracked probe file deleted after the run.

| staging (anchored decorrelated APPROVE pair for M3-P3, plus) | check-dual-review | merge-preconditions |
|---|---|---|
| pulse's real `m3-p3-criteria-round4.yaml` and `round3.yaml` (no head) | green, exit 0; both named as history by REPORT lines | exit 21 "no repository could be established": the review conditions cleared and it reached the network condition |
| round4 with an abbreviated present head `"abc1234"` | red: "declares head abc1234, which is not forty lowercase hexadecimal digits" | red, condition-1=red, condition-2=red |

So the head-less real file is green at both gates, and a present but unusable
head is still refused at both. The round's own test (20 tests in
`test/history-compat.test.ts`, 20 pass, 0 fail, 0 skipped) asserts the same
two arms.

### Item 3: CR-002 to CR-006

- **CR-002 closed.** DR-0053 carries an amendment section for criterion 4c
  (delivery/plan/kernel-plan-m3.md:1809), with the reason, the kept
  `ChecksRun.failed`, and a release-note line.
- **CR-003 closed.** The `validate.ts` comment now says the gates do not read
  the stamp; the per-check comments and the `runChecks` header are corrected;
  the schema `head` `$comment` is updated to the new grouping.
- **CR-004 closed.** DR-0055 on the branch carries the correction section to
  point 3 (admission does not read the stamp).
- **CR-005 closed, and the spec-less row is honest.** Seven rows gained
  witness specs; all 17 of those rows resolve to a spec by test title (my
  scan). The eighth, `verdict-pair-blocking-finding-refused`, has its red run
  recorded instead. I checked the stated obstacle in the source rather than
  accepting it:
  - rule (f) in `src/witness/run.ts` requires `consumesExternalOutput` when a
    phase-owned member touches a changed file the spawn grep matches, and
    `src/checks.ts` is such a file (the other `src/checks.ts` specs of this
    round do declare the git capture);
  - rule (c) then requires the capture's basename to be referenced from the
    named test's source, and `test/verdict-head.test.ts` reads no captured
    output;
  - a mutation member must also intersect a changed hunk (rule (d),
    line-level), and `BLOCKING_SEVERITIES` is outside one.
  So a spec would have needed either an artificial capture reference in a test
  that consumes none, or an unrelated edit to put the line in a hunk. Both are
  worse than a recorded red run. The recorded run (HEAD green, two mutations
  red, restore green) matches the one I produced independently in the first
  review (mutation M7b). The residue is stated: no gate re-runs that witness,
  so a later change that defangs it would not redden `red-witness`.
- **CR-006 closed.** `HEADLESS_ONLY_WARNING` is printed in the not-applicable
  detail when every excluded verdict is head-less; its test passes within the
  20.

### Item 4: criteria 1 to 8 re-walked at 1e48bff

1. **Met.** All 49 pulse verdicts through `node bin/tiphys.ts validate --type
   verdict`, no context: 42 no INVALID and exit 0, 7 INVALID and exit 1. The
   seven are exactly the seven `kind: finding` files named in the first walk
   (counted: `7 kind: finding`). Zero `NOT IN FORCE` lines, as expected: pulse
   has no final reports.
2. **Met, partly by deduction.** Branch: `test/history-compat.test.ts` 20 of 20
   on v26.6.0. Main moved from b16f200 to 3eeccb9, and `git diff --name-only
   b16f200 origin/main` outside `delivery/` names only `CLAUDE.md`,
   `test/behaviors.json` and `test/retirement-inventory.test.ts`. No source,
   schema or script changed, so the red I measured on main's source in the
   first review still holds. Deduced, not re-run.
3. **Met.** Mutations at this head, each through `node --test
   --test-name-pattern=<title> test/history-compat.test.ts`, restored and
   checked byte-equal after each:

   | mutation | result |
   |---|---|
   | M1 merge-preconditions head-less exclusion disabled | exit 1, 0 pass 1 fail |
   | M1b partitionByAuditedHead head-less exclusion disabled | exit 1, 0 pass 1 fail |
   | M2 review-families scope fails open | exit 1, 0 pass 1 fail |
   | M3 validate exits on `failed` again | exit 1, 0 pass 1 fail |
   | M4 schema `head` required again | exit 1, 0 pass 1 fail |

   `git status --short` after: only my two untracked review files.
4. **Met.** The real-shaped 0.2.0 admission test passes in the 20; no stamp
   reader on either admission path.
5. **Met.** The old-stamp tests pass in the 20 (M3 and M4 above exercise the
   two nearest rules).
6. **Met.** Three review-families tests pass; M2 reddens the later-family one.
7. **Met.** Pulse loop: 42 skipped-only files exit 0, 7 INVALID files exit 1;
   M3 reddens the skipped-only test.
8. **Met.** 22 behavior rows changed against main, all 22 resolve by name, no
   id removed. 17 of the 18 release rows resolve to a witness spec; the 18th
   carries a recorded red run (item 3). Red-witness gate at this head:
   `node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full
   --only red-witness --base origin/main --head HEAD`, exit 0: "green: 112
   witness(es) evaluated (20 own, 92 stored re-evaluated in 905696ms); every
   witness red against every declared dangerous state and green at head".
   The work history records no red-witness gate run for the fix round's new
   specs; this run fills that gap.

Changed test files plus the merged-in `test/retirement-inventory.test.ts`, one
invocation (`node --test` naming nine files, v26.6.0, `dist/` built): exit 0,
262 tests, 262 pass, 0 fail, 0 skipped.

Local checks at this head: `node scripts/check-authored-bytes.mjs` exit 0;
`node scripts/render-agent-rules-gates.mjs --check` exit 0 (24 rows);
`node scripts/check-id-collisions.mjs` no collisions; citations gate green
("4 citation(s) resolved" over 2 changed documents at 1e48bff); scope gate
not-applicable (this is not a phase branch, by the branch-name rule).

### Item 5: new defects

**The two merges are clean.**

- `d328481` (M5-P5): `test/behaviors.json` is the union of both sides'
  appended rows. 1357 rows, no duplicate key, no row of either side lost.
- `1e48bff` (paperwork): the remerge diff is empty. `package.json` and the
  lockfile are unchanged by both merges.
- `5879e2e` quotes the abbreviated head in the sibling test, because YAML reads
  an all-digit short sha as a number. Correct, and it narrows nothing.

**The headless path has one new defect, CR-007 (low).**

#### CR-007 (low): a current refusing review with no head is excluded as history, so the grouping fails open for it

The staging: the same anchored APPROVE pair for M3-P3, plus a third review of
M3-P3 that is CURRENT. It is stamped `tiphys-version: 0.2.0`, verdict
FIX-ROUND-NEEDED, one high finding, a different family, and no `head` line.

| gate | result |
|---|---|
| check-dual-review | **green, exit 0**; the refusing review appears only as an EXCLUDED/REPORT line ("declares no head, so it is history (DR-0054)") |
| merge-preconditions | exit 21 at the network condition, so the review conditions **cleared** |

The same document validates: since 0.2.1 `head` is optional in the schema, and
admission does not schema-validate (open question 11). On main this staging is
red at both gates.

The mechanism is the one the `headGroupFor` header itself describes: dropping
a same-phase sibling shrinks the group, and a shrinking group is the fail-open
shape. The header records that a refusing third review with its `phase:` line
deleted once left both merge checks green, and that case was fixed. Deleting
the `head:` line now has the same effect. The new paragraph's sentence "the
fail-open worry above does not apply to it" is true for pre-M4-P10 history and
false for a current document that omitted the field.

Why low and not medium:

- the exclusion is named on the output, never silent;
- the reviewer role requires the full forty-character `head`;
- DR-0012 merges only on the orchestrator's reading of both reviews, not on
  the gate alone;
- the trigger is an author error in a current review at the SAME head.

The only in-document discriminator between real history and a current omission
is the stamp, and the DR-0055 correction says admission does not read the
stamp. So the fix is an orchestrator choice between:

1. **Validate-side (recommended).** Gate `head` as required since 0.2.0
   through `RULES_SINCE`, the mechanism DR-0055 already uses for one keyword.
   A current stamped review that omits `head` is then INVALID at `tiphys
   validate`, which the reviewer role already requires to be clean, while
   unstamped pulse history stays valid. Admission is untouched.
2. Admission-side: refuse a head-less sibling stamped 0.2.0 or later. It
   tightens only, but it reads the stamp at admission, against the correction.
3. Accept as residual risk, and correct the header sentence to say the
   exclusion applies to any head-less document, current or not.

In every case, correct the header sentence.

### What I did not check in this pass

- I did not run the full PR bundle or the full suite; single files and single
  gates only, per the brief.
- I did not re-run criterion 2 on main's source (deduced above).
- I read no consumer other than pulse.
- `validate --context` on the verdict's own head (open question 3) is left as
  the round left it; I did not probe it again.

## Re-verification at 281d892

Detached at 281d8925f06dbb81cca16fd32d7199e600908c23 (fix round 2: `ffb786d`,
`e55af6f`, `281d892` on top of 1e48bff). origin/main is still
3eeccb911a5ca20bed375783cf3fdb3f54e37934. Same contract (criteria), same
family (Opus). Toolchain node v26.6.0 from the scratch prefix, `npm run build`
exit 0 and `dist/` built before every test run.

### Verdict at 281d892

**APPROVE.** CR-007 is closed. CR-001 stays closed. One new low
finding, CR-008: the new behavior row `validate-verdict-head-required-from-0-2-0`
has no witness spec, and the work history does not say so. I reddened its test
myself with two different mutations, so the test is sound; only the registration
is missing. No high or medium finding. Merge authority stays governed by
delivery/decisions/DR-0012-delegated-merge-authority.md:23.

### Item 1: CR-007 is closed

My own staging from the first re-verification, re-run through the branch's
`stageReviewedChange` and `runGate` helpers (untracked probe file, deleted
after the run). The third review is current: stamped `tiphys-version: 0.2.0`,
FIX-ROUND-NEEDED, one high finding, family-c, no `head` line. It sits beside
an anchored decorrelated APPROVE pair for M3-P3.

| staging | check-dual-review | merge-preconditions |
|---|---|---|
| C: the refusing review ADDED by the change | **red, exit 1**: "declares no head, and the change under audit ADDS it (merge base ...), so it is current work and not history ... It reads verdict FIX-ROUND-NEEDED, blocking finding(s) CR-001 (high)" | **red, exit 1**, condition-1=red, condition-2=red |
| C, bare script with no `--base` | green, exit 0; REPORT "excluded as history (DR-0054) on its SHAPE ALONE: provenance was NOT checked, because no base was given" | not run |
| D: the same file committed AT THE BASE, unchanged | green, exit 0 (history) | exit 21 at the network condition (review conditions clear) |
| E: pulse round4 at the base, one comment line appended on the branch | **red, exit 1**, "the change under audit CHANGES it" | **red, exit 1**, condition-1 and condition-2 red |

D is the residual the work history states ("a head-less verdict with a
blocking finding that is ALREADY ON THE BASE is still history"). It is named
on the output with its verdict and findings. The no-base arm is the
informational workflow step, also stated as a residual. Both are honest and
neither is new.

At `tiphys validate --type verdict`, same document, stamp varied:

| stamp | result |
|---|---|
| 0.2.0 | `INVALID #/head required property head is missing`, exit 1 |
| 0.3.0 | same INVALID line, exit 1 |
| 0.1.0 | `HISTORY verdict-head-required applies from tiphys-version 0.2.0 ...`, exit 0 |
| none | `HISTORY verdict-head-required ... pre-stamp history held to the 0.1.0 rules`, exit 0 |

Observation, not a finding: an UNSTAMPED current review that omits `head`
still validates clean, because an unstamped document is history by
construction in `ruleApplies` (the stamp is recommended, not required).
The merge gates now refuse it if the change adds it (row C), so the
enforcement that matters holds.

### Item 2: CR-001 stays closed

| staging (anchored pair for M3-P3, plus) | check-dual-review | merge-preconditions |
|---|---|---|
| A: pulse's real `m3-p3-criteria-round4.yaml` and `round3.yaml`, verbatim, committed at the base | green, exit 0 | exit 21 at the network condition, review conditions clear |
| B: round4 with a present abbreviated head (`"95beb2c"`) | red, exit 1, "declares head 95beb2c, which is not forty lowercase hexadecimal digits" | red, exit 1, condition-1 and condition-2 red |

### Item 3: the fix-round contract, and the witnesses

Read in the order the contract binds, item 3 first.

- **Did not cover: present, and correctly scoped.** It names the searched
  trees (`src`, `scripts`, `bin`, plus `plugin/src`), a second grep over the
  shipped non-code trees, readers that decide "history" in other words (the
  review-families falsifiers, read and not re-derived), and renames (a renamed
  head-less verdict reads as ADDED and is refused, fail-closed, stated and
  not tested).
- **Mechanism: named.** "An exemption for history, keyed on a property the
  present can also have." That is the mechanism, not the instance, and the fix
  keys on a property only the past has (the same blob at the merge base).
- **Derivation: published in full, before (37 lines) and after (40 lines),**
  with every hit classified (exempts, refuses, warns, noise), and a second grep
  for every `check.run` caller, which found the three and explains why the
  third (`validate --context`) is unchecked.
- **Claim grep: clean.** Over the fix round 2 section (work-history lines
  1186 to 1600) the line-based grep finds 10 lines; the wrap-insensitive form
  finds 11 `never` and 1 `needs a`, so no wrap miss. Each of the round's own
  hits (1197, 1282, 1394, 1440) has a settling entry in the refreshed claim-grep
  list. I settled 1440 ("never silent") independently: row D prints the REPORT
  line with verdict and findings.

**The new witness has three members, each structurally different.** In
`witness/kernel-0-2-1-headless-sibling-provenance.json`:

1. the blob comparison dropped (`atHead !== undefined` alone);
2. provenance never established (`base === undefined || base !== ""`, so every
   run is `unchecked`);
3. the base blob read at the wrong revision (`provenance.refSha`).

They break three different steps (compare, establish, read), so this is a
class witness in the sense of the "one witness is not a class" rule. Each is
red at the red-witness gate (below).

**Reworked witnesses: checked.**

- `kernel-0-2-1-headless-sibling-is-history`: member 0 now disables the
  at-base branch, member 2 targets the new REPORT text, and new member 3
  reverts the `relative()` path fix. That fix is real: the work history records
  that without it merge-preconditions read every sibling as ADDED.
- `kernel-0-2-1-history-well-formed`: the deleted patch is replaced by a
  `src/stamp.ts` mutation (`entry: "head"` to `"phase"`). No file under
  `witness/`, `src/`, `test/` or `scripts/` still names the deleted patch.
- `merge-preconditions-composed-check-violations-are-red`: its find follows
  the new `check.run(..., { base })` call.
- The repaired `kernel-0-2-1-verdict-framing-not-required.patch` applies:
  `git apply --check` passes for all 13 files in `witness/patches`.
- Every mutation find in `witness/` occurs at this head (799 mutations; 8
  finds occur more than once, all with the same count as at 1e48bff, and the
  runner replaces all occurrences, so their meaning is unchanged).

**The red-witness gate at this head:** `node bin/tiphys.ts gates run --registry
gate-registry.yaml --mode full --only red-witness --base origin/main --head
HEAD`, exit 0: "green: 113 witness(es) evaluated (22 own, 91 stored
re-evaluated in 881785ms); every witness red against every declared dangerous
state and green at head". That matches the work history's own run at
`e55af6f` (113, 22 own), on this head.

### Item 4: criteria 1 to 8 at 281d892

1. **Met.** All 49 pulse files through `validate --type verdict`, no context:
   42 no INVALID and exit 0, 7 INVALID and exit 1, the same seven
   `kind: finding` files. **Zero `#/head` INVALID lines**: the head-required
   rule does not turn pulse's unstamped history INVALID (each file prints a
   HISTORY verdict-head-required line instead).
2. **Met, partly by deduction.** Branch: `test/history-compat.test.ts` 21
   tests, 21 pass, 0 fail, 0 skipped. Main's source is unchanged since the
   first review's measurement (origin/main has not moved).
3. **Met, with a judged deviation.** `head` is REQUIRED in the shipped schema
   again, and `RULES_SINCE` lifts it for documents stamped before 0.2.0 or
   unstamped. So the criterion's "optional in the schema" now holds for
   history as `tiphys validate` applies the schema, not for the raw file.
   Consequence, stated: a consumer that validates pulse's history against
   `schemas/verdict.schema.json` with a generic JSON Schema tool, bypassing
   `tiphys validate`, sees it invalid again. I found no kernel reader that
   does this (only `src/commands/validate.ts` loads the verdict schema). The
   orchestrator chose this design, so I judge it as serving intent.
   Mutations at this head: M1, M1b (head-less exclusion at each admission
   reader) each exit 1, 0 pass, 1 fail. My old M4 (put `head` back in
   `required`) is now the shipped state and was retired.
4. **Met.** Admission test passes within the 21.
5. **Met.** Old-stamp tests pass within the 21; admission reads no stamp.
6. **Met.** M2 (review-families scope fails open) exit 1, 0 pass, 1 fail.
7. **Met.** Pulse: 42 skipped-only files exit 0, 7 INVALID exit 1. M3
   (exit on `failed`) exit 1, 0 pass, 1 fail.
8. **Met in substance, one registration missing (CR-008).** 24 behavior rows
   changed against main, all 24 resolve by name, none removed. The new
   `admission-headless-sibling-provenance-decides-history` has the provenance
   witness. The new `validate-verdict-head-required-from-0-2-0` has no witness
   spec.

Test counts at this head (node v26.6.0, `dist/` built):

| invocation | tests | pass | fail | skipped |
|---|---|---|---|---|
| `node --test test/history-compat.test.ts` | 21 | 21 | 0 | 0 |
| `node --test test/verdict-head.test.ts` | 41 | 41 | 0 | 0 |
| the 8 changed test files plus `test/retirement-inventory.test.ts`, one invocation | 263 | 263 | 0 | 0 |

Other local checks: `check-authored-bytes` exit 0; `render-agent-rules-gates
--check` exit 0; `check-id-collisions` no collisions; citations gate green
(4 resolved in 2 changed documents at 281d892).

### Item 5: new defects

#### CR-008 (low): the new behavior row validate-verdict-head-required-from-0-2-0 has no witness spec, and the work history does not say so

The row is added (work history line 1513) and resolves to a test in
`test/verdict-head.test.ts`. No spec under `witness/` names that test. The
round's witness section lists the new and reworked specs and does not mention
this row. The CR-005 row had the same gap and a stated reason (rule (f), a
spawning file). Here that reason does not apply: the behavior lives in
`schemas/verdict.schema.json` and `src/stamp.ts`, and neither matches the
spawn grep (0 hits each for the four tokens). `src/stamp.ts` is a new file on
the branch, so a mutation of the row's `since` intersects the diff (rule (d)).
The `"head"` line in `required` is NOT in a changed hunk against main (main
already required it), but a patch member is judged file-level and the schema
file is changed. So a spec was possible.

The test itself is sound. I ran it by exact title:

| state | result |
|---|---|
| HEAD | exit 0, 1 test, 1 pass |
| `"head"` removed from `required` in the schema | exit 1, 0 pass, 1 fail |
| the `verdict-head-required` row's `since` set to `9.9.9` | exit 1, 0 pass, 1 fail |

Restored byte-equal after each. Fix: add a witness spec with those two members
(a patch for `schemas/verdict.schema.json` and a mutation in `src/stamp.ts`),
or record this red run in the work history as the round did for CR-005.

#### Checked and not a defect

- **The provenance `error` arm has no test.** Mutating it to exclude instead of
  refuse (`if (provenance.kind === "error" && false)`) leaves the round's test
  green. I tried to reach the arm through the shipped entry points: the bare
  script with `--base` set to an orphan commit and to an invalid sha. Both
  stopped earlier, at exit 21 with "the review budget could not be
  established ... no merge base", before any grouping. So through the gates the
  arm is defensive and a missing merge base already fails closed upstream. I
  did not find an input that reaches it; a test for it would need a direct
  call to the check. Not a finding.
- **Blob comparison scope.** `blobAt` compares the file at the commit the
  corpus was read from with the merge base of `--base` and that commit. After a
  merge of main into the branch, the merge base moves up, so a file that
  reached main meanwhile counts as at-base. That is the stated residual (row D).
- **`RULES_SINCE` for unstamped documents.** `ruleApplies` returns false for
  any unstamped document, so the row's `since` only matters for stamped ones
  (my `since: "0.1.0"` mutation was green for that reason; that is design,
  not a gap).

### What I did not check in this pass

- The full PR bundle and the full suite (single files and single gates only).
- Consumers other than pulse.
- The `error` arm through a direct check call (see above).
