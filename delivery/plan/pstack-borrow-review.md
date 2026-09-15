# pstack borrow review: what Tiphys should take, adapt, and refuse

- date: 2026-09-15
- author: orchestrator
- status: PROPOSAL. Nothing here is decided except where it says so.
- reference: pstack 0.15.2 by Lauren Tan (poteto), MIT, published in Cursor's
  plugins repository, read at pinned commit
  `c1c0a32802223f4be824112dd83d33ad29a8b26c`. Cloned outside this repository,
  never vendored, never committed.
- subject: Tiphys at `main`, `3b40118`, kernel `@tiphys/kernel@0.1.0` published,
  M3 closed, M4 not started.
- method: nine parallel readers over pstack, nine over Tiphys, one assessor per
  candidate, then one adversarial reviewer that had not seen the reasoning.

## How to read this

The table in section 2 is the answer. Everything below it is the working.

Five things are worth your time and they are section 4's first five rows.
Three questions are yours and they are in section 3. The rest of this document
exists so that a later reader can tell a decision from a guess.

**The headline, and it is not a pstack finding.** Measuring this repository to
answer your token question produced the sharpest number in the review:

| across all 50 units merged to `main` | value | assurance | overhead |
|---|---|---|---|
| lines changed | 40,825 (9.4%) | 68,140 (15.7%) | **324,933 (74.9%)** |
| units touching the bucket | 12 (24%) | 15 (30%) | **50 (100%)** |

Every unit that reached `main` carried paperwork. Fewer than a quarter carried
anything a consumer receives. DR-0027 measured a 24 hour window and found
2 merges of 29 touching `src/`; that window was not an outlier, it was the
first time anyone counted. The measurement is now a command with an exit code
and it is in the sandbox repository, described in section 4 item 1.

## 1. Current state of Tiphys

**What it is.** A delivery-process kernel shipped as an npm package. It is
built BY an orchestrated delivery process, not by itself; nothing runs on
Tiphys before M4 (delivery/plan/kernel-plan-v1.md:38). M1, M2 and M3 are
closed, 27 phases shipped, and 0.1.0 is published and tagged.

**What is built and ships.** Sixteen CLI subcommands (`init`, `doctor`, `lock`,
`pool`, `spawn`, `teardown`, `watch`, `status`, `validate`, `brief`,
`checklist`, `mode`, `plan`, `tuition`, `gates`, `version`), 16 JSON schemas,
6 role briefs, 5 checklists, a gate registry with 18 gates, a tuition feed, and
165 red-witness specs under `witness/` that name concrete source mutations as
dangerous states rather than asserting coverage.

**The mechanisms that carry the design.** Three constraints do most of the
work: never read current state from the tail of an append-only log (src/task.ts:22),
never use pid or process liveness for identity or exclusion (src/liveness.ts:10),
and never open a path whose type has not been established (src/task.ts:36).
Assurance is declared, not improvised: assurance-modes.yaml recomputes a mode's
declared skips against `full` in three directions rather than trusting them.
A gate that writes green with zero units is rewritten to error.

**What is designed and not built.** The whole of layer 3 and layer 4 binding.
`role-model-config.yaml:7` says so in terms: M3 ships the data and no resolver,
and binding is the M4 harness adapter. `grep -rn role-model-config src/ test/`
resolves only to a schema registration and two comments. The kernel has no
orchestration loop at all: `tiphys spawn --exec` launches a generic argv
subprocess and the dispatching is done by a human-readable skill in `.claude/`.

**What is open.** M4 is cutover: the pilot (DR-0034: `pulse`), the thin
`@tiphys/claude-code-plugin`, the harness adapter, authority enforcement, fleet
durability, cross-environment exclusion. It may not dispatch without its own
intake and plan, decomposed into at minimum six workstreams
(delivery/plan/kernel-plan-v1.md:368).

**The governing steers, newest first.** These decide most of section 2:

- DR-0034:12, the owner, 2026-08-15: "let's not over engineer adoption. first
  get this thing working and just use it."
- DR-0029:19, the owner: the kernel owns orchestration; project checks, skills
  and definitions of done come from the project and are hooked in. The kernel
  ships the gate contract and zero project gates.
- DR-0027:9, the owner: reviews target shipped value, not ceremony. Measured
  cost of ignoring it at DR-0027:17.
- DR-0016:26: being asked a question whose answer was already obvious is a
  failure of the system.

## 2. Candidate assessment

Verdict key: **have** (already present, often stronger), **adopt**, **adapt**
(borrow narrower than proposed), **defer**, **reject**.

| # | Candidate | What Tiphys has | Verdict | Where | Code or model |
|---|---|---|---|---|---|
| 1 | Standing orders register | Verbatim append at spawn, in CODE (src/brief.ts:24); charter owns the content scope | **adapt** (fix-round brief template only) | `.claude/` | model |
| 2 | Verification ledger | No head field on a verdict; directory convention scopes a head | **adapt** (take the head-SHA key, refuse the graded verdicts) | M4 kernel | code |
| 3 | Brief contract | Role half validated and refused; phase half unguarded | **adapt** (validate the phase projection) | M4 kernel | code |
| 4 | Scale gates | DR-0027 is the collapse rule, and it is homeless | **adapt** (give it a home, fix three stale lines) | `.claude/` | model |
| 5 | Queue discipline | Lease, beacon, atomic status rewrite, union registries | **reject** (no named failure) | n/a | n/a |
| 6 | Liveness and failure | Beacon freshness, salvage skill, DR-0016 escalation | **reject** (no named failure; two rules harmful here) | n/a | n/a |
| 7 | Playbook fidelity | Checklists with framings and evidence flags, stronger than a todo list | **adapt** (bind the checklist to the dispatch procedure) | `.claude/` | model |
| 8 | Model roles | Tier, rationale, charter override, family policy, no resolver | **adapt** (guard the subagent-model override) | M4 plugin | code |
| 9 | Reviewer independence | Required, and checked, by comparing free prose | **adapt** (give `produced-by` a token grammar) | M5 kernel | code |
| 10 | Findings triage | Severity enum, required concrete fix, 49 arbitrations | **have** | n/a | n/a |
| 11 | Decision log | 32 records, STATE.md, 38 work histories | **adapt** (review the orchestrator's own trail, refuse the TSV) | `.claude/` | model |
| 12 | Pickup and pause | `orchestrator-next.mjs` exits nonzero while work remains | **adapt** (commit trigger; refuse the pause procedure) | `.claude/` | both |
| 13 | Verification capability | Gate contract; project supplies the gate | **reject** (DR-0029 decides it) | n/a | n/a |
| 14 | Setup improvement loop | Tuition flow with a schema and a mechanism index | **reject**, but it surfaced a live defect | `.claude/` | code |
| 15 | Planning | Plan writer, adversarial reviewer, 5 rounds, 8 revisions | **adapt** + one decision for you | M4 intake | both |
| 16 | Value-to-overhead accounting | Nothing. Counted once by hand in DR-0027 | **adopt** (built, in the sandbox) | sandbox now, kernel M4 | code |

Detail follows only where the verdict is not obvious from the row.

### 2.1 The three that matter most

**2 (verification ledger).** pstack keys a verdict row by pull request plus
head SHA, so a new head voids the row for free
(`skills/poteto-mode/scripts/orch/store.ts:1331`). Tiphys requires the same
property and implements none of it: schemas/verdict.schema.json:9 has no head
field, and scripts/check-dual-review.mjs:29 says so in its own source, that
"THE DIRECTORY IS WHAT SCOPES A SET OF VERDICTS TO ONE HEAD". DR-0012:22
requires two reviews "for the current head" and the artifact cannot express
which head it read. Measured instance at delivery/STATE.md:28: two verdicts
turned out to be on the pre-fix-round head `eb13da6`, caught by an orchestrator
reading prose. The fix is one required field and one group-key change. It is
the cheapest real item in the review.

**7 (playbook fidelity).** The borrow is not pstack's copied todo list, which
is an honour system weaker than what Tiphys already ships. It is the
CONNECTION: pstack's playbook is the thing the agent opens, so its checklist
is harder to skip. Tiphys's checklist is a shipped artifact its own dispatch
procedure never names. Measured: `checklists/clean-room.yaml` landed on
2026-08-13 in commit `2a3892b`; of the ten clean-room reviews added since,
exactly ONE references it. `grep -n checklist .claude/skills/phase-delivery/SKILL.md`
returns zero hits, including at the clean-room dispatch step
(.claude/skills/phase-delivery/SKILL.md:81). The kernel ships a review contract
that nine of its own last ten reviews did not use.

**16 (value-to-overhead accounting).** Your question, and it had no mechanism.
Now it does, in the sandbox repository: a classifier whose rules are data, a
three-bucket split, a budget with an exit code. The third bucket is the design:
folding review into overhead would make reviewing less the cheapest way to
pass, so the budget constrains overhead against value and leaves assurance
reported but ungated. A range with no value at all is not within budget however
generous the number.

### 2.2 Eight more, found by sweeping pstack beyond the candidate list

Ranked. The first three are better value than several of the sixteen above.

| Item | pstack | Tiphys today | Verdict |
|---|---|---|---|
| A status query that fails is a VERDICT with an exit code, never silence | `skills/poteto-mode/scripts/watch-pr/policy.ts:326` | CLAUDE.md:859: a watcher armed for 1500 seconds reported nothing while the job it watched had finished | **adopt** |
| Re-check a verdict against the git PATCH-ID, not only the head SHA | `skills/poteto-mode/playbooks/shipping.md:9` | nothing; and this CORRECTS item 6, see below | **adapt** |
| A parked owner question carries its DEFAULT ON NO ANSWER | `skills/poteto-mode/playbooks/orchestrate.md:30` | schemas/decision-record.schema.json:10 requires twelve fields and has no such field | **adapt** |
| Five named dismissal shapes for the arbitration step | `skills/interrogate/references/lead-judgment.md:18` | 49 arbitration documents; `grep -c arbitration .claude/skills/phase-delivery/SKILL.md` returns 0 | **adapt** |
| Account for every spawned child at the rollup | `skills/poteto-mode/playbooks/orchestrate.md:74` | salvage handles a death the orchestrator NOTICED; nothing handles one it forgot (CLAUDE.md:425) | **adapt** |
| The status page is DERIVED from the tables | `skills/poteto-mode/playbooks/orchestrate.md:32` | delivery/STATE.md is 1952 hand-maintained lines and the A-n namespace collided twice inside it | **adapt**, narrowly |
| Blind the eval before promoting a brief change | `skills/poteto-mode/playbooks/eval.md:7` | role briefs ship as a deliverable and no edit to one has ever been measured | **adapt** |
| Every claim carries its evidence or its LABEL in the same sentence | `skills/poteto-mode/SKILL.md:107` | the claim grep, which CLAUDE.md:389 records as blind to a phrase straddling a wrap | **adapt** |

**The patch-id item corrects item 6 and is the reason this sweep earned its
cost.** A head-SHA key voids a verdict whenever the head changes, and a phase
branch that merges its base in to stay mergeable changes its head without
changing a line of the code under review. Under a strict head rule both reviews
would be voided for nothing. pstack records the base SHA and the stable
`git patch-id` of the base-to-head diff alongside the head, and compares the
patch-id before landing: a rebase or a base merge rewrites the SHA and preserves
the patch-id, while a real edit changes both. **Stated as design reasoning, not
as measurement:** no Tiphys incident of this shape is recorded, and I looked.
Item 6 should carry the patch-id from the start anyway, because adding it later
means a second breaking change to the same published schema.

Two rejects worth naming so nobody re-litigates them. **PID-based stale-lock
detection**, which pstack's own store implements and constraint C-2 forbids
outright; it is listed only because several good items above come out of the
same two files and a reader passes it on the way. And **arena bakeoffs plus a
frozen merge frontier**: no Tiphys incident is caused by a serial fix round
where a bakeoff would have won, and DR-0016's fresh-implementer path is the
measured answer to a twice-failed phase.

### 2.3 Where Tiphys is already stronger, and pstack should borrow back

Stated because the deliverable must not read as a one-way import.

- **Red witness.** 165 specs naming concrete source mutations, with captured
  external output where a behaviour consumes another program. pstack's nearest
  is `skills/principle-prove-it-works/SKILL.md`, which is prose.
- **Vacuity accounting.** A gate that writes green over zero units is rewritten
  to error, and a required gate that was skipped is NAMED. pstack has no
  equivalent concept.
- **Declared downgrades.** assurance-modes.yaml recomputes a mode's skips in
  three directions. pstack's "a skipped step stays with a one-line reason" is
  an honour system.
- **The three constraints.** pstack's own store steals a lock by
  `process.kill(pid, 0)` and treating ESRCH as death
  (`skills/poteto-mode/scripts/orch/store.ts:368`). Tiphys forbids exactly that
  and uses lease freshness. This is the clearest case where borrowing the code
  would be a regression.
- **Requirement traceability.** A 115-row migration table and a clause map with
  a check. pstack has none.
- **Brief refusal.** pstack's "missing fields are a refuse-to-spawn condition"
  is prose: `--brief` is an unchecked opaque string and `orch` has no spawn
  concept. Tiphys's `brief compose` genuinely refuses, naming the path.

## 3. Decisions for me

Three. Everything else in this review was decided under DR-0016 and is recorded
as a recommendation with its reasoning.

### D1. Does a plan still earn five adversarial review rounds?

**The thing.** kernel-plan-v1 was written, then reviewed five times (four
adversarial rounds plus a verification round), producing 40 numbered findings,
5 of them high, across 8 recorded revisions. All four review rounds are dated
2026-08-04. pstack takes the opposite position: it ships no planning skill, and
its rule is that any fork whose answer is observable by running something is
not a question, it is a prototype.

**The actual question.** Not "should Tiphys plan" (it must; the plan is the
owner contract and the scope gate's mechanical input). The question is whether
the plan-writing stage should be allowed to settle empirical questions by
PROTOTYPE before review, and whether that lets the review-round count drop.

**The evidence, per finding.** I walked the external round
(delivery/review/plan-review-r4-external.md:12). Its findings split cleanly:

- F-02, git identity missing in a clean environment: a sixty-second script on a
  clean machine settles it. A prototype would have caught it.
- F-01, the lease renew-versus-takeover race, and F-03, a stale local branch as
  the worktree base: a prototype catches these only if you already knew to
  write the concurrent test, which is what the review told them to write.
- F-05, "monotonically increasing test counts are a weak and gameable
  acceptance rule", and F-06, "M4 contains several architecture-bearing systems
  in one paragraph": these are critiques of the CONTRACT. No prototype reaches
  them.

Roughly a quarter of the forty findings were facts about tool behaviour that a
short script settles. Three quarters were about the contract or about hazard
classes, which is what adversarial review is for and what a prototype cannot
see.

**Options.**

1. Keep five rounds. Cost: the measured one, paid again at M4.
2. **Two rounds, with a prototype gate in front of them.** The plan writer may
   not write prose about an empirically settleable fork; it runs a throwaway
   and records the result in a prototype-evidence appendix. Review rounds drop
   to two (one internal, one cross-family) because the class of finding that
   drove rounds 3 to 5 is the class a prototype removes.
3. Drop adversarial plan review entirely. Rejected: F-05 and F-06 were both
   high-value and neither is reachable any other way.

**Recommendation: option 2.** It is the only one that removes a measured cost
without removing a measured benefit, and Tiphys has no prototype concept today
(`grep -rniE 'prototype|spike|throwaway'` over `roles/`, `checklists/`,
`schemas/`, `.claude/` and CLAUDE.md returns only `Object.prototype` and one
unrelated use). **Blocks:** M4's mandatory intake, which is the next thing to
be written.

### D2. What is the value-to-overhead budget, and does it gate?

**The thing.** Section 2 item 16 measures the ratio. It does not yet constrain
anything. The measurement today reads 7.96 overhead lines per value line across
the whole history.

**The actual question.** Does the ratio become a gate, and at what number?

**Options.**

1. Report only. Zero risk, zero effect. This repository's own tuition says
   twice that a rule which depends on remembering does not survive.
2. **Gate at the milestone boundary, not the phase.** A single phase can
   legitimately be almost all paperwork (a plan, an exit test). A MILESTONE that
   is 8 to 1 against value is the thing worth refusing. Budget at 3.0 to start,
   which is a real tightening from 7.96 and still loose enough that no
   individual phase has to argue.
3. Gate per pull request. Rejected: it would block the plan, the exit test and
   every decision record, which are the artifacts the process exists to
   produce.

**Recommendation: option 2, budget 3.0, reviewed at M5.** The number is a
starting point chosen to be achievable rather than aspirational; the mechanism
matters more than the threshold and the threshold is one line to change.
**Blocks:** nothing. It can land after M4.

### D3. Is cross-vendor review a requirement or a preference?

**The thing.** DR-0012:22 requires the two clean-room reviews of one head to be
produced on different model families, and T-001 is the measured miss that made
it a rule. Two facts, both verified, and together they are the sharpest finding
in this review.

First, **no reviewed head in this repository has ever had a cross-VENDOR pair.**
Every review header that names a model names one of exactly four: Claude
Opus 5, Claude Sonnet 5, Codex `gpt-5.6-sol`, Codex `gpt-5.6-terra`. The
Anthropic pairs are Sonnet 5 against Opus 5. The macOS pilot pair is
`gpt-5.6-sol` against `gpt-5.6-terra`
(delivery/review/clean-room-macos-portability-pilot-final-criteria.md:6 and
delivery/review/clean-room-macos-portability-pilot-final-adversarial.md:6).
Both are one vendor. Non-Anthropic reviewers were genuinely used, which is real
and worth keeping; they were never used AS THE OTHER HALF OF A PAIR.

Second, **the guard has never run.** `gate-registry.yaml:283` says so in the
registry's own words: this repository "has never had a verdict document in it",
so `check-dual-review` has reported not-applicable on every phase merge to
date. When it does run it will compare `produced-by`, which
schemas/verdict.schema.json:41 constrains only to a non-whitespace string,
while the sibling field `framing` next to it at schemas/verdict.schema.json:47
already carries a real token grammar. Two distinct prose strings pass. The only
two verdict documents that exist, at
delivery/evidence/m3-exit-test/e1/e1-7/verdict-criteria.yaml:5 and
delivery/evidence/m3-exit-test/e1/e1-7/verdict-hazard.yaml:4, are exactly that
case.

So the decorrelation requirement is real, the check is real, and the property
has held on zero heads. That is this repository's own named pattern: a guard
whose condition does not test the property that matters.

**The actual question.** At M4, when the harness adapter can actually route a
model, is "different family" a hard precondition that refuses to dispatch, or a
recorded preference the orchestrator may waive?

**Options.**

1. Hard precondition that refuses to dispatch. Strongest, and it makes a
   capacity outage block a merge. DR-0026 already records one occasion where
   the family constraint was waived under capacity pressure, so this option
   would have blocked a phase that in fact shipped.
2. **Recorded, comparable, and waivable with a reason.** `produced-by` becomes
   a token a machine can compare, the check reddens on a same-family pair, and a
   waiver is an explicit declared downgrade in the mode, which
   assurance-modes.yaml already has the machinery for.
3. Preference only. Rejected: it is what exists now, and what exists now cannot
   distinguish two vendors from two Anthropic models.

**Recommendation: option 2**, plus one free thing now:
.claude/skills/phase-delivery/SKILL.md:83 dispatches a clean-room reviewer with
no instruction to record its model, and adding that line costs nothing and is
what makes the question answerable at all. **Blocks:** nothing immediately. The
grammar wants the next breaking contract revision after 0.1.0, because
tightening `produced-by` rejects documents that 0.1.0 accepts.

**Cross-vendor EXECUTION is a separate question and I am not asking it.** The
kernel needs nothing for it: `ExecutorRequest` carries an argv array behind
`ExecutorAdapter` (src/spawn.ts:106) and the blueprint already anticipates
cross-vendor pairings at delivery/intake/orchestrated-delivery-v1.md:115. What
it needs is everything around the kernel, starting with the fact that the child
environment allowlist carries no model-vendor credential and redirects `HOME`
and `XDG_CONFIG_HOME` to a scrubbed harness-owned root (src/exec/env.ts:68).
That is an M4 harness-adapter question, not a borrow.

## 4. Work plan

Ordered: decided and low risk first. Every item names its verify command.
"Blocked by" means it waits on a decision in section 3.

| # | Item | Where | Tier | Verify | Blocked by |
|---|---|---|---|---|---|
| 1 | Value-to-overhead measurement (DONE, sandbox) | sandbox | cheaper | `node --test "tools/value-ratio/test/*.test.js"` | none |
| 2 | Fix three stale lines in the dispatch playbook | `.claude/` | cheaper | `git diff` review, `node scripts/check-authored-bytes.mjs` | none |
| 3 | Bind the clean-room checklist to the dispatch step | `.claude/` | cheaper | `node bin/tiphys.ts checklist resolve --checklist clean-room --framing criteria-contract` | none |
| 4 | Fix-round brief template | `.claude/` | cheaper | `node scripts/check-authored-bytes.mjs` | none |
| 5 | Close the tuition promotion leak | kernel | cheaper | `npm test` | none |
| 6 | Head SHA AND patch-id on the verdict, and in the group key | kernel | cheaper | `npm ci && npm run build && npm test` | none |
| 7 | Validate the phase half of a composed brief | kernel | cheaper | `npm test` | none |
| 8 | Prototype-evidence appendix in the plan schema | kernel | strongest | `npm test` | D1 |
| 9 | `CLAUDE_CODE_SUBAGENT_MODEL` guard | M4 plugin | strongest | `npm test` | none |
| 10 | Token accounting in the kernel, and the milestone budget | kernel | cheaper | `npm test` | D2 |
| 11 | `produced-by` token grammar | kernel | cheaper | `npm ci && npm run build && npm test` | D3 |
| 12 | Cross-model review of the orchestrator's own trail | `.claude/` | strongest | `node scripts/check-dual-review.mjs <dir>` | none |
| 13 | Name the arbitration step in the dispatch procedure | `.claude/` | cheaper | `grep -c arbitration .claude/skills/phase-delivery/SKILL.md` returns non-zero | none |
| 14 | Record the reviewer's model slug in every review header | `.claude/` | cheaper | grep over the next two review headers | none |
| 15 | `default-on-no-answer` on the decision record | kernel | cheaper | `npm test` | none |
| 16 | A CI watcher whose query failure is a verdict with an exit code | `.claude/` | cheaper | run it against a broken endpoint, assert non-zero | none |

### The five with the best value for cost

**1. Value-to-overhead measurement. Already built and pushed.**
`tools/value-ratio/` in the sandbox repository. Acceptance criteria met: the
tool classifies from a data file, reports lines, files and units per bucket,
accepts a token ledger, exits 1 over budget and 2 on usage error, and refuses
to pass a range that shipped nothing. Ten tests, ten pass, zero skipped, on
node v22.22.2. The glob matcher was rewritten after the first version matched
`src/**` against `src/cli.ts` and not `src/commands/doctor.ts`; the suite goes
five red against the old matcher and five green against the new one.

**2. Fix three stale lines in the dispatch playbook.** The procedure the
orchestrator actually reads contradicts three decided records.
.claude/skills/phase-delivery/SKILL.md:8 says a phase is "merged by the owner",
which DR-0012 delegated. The same file at line 13 says the orchestrator never lets a review
be skipped, which DR-0027 narrowed, and at line 21 says "Phases are sequential
until M5", which DR-0011 superseded. Acceptance: each of the three lines cites
the record that governs it, and a grep for the superseded wording returns zero.

**3. Bind the clean-room checklist to the dispatch step.** Acceptance:
`.claude/skills/phase-delivery/SKILL.md` section 5 and the clean-room brief
instruct the reviewer to run `checklist resolve` with a framing and to answer
every resolved probe by id, with a probe that does not apply answered "not
applicable" and a reason rather than omitted. Falsifiable: the next two
clean-room reviews each name every resolved probe id, measured by grep, against
a baseline of one in ten.

**4. Fix-round brief template.** The one measured resume failure
(.claude/skills/phase-delivery/SKILL.md:117: six heads in two hours, five
cancelled CI runs, two hours with no completed gate evidence on a milestone
critical path) happened because the fix-round brief is hand-typed and the
correct push wording lives in a procedure document instead of in the artifact.
Acceptance: the template exists, section 6 points at it, and it carries the
push clause verbatim and the environment-warnings placeholder that today exists
only on the initial dispatch at
.claude/skills/phase-delivery/references/implementer-brief.md:73.

**5. Head SHA and patch-id on the verdict.** Section 2.1, with section 2.2's
correction: the head alone would void both reviews whenever a phase branch
merges its base in to stay mergeable, so the verdict records the head, the base
and the `git patch-id` of the base-to-head diff, and the merge procedure
compares the patch-id. Acceptance:
`tiphys validate --type verdict` exits nonzero with pointer `#/head` on a
verdict with no head; `check-dual-review` reddens when two verdicts for one
phase carry different heads, and when the group's head differs from a supplied
`--head`; and it passes on a directory holding four verdicts across two heads
where the pair matching `--head` is decorrelated. That last case fails on
`main` today, which is the red witness.

### The one that is not a borrow at all

**5. Close the tuition promotion leak.** Found while assessing candidate 14 and
it is a live defect. test/tuition.test.ts:173 checks that every delivering-log
entry declaring `kernel-relevant: yes` resolves in the shipped feed. Twelve of
the 23 entries declare it and all twelve are promoted, so the guard works. The
other eleven declare nothing, are skipped by `continue` at
test/tuition.test.ts:174, and ten of them have no shipped counterpart: T-010 to
T-014, T-019, T-020, T-023, T-024 and T-025. The promotion obligation is
self-declared, so an entry that says nothing is exempt from it. The entry the
guard failed hardest to promote is T-010, which is the record of a check that
could not see the byte it existed to catch.

Acceptance: an entry declaring neither `yes` nor `no` fails the test naming the
file; the eleven silent entries each gain an explicit declaration; the ten
kernel-relevant ones are promoted. Verify: `npm test`.

## 5. Not borrowing, with reasons

- **The orch state CLI as code.** `store.ts` steals a lock by
  `process.kill(pid, 0)` (`skills/poteto-mode/scripts/orch/store.ts:368`),
  which constraint C-2 forbids outright. It is also bun. Reimplementing the one
  good idea in it (the ledger key) is item 6.
- **Graded verdict vocabulary.** Five verdict grades against Tiphys's two.
  DR-0020 closed the enum at 0.1.0 and no Tiphys failure is named that grading
  removes. The head-SHA half of candidate 2 is taken; this half is not.
- **check-plan.mjs.** A template linter, not a plan checker. It hardcodes
  pstack's own strings, including a model slug at
  `skills/poteto-mode/scripts/check-plan.mjs:7` and a fixed ten-lane numbering.
  Tiphys's plan schema and clause map are the stronger form.
- **Queue and drain, the in-flight window, the stop line.** No named failure in
  23 tuition entries or in STATE.md. Phases are not yet concurrent by default,
  so the window is unmotivated before M5.
- **Retry by failure mode.** The turn-end record carries an exit code and no
  reason (src/hooks.ts:13), so a cap-hit and a tool error are indistinguishable.
  Every recorded agent death here was a SESSION-level death where no payload
  exited, so the reason field would have been empty. The input does not exist
  until M4's executor adapters can observe it.
- **The pause-safely procedure.** Tiphys's measured failure is the opposite
  one: three false stops recorded in CLAUDE.md:1069, with the owner asking for
  the reverse. A procedure that makes stopping easier is actively harmful here.
  The one clause worth taking is the per-action commit trigger, item in the
  table.
- **The feature map and the generated verify skill.** DR-0029 decides it: a
  feature map is project content. The kernel ships the gate contract and zero
  project gates. If Pulse wants a launch-drive-evidence checklist it is Pulse's
  file, declared as a Pulse gate, needing zero kernel change.
- **reflect and automate-me.** Their trigger is a transcript, and transcripts
  are not durable here: exactly one session transcript exists in this container
  for a build running since 2026-08-05. Tiphys produced 23 tuition entries in
  about 40 days; discovery is not the failing stage, promotion is, and that is
  item 5.
- **The decision-log TSV.** DR-0027 is precisely the shape of objection: a
  per-decision row file is more non-shipping paperwork, and the failures it
  claims to remove are READ failures, not write failures. CLAUDE.md:1043 says
  the fact was written down and still rediscovered thirteen days later. What is
  taken instead is the side mechanism: cross-model review of the orchestrator's
  own trail. There are 198 documents under delivery/review/ and not one takes
  the orchestrator's decision trail as its subject; the two named
  `orchestrator-*` are authored BY it about a code finding, not about it.
- **A third model tier.** role-model-config.yaml deliberately keeps vendor
  product names out of a versioned artifact. The two-tier vocabulary is closed
  by DR-0020 and no failure is named that a third tier removes.

## 6. Adversarial review outcome

To be completed: the draft goes to a reviewer that has not seen this reasoning,
against the ground rules (overengineering, conflicts with decision records,
items with no named failure, work that will not pay for its tokens at 10 to 20
concurrent agents). Findings are recorded as act on, consider, noted or
dismissed, with reasons, and what is dismissed stays visible.

## 7. Licence and attribution

pstack is MIT (Lauren Tan, poteto). **No pstack code or text is copied into
Tiphys by any item in this plan.** Every borrow is an idea or a design shape:
the ledger key, the mode-selection step, the checklist binding, the prototype
gate, the bucket split. The pinned checkout lived outside this repository and
is not vendored.

Two items would need attribution if they changed shape and they are called out
so nobody does it accidentally. If item 6 ever reimplements pstack's ledger
row FORMAT rather than its key, or if a future item ports `watch-pr`'s policy
engine (which is plain Node apart from its bun bootstrap and is genuinely good
work), each carries an MIT notice naming the upstream file and commit.

---

## Appendix A: method and what it cost

Nine agents read pstack, nine mapped Tiphys, seventeen assessed one candidate
each, one reviewed the draft cold. Every absence claimed in this document was
probed with a command rather than inferred; the commands are in the working
notes and the material ones are quoted inline.

This review is itself overhead by its own measure, and the number is recorded
rather than omitted: over 3.3 million subagent tokens, 100% in the overhead
bucket, producing one document and one sandbox tool. Whether that was worth it
is a judgement the ratio cannot make, which is stated in
`tools/value-ratio/README.md` as a limitation rather than discovered later.

## Appendix B: corrections to claims made during the review

- An early reading held that Tiphys's dual review was NOMINALLY cross-family.
  That was wrong and is corrected in section 3 D3: real cross-vendor review
  happened in nine reviews. What is true is narrower and is the finding that
  survived: the property is recorded in prose in 30 of 109 documents and is
  machine-comparable in none.
- An early reading held that the tuition promotion guard was vacuous. It is
  not: it fires correctly for the twelve entries that declare the field. The
  defect is that declaration is optional and eleven entries are silent.
- The value-ratio tool's first glob matcher was wrong in a way that read
  plausibly, and the numbers it produced were quoted before the bug was found.
  Every figure in this document comes from the corrected matcher, which two
  independent implementations now agree on to the file.
