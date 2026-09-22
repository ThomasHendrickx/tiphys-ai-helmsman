# The value-delivery investigation: findings, corrected estimates, and the pruning-first plan

- subject: the owner's brief "Tiphys: Re-centering the Architecture on Value Delivery"
- investigated: 2026-09-21; the temporary head recorded then as `60a87b7` is not
  reachable from the retained repository history
- reproducible baseline: current-state claims and the dispatch plan were rechecked on
  2026-09-22 against `main` at `57df640db9b3a08bf5167c6484bd499db39a0bd3`
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
  all thirty phases of M4. The current-tree result is still zero at the reproducible
  baseline above.
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

## Dispatch plan

The recommendation above has been narrowed into the approved, dispatchable plan at
`delivery/plan/value-delivery-plan.yaml`. That file is the execution contract; this section
is background only.

The executable scope is six phases, in this order:

1. run the already-built cutover trigger and prove the current product loop on `pulse`;
2. carry charter product intent into agent briefs and require a delivered outcome in the
   final report;
3. land structured verdicts with the reviewed branch and make missing review evidence red
   for shipped-code changes;
4. expose the CI facts that already exist and repair the stale milestone selector;
5. prune only the three repeatedly loaded context files, after the review evidence path is
   live;
6. prove scale-out on `hemma`, the existing-project adoption case deferred when `pulse`
   replaced it as the M4 pilot.

The earlier 25-to-32-phase roadmap is withdrawn. It mixed the value path with telemetry,
policy vocabulary and record cleanup that are useful but not prerequisites. The dispatch
plan parks those items explicitly.

Two corrections from review are incorporated rather than left as notes:

- `delivery/review/<phase>-<reviewer>.json` already qualifies as phase-owned evidence under
  the scope gate's existing filename rule, so no scope-gate widening is planned.
- Landing verdict JSON activates the two pair checks and the six merge-condition rows. It
  does NOT activate the three cross-document completeness checks, which deliberately read
  `plan.yaml` and `work-history.yaml`; that artifact migration is parked rather than being
  misreported as a consequence of verdict landing.

The two large M3 witness files are also left untouched. Deleting their current-tree copies
would reduce checkout and grep cost but would not reduce a full clone while their blobs
remain in git history; history rewriting is not justified by this plan.

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
