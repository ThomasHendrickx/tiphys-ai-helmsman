# Orchestrated Delivery Process

How to go from a spec, a bug report, or a one-line description to production-hardened,
quality-gated code — using one persistent orchestrator session driving fresh, single-purpose
subagents through an adversarial pipeline. Distilled from the runs where this worked.

The one-sentence version: **nothing is trusted until an independent set of eyes with no stake
in it being true has tried to break it — the input report, the plan, the implementation, and
the tests themselves all get that treatment.**

---

## 0. Roles

| Role | Lifetime | Sees | Never does |
|---|---|---|---|
| **Orchestrator** (the main chat) | Persistent across the whole run | Everything | Writes feature code itself (except infra hotfixes); lets a review skip |
| **Investigator** | One mystery | The codebase + the symptom | Fixes anything — it produces a root-cause verdict with evidence |
| **Plan writer** | One plan | The input report + the code | Decides product questions — it flags them |
| **Adversarial plan reviewer** | One review | the input report, the plan, and the code [^sc-001] | Edits anything |
| **Implementer** | One phase (+ its fix rounds, resumed with context intact) | Its phase text + mandated reading | Creates PRs; edits the plan; re-investigates settled questions |
| **Clean-room reviewer** | One PR | The diff + the plan's acceptance criteria — explicitly NOT the implementation session | Edits anything; posts to the PR |

The separation is the point. The clean-room reviewer catches what the implementer cannot see
because the implementer knows what the code is *supposed* to do. Same fresh-eyes logic at every
stage.

[^sc-001]: ANNOTATION, NOT A REWRITE. This cell originally read "The plan + the
code, nothing else". It is corrected here rather than in a new document because
the kernel's `roles/adversarial-plan-reviewer.md` states the same visibility and
two governing documents that disagree about a role's visibility is the defect
being closed. Spec-coherence finding SC-001 recorded the contradiction: this
document's own section 1d requires the same reviewer to check every input
finding is fixed-or-parked, which cannot be done without the input report's
finding list, and the blueprint (section 6) describes reading the input report
as existing practice "kept because it costs nothing", which "nothing else"
denies. Kernel plan v1 decision D-14 settled it in favour of the blueprint where
the two deliberately differ. The original wording is preserved in this footnote
so the provenance survives the correction, which is what makes this an
annotation.

---

## 1. Intake → Plan

**1a. Verify the input before believing it.** Whatever arrives — spec, user-test bug report,
description — gets a code-level verification pass over every claim before a single phase is
planned. Each claim is checked against actual file:line evidence. The output is a section
called **"Where the report and the code disagree"**, and it is the most load-bearing part of
the plan. (In one run, 5 of 11 report assessments did not survive contact with the code —
features declared "missing" that had shipped, display bugs that were schema-level projects,
one-line bugs hiding under grand theories.) Claims that fail verification become
*verification-first steps*: the phase's step 1 is "confirm which of these three failures this
actually is, write it down, and only then build."

**1b. Investigate the hardest mystery in parallel.** If one finding is a genuine unknown
(silent failure, no errors, no writes), a dedicated investigator agent root-causes it while
the plan is being written. The plan carries a literal fill-in box for that phase
("[ORCHESTRATOR FILLS IN] Root cause / Fix shape / Files") — everything else in the phase
(acceptance criteria, tests, gates) is fixed regardless of what the cause turns out to be.
Require the investigator to produce a **runnable repro** that is red on the current code, not
just an explanation.

**1c. The plan document.** One markdown file, committed as the first commit of the first
branch. Structure:

- **Header**: status, baseline commit, process summary, and the binding rule:
  *"If it is not written here, it is not being made. Unanswered questions go to the
  orchestrator."* This is what keeps ten agents from improvising.
- **Standing context**: what previous runs bought, what is already fixed, what deploy state is.
- **Where the report and the code disagree** (see 1a).
- **Phases**: each with branch name, severity, verified root cause, numbered steps,
  **files-to-touch (verify before editing)**, acceptance criteria written as falsifiable
  statements, and an explicit migrations note (none / additive / what).
- **Decisions taken in this plan (flag if you disagree)**: every non-obvious call, numbered,
  so disagreement targets a number instead of re-litigating prose.
- **Product decisions for the owner**: things the pipeline will NOT decide. A phase that
  touches one ships the analysis and *nothing else*.
- **Open questions** and **Parked (not in this plan)** — every input finding must land in
  a phase, a decision, an open question, or parked-with-a-reason. No orphans.

**1d. Adversarial plan review.** A fresh agent tries to break the plan before anyone builds:
re-verify every file:line citation; hunt cross-phase conflicts (two phases editing one file
incompatibly, hidden dependencies); check every input finding is fixed-or-parked; probe fix
shapes for the edge case that becomes a new dead end (the canonical example: "make unlinked
rows stop showing green" quietly creates "zero-amount rows are stuck urgent forever" unless
the plan says what a zero-amount row shows); and — critically — **test the testability
claims**: if the plan says "this e2e fails on baseline," check the test as specified would
actually be red (one plan's flagship regression test would have passed on the broken code
because it was modeled on a direct-DB-seed spec that bypassed both defects). Verdict + severity-
ranked findings + concrete plan edits. All findings are applied to the document before
execution starts.

---

## 2. Execution loop (per phase)

**One phase = one branch = one PR.** Sequential: the next phase starts only after the previous
one is merged AND its production deploy is verified. (Consolidation exception in §5.)

**2a. Implementer briefing.** Fresh subagent per phase. The prompt contains: mandated reading
in order (project rules file, the exact plan sections, the specific skill files for the
surfaces it touches), the phase scope with any updates from pipeline history, the push
protocol, the full gate list, environment warnings accumulated from prior phases, and the
reporting contract ("your final message is consumed by the orchestrator — raw and complete:
per-step commits, gate results with exit codes, deviations, open questions"). Two standing
rules: **do not create the PR** (orchestrator does) and **if implementation reveals the plan
is wrong, stop and escalate — never improvise a different fix.**

**2b. Verification-first steps are sacred.** Where the plan says "step 1 is verification,"
the implementer writes findings down BEFORE any code (they go verbatim into the work history),
and if the findings contradict the plan's expected reading, it stops and reports.

**2c. Red-witness discipline.** A test only counts as guarding a fix if it was demonstrated
red on the baseline and green after. Concretely: revert the source to baseline, run the new
tests, capture the failure, restore, run green, and put both in the PR description. Corollary:
**repair lying test fakes first** — if an existing test was green while the bug lived (a mock
that ignored the argument that mattered), fix the fake, show the old test now goes red
pre-fix, then land the fix. A false witness left in the suite is worse than no test.

**2d. Commit/push protocol.** Per-step local commits with meaningful messages; **batched
pushes** at logical milestones (every 1–3 steps) rather than per-commit (each push costs a CI
run); ALWAYS push before any long-running validation (environments get reclaimed; unpushed
work dies — this happened, twice).

**2e. Standing gates — every phase, before the PR** (adapt names to the project):
1. Typecheck: zero errors. 2. Lint: zero errors, no suppressions.
3. Unit tests for every changed service method. 4. Stories/fixtures for every changed
component state. 5. Locale/i18n parity across all languages. 6. Analytics/telemetry doc kept
symmetric with the code (additions AND removals). 7. Generated manifests regenerated, drift
committed. 8. **The full-suite wrapper, never bare test runners** — it must enforce
discovery-count parity (passed+failed+skipped+did-not-run == discovered), because "all green"
with silently-dropped tests is the most dangerous output a suite can produce. Report the
exit code, never infer success from a log tail. 9. All e2e green (environmental failures are
diagnosed with evidence — byte-identical route, reproduced outside the test runner — not
waved off). 10. Help/docs grep for touched copy. 11. **Work-history entry**: the prompt
verbatim, every file touched, and Key Decisions — the *why* that is invisible in the diff.

---

## 3. Clean-room review (per PR)

A fresh agent that has NOT seen the implementation session reviews the diff **against the
plan's acceptance criteria as a contract**: each criterion quoted, file:line evidence,
met/not-met. Plus targeted probes the orchestrator writes per phase:

- **Correctness probing** of the specific fix (edge cases: negatives, zero, empty, unicode,
  the state that can never exit).
- **Test honesty**: would this test fail if the fix were reverted? Does the e2e assert
  behavior (DB rows, visible copy) or implementation details that trivially pass? Does a
  fence actually catch the failure mode it is named for?
- **Deviations assessed one by one** — implementers must declare every departure from the
  plan's letter; the reviewer judges whether each serves the plan's intent (they often do,
  and are frequently better than the letter — but that judgment is the reviewer's to make,
  not the implementer's to assume).
- **Scope audit**: every changed file is on the phase's list or a declared extra.
- **Blast-radius questions**: who else consumes what this changed? (The single best question
  in the whole process. It caught: a display rule reaching 3 of 8 render surfaces; a shared
  composition field feeding both a renderer and a security gate; an event-classified error
  path that stayed silent.)

Verdict: APPROVE or FIX-ROUND-NEEDED with severity-ranked findings and a concrete fix each.
**The fix round goes back to the SAME implementer** (resumed — context intact, far cheaper
than a fresh agent re-reading everything). Disputes are allowed with evidence; the
orchestrator arbitrates. The orchestrator also makes judgment calls the review surfaces —
and explicitly flags any that touch owner-reserved territory as vetoable.

---

## 4. Merge, deploy, verify

- **Merge on CI green only.** Squash, with a commit message that tells the story.
- **Flake playbook**: on a red, extract the failure and judge fail-pattern vs. local run.
  Known-flake signature → re-kick (empty commit if the re-run API is unavailable). Unknown →
  investigate before re-kicking; CI catching a real bug looks identical to a flake until you
  read the log. **Three consecutive reds from the same flake = stop paying the lottery; fix
  the flake first** (promote its fix to next-in-queue — a ~50% flake taxes every future run
  and will eventually skip something that matters).
- **After every merge**: verify migrations actually applied to production AND the production
  deploy reached READY, before the next phase starts. Never assume the platform did its job —
  one run discovered deploys silently not spawning, and another discovered migrations being
  skipped by a flake while the code deployed anyway.
- **Fix the pipeline itself when it shows a flaw, immediately, as a hotfix PR**: examples
  that came out of this — migrations must not be gated on a flaky e2e when deploys are
  ungated; CI needs a per-ref concurrency group so superseded runs cancel; the e2e mock flag
  must not be NODE_ENV-gated when CI serves a production build.

---

## 5. Cost stewardship (owner-directed, now standing policy)

- **Consolidate small phases into one PR** when they are low-risk and touch disjoint
  surfaces — one implementer, one review, one merge instead of three of each. Keep big or
  risky phases alone.
- **Batched pushes** (see 2d) — a fix round should be 1–2 pushes, not six.
- **Model tier per risk**: strongest model for money-path/architecture phases, investigations,
  and all reviews; cheaper tier for mechanical phases (a measurement script, copy).
- **Kill recurring flakes early** — the single highest-ROI move; count what one flake costs
  across re-kicks, reviews, and near-misses before deciding it can wait.
- Re-kick only when there is nothing pending to batch the re-kick with.

---

## 6. Resilience (the pipeline must survive its own environment)

- **A heartbeat routine** (hourly cron into the same session) whose prompt restates the whole
  pipeline state and process, so any interruption — session limit, container reclaim — is
  recovered without the owner typing "continue". It checks: tasks, branches, PRs, running
  agents; resumes dead work exactly where it stopped; and disables itself (never deletes)
  only after the final report ships.
- **Durable state lives outside the chat**: the plan and work histories in the repo, pipeline
  state in a task list, everything pushed. Assume the container dies hourly.
- **Salvage discipline**: when an agent dies mid-work, commit whatever it left as an
  explicitly-labeled unreviewed WIP commit ("do not treat as reviewed") rather than losing it;
  the resumed implementer verifies-or-rewrites, never trusts.
- **Agents must never end their turn to "wait"** for builds/CI — ending the turn kills them.
  Wait by doing other useful steps, then check state directly.
- **Accumulate environment warnings** in work histories and forward them to every subsequent
  implementer (production URLs leaking into shell env, stale servers holding ports, stale
  build caches after OOM, `export A=x B=$A` expansion traps). Each one bit somebody once;
  none bit anybody twice.

---

## 7. Reporting

- The orchestrator narrates to the owner at **milestones** (phase merged, incident found,
  decision needed), not per-event. Routine bot noise gets a one-line ack.
- **Honesty rules**: environmental failures come with evidence; "all green" only ever means
  the wrapper's exit code; false claims found in comments/docs are corrected loudly in place
  ("a comment describing behavior that does not exist is worse than none"); incidents
  (production drift, near-misses) are reported with cause, exposure window, and the
  structural fix — not buried.
- **The final report**: a table of every input finding → outcome; the decisions still owed by
  the owner; verification checklists only the owner can run; infrastructure the run left
  behind; anything flagged out-of-band (e.g., a security-relevant environment hazard).
- **Owner decisions are never pre-empted.** A phase touching one ships analysis + options +
  recommendation and nothing else. When the orchestrator must decide something owner-adjacent
  to keep moving (an acceptance criterion forced it), it decides, flags it vetoable, and makes
  the revert trivial.

---

## 8. Failure modes this process was tuned by (keep them; they are the tuition)

1. A **mock ignoring its discriminating argument** kept CI green for months over a total
   feature failure. → Red-witness discipline + repair-the-fake-first.
2. A plan's flagship regression test **would have passed on the broken code**. → Adversarial
   review must execute testability claims, not admire them.
3. Migrations **skipped by a flake while the deploy shipped anyway** → gate migrations on
   correctness checks, not on anything flakier than the deploy itself.
4. A fix for "shows green wrongly" almost shipped "**zero-amount rows stuck forever**" → probe
   every fix shape for the state that can no longer exit.
5. A shared field serving **both a renderer and a security gate** — resolving it for display
   broke the gate. → "A field that renders and decides is two fields." Blast-radius questions.
6. The reproduction lever everyone assumed (slow client) was **empirically wrong** (slow
   server). → Reproduce before fixing; if it will not reproduce, ship the harness and say so.
7. Environments **lie**: prod URLs in shell env, stale builds with old BUILD_IDs, ports held
   by dead servers, agents killed mid-write. → §6, all of it.
8. **"Two different questions; I reported the answer to the easier one"** — an implementer's
   own postmortem of a trade-off analysis. Reviews exist because everyone does this.

---

## 9. Minimal adoption checklist for a new project

1. Write the standing gates into the repo's agent-rules file (CLAUDE.md equivalent), including
   the full-suite wrapper with parity counting and the work-history requirement.
2. Set up the heartbeat routine with the pipeline-state prompt.
3. First run: intake → verification pass → plan with the section structure above → adversarial
   plan review → phase loop (implement → clean-room review → fix round → merge on green →
   verify deploy) → final report.
4. Add a CI concurrency group and check that migrations/deploys cannot diverge, before the
   first merge.
5. Keep every plan, work history, and incident note in the repo — the next run's quality
   comes from this run's memory.
