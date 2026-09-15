# pstack borrow review: proportioning the making-sure

- date: 2026-09-15
- author: orchestrator
- status: PROPOSAL. Nothing here is decided except where it says so.
- reference: pstack 0.15.2 by Lauren Tan (poteto), MIT, in Cursor's plugins
  repository, read at pinned commit
  `c1c0a32802223f4be824112dd83d33ad29a8b26c`. Cloned outside this repository,
  never vendored, never committed.
- subject: Tiphys at `main`, `3b40118`, `@tiphys/kernel@0.1.0` published,
  M3 closed, M4 not started.
- method: nine readers over pstack, nine over Tiphys, one assessor per
  candidate, three adversarial reviewers that had not seen the reasoning. What
  they found is in section 8 and it changed this document twice.

## The answer, in one page

**Tiphys does not overspend on bureaucracy. It overspends on making sure.**
Measured across all 50 units ever merged to `main`:

| | value | assurance | overhead |
|---|---|---|---|
| lines changed | 40,825 (9.4%) | **307,082 (70.8%)** | 85,991 (19.8%) |

Seven and a half lines of proof for every line of the thing being proved. That
is not a process drowning in paperwork; it is a process that reviews everything
as though everything mattered equally.

**The rule that fixes it: size buys coverage, impact buys depth.** They are
different axes, and conflating them is what makes a process overreact. A large
surface can break in a corner nobody looked at, so it needs breadth. A change
that matters can be three lines and still be expensive to get wrong, so it
needs depth. Neither substitutes for the other:

| | low impact | high impact |
|---|---|---|
| **zero subject** | none. It is paperwork. | none. There is no subject. |
| **small** | `local-only`. A quick pass. | `full`. Depth, not breadth. |
| **large** | `direct-pr`. The gates ARE the coverage. | `full`. Both contracts, both lenses. |

**Those mode names are not new.** `full`, `direct-pr` and `local-only` are the
three modes the blueprint declares at
delivery/intake/orchestrated-delivery-v1.md:148 and `assurance-modes.yaml`
defines. Tiphys never lacked assurance tiers. It lacked a rule for picking one,
so everything got `full`.

The selector is built and pushed, in the sandbox repository, with the
measurement it rests on. Four small things in `.claude/` are worth doing on top
of it. One question is genuinely yours.

## 1. Current state of Tiphys

A delivery-process kernel shipped as an npm package, built BY an orchestrated
process rather than by itself; nothing runs on Tiphys before M4
(delivery/plan/kernel-plan-v1.md:38). M1 to M3 are closed. 28 phases were
planned and 27 merged through their own branch.

**Built and shipping.** Sixteen CLI subcommands, 16 JSON schemas, 5 role briefs
for 6 declared roles, 5 checklists, a gate registry with 18 gates, a tuition
feed, and 162 witness specs under `witness/` naming concrete source mutations
as dangerous states.

**The mechanisms that carry it.** Three constraints do most of the work: never
read current state from the tail of an append-only log (src/task.ts:24), never
use pid or process liveness for identity or exclusion (src/liveness.ts:11), and
never open a path whose type has not been established (src/task.ts:38).
Assurance modes are declared, not improvised, and a mode's declared skips are
recomputed against `full` in three directions. A gate writing green over zero
units is rewritten to error.

**Designed and not built.** Layer 3 and 4 binding. `role-model-config.yaml:7`
says so: M3 ships the data and no resolver. Inside `src/`, the file is named
four times and never read to route anything. The kernel has no orchestration
loop: `tiphys spawn --exec` launches a generic argv subprocess, and the
dispatching lives in a human-readable skill under `.claude/`.

**Open.** M4 is cutover: the pilot (DR-0034: `pulse`), the thin
`@tiphys/claude-code-plugin`, the harness adapter, authority enforcement, fleet
durability, cross-environment exclusion. It may not dispatch without its own
intake and plan (delivery/plan/kernel-plan-v1.md:368).

**The governing steers, newest first.** These decide most of section 5:

- DR-0034:12, the owner: "let's not over engineer adoption. first get this
  thing working and just use it."
- DR-0029:19 and DR-0028:12, the owner: the kernel owns orchestration and ships
  the gate CONTRACT and zero project gates; project checks come from the
  project.
- DR-0027:9, the owner: reviews target shipped value, not ceremony. Cost of
  ignoring it at DR-0027:17.
- DR-0016:26: being asked a question whose answer was already obvious is a
  failure of the system.

## 2. The finding

The headline table is the measurement. Three things about it matter more than
the number.

**It is recomputable.** DR-0027 counted this once, by hand, after the fact,
because the owner noticed. A number nobody can re-derive is an anecdote. It is
now a command with an exit code, and two independent implementations plus an
adversarial reviewer's third agree on every figure to the line.

**Assurance, not paperwork, is the bulk.** An earlier draft reported 74.9%
overhead, because `delivery/review/**`, `delivery/verification/**` and
`delivery/evidence/**` were classified as paperwork. They are not: a clean-room
review is a test written in prose. An adversarial reviewer caught the shipped
classification contradicting its own stated rationale, and the correction moved
239,000 lines and took the ratio from 7.96 to 2.11. That correction is the
difference between "stop writing so much" and "proportion the proof to the
thing proved", and only the second is true.

**The per-unit distribution is where the overreaction is visible.** Subject
size, meaning value plus assurance lines with paperwork excluded, across the 50
units: p25 0, median 0, p75 338, p90 3408. **Thirty-four of the fifty units
have a subject size of zero.** They changed no value path and no assurance
path. Every one of them still went through the process.

One honest caveat, from the same reviewer: the row "50 of 50 units touched
overhead" is process-mandated rather than discovered, because the durability
rule requires paperwork with every change. The LINE percentages carry the
argument on their own.

## 3. The rule, and what is already built

`tools/value-ratio/assurance-tier.mjs` in the sandbox repository implements the
two-by-two:

```
node tools/value-ratio/assurance-tier.mjs --repo <dir> --range <rev> --impact <low|high>
```

Four design decisions in it are load-bearing, and each is asserted in the suite:

1. **Size is computed, impact is declared.** Size comes from the diff and
   cannot be argued with. Impact is a judgement, declared before the work in
   the phase declaration, where it cannot be retrofitted to justify a review
   that was skipped.
2. **The declaration has a floor.** `highImpactPaths` names the paths where
   being wrong is expensive. A change touching one may not be called low
   impact; the command refuses and names the path rather than warning.
3. **Overhead is excluded from size, both ways.** A longer work history cannot
   buy a heavier review and a shorter plan cannot dodge one.
4. **The threshold is derived, not chosen.** 500 subject lines sits between the
   kernel's own p75 and p90.

Measured: 17 tests, 17 pass, 0 fail, 0 skipped on node v22.22.2, red under two
structurally different mutations. Counting overhead in the subject reddens
three tests; turning the floor refusal into a no-op reddens two.

**What it deliberately does not do.** It picks the tier. It does not measure
whether the review that happened was any good, and the red-witness rule remains
the only thing separating a `full` review done well from one done badly.

**What adopting it costs.** Nothing in the kernel yet. The selector reads a git
range and a declaration. The cheapest adoption is to run it at dispatch and
record the answer in the phase declaration, which is a `.claude/` procedure
change. Wiring it into `assurance-modes.yaml` as a `selection` field belongs in
M4's pilot-bootstrap workstream, after the pilot has produced evidence about
whether the thresholds are right.

## 4. Candidate assessment

Verdict key: **have** (present, often stronger), **adopt**, **adapt** (borrow
narrower than proposed), **reject**.

| # | Candidate | Verdict | Why, in one line |
|---|---|---|---|
| 1 | Standing orders register | adapt | Verbatim append at spawn is already CODE (src/brief.ts:24) and the charter owns the content scope; only the fix-round brief has no template. |
| 2 | Verification ledger | adapt | The head-SHA key is real and cheap; the graded verdict vocabulary is refused under DR-0020. |
| 3 | Brief contract | adapt | The role half is validated and refused; the phase projection is not. |
| 4 | Scale gates | **adopt, and it became section 3** | The collapse rule is the ancestor of the two-by-two. |
| 5 | Queue discipline | reject | No named failure in 23 tuition entries or in STATE.md. |
| 6 | Liveness and failure | reject | No named failure, and two of the seven rules are actively harmful here. |
| 7 | Playbook fidelity | adapt | Tiphys ships a review checklist its own dispatch procedure never names. |
| 8 | Model roles | adapt | `CLAUDE_CODE_SUBAGENT_MODEL` is unmentioned repo-wide and would flatten role routing silently. |
| 9 | Reviewer independence | adapt | The decorrelation check compares free prose, and has never run. |
| 10 | Findings triage | have | 49 arbitrations already do it, grouped by mechanism rather than by band. |
| 11 | Decision log | adapt | Refuse the TSV; take the cross-model review of the orchestrator's own trail. |
| 12 | Pickup and pause | adapt | `orchestrator-next.mjs` exits nonzero while work remains, which beats a playbook. Refuse the pause procedure: the measured failure here is stopping too early. |
| 13 | Verification capability | reject | DR-0028 and DR-0029 decide it: a feature map is project content. |
| 14 | Setup improvement loop | reject | Transcripts are not durable here. It did surface a live defect, section 5 item 4. |
| 15 | Planning | adapt | Prototype the empirically settleable forks; keep the plan as the owner contract. |
| 16 | Value-to-overhead accounting | adopt | Built, sections 2 and 3. |

**Where Tiphys is already stronger, and pstack should borrow back.** Red
witness: 162 specs with concrete mutations, against pstack's prose principle.
Vacuity accounting: a gate green over zero units becomes an error, which pstack
has no concept of. Declared downgrades recomputed in three directions. The
three constraints: pstack's own store steals a lock by `process.kill(pid, 0)`
and treating ESRCH as death, which constraint C-2 forbids outright, so
borrowing that code would be a regression. Requirement traceability, which
pstack has none of. And brief refusal: pstack's "missing fields are a
refuse-to-spawn condition" is prose, since `--brief` is an unchecked opaque
string, while Tiphys's `brief compose` genuinely refuses and names the path.

## 5. The work

**Four items.** An earlier draft had sixteen, and an adversarial reviewer
pointed out that a sixteen-item plan is the disease this document diagnoses.
The twelve that were cut are not lost: they are in section 4 with their
verdicts, and any can be picked up when something makes it worth it. These four
are text edits in `.claude/`, each closes a measured failure, and together they
are about an hour.

| # | Item | Verify | Measured failure it closes |
|---|---|---|---|
| 1 | Fix three stale lines in the dispatch playbook | `git diff`, then `node scripts/check-authored-bytes.mjs` | The procedure contradicts three decided records |
| 2 | Bind the clean-room checklist to the dispatch step | `node bin/tiphys.ts checklist resolve --checklist clean-room --framing criteria-contract` | 13 of 16 reviews since it shipped never used it |
| 3 | Record the reviewer's model in every review header | grep the next two review headers | Decorrelation is unauditable across most of the record |
| 4 | Close the tuition promotion leak | `npm test` | 10 entries never reached the shipped feed |

**1. Three stale lines.** `.claude/skills/phase-delivery/SKILL.md:8` says a
phase is "merged by the owner", which DR-0012 delegated. Line 13 says the
orchestrator never lets a review be skipped, which DR-0027 narrowed. Line 21
says "Phases are sequential until M5", which DR-0011 superseded. Acceptance:
each line cites the record that governs it, and a grep for the superseded
wording returns zero.

**2. The checklist binding.** `checklists/clean-room.yaml` landed on 2026-08-13
in `2a3892b`. Sixteen clean-room reviews have been added since; three reference
it, and two of those three are the reviews of M3-P7, the phase that built it.
Outside its own phase: one in fourteen. `grep -n checklist` over the dispatch
skill returns zero hits, including at the clean-room dispatch step
(.claude/skills/phase-delivery/SKILL.md:83). The borrow from pstack is not its
copied todo list, which is weaker than what Tiphys ships; it is the connection
pstack gets free by putting the checklist in the file the agent opens.
Acceptance: the next two reviews each answer every resolved probe by id, with a
probe that does not apply answered "not applicable" and a reason.

*Caveat, from a reviewer:* under some framings the checklist resolves 23
probes, and a per-review floor of 23 evidence-required answers collides with
DR-0027's tiering. The binding must say which tier the floor applies to. Under
section 3 the answer falls out: `full` only.

**3. The reviewer's model.** Costs nothing, and it is what makes section 6's
question answerable at all. Today the two reviews of one head are never
comparable after the fact: across 109 clean-room documents, 30 name a model.

**4. The tuition promotion leak.** Found while assessing candidate 14.
test/tuition.test.ts:173 checks that every delivering-log entry declaring
`kernel-relevant: yes` resolves in the shipped feed. Twelve of the 23 entries
declare it and all twelve are promoted, so the guard works. Eleven declare
nothing, are skipped by `continue` at test/tuition.test.ts:174, and ten of
those have no shipped counterpart: T-010 to T-014, T-019, T-020, T-023, T-024,
T-025. The obligation is self-declared, so an entry that says nothing is exempt
from it. The entry the guard failed hardest to promote is T-010, the record of
a check that could not see the byte it existed to catch.

Acceptance, in two parts so no promotion is prejudged: (a) the guard reddens on
an entry declaring neither `yes` nor `no`, naming the file; (b) all eleven
silent entries gain an explicit declaration. What gets promoted falls out of
(b) rather than being fixed in advance.

## 6. The decision for you

One. Everything else was decided under DR-0016 and is recorded with its
reasoning. An earlier draft raised three questions, and two of them carried
recommendations I said I would defend, which DR-0016 and DR-0023 both say means
there was no question.

### D1. Do you accept that some changes ship with no adversarial review?

**The thing.** The rule in section 3 sends zero-subject changes to no review at
all, and small low-impact changes to `local-only`, which is implement,
orchestrator diff review, fast-forward. Under it, 34 of the last 50 units would
have had no reviewer, and some of the rest would have had one pass instead of
two.

**Why it is genuinely yours.** It is a risk-appetite choice, it is high impact,
and it is expensive to reverse in the direction that matters: a defect that
ships through a zero tier is found by a user, not by a reviewer. I cannot
defend a recommendation on your behalf because the thing being traded is your
exposure, not my correctness. This is the DR-0016 exception rather than a
failure to decide.

**Options.**

1. **Accept as specified.** The zero tier gets the byte and citation gates and
   no reviewer; small and low gets one pass. This is the version that is built.
2. **Accept with a floor: never zero.** Every change gets at least
   `local-only`, so nothing merges unlooked-at. Costs one orchestrator diff
   review per paperwork commit, which over this history is 34 reviews that
   would have found, on the evidence, nothing.
3. **Accept, but review the impact DECLARATION rather than the change.** The
   declaration is one line and reviewing it is cheap; getting it wrong is the
   only way the tier comes out wrong.

**What I would say if pushed:** option 3 is what I would build next, because
the scheme's soundness rests entirely on the impact declaration and nothing
currently reads it. But the trade between 1 and 2 is yours.

**Blocks:** wiring the selector into dispatch. Not the four items in section 5,
which are independent of it.

**Decided under DR-0016 and reported, not asked:** the budget is
reporting-only rather than a gate, because a flat ratio penalises exactly the
cheap `.claude/` fixes this review recommends, which is the wrong incentive;
and `produced-by` gets a token grammar at the next breaking contract revision
rather than staying prose.

## 7. Not borrowing, with reasons

- **The orch state CLI as code.** It steals a lock by `process.kill(pid, 0)`,
  which constraint C-2 forbids, and it is bun. The one good idea in it, the
  ledger key, is candidate 2.
- **Graded verdict vocabulary.** Five grades against Tiphys's two. DR-0020
  closed the enum and no Tiphys failure is named that grading removes.
- **check-plan.mjs.** A template linter, not a plan checker: it hardcodes
  pstack's own strings, including a model slug and a fixed ten-lane numbering.
- **Queue and drain, the in-flight window, the stop line.** No named failure.
  Phases are not concurrent by default, so the window is unmotivated before M5.
- **Retry by failure mode.** The turn-end record carries an exit code and no
  reason (src/hooks.ts:13). Every recorded agent death here was session-level,
  where no payload exited, so the reason field would have been empty. The input
  does not exist until M4's executor adapters can observe it.
- **The pause-safely procedure.** Tiphys's measured failure is the opposite:
  three false stops recorded in CLAUDE.md:1069, with the owner asking for the
  reverse.
- **The feature map and the generated verify skill.** DR-0028 and DR-0029
  decide it. If Pulse wants a launch-drive-evidence checklist it is Pulse's
  file, declared as a Pulse gate, needing zero kernel change.
- **reflect and automate-me.** Their trigger is a transcript, and transcripts
  are not durable here: one session transcript exists in this container for a
  build running since 2026-08-05.
- **The decision-log TSV.** DR-0027 is the objection: more non-shipping
  paperwork, and the failures it claims to remove are READ failures, not write
  failures. CLAUDE.md:1043 records a fact that WAS written down and was still
  rediscovered thirteen days later.
- **A third model tier.** `role-model-config.yaml` deliberately keeps vendor
  product names out of a versioned artifact, and no failure is named that a
  third tier removes.

## 8. Adversarial review outcome

Three reviewers, three lenses, none of whom saw the reasoning. Both completed
reviews returned FIX-ROUND-NEEDED.

**Acted on.** The plan was sixteen items and is now four. Two owner questions
became orchestrator decisions. The bucket classification was wrong and the
correction moved 239,000 lines and inverted the headline. The checklist count
was 10-and-1 and is 16-and-3. "pstack ships no planning skill" was false: it
ships `skills/poteto-mode/playbooks/multi-phase-plan.md`, `skills/architect/`
and a plan linter, and the real contrast is that it does not plan BY DEFAULT.
The red witness for the measurement tool could not be re-run by a reader and
now can. Counts corrected: 165 witnesses to 162, 6 role briefs to 5, 27 phases
to 28-planned-27-merged, three constraint citations repointed.

**Considered, not acted on.** Candidate 2's near-miss cost nothing and was
caught by the process working; that is recorded rather than dressed up. The
patch-id idea is pstack prose rather than its implemented store, so borrowing
it means designing from scratch, which is now said. The plan-review derivation
rested on an unenumerated count and the underlying figure is 47 unique finding
ids, not 40; the claim is weakened accordingly rather than propped up.

**Dismissed, with reasons, because a dismissal a reader cannot see is
indistinguishable from an oversight.** The headline measurement survived a
fully independent re-derivation by a reviewer who wrote their own script and
derived the classification from `package.json`'s `files` array, and got every
figure identical. No proposed item introduces a bun dependency. The
three-bucket structure is right and the obvious two-bucket simplification would
be worse; the holes found were in the classification, not the structure.
Candidate 2's red witness is against the dangerous state rather than the absent
feature. The checklist binding does not make reviews materially longer.

**Not covered, stated because a review whose scope is wrong returns an empty
result indistinguishable from an absence of defects.** The third reviewer, on
conflicts with decided records and internal consistency, had not returned when
this was written; its findings are not represented here. The cost lens reviewed
cost only. No reviewer examined the sandbox subject project.

## 9. Licence and attribution

pstack is MIT (Lauren Tan, poteto). **No pstack code or text is copied into
Tiphys by any item in this plan.** Every borrow is an idea: the mode-selection
step, the checklist binding, the ledger key, the prototype gate, the bucket
split. The pinned checkout lived outside this repository and is not vendored.

Two items would need attribution if they changed shape, named so nobody does it
by accident: reimplementing pstack's ledger row FORMAT rather than its key, or
porting `watch-pr`'s policy engine, which is plain Node apart from its bun
bootstrap and is genuinely good work. Each would carry an MIT notice naming the
upstream file and commit.

---

## Appendix A: the commands behind every number

```
# the headline table and the ratio
node tools/value-ratio/value-ratio.mjs --repo <kernel> --range origin/main

# the tier a range earns
node tools/value-ratio/assurance-tier.mjs --repo <kernel> --range <sha>~1..<sha> --impact low

# reviews added after the checklist landed, and those referencing it
git log --format=%H 2a3892b..origin/main | while read c; do \
  git show --pretty=format: --name-only --diff-filter=A "$c"; done \
  | grep '^delivery/review/clean-room-.*\.md$' | sort -u

# the tuition promotion leak
for f in delivery/tuition/T-*.md; do \
  grep -qiE 'kernel-relevant:[[:space:]]*yes' "$f" || echo "$f"; done

# every review header naming a model
grep -rhiE '^[[:space:]]*[-*]?[[:space:]]*(reviewer|produced-by|model)[[:space:]]*:' \
  delivery/review/clean-room-*.md | grep -iE 'sonnet|opus|gpt|codex|gemini|grok'

# counts
find witness -name '*.json' | wc -l ; ls roles/*.md | wc -l ; ls delivery/review/*.md | wc -l
```

Counts as measured: 162 witness spec files; 5 role briefs for 6 declared roles;
198 documents at the top level of `delivery/review/` and 234 including
`delivery/review/evidence/`.

## Appendix B: what this document got wrong

Kept rather than deleted, because a reader should be able to tell a corrected
claim from one that was always right.

- **The bucket classification was wrong and the headline was wrong with it.**
  Reviews and evidence were counted as paperwork, giving 74.9% overhead. They
  are assurance. The real figures are 9.4 / 70.8 / 19.8, and the ratio is 2.11.
- **"No reviewed head has ever had a cross-vendor pair" needed sharpening.**
  Non-Anthropic reviewers were genuinely used. What is true is that the two
  reviews OF ONE HEAD were never cross-vendor: the Anthropic pairs are Sonnet 5
  against Opus 5, and the macOS pilot pair is `gpt-5.6-sol` against
  `gpt-5.6-terra`, which is one vendor twice.
- **"Ten clean-room reviews, one referencing the checklist" was a date-windowed
  count.** Measured from the landing commit it is sixteen and three, two of the
  three being the checklist's own phase.
- **"pstack ships no planning skill" was false.** It ships a planning playbook,
  a design skill and a plan linter. It does not plan by default.
- **The tuition guard is not vacuous**, as an earlier reading had it. It fires
  correctly for the twelve entries that declare the field; the defect is that
  declaration is optional.
- **The measurement tool's own glob matcher was wrong** in a way that read
  plausibly, matching `src/**` against `src/cli.ts` but not
  `src/commands/doctor.ts`, and its numbers were quoted before the bug was
  found. Two further bugs surfaced while building the witness for it: a
  replacement string whose `$&` was expanded into the mutant, and a nested
  `node --test` that Node refuses recursively by warning on stderr and exiting
  zero. All three are one shape, a later pass that cannot tell what an earlier
  pass produced, and the last is a guard that could not go red.

## Appendix C: this review's own cost

4,487,517 subagent tokens recorded in the sandbox ledger across five workflows,
100% of it in the overhead bucket, producing one document, one measurement tool
and one subject project. Under this document's own rule this change has a zero
subject in the kernel and would earn no review at all; it got three. Whether
that was worth it is a judgement the ratio cannot make, which is why the tool
says so in its own README rather than leaving it to be discovered.
