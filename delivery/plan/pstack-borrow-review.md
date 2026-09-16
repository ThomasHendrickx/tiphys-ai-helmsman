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

**The rule that fixes it, decided by the owner as DR-0035: every change is
reviewed, and what tiers is the number of FIX ROUNDS.** A fix round is one
back-and-forth between the `clean-room-reviewer` and the `implementer`. One is
the floor and there is no zero:

| | low impact | high impact |
|---|---|---|
| **zero subject** | 1 round | 1 round |
| **small** | 1 round | 2 rounds |
| **large** | 2 rounds | 3 rounds |

Size buys coverage and impact buys depth, but both are spent on ITERATION
rather than on whether a review happens. **The cap is a cap, not a target**, and
the number that justifies it is already measured: of sixteen fix rounds in M1,
thirteen were re-reviewed and TWELVE of those thirteen produced a new finding
attributable to the round itself (CLAUDE.md:335). A fix round is a change, and
a change needs reviewing, so round N+1 largely exists to check round N.

At the cap, DR-0016 applies: a fresh implementer and a third review contract,
not a fourth round.

The selector is built and pushed, in the sandbox repository, with the
measurement it rests on. On top of it, five text edits close defects in how the
process runs itself, and three changes increase what the kernel can do.

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

`tools/value-ratio/assurance-tier.mjs` in the sandbox repository implements
DR-0035's table:

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

5. **The floor and the ceiling are asserted directly**, not left to follow from
   the table, so a later editor tuning a cell trips a test.

Measured: 18 tests, 18 pass, 0 fail, 0 skipped on node v22.22.2, red under four
structurally different mutations. Counting overhead in the subject reddens
three tests; turning the floor refusal into a no-op reddens two; dropping any
cell to zero reddens two; raising a cell above three reddens the same two.

**What it deliberately does not do.** It picks the round budget. It does not
measure whether the review that happened was any good, and the red-witness rule
remains the only thing separating a round done well from one done badly.

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

Two groups. The first five close a defect in how the process runs itself and
cost almost nothing. The last three increase what the kernel can DO, and each
one carries its round budget under DR-0035 rather than being argued into or out
of existence.

### Hygiene: five text edits

**Five items.** An earlier draft had sixteen, and an adversarial reviewer
pointed out that a sixteen-item plan is the disease this document diagnoses.
The twelve that were cut are not lost: they are in section 4 with their
verdicts, and any can be picked up when something makes it worth it. Four are text edits in `.claude/`; the fifth is a
ten-line configuration change in the kernel. Each closes a measured failure,
and together they are about an hour.

| # | Item | Verify | Measured failure it closes |
|---|---|---|---|
| 1 | Fix three stale lines in the dispatch playbook | `git diff`, then `node scripts/check-authored-bytes.mjs` | The procedure contradicts three decided records |
| 2 | Bind the clean-room checklist to the dispatch step | `node bin/tiphys.ts checklist resolve --checklist clean-room --framing criteria-contract` | 13 of 16 reviews since it shipped never used it |
| 3 | Record the reviewer's model in every review header | grep the next two review headers | Decorrelation is unauditable across most of the record |
| 4 | Close the tuition promotion leak | `npm test` | 10 entries never reached the shipped feed |
| 5 | Add the missing citation roots | re-run the citations gate over a document citing each | 4 shipped trees cannot be cited by line |

### Capability: three that change what the kernel can do

These were cut from an earlier draft under a reviewer's finding that sixteen
items was the wrong shape. The reviewer was right about the SHAPE and the cut
took the SUBSTANCE with it. They are back, and DR-0035 is what makes that
defensible: each now carries a cost in rounds instead of a place in a list.

| # | Item | Rounds | Verify | Named failure it closes |
|---|---|---|---|---|
| 6 | Head SHA on the verdict | 2 or 3 | `npm ci && npm run build && npm test` | A verdict cannot say which head it read |
| 7 | Validate the phase half of a composed brief | 2 | `npm test` | A brief can render with no acceptance section and exit 0 |
| 8 | The prototype gate | 1 | `npm test` | Facts a script settles are found by adversarial review instead |

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

**The scoping is part of the acceptance, not a caveat.** Under the
`criteria-contract` framing the checklist resolves 23 probes, each
evidence-required, and a blanket 23-answer floor would reimpose on cheap phases
exactly the ceremony DR-0027:42 cut. So the binding names its scope: the floor
applies to reviews under the `full` tier only, which section 3 selects, and
DR-0027's own table decides which trees reach it. A review of a `scripts/`-only
change answers nothing. This is the one item in the plan that could increase
per-review cost, and the scoping is what stops it.

**3. The reviewer's model.** Costs nothing, and it is what makes section 6's
question answerable at all. Today the two reviews of one head are rarely
comparable after the fact: of 109 clean-room documents, **13 name a model in a
reviewer or produced-by header**, which is the only place a later reader can
rely on. (26 mention one anywhere in the body, often inside a quoted grep
pattern, which is not an assertion. The commands for both are in appendix A.)

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

**5. The missing citation roots.** Found by running the gate rather than by
reading it: the citations gate reddened twice while this document was being
written, on `role-model-config.yaml:7` and on `checklists/clean-room.yaml:38`,
both reported as "matches no declared root". The declared roots at
src/gates/citations.ts:200 are `src/`, `bin/*.ts`, `test/`, `scripts/`,
`delivery/`, `schemas/`, `roles/`, `tuition/`, root `*.md` and root `*.json`.

So four shipped trees cannot be cited by line from a `delivery/` document:
`checklists/`, `templates/`, `witness/`, and root-level `*.yaml`, which is
`gate-registry.yaml`, `assurance-modes.yaml` and `role-model-config.yaml`.
Every one is in the `files` array of package.json:20 and therefore ships. The
red-witness system's 162 specs are among them.

The consequence is quiet rather than loud, which is why it survived: an author
who hits it does what I did and QUOTES the path in backticks, which the gate
treats as deliberately non-resolving. The evidence chain degrades one citation
at a time and nothing reports it. Acceptance: a document citing one line in
each of the four resolves all four, and the gate's unit count rises by four
against the same document with them quoted.

**6. Head SHA on the verdict.** pstack keys a ledger row by pull request plus
head SHA, so a new head voids the verdict for free
(`skills/poteto-mode/scripts/orch/store.ts:1331`). Tiphys says the gap in its
own source at src/checks.ts:3255: "the verdict schema carries no head field, so
`phase` is the join key and the DIRECTORY is what scopes it". So DR-0012:22's
"two reviews of the current head" is enforced by which folder the operator
points the checker at.

**This is the weakest of the three on evidence and it is stated that way.** The
measured instance, a pair of verdicts on a pre-fix-round head, is recorded at
delivery/evidence/m3-exit-test/e1/e1-7/verdict-criteria.yaml:8, which carries
the head in prose inside `produced-by`. It was CAUGHT, by an orchestrator
reading that prose, and it cost nothing. The argument is that the property is
currently uncheckable, not that it has already bitten.

The change is three fields (`head`, `base`, `patch-id`), a group key of phase
plus head, and a `--head` flag on the checker. **The patch-id is not optional
decoration:** head alone voids both reviews whenever a branch merges its base in
to stay mergeable, which is ordinary practice. That half is pstack's playbook
PROSE rather than its implemented store, so it is designed here from scratch
and costed accordingly. This is a breaking change to a published schema and
lands with the next contract revision, not before.

The round estimate is 2 or 3 because it straddles the size threshold. **The
selector decides from the real diff, not the author**, which is the point of
having one.

**7. Validate the phase half of a composed brief.** The sharpest of the three,
and it is barely a borrow: pstack's own "missing fields are a refuse-to-spawn
condition" is prose, because its `--brief` is an unchecked opaque string.
Checking that claim is what surfaced the Tiphys gap.

`schemas/plan.schema.json` requires fifteen fields on a phase, among them
`intent`, `files-to-touch` and `acceptance`. `tiphys brief compose` never
validates the plan against that schema: it YAML-decodes it at
src/commands/brief.ts:191 and renders. And the renderer at src/roles.ts:855 is
`if (!(field in phase)) { continue; }`.

**So a plan phase missing `acceptance` composes a brief with no acceptance
section, and the command exits 0.** The asymmetry is exact and it is the
finding: the ROLE half IS guarded, by `missingRequiredSections` at
src/commands/brief.ts:155, which refuses and names what is absent. The kernel
validates the half it authored and trusts the half the operator supplies.

The same shape has already been paid for once in this command family:
scripts/check-brief-drift.mjs:36 records the brief gate reporting
"green (3 generated brief gate rows compared)" over a table holding a header, a
separator and nothing else.

The change is to call the validator that already exists before rendering.
Non-breaking, a few lines and their tests.

**8. The prototype gate.** pstack classifies a fork before asking: if the answer
is observable by running something it is not a question
(`skills/poteto-mode/SKILL.md:20`), open questions are settled by prototype
BEFORE the plan is written (`skills/poteto-mode/playbooks/multi-phase-plan.md:6`),
and its plan linter makes a prototype-evidence appendix mandatory
(`skills/poteto-mode/scripts/check-plan.mjs:180`).

Tiphys has none of this. `grep -rniE 'prototype|spike|throwaway'` over `roles/`,
`checklists/`, `schemas/`, `.claude/` and CLAUDE.md returns zero. There is no
way to settle an empirical question except to write prose about it in a plan
and have the prose adversarially reviewed.

The named failure is F-02 in the external plan review
(delivery/review/plan-review-r4-external.md:15): `tiphys init` assumes git
author configuration. That is a fact a short run on a clean machine settles,
and it cost a high-severity finding in a review round instead.

**The honest limit, because it decides how much this is worth.** The other
findings in that round were critiques of the CONTRACT rather than of the world:
F-05, that monotonically increasing test counts are a weak and gameable
acceptance rule, and F-06, that M4 packs several architecture-bearing systems
into one paragraph. No prototype reaches either. This shrinks plan review; it
does not replace it, and the candidate table's "adapt" verdict says so.

The change is an optional `prototype-evidence` array on the plan schema, a
clause in `roles/plan-writer.md`, and a derived check that a phase whose
grounding asserts external tool behaviour cites one. Non-breaking.

## 6. The decision, now answered

**DR-0035, decided by the owner 2026-09-15:** every change is reviewed, the
tiering is on the number of fix rounds, and one round is the bare minimum.
The record is at
delivery/decisions/DR-0035-review-is-never-skipped-the-rounds-are-what-tier.md:16.

That refused the zero tier this document proposed, and it replaced the dial.
An earlier version tiered which assurance MODE a change earned and could select
none. Two things were wrong with it, and only the first was obvious:

1. It would have let a change merge unlooked-at.
2. **It silently narrowed a condition of the DR-0012 grant.** Delegated merge
   authority is conditional on two independent clean-room reviews of the
   current head (DR-0012:22), and a change routed to no review has no such
   pair. DR-0012:40 puts an owner-reserved condition outside what the
   orchestrator may change. An adversarial reviewer found that; I had justified
   escalating the question on risk appetite alone.

**Tiering the rounds dissolves the governance problem rather than answering
it.** The first review always happens, so DR-0012's condition is untouched, and
what varies is only how many times findings go back to the implementer.

Nothing in this plan now waits on the owner. Two further calls were taken under
DR-0016 and are reported rather than asked: the value-to-overhead budget is
reporting-only rather than a gate, because a flat ratio penalises exactly the
cheap `.claude/` fixes section 5 recommends; and `produced-by` gets a token
grammar at the next breaking contract revision rather than staying prose.

## 7. Not borrowing, with reasons

- **The orch state CLI as code.** It steals a lock by `process.kill(pid, 0)`,
  which constraint C-2 forbids, and it is bun. The one good idea in it, the
  ledger key, is candidate 2.
- **Graded verdict vocabulary.** Five grades against Tiphys's two. DR-0020
  closed the enum and no Tiphys failure is named that grading removes.
- **check-plan.mjs.** A template linter, not a plan checker: it hardcodes
  pstack's own strings, including a model slug and a fixed ten-lane numbering.
- **Queue and drain, the in-flight window, the stop line.** No named failure in
  23 tuition entries or in STATE.md, and that carries the verdict on its own.
  An earlier draft also said the window was unmotivated because phases are
  sequential before M5; that reason is deleted, because DR-0011 superseded it
  and item 1 of section 5 exists to fix the same stale wording elsewhere.
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

Three reviewers, three lenses, none of whom saw the reasoning. All three
returned FIX-ROUND-NEEDED, and the document is better for each of them.

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

The third reviewer, on conflicts with decided records, returned after the
rewrite and found four things the rewrite had not already closed. **The most
important is in section 6:** the tier rule amends a condition of the DR-0012
grant, which makes D1 owner-reserved by construction rather than by my
judgement, and I had justified the escalation on the weaker ground of risk
appetite alone. It also caught a number that does not reproduce ("30 of 109
name a model": the reproducible figures are 13 in a header and 26 anywhere in
the body, and the header one is what matters), an internal contradiction where
section 7 rejected a candidate using the same stale "sequential until M5"
wording that section 5 item 1 exists to delete, and a 23-probe floor that
needed DR-0027 scoping written into the acceptance rather than left as a
caveat. All four are fixed above.

**Not covered, stated because a review whose scope is wrong returns an empty
result indistinguishable from an absence of defects.** The conflicts lens says
in terms that it judged governance and not engineering: "a proposal could be
internally coherent, consistent with all 32 records, and still a bad idea, and
I would not have said so." The cost lens reviewed cost only. No reviewer
examined the sandbox subject project, and no reviewer saw the final text of
this document: all three read the sixteen-item draft, so the four-item plan in
section 5 has had a cost read and a governance read of its parts, and no review
of its whole.

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

# reviews naming a model in a HEADER (13), and anywhere in the body (26)
grep -lEi '^[[:space:]]*[-*]?[[:space:]]*(reviewer|produced-by|model)[[:space:]]*:.*(opus|sonnet|gpt-5|codex|gemini|grok)' \
  delivery/review/clean-room-*.md | wc -l
grep -liE 'opus|sonnet|gpt-5|codex' delivery/review/clean-room-*.md | wc -l

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
100% of it in the overhead bucket, producing one document, one measurement
tool, one subject project and one decision record. Under DR-0035 this change
has a zero subject in the kernel and earns ONE round; it got three. That is a
fair summary of the whole problem: the process spent triple its own budget on
the document arguing for the budget. Whether it was worth it is a judgement the
ratio cannot make, which is why the tool says so in its own README rather than
leaving it to be discovered.
