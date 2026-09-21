# The value-delivery investigation: findings, corrected estimates, and the pruning-first plan

- subject: the owner's brief "Tiphys: Re-centering the Architecture on Value Delivery"
- investigated: 2026-09-21, against `main` at `60a87b7`
- method: nine parallel investigators, one per theme, read-only, every claim required to
  carry a `path:line` citation the agent had actually read
- status: findings settled. The plan below is a recommendation, not a dispatch.

This document exists so that nothing here has to be rediscovered. It records what was
measured, what was wrong, and what follows. A later reader should be able to act from
this file alone.

## What the brief was, and what it was not

The owner commissioned a document from a non-Anthropic model. The artifact produced is
an INVESTIGATION BRIEF, not an investigation report: it sets an assignment, states eight
hypotheses and asks someone to verify them against the codebase. It contains no findings.
So "is it valid" could only be answered by running the investigation it commissions.

Its "Things we explicitly do NOT want" section is unusually disciplined and should be
kept whatever else is done: it pre-empts numeric value scores, large risk matrices,
LLM-generated confidence percentages, a `value / token_cost` formula, and Goodhart.

Three items the brief placed OUT of scope, because the owner already had them on his own
list: merging and cleaning decision records, compacting the track record, and tightening
the prompt files. The investigation therefore did NOT cover pruning. That gap is closed
by Wave P below, which was added after the fact at the owner's request.

## Verdicts

| Theme | Verdict | The measurement that decided it |
|---|---|---|
| A product objective | partly confirmed | `product-intent` has zero readers. An inverted charter reading "Deliver nothing. Success is that no software is ever shipped and every ceremony is performed twice" validates at exit 0, identical to the real one. Reproduced twice, independently. |
| B invariants vs assurance | partly confirmed | No rule-class vocabulary exists anywhere. But the brief's prediction of symmetry is false: the credential boundary is real fail-closed code while dual review is structurally inert. |
| C per-phase assurance floor | partly confirmed, much already built | Three modes, mode-scoped gate selection and path-scoped `diff-touches` preconditions all exist and work. But `charter.yaml` line 43 carries one `assurance-tier` for the whole repository and its value is read by no code; the only reader of the field NAME is src/checks.ts:745, which compares enums. |
| D orchestrator judgment | DIAGNOSIS BACKWARDS | T-041: sixteen of twenty-eight merged M4 phases changed shipped-tree files with no review document and no reviewer dispatched. |
| E outcome first-class | partly confirmed | `intent` is a required phase field and reaches every dispatched agent, but resolves to nothing and is dropped at the phase-declaration projection. |
| F delivery cost telemetry | partly confirmed | More is already captured than the brief credits. And the theme is PARKED by the owner-approved plan at delivery/plan/kernel-plan-v1.md:422 as a v1 non-goal. |
| G tuition reverse gear | CONFIRMED | Seven gate ids added over the registry's life, zero ever removed. CLAUDE.md went 31 to 1327 lines in 48 days across 39 commits, with exactly one net-shrink commit, of one line. |
| H completion semantics | CONFIRMED | But the final-report schema faithfully implements the owner-supplied process document, which uses the word "value" zero times in 276 lines. |
| X mechanical vs prompt | CONFIRMED | Of 42 binding controls enumerated from CLAUDE.md, 11 are mechanical and merge-blocking and 22 have no mechanism at all. |

## The finding that reorders the whole brief

The brief assumes Tiphys is over-assured. Measured, the assurance layer it wants to make
proportional was substantially NOT RUNNING.

- `check-dual-review` reports zero verdict documents. Today, and across M1, M2, M3 and
  all thirty phases of M4. Re-measured at `60a87b7`.
- `merge-preconditions` inherits that precondition, so DR-0012's six merge conditions
  were never produced for any pull request.
- `verdict-criteria-complete`, the one check tying a review back to the declared
  acceptance list, cannot run at all: no `plan.yaml` is tracked in this repository.
- `delivery/review/` holds 241 markdown files at its top level and zero verdict JSON.
  The ten JSON verdicts that exist are nested below, which is where the gate does not read.
- Review coverage by milestone: M2 about 100 percent, M3 about 100 percent, M4 43 percent
  (13 of 30). The drop coincides exactly with two-wide parallel wave dispatch under DR-0044.
- Five real verdict documents were written to `/tmp/claude-0/verdicts/` and lost, because
  the reviewer brief names that path.

So the cost being paid was assurance CEREMONY while the assurance itself silently stopped.
That inverts the brief's priority order.

**The strongest counterargument, recorded rather than buried.** T-041 states that every
one of those sixteen phases passed the full gate bundle, both CI arms and a green
post-merge run, and that no defect is known to have resulted. The straightforward reading
is that the MECHANICAL layer was protecting the product and the prompt-only review layer
was the redundant part. On that reading the correct move is to delete prompt rules, not
promote them. This investigation does not accept that reading, because absence of a known
defect in unreviewed code is weak evidence, but a later reader should know the case exists
and was considered.

## Estimates: the first set was wrong, and how

The first estimate given to the owner was in person-days and was WRONG BY MORE THAN AN
ORDER OF MAGNITUDE. Its source is recorded here because the failure is instructive.

The orchestrator's brief to the nine investigators contained this sentence: "Calibrate
against this repository's real history: a phase here touching 3 to 5 files with tests and
a red-witness typically ran 1 to 3 days including review." That anchor was NOT measured.
It was inferred from what the work looked like, and every person-day figure in the first
report inherited it. It is exactly the failure this repository's rules name: a claim with
no verifiable artifact behind it, wearing a repo-calibrated label.

The owner caught it by asking whether the numbers were evidence, and observing that the
entire system was built in under three weeks.

### What the repository actually says

| Measure | Value |
|---|---|
| Project span | 2026-08-04 to 2026-09-19 |
| Active days carrying commits | 17 |
| Total commits on `main` | 349 |
| All 30 M4 phases, first merge to last | 45.5 hours |
| Median gap between consecutive phase merges | about 1 hour |
| Branch life, first commit to merged, including review and fix rounds (5 sampled M4 phases) | 1.8 to 3.6 hours |

A phase in this repository costs about TWO HOURS, not one to three days. The original
anchor was out by a factor of roughly 12 to 36.

### The consequence the owner drew, and why it reverses

Given the wrong numbers (35 to 60 person-days of change against three weeks for the whole
system), rebuilding from scratch was the obviously cheaper option. Given the measured
numbers, the full brief is 4 to 7 active days against 17 active days to rebuild.
Incremental is about three times cheaper, and the first wave is under one day.

Two things a rebuild would not carry, and they are most of the 17 days' value: the 44
tuition entries, 347 witness specs and 1387 tests can be copied, but HOW THEY WERE FOUND
cannot. Every one came from an incident. This investigation found three controls that were
nominal for four milestones without anyone noticing; that is the class of thing a clean
rebuild reintroduces silently.

A rebuild is right if the ARCHITECTURE is wrong. Nothing in these nine investigations says
it is. What they say is that parts of it were never wired up.

### The number that cannot be given

Wall clock is not the owner's binding constraint. Inference budget is. It was not
estimable from repository data at the time of this investigation. The search that
establishes that, with its scope stated because an absence claim is worthless without one:
a grep for `tokenUsage`, `inputTokens`, `outputTokens`, `cost`, `quota`, `rate-limit` and
`429` across `src/` and `plugin/src/` returned zero telemetry hits, only the word "cost" in
prose comments and "usage" in CLI usage strings. Not covered by that search: `scripts/`,
`test/` and `.claude/`. This is Theme F's finding, and it is why every estimate in this
document is in hours rather than in the currency actually being spent.

Worth recording alongside it: the Claude Code harness DOES expose full token and cost data,
and this repository holds a captured fixture proving it, carrying `total_cost_usd`,
`input_tokens`, `cache_read_input_tokens`, `output_tokens` and a per-model usage block. Both
adapters discard it by spawning with stdio "inherit".

## Governance blockers the brief did not know about

Three settled positions constrain this work before any code is written.

1. **DR-0029** decided the ownership boundary: Tiphys owns the PROCESS, the project owns
   the PREDICATE, and every gate command and threshold sits on the project's side. A risk
   table baked into kernel schemas contradicts it. Assurance policy must therefore ship as
   a project-owned document plus a schema, never as kernel thresholds.
2. **DR-0035** decided there is no zero-review tier.
3. **The plan parks it.** delivery/plan/kernel-plan-v1.md:422 lists pipeline telemetry (cost per phase, review
   hit rate, flake tax) as a blueprint v1 non-goal deferred to v1.1. All of Theme F needs a
   plan revision first. The next free ids, checked 2026-09-21: DR-0049 and T-045.

## Disk bloat and context bloat are different problems

| | Size | Enters a model's context? |
|---|---|---|
| `delivery/` | 24.5 MB, 699 files | No. Only when an agent greps it. |
| `CLAUDE.md` | 1327 lines, 76,787 bytes, about 19,200 tokens | YES. Every agent, every dispatch. |
| `AGENTS.md` | 663 lines, 35,591 bytes, about 9,000 tokens | Yes, through mandated reading |
| `delivery/STATE.md` | 2682 lines, 175 KB | Often. Agents read it to find where things stand. |
| `.claude/skills/` | 125 KB, 19 files | On demand |

`npm pack` ships 207 entries and 2.7 MB: `dist/`, `schemas/`, `tuition/`, `roles/`,
`templates/`, `checklists/`, `AGENTS.md` and four config files. It ships none of
`delivery/`, `test/`, `witness/`, `src/` or `.claude/`. **The shipped product is already
clean.** `delivery/` is repo weight, not product weight.

`delivery/` by subtree: evidence 9.0 MB (125 files, of which TWO `witness-records.json`
files from the closed M3 exit test are 8.3 MB), work-history 6.2 MB (75 files), review
6.1 MB (277 files), plan 1.85 MB, verification 517 KB, tuition 306 KB, decisions 255 KB.

## The retirement inventory: what it does and does NOT prove

M4-P23 shipped a retirement inventory whose purpose is retiring `CLAUDE.md` and `.claude/`
as instruction channels. Dispositions:

| Root | PORT | DELETE | KEEP |
|---|---|---|---|
| `CLAUDE.md` | 67 | 11 | 62 |
| `.claude/skills` | 118 | 0 | 13 |
| `.claude/orchestrator-next.mjs` | 14 | 6 | 5 |

296 rows total, 1 entry in the `retired` array.

**A CORRECTION THAT MATTERS, AND IT WAS MADE TO THE OWNER AFTER AN OVERSTATEMENT.** A PORT
row does NOT carry a proof that the rule's force survived the move. All 67 of the
`CLAUDE.md` negative witnesses are `kind: sibling`: they prove the verification grep is
DISCRIMINATING, by showing the same string is absent from some other file. They say nothing
about whether the destination preserves what the rule did.

The worked example, which should settle it for any later reader:

- `CLAUDE.md` text: `4. Falsifiable acceptance criteria only; "works correctly" is banned`
- destination: `checklists/plan-review.yaml`
- verified-by: `grep -c 'falsifiable' checklists/plan-review.yaml`, exit 0, output 2
- negative witness: the same word absent from `checklists/flake-playbook.yaml`, exit 1

So the proof that "works correctly is banned" was ported is that the word "falsifiable"
appears twice in a checklist. Theme E separately measured that this rule is enforced by
NOTHING: no lexical or structural check on acceptance-criterion text exists anywhere.

**PORT means "a related keyword exists in a kernel artifact", not "the rule still binds."**
Any deletion plan resting on the inventory must carry this caveat or it will delete live
rules and report success.

## The plan

Priced in phase-equivalents, where one phase is the measured about-two-hours.

### Wave 0-min: three one-line CI edits, about 1.5 hours

Not economically ahead of pruning. They come first because they make the pruning safe and
measurable, and they cost less than the decision about them.

| # | Change | Why first |
|---|---|---|
| 1 | Wire `scripts/check-authored-bytes.mjs` into the `gates` job | It runs today only in `macos-smoke.yml`, and live branch protection requires exactly one context, `gates`. Makes the ASCII and control-character rule merge-blocking while the rules file is being edited. |
| 2 | Wire `scripts/check-id-collisions.mjs` into the `gates` job | The script exists, covers both file-per-id schemes, reads all history, and is referenced by nothing. |
| 3 | Upload `summary.json` as a CI artifact, by exact path only | It is the only file carrying per-gate `units`, `applicable` and `vacuous`, and it dies with the runner. Uploading it is what lets the pruning be measured before and after. Never upload the evidence directory: it can contain captured output. |

### Wave P: pruning. 4 to 6 phases, about 8 to 12 hours. Runs BEFORE the architecture waves

The owner's economic argument is correct and the arithmetic supports it.

| | Tokens |
|---|---|
| Cost of pruning, 4 to 6 phases at full `CLAUDE.md` | about 380k |
| Saved across the remaining 21 to 26 phases, at 3 dispatches each | about 660k |
| Saved at 5 dispatches each | about 1.36M |

Net saving roughly 300k to 1M tokens. **The multiplier is a sensitivity, not a measurement:
dispatches per phase is not recorded anywhere, which is Theme F again.** The direction is
robust; the magnitude is not.

| # | Change | Phases | Effect |
|---|---|---|---|
| P1 | Prune `CLAUDE.md` on a verifiable criterion: the 17 heading rows, the 11 DELETE rows, and prose that restates one of the 11 mechanically-blocking controls, which shrinks to a one-line pointer. The other ~50 PORT rows need per-row judgment and are review work, not a delete. | 1 to 2 | About 19,200 tokens down toward 9,000, on every dispatch |
| P2 | Same treatment for `.claude/skills`, where 118 of 131 rows are PORT | 1 | Large file-count win |
| P3 | Compact `delivery/STATE.md`. It is append-only by habit, not by rule. Cut to current standing plus a pointer to git history. | 0.5 to 1 | 2682 lines to a few hundred |
| P4 | The two 8.3 MB `witness-records.json` files from the closed M3 exit test | 0.25 | Clone and grep speed only |
| P5 | Decision-record merge and cleanup: 46 records, some superseded | 1 to 2 | Correctness of the record, not size |

Deleting a RULE and deleting EVIDENCE are different acts. P1 and P2 delete rules against a
stated criterion. P4 and P5 touch the record, have no mechanical check, and run against the
standing rule never to soften a work history. Keep them behind P1 to P3 and treat them as
owner judgment.

A cost worth naming: P1 is the largest edit to the rule surface in the project's history,
and under the sequence above it happens while the review gates are still not running. Moving
the verdict-to-branch item ahead of Wave P costs one extra phase at full token price, about
40k tokens, and buys a live review gate while the rules are cut. The orchestrator's
recommendation is to pay it.

### Wave 0-rest: turn on what already exists. 1 to 2 phases

| # | Change |
|---|---|
| 4 | The reviewer writes the verdict JSON to `delivery/review/<phase>-<reviewer>.json` on the phase branch instead of `/tmp`. Add that glob to the scope gate's standing pre-authorized extras. |
| 5 | Add the 7 missing gate ids to `full`'s `gate-sets` in `assurance-modes.yaml`. The document claims 14 where the registry runs 21. |
| 6 | Fix `.claude/orchestrator-next.mjs`'s M4 terminal rule. It currently names an action already completed. |

Item 4 is the keystone of the entire plan. On its own it makes `check-dual-review` report a
real verdict for the first time in four milestones, produces DR-0012's six condition records,
and makes four dark derived checks reachable.

### Wave 1: make the gap visible before making it blocking. 3 to 4 phases

Print-only DR-0027 path-class classifier; the converse `mode-gate-sets-complete` check;
per-gate duration on the gate result record; `closedAt` on the task record.

### Wave 2: make it blocking, on the numbers Wave 1 produced. 3 phases

A phase branch touching a shipped tree with fewer than two decorrelated verdicts naming its
head is RED; `gate-classes` reddens when only a conditional gate satisfies the `review`
class; close the `not-applicable` escape for that class.

### Wave 3: the brief's actual asks. 5 to 6 phases, plus two decision records

Rule-class enum on gates, wired to nothing in its first slice and guarded by a test
asserting no reader; assurance policy as validated project-owned data; `intent` resolving to
acceptance criteria; optional `delivered-outcome` and `assurance-floor` on the final report;
charter product intent reaching the composed brief.

### Wave 4: telemetry and the reverse gear. 8 to 10 phases, plus one plan revision

Blocked on unparking delivery/plan/kernel-plan-v1.md:422. Durable gate-run ledger; tuition
lifecycle field; control retirement register with a real non-weakening witness; the periodic
effectiveness review, which additionally needs roughly three months of retained runs before
it means anything.

## Totals

| Scope | Phases | Wall clock at the measured pace |
|---|---|---|
| Wave 0-min | under 1 | about 1.5 hours |
| Wave P | 4 to 6 | 8 to 12 hours |
| Wave 0-rest | 1 to 2 | 2 to 4 hours |
| Waves 1 and 2 | 6 to 7 | 12 to 18 hours |
| Wave 3 | 5 to 6 | 12 to 18 hours |
| Wave 4 | 8 to 10 | 20 to 30 hours |
| Everything | 25 to 32 | about 55 to 85 hours, or 5 to 8 active days |

## What is NOT recommended

Theme D as written. The brief wants discretion returned to the orchestrator. The measurement
says discretion was already effectively unconstrained and the result was sixteen unreviewed
shipped-code phases. Theme G is the part of the same intuition that is genuinely confirmed:
the ratchet is real, and the answer is a retirement mechanism, not looser rules.

## Open and unverified

- Dispatches per phase is not recorded, so every token projection here is a sensitivity.
- The 42-control enumeration in Theme X is the investigator's reading of CLAUDE.md prose,
  not a list the repository maintains. The RATIO is robust; the denominator is soft, and no
  decision should hang on 26 percent versus 30 percent.
- Whether the ~50 judgment-required PORT rows are genuinely redundant is unestablished. Each
  needs reading against its destination.
- Five of the seven never-asserted gates are correct rather than rotten: `deploy` and
  `migrations` are structurally post-merge, the two clean-room-checklist entries are
  declared-not-executed by design, and `credential-token` waits on an owner action.
