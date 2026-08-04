# Migration Table: Orchestrated Delivery Process to Tiphys v1

Date: 2026-08-04
Source: `delivery/intake/orchestrated-delivery-process.md` (process doc, sections 0 to 9)
Target: `delivery/intake/orchestrated-delivery-v1.md` (v1 blueprint: placement rule section 1, layer model section 2, toolbelt section 4, kernel artifacts section 5, roles section 6, owner interface section 7, milestones section 13)

Method: the process doc was walked top to bottom, section by section, and every normative statement (must, never, always, gate, protocol, standing policy) was extracted as a rule. Each rule got the blueprint's placement rule applied in order (computable script, LLM-plus-verifier, LLM-plus-adversarial-LLM) and was mapped to a concrete target artifact and the milestone that builds it. Rules mapping to multiple artifacts get one row per artifact with a lettered suffix.

Layer key: L1 infrastructure (bash, CI, git config), L2 process kernel (schemas, templates, prompts, checklists), L3 judgment (LLM agents), L4 owner (blueprint, decision queue).

## Main table

### Section 0: Roles (lines 13-27)

| ID | Source | Rule | Target layer | Target form | Milestone | Notes |
|---|---|---|---|---|---|---|
| R-001a | S0, 15-17 | Orchestrator never writes feature code in projects (infra hotfixes excepted) | L1 | project-write block hook (Claude Code plugin) | M4 | Hook named in M4 contents; infra-hotfix carve-out needs a defined bypass |
| R-001b | S0, 15-17 | Same rule, stated to the orchestrator | L2 | AGENTS.md clause | M3 | v1 section 3 carries this rule over verbatim |
| R-002 | S0, 17 | Orchestrator never lets a review skip | L2 | AGENTS.md clause + gate registry per assurance mode | M3 | Contested, see resist section: L1 branch-protection enforcement is possible but must be mode-aware |
| R-003 | S0, 15-27 | Each role is a fresh, single-purpose agent with a fixed lifetime (fresh eyes at every stage) | L1 | spawn + worktree pool (fresh context per task) | M1 | v1 section 6 carries fresh-context-per-role verbatim |
| R-004 | S0, 18 | Investigator produces a root-cause verdict with evidence, never fixes anything | L2 | investigator role brief | M3 | Verified by report contract validation + citation linter (v1 section 6) |
| R-005 | S0, 19 | Plan writer never decides product questions, it flags them | L2 | plan-writer role brief | M3 | Escalation lands as L4 decision record (see R-022) |
| R-006 | S0, 20 | Adversarial plan reviewer sees the plan and the code, nothing else, edits nothing | L2 | adversarial-plan-reviewer role brief | M3 | v1 section 6 deliberately widens inputs: reviewer also reads the input report (decorrelation, costs nothing); brief must follow v1, not the letter of the process doc |
| R-007 | S0, 21 | Implementer never edits the plan and never re-investigates settled questions | L2 | implementer role brief clause | M3 | |
| R-008 | S0, 21 | Implementer never creates PRs | L1 | credential scoping (token scope or branch protection) | M2 | Seeded in blueprint section 11; v1 section 4: enforced structurally, not by instruction |
| R-009a | S0, 22 | Clean-room reviewer must not see the implementation session | L1 | spawn (fresh context, isolated worktree) | M1 | Isolation is structural, not promised |
| R-009b | S0, 22 | Clean-room reviewer reviews diff + acceptance criteria only; edits nothing, posts nothing to the PR | L2 | clean-room-reviewer role brief | M3 | |

### Section 1: Intake to Plan (lines 30-78)

| ID | Source | Rule | Target layer | Target form | Milestone | Notes |
|---|---|---|---|---|---|---|
| R-010a | S1a, 32-40 | Every input claim gets code-level verification with file:line evidence before any phase is planned | L3 | verification pass mandated in scout/plan-writer brief | M3 | LLM produces; verifier is R-010b |
| R-010b | S1a, 32-40 | Citations in the verification output must be real (file exists, line in range) | L1 | citation linter | M2 | Seeded in blueprint section 11 ("citations must be real") |
| R-011 | S1a/1c, 34-36, 58 | Plan must contain a "Where the report and the code disagree" section | L2 | plan schema (required section) | M3 | |
| R-012 | S1a, 38-40 | Claims that fail verification become verification-first steps: step 1 is confirm, write down, then build | L2 | plan template clause | M3 | Execution side is R-035 |
| R-013 | S1b, 42-45 | A genuine unknown gets a dedicated investigator in parallel with plan writing | L2 | AGENTS.md dispatch clause | M3 | The call itself is L3 orchestrator judgment |
| R-014 | S1b, 44-46 | The plan carries a fill-in box for the investigated phase; everything else in that phase is fixed regardless of the cause | L2 | plan template (fill-in box construct) | M3 | |
| R-015a | S1b, 47-48 | Investigator must produce a runnable repro that is red on current code, not just an explanation | L2 | investigator role brief clause | M3 | |
| R-015b | S1b, 47-48 | Repro redness is verified, not asserted | L1 | red-witness harness (asserts red on baseline) | M2 | Same harness as R-036 |
| R-016 | S1c, 50-51 | The plan is one markdown file, committed as the first commit of the first branch | L2 | plan template + AGENTS.md clause | M3 | Commit-position check is computable if wanted later |
| R-017 | S1c, 53-55 | Binding header rule: if it is not written in the plan it is not being made; unanswered questions go to the orchestrator | L2 | plan template header (binding rule text) + brief clauses | M3 | v1 principle 3 generalizes this to blueprint silence |
| R-018 | S1c, 56 | Plan has a standing-context section (what previous runs bought, deploy state) | L2 | plan schema (required section) | M3 | |
| R-019 | S1c, 58-60 | Each phase declares branch name, severity, verified root cause, numbered steps, files-to-touch, falsifiable acceptance criteria, explicit migrations note | L2 | plan schema (phase fields) | M3 | v1 section 5 plan schema adds conflicts-with and parallelizable; adopt the superset |
| R-020 | S1c, 59 | Files-to-touch is verified before editing and enforced after | L1 | scope auditor | M2 | Seeded in blueprint section 11 ("scope must match plan") |
| R-021 | S1c, 61-62 | Non-obvious plan calls listed as numbered "Decisions taken in this plan (flag if you disagree)" | L2 | plan schema (numbered decisions section) | M3 | |
| R-022 | S1c, 63-64 | Product decisions belong to the owner; a phase touching one ships the analysis and nothing else | L4 | decision record schema + charter escalation contract | M3 | Seeded in blueprint section 11 ("owner decisions never pre-empted"); see also R-090 |
| R-023 | S1c, 65-66 | Every input finding lands in a phase, a decision, an open question, or parked-with-reason; no orphans | L1 | coverage checker | M2 | Seeded in blueprint section 11 ("no orphan findings") |
| R-024 | S1d, 68 | An adversarial plan review happens before anyone builds | L2 | full-mode pipeline definition + reviewer role brief | M3 | Mode-scoped: direct-PR and local-only modes skip it by declaration (v1 section 8) |
| R-025 | S1d, 69 | Plan review re-verifies every file:line citation | L1 | citation linter (run by/for reviewer) | M2 | Same artifact as R-010b; second call site |
| R-026a | S1d, 69-70 | Plan review hunts cross-phase conflicts: file overlap floor | L1 | conflict pre-pass script | M5 | v1 section 10: script computes the cheap floor |
| R-026b | S1d, 69-70 | Hidden dependencies and semantic coupling above the file-overlap floor | L2 | plan-review checklist (probe list) | M3 | Judged by L3 reviewer |
| R-027 | S1d, 70-73 | Probe every fix shape for the edge case that becomes a new dead end (the state that can no longer exit) | L2 | plan-review checklist probe | M3 | Seeded in blueprint section 11 ("adversarial review probes") |
| R-028a | S1d, 73-76 | Test the testability claims: a test the plan claims red-on-baseline must be checked, not admired | L2 | plan-review checklist probe | M3 | |
| R-028b | S1d, 73-76 | Red-on-baseline is later proven mechanically at implementation | L1 | red-witness harness | M2 | Same artifact as R-036 |
| R-029 | S1d, 76-77 | Plan review outputs verdict + severity-ranked findings + concrete plan edits, in a validated format | L2 | finding-format schema | M3 | v1 section 6 attaches finding-format validation to this role |
| R-030 | S1d, 77-78 | All plan-review findings are applied to the plan document before execution starts | L2 | AGENTS.md clause (orchestrator duty) | M3 | A plan-version check could make this computable later |

### Section 2: Execution loop (lines 82-124)

| ID | Source | Rule | Target layer | Target form | Milestone | Notes |
|---|---|---|---|---|---|---|
| R-031 | S2, 84 | One phase = one branch = one PR | L2 | kernel convention in briefs + worktree naming | M3 | Largely computable via spawn conventions (M1) |
| R-032 | S2, 84-85 | Sequential: next phase starts only after previous merged AND production deploy verified | L1 | deploy verifier blocks next dispatch | M2 | Toolbelt contract says "blocks next dispatch"; consolidation exception is R-073 |
| R-033a | S2a, 87-92 | Implementer brief must contain: mandated reading in order, phase scope with pipeline-history updates, push protocol, full gate list, accumulated environment warnings, reporting contract | L2 | implementer brief template | M3 | |
| R-033b | S2a, 87-92 | Brief assembly (worktree + brief + hooks + task meta) is one command | L1 | spawn | M1 | |
| R-034 | S2a, 92-94 | If implementation reveals the plan is wrong: stop and escalate, never improvise a different fix | L2 | implementer brief clause | M3 | Carried over verbatim per v1 section 6 |
| R-035 | S2b, 96-98 | Verification-first steps: findings written before any code, verbatim into work history; contradiction with the plan means stop and report | L2 | implementer brief clause + work-history template | M3 | |
| R-036 | S2c, 100-103 | Red-witness: a test guards a fix only if demonstrated red on baseline and green after, both in the PR description | L1 | red-witness harness (emits evidence file) | M2 | Seeded in blueprint section 11 ("red-witness discipline") |
| R-037a | S2c, 103-105 | Repair lying test fakes first: fix the fake, show the old test red pre-fix, then land the fix | L2 | implementer brief clause | M3 | |
| R-037b | S2c, 103-105 | The fake-repair red/green demonstration is mechanical | L1 | red-witness harness | M2 | Same artifact as R-036 |
| R-038 | S2d, 107 | Per-step local commits with meaningful messages | L2 | implementer brief clause | M3 | Partly advisory; message quality is judgment |
| R-039 | S2d, 107-109 | Batched pushes at logical milestones (every 1 to 3 steps), never per-commit; each push costs a CI run | L2 | implementer brief clause (cost policy) | M3 | |
| R-040 | S2d, 109-110 | ALWAYS push before any long-running validation (unpushed work dies with the environment) | L2 | implementer brief clause | M3 | Contested, see resist section: an L1 pre-validation hook could enforce; v1 principle 6 demands a migration ticket for prompt-only rules |
| R-041 | S2e, 113 | Gate: typecheck, zero errors | L1 | CI gate + gate registry entry | M4 | Generic gate machinery M2; per-project wiring at cutover |
| R-042 | S2e, 113 | Gate: lint, zero errors, no suppressions | L1 | CI gate + suppression scan | M4 | No-new-suppressions is computable via diff grep |
| R-043 | S2e, 114 | Gate: unit tests for every changed service method | L2 | gate registry entry + clean-room checklist probe | M3 | Contested, see resist section: mapping changed methods to tests is not reliably computable |
| R-044 | S2e, 114-115 | Gate: stories/fixtures for every changed component state | L2 | gate registry entry + clean-room checklist probe | M3 | Contested, see resist section: same shape as R-043 |
| R-045 | S2e, 115 | Gate: locale/i18n parity across all languages | L1 | i18n parity script (key-set comparison) | M4 | |
| R-046 | S2e, 115-116 | Gate: analytics/telemetry doc kept symmetric with the code, additions AND removals | L1 | doc-symmetry script (event-name grep both ways) | M4 | Contested, see resist section: name symmetry is computable, semantic accuracy is not |
| R-047 | S2e, 117 | Gate: generated manifests regenerated, drift committed | L1 | regen-and-diff-clean script | M4 | |
| R-048 | S2e, 117-120 | The full-suite wrapper, never bare test runners; parity counting (passed+failed+skipped+did-not-run == discovered) | L1 | full-suite wrapper (EXISTS, ported into kernel bin) | M2 | In toolbelt table (v1 section 4), not in section 11 rows |
| R-049 | S2e, 120-121 | Report the exit code; never infer success from a log tail | L2 | report contract (evidence = exit codes) | M3 | Restated as R-086; one contract clause serves both |
| R-050a | S2e, 121 | Gate: all e2e green | L1 | CI e2e gate + gate registry entry | M4 | |
| R-050b | S2e, 121-123 | Environmental e2e failures are diagnosed with evidence (byte-identical route, reproduced outside the runner), never waved off | L2 | env-failure diagnosis checklist | M3 | Applied by L3 (implementer/orchestrator) |
| R-051 | S2e, 123 | Gate: help/docs grep for touched copy | L1 | docs-grep script | M4 | |
| R-052a | S2e, 123-124 | Work-history entry per phase: the prompt verbatim, every file touched, Key Decisions (the why invisible in the diff) | L2 | work-history template | M3 | |
| R-052b | S2e, 123-124 | A task cannot close without its report/work-history | L1 | teardown guard (refuses without report) | M1 | Toolbelt: teardown refuses when unlanded work present; scout carve-out requires report |

### Section 3: Clean-room review (lines 127-153)

| ID | Source | Rule | Target layer | Target form | Milestone | Notes |
|---|---|---|---|---|---|---|
| R-053 | S3, 129-131 | Review the diff against the plan's acceptance criteria as a contract: each criterion quoted, file:line evidence, met/not-met | L2 | clean-room checklist + verdict schema | M3 | |
| R-054 | S3, 131 | Orchestrator writes targeted probes per phase and injects them into the review | L2 | AGENTS.md clause + checklist extension mechanism | M3 | Probe content is L3 judgment |
| R-055 | S3, 133-134 | Correctness probing of the specific fix: negatives, zero, empty, unicode, the state that can never exit | L2 | clean-room checklist probe list | M3 | Seeded in blueprint section 11 ("adversarial review probes") |
| R-056a | S3, 135-137 | Test honesty probes: would the test fail if the fix were reverted; does it assert behavior, not implementation details; does a fence catch the failure mode it is named for | L2 | clean-room checklist probe list | M3 | |
| R-056b | S3, 135 | The revert check is computable | L1 | red-witness harness (red on baseline == fails without fix) | M2 | Same artifact as R-036 |
| R-057a | S3, 138-141 | Implementers must declare every departure from the plan's letter | L2 | report contract (deviations section) | M3 | |
| R-057b | S3, 138-141 | Each deviation is judged against the plan's intent by the reviewer; the implementer never assumes | L2 | clean-room checklist clause | M3 | |
| R-058 | S3, 142 | Scope audit: every changed file is on the phase's list or a declared extra | L1 | scope auditor | M2 | Seeded in blueprint section 11 ("scope must match plan"); same artifact as R-020 |
| R-059 | S3, 143-146 | Blast-radius questions: who else consumes what this changed | L2 | clean-room checklist probe list | M3 | Seeded in blueprint section 11 ("adversarial review probes"); doc calls it the single best question |
| R-060 | S3, 148 | Verdict is APPROVE or FIX-ROUND-NEEDED with severity-ranked findings and a concrete fix each | L2 | verdict schema | M3 | v1 section 6 attaches verdict schema to this role |
| R-061 | S3, 148-150 | Fix round goes back to the SAME implementer, resumed with context intact | L2 | AGENTS.md clause | M3 | Carried over verbatim per v1 section 6; resume mechanics live in spawn (M1) |
| R-062 | S3, 150-151 | Disputes are allowed with evidence; the orchestrator arbitrates | L2 | AGENTS.md clause + reviewer/implementer brief clauses | M3 | |
| R-063 | S3, 151-153 | Judgment calls touching owner-reserved territory are explicitly flagged vetoable | L4 | decision record (reversibility field) | M3 | |

### Section 4: Merge, deploy, verify (lines 156-173)

| ID | Source | Rule | Target layer | Target form | Milestone | Notes |
|---|---|---|---|---|---|---|
| R-064 | S4, 158 | Merge on CI green only | L1 | branch protection required checks | M4 | Merge authority per assurance mode is L4 (v1 section 8) |
| R-065a | S4, 158 | Squash merge | L1 | repo merge config (squash-only) | M4 | |
| R-065b | S4, 158 | Merge commit message tells the story | L2 | AGENTS.md clause | M3 | Judgment content, so prompt-side |
| R-066 | S4, 159-162 | Flake playbook: extract the failure, judge fail-pattern vs local run; known signature means re-kick, unknown means investigate first (a real bug looks identical to a flake until you read the log) | L2 | flake playbook checklist | M3 | Applied by L3 orchestrator |
| R-067 | S4, 162-164 | Three consecutive reds from the same flake: stop re-kicking, fix the flake first, promote its fix to next-in-queue | L2 | AGENTS.md policy clause | M3 | Contested, see resist section: the counter is computable from CI history |
| R-068 | S4, 165-168 | After every merge: verify migrations actually applied to production | L1 | migration verifier script | M2 | Seeded in blueprint section 11 ("verify deploy + migrations after merge") |
| R-069 | S4, 165-168 | After every merge: verify the production deploy reached READY before the next phase starts | L1 | deploy verifier script (poll until READY or timeout) | M2 | Seeded in blueprint section 11; same seed row as R-068 |
| R-070 | S4, 169-173 | A pipeline flaw is fixed immediately as a hotfix PR, not deferred | L2 | tuition flow (kernel PR, next-in-queue) | M3 | v1 section 9; the e2e-mock-flag NODE_ENV example lands as a tuition entry |
| R-071 | S4, 170-171 | Migrations must not be gated on anything flakier than the deploy itself; gate on correctness checks | L1 | CI config pattern (migration job dependencies) | M4 | Also failure mode 3 (S8, 236-237) |
| R-072 | S4, 171-172 | CI needs a per-ref concurrency group so superseded runs cancel | L1 | CI config (concurrency group) | M4 | Also adoption step 4 (S9, 259); same artifact as R-097 |

### Section 5: Cost stewardship (lines 176-188)

| ID | Source | Rule | Target layer | Target form | Milestone | Notes |
|---|---|---|---|---|---|---|
| R-073 | S5, 178-181 | Consolidate small, low-risk, disjoint-surface phases into one PR; keep big or risky phases alone | L2 | AGENTS.md policy clause | M3 | L3 judgment call, informed by conflict pre-pass (M5); this is the exception to R-032 |
| R-074 | S5, 182 | A fix round should be 1 to 2 pushes, not six | L2 | implementer brief clause | M3 | Companion of R-039 |
| R-075 | S5, 183-185 | Model tier per risk: strongest model for money-path/architecture phases, investigations, all reviews; cheaper tier for mechanical phases | L2 | role-to-model config (kernel defaults, charter override) | M3 | v1 section 6: binding is configuration resolved by the harness adapter; charter override is L4 (M4) |
| R-076 | S5, 186-187 | Kill recurring flakes early; count what a flake costs across re-kicks, reviews, near-misses before deciding it can wait | L2 | AGENTS.md policy clause + tuition entry | M3 | Overlaps R-067 |
| R-077 | S5, 188 | Re-kick only when there is nothing pending to batch the re-kick with | L2 | AGENTS.md policy clause | M3 | |

### Section 6: Resilience (lines 190-207)

| ID | Source | Rule | Target layer | Target form | Milestone | Notes |
|---|---|---|---|---|---|---|
| R-078 | S6, 192-197 | A heartbeat/supervision mechanism recovers any interruption without the owner typing "continue": checks tasks, branches, PRs, running agents; resumes dead work where it stopped | L1 | watcher + liveness guard | M1 | Seeded in blueprint section 11: "hourly cron heartbeat" becomes "event watcher + guard (replaces cron)"; mapping agrees, form deliberately changed by v1 |
| R-079 | S6, 196-197 | The heartbeat disables itself (never deletes) only after the final report ships | L1 | watcher lifecycle (exit-with-reason, sleep-on-fleet) | M1 | Semantics shift under the event watcher; the invariant to keep is "supervision never silently disappears while work is in flight" |
| R-080 | S6, 198-199 | Durable state lives outside the chat: plan and work histories in the repo, pipeline state in a task list, everything pushed; assume the container dies hourly | L1 | fleet/ state layout (state/, task meta, locks) per v1 section 3 | M1 | v1 principle 4: restart is a non-event |
| R-081a | S6, 200-202 | When an agent dies mid-work, its leavings are committed as an explicitly-labeled unreviewed WIP commit, never lost | L1 | salvage path in teardown/spawn scripts (labeled WIP commit) | M1 | |
| R-081b | S6, 200-202 | The resumed implementer verifies-or-rewrites salvaged WIP, never trusts it | L2 | implementer brief clause | M3 | |
| R-082a | S6, 203-204 | Agents must never end their turn to wait for builds/CI; wait by doing useful steps, then check state directly | L2 | brief clause (all roles) | M3 | |
| R-082b | S6, 203-204 | Turn end is detected structurally | L1 | spawn turn-end hook | M1 | Plugin-side turn-end signal ships in M4 |
| R-083a | S6, 205-207 | Environment warnings accumulate in work histories (prod URLs in env, stale ports, stale caches, export expansion traps); none bites twice | L2 | environment-warnings log/template | M3 | |
| R-083b | S6, 205-207 | Accumulated warnings are forwarded into every subsequent implementer brief | L1 | spawn (brief assembly includes warnings file) | M1 | |

### Section 7: Reporting (lines 211-227)

| ID | Source | Rule | Target layer | Target form | Milestone | Notes |
|---|---|---|---|---|---|---|
| R-084 | S7, 213-214 | Orchestrator narrates to the owner at milestones only (phase merged, incident, decision needed); routine noise gets a one-line ack | L2 | status line contract (sparse, supervisor-actionable states) | M3 | Status line contract is a v1 section 5 artifact; not named in any milestone contents, M3 is the best fit |
| R-085 | S7, 215-216 | Environmental failure claims come with evidence | L2 | report contract clause + schema validation | M3 | Seeded in blueprint section 11 ("honest reporting rules") |
| R-086 | S7, 216 | "All green" only ever means the wrapper's exit code | L2 | report contract clause | M3 | Restates R-049; one clause serves both |
| R-087 | S7, 216-218 | False claims found in comments/docs are corrected loudly in place; a comment describing behavior that does not exist is worse than none | L2 | implementer + reviewer brief clause | M3 | |
| R-088 | S7, 218-219 | Incidents (production drift, near-misses) are reported with cause, exposure window, and the structural fix, never buried | L2 | report contract (honest-failure section) | M3 | Seeded in blueprint section 11 ("honest reporting rules") |
| R-089a | S7, 220-222 | Final report contains: table of every input finding to outcome, decisions still owed by the owner, owner-only verification checklists, infrastructure left behind, out-of-band flags | L2 | report contract/template (final report shape) | M3 | |
| R-089b | S7, 220-221 | Every-finding-has-an-outcome is checkable | L1 | coverage checker (finding-to-outcome parity) | M2 | Same artifact as R-023, second call site |
| R-090 | S7, 223-227 | Owner decisions are never pre-empted; a forced owner-adjacent call is decided, flagged vetoable, and made trivially revertible | L4 | charter escalation contract + decision record (reversibility field, queue) | M3 | Seeded in blueprint section 11 ("owner decisions never pre-empted"); mapping agrees |

### Section 8: Failure modes / tuition (lines 230-248)

| ID | Source | Rule | Target layer | Target form | Milestone | Notes |
|---|---|---|---|---|---|---|
| R-091 | S8, 230-248 | The recorded failure modes are kept as tuition; every new failure mode becomes a tuition entry, kernel-relevant tuition ships upstream as a kernel PR | L2 | tuition/ log + tuition flow (v1 section 9) | M3 | tuition/ dir is scaffolded in M1; the flow operates from M3; milestones never name it explicitly |
| R-092 | S8, 242-243 | Reproduce before fixing; if it will not reproduce, ship the harness and say so | L2 | investigator brief clause | M3 | Failure mode 6; complements R-015a |
| R-093 | S8, 240-241 | "A field that renders and decides is two fields": shared-consumer probe | L2 | clean-room checklist entry (blast-radius list) | M3 | Failure mode 5; concrete instance of R-059. Failure modes 1 to 4 and 7 to 8 are embodied in R-036/R-037, R-028, R-071, R-027, R-080 to R-083, and the review layer itself |

### Section 9: Adoption checklist (lines 251-263)

| ID | Source | Rule | Target layer | Target form | Milestone | Notes |
|---|---|---|---|---|---|---|
| R-094 | S9, 253-254 | Standing gates, the parity-counting wrapper, and the work-history requirement live in the repo's agent-rules file as a single source | L2 | gate registry (canonical, consumed by CI and briefs) | M3 | Gate registry is a v1 section 5 artifact not named in milestone contents; M3 is the best fit, gate scripts themselves are M2/M4 |
| R-095 | S9, 255 | Supervision (heartbeat) is in place before the first run | L1 | fleet-home init + doctor CLI check | M1 | |
| R-096 | S9, 256-258 | First run follows the full sequence: intake, verification pass, plan, adversarial plan review, phase loop, final report | L2 | assurance mode definition: full (v1 section 8) | M3 | "The current proven process is the definition of full" |
| R-097 | S9, 259-260 | CI concurrency group and a migrations/deploys-cannot-diverge check exist before the first merge | L1 | project bootstrap check (doctor) + CI config | M4 | Same CI artifact as R-072; greenfield bootstrap path is M5 |
| R-098 | S9, 261-263 | Every plan, work history, and incident note stays in the repo; the next run's quality comes from this run's memory | L2 | repo layout convention + tuition flow | M3 | Overlaps R-080 (state durability) and R-091 (tuition); kept because the retention duty is distinct from the durability duty |

## Rules that resist placement

These rows carry a provisional placement in the main table but the choice is genuinely contested. The plan writer should decide each one explicitly.

1. **R-002 (review never skipped).** Options: (a) L2 AGENTS.md clause only, cheap but prompt-only, which v1 principle 6 says is a temporary state; (b) L1 branch protection requiring a review approval before merge. The complication: assurance modes (v1 section 8) legitimately skip reviews in direct-PR and local-only modes, so L1 enforcement must read the charter's declared mode, which couples branch protection to the gate registry. Provisional: L2 with an L1 migration ticket.
2. **R-040 (always push before long validation).** Options: (a) L2 brief clause (current form); (b) L1 hook that checks for unpushed commits before any long-running command and warns or blocks. The hook is computable but "long-running validation" is not a crisp trigger. Provisional: L2 clause plus a tuition-tracked migration ticket, since this rule exists because unpushed work died twice.
3. **R-043 (unit tests for every changed service method).** Options: (a) L1 heuristic script mapping diff hunks to test files, which produces false positives and negatives on any nontrivial codebase; (b) L2 gate registry entry checked by the L3 clean-room reviewer. Coverage tooling could give a computable floor (changed lines executed by some test). Provisional: L2 + L3 with an optional L1 coverage floor.
4. **R-044 (stories/fixtures for every changed component state).** Same structure as R-043; "component state" is not machine-enumerable. Provisional: L2 + L3.
5. **R-046 (analytics doc symmetric with code).** Options: (a) L1 script that greps event names in both directions, computable and catches additions and removals by name; (b) L3 review for whether the doc's description matches the event's actual semantics. Provisional: L1 for name symmetry (the stated rule), with semantic accuracy left to the R-059 blast-radius probe.
6. **R-067 (three consecutive reds = fix the flake first).** Options: (a) L1 counter over CI run history that flags the threshold mechanically; (b) L2/L3 orchestrator policy, since "same flake" requires signature matching, which is judgment. Provisional: L2 policy clause; a later L1 flake-signature counter is a natural v1.1 telemetry item (v1 section 12 defers flake-tax telemetry).

## Coverage statement

All ten sections of the process doc (0 through 9) were walked in order. Rows per section (counting each lettered suffix as a row):

| Process doc section | Lines | Base rules | Rows |
|---|---|---|---|
| 0. Roles | 13-27 | 9 | 11 |
| 1. Intake to Plan | 30-78 | 21 | 25 |
| 2. Execution loop | 82-124 | 22 | 26 |
| 3. Clean-room review | 127-153 | 11 | 13 |
| 4. Merge, deploy, verify | 156-173 | 9 | 10 |
| 5. Cost stewardship | 176-188 | 5 | 5 |
| 6. Resilience | 190-207 | 6 | 9 |
| 7. Reporting | 211-227 | 7 | 8 |
| 8. Failure modes | 230-248 | 3 | 3 |
| 9. Adoption checklist | 251-263 | 5 | 5 |
| Total | | 98 | 115 |

All ten seeded rows from blueprint section 11 appear and are marked in Notes: red-witness (R-036), scope (R-020/R-058), citations (R-010b/R-025), orphans (R-023), deploy + migration verification (R-068/R-069), implementer-no-PR (R-008), heartbeat (R-078), review probes (R-027/R-055/R-059), honest reporting (R-085/R-088), owner decisions (R-022/R-090). One deliberate deviation from the process doc's letter is inherited from the blueprint itself and noted at R-006 (reviewer also reads the input report) and R-078 (event watcher replaces cron); in both cases this table follows the blueprint.
