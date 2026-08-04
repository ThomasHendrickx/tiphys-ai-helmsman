# Tiphys, Orchestrated Delivery v1 (bones)

Named for the Argo's helmsman: steering instead of rowing, a hazard disarmed once and permanently (the Symplegades), and a helm that survives any single helmsman.

Status: skeleton. Every section header is load-bearing; flesh follows per section.
Origin: current single-session process (proven, 1+ week) + selective borrows from firstmate + this design discussion.

---

## 0. Purpose and design principles

A trans-project delivery system: one owner, one orchestration layer, disposable agents, deterministic guardrails.

Principles (ordered, earlier wins on conflict):

1. **Determinism first.** Anything computable is a script with an exit code. LLMs are kept true by deterministic verification wherever verification is computable.
2. **Nothing is trusted.** Every artifact gets independent adversarial eyes before anything builds on it. Includes the blueprint. Includes the tests (red-witness). Includes this document.
3. **Owner decides in blueprint, not in realization.** Decisions are front-loaded into declarative artifacts. Realization escalates only on blueprint silence about an irreversible choice; it never improvises one.
4. **Restart is a non-event.** All truth lives in files, worktrees, and git. Any session's conversation memory is a cache.
5. **Evidence over claims.** Exit codes, counts, URLs, diffs. An agent's assertion without a verifiable artifact is treated as unknown.
6. **Rules are structural, not behavioral.** "Must never X" converts to "X is impossible or automatically detected". Prompt-only rules are a temporary state with a migration ticket.
7. **Cost is tiered by risk.** Assurance level is a per-project (and per-task-shape) choice, declared, never improvised.

## 1. The placement rule

For every rule, step, or check, ask in order:

1. **Computable?** Script. Exit code. No LLM.
2. **Production needs judgment, verification does not?** LLM produces, script verifies. (Largest category. Default suspicion: any prompt rule probably lives here.)
3. **Neither?** LLM judgment + adversarial second LLM, output in a schema a script structurally validates.

## 2. Layer model

| Layer | Form | Owns | Changes via |
|---|---|---|---|
| 1. Infrastructure | bash + CI + git config | supervision, isolation, gates, verifiers | kernel PRs |
| 2. Process kernel | versioned repo: schemas, templates, prompts | roles, contracts, checklists | kernel PRs (tuition flow, section 9) |
| 3. Judgment | LLM agents | plan, review, implement, arbitrate | kernel version pin |
| 4. Owner | blueprint + decision queue | irreversible calls, approvals, priorities | Thomas, directly |

## 3. Topology

```
kernel/                 versioned, shared across projects (git repo, semver tags)
  AGENTS.md             orchestrator job description
  roles/                per-role prompt templates (briefs)
  schemas/              charter, plan, decision-record, status-line, report
  checklists/           probe lists per review type
  bin/                  the deterministic toolbelt (section 4)
  tuition/              cross-project failure-mode log feeding kernel changes

fleet/                  local, per-machine, gitignored as a whole
  charter/<project>.md  per-project charter (section 7)
  backlog.md            queue, dependencies, done tail
  state/                watcher beacons, task meta, status files, locks
  decisions/            owner decision records (section 7)
  <task-id>/            brief, report, evidence

projects/               clones; read-only for the orchestrator
```

- Decided: distribution via npm, maximized. The kernel ships as an npm package (source lives under projects/ like any project and is delivered by the system itself). A fleet home is a small npm project depending on a pinned kernel version: package.json is the pin, npm install is the upgrade, rollback is a version change. Claude Code integration is a thin plugin (skills, commands, hooks) consuming the installed kernel; any future harness is a new thin adapter, never a kernel change.
- Rule carried over: orchestrator never writes to projects/; project knowledge lands in the project's own CLAUDE.md via a normal delivered change.

## 4. Layer 1: Infrastructure (the toolbelt)

Each entry: contract in one line. Status: EXISTS (current process) / BORROW (firstmate pattern) / BUILD (new).

| Component | Contract | Status |
|---|---|---|
| watcher | sleep on fleet; exit with one reason line (signal, stale, check, heartbeat); zero tokens idle; exponential heartbeat backoff | BORROW |
| liveness guard | every supervision script warns if tasks in flight and watcher beacon stale | BORROW |
| session lock | one orchestrator per fleet; second session goes read-only | BORROW |
| worktree pool | clean disposable worktree per task; parallel-safe | BORROW |
| spawn | window + worktree + brief + turn-end hook + task meta, one command | BORROW |
| teardown | refuses when unlanded work present; scout carve-out requires report | BORROW |
| full-suite wrapper | machine-countable pass/fail/skip parity vs baseline | EXISTS |
| red-witness harness | input: test IDs + baseline SHA; asserts red on baseline, green on head; emits evidence file | BUILD |
| scope auditor | git diff names vs plan's declared files-to-touch; undeclared extras fail | BUILD |
| citation linter | file exists, line in range, optional content hash; stale citation fails | BUILD |
| coverage checker | every input finding ID referenced by a phase, decision, or parked item; orphans fail | BUILD |
| deploy verifier | poll platform API until deployment READY or timeout; blocks next dispatch | EXISTS (manual) -> BUILD (script) |
| migration verifier | applied migrations match repo migrations post-merge | EXISTS (manual) -> BUILD (script) |
| conflict pre-pass | pairwise files-to-touch overlap across planned phases; feeds parallelism (section 10) | BUILD |
| credential scoping | implementers cannot create PRs or merge; enforced by token scope or branch protection, not instruction | BUILD |

## 5. Layer 2: Process kernel

Artifacts (each gets a schema or template file):

- Role briefs: investigator, plan writer, adversarial plan reviewer, implementer, clean-room reviewer, orchestrator.
- Plan schema: phases with `id`, `intent`, `acceptance`, `files-to-touch`, `migrations`, `conflicts-with`, `parallelizable`, citations.
- Charter schema: section 7.
- Decision record schema: section 7.
- Status line contract: sparse, supervisor-actionable states only (`needs-decision`, `blocked`, `done`, `failed`, phase changes).
- Report contract: findings with IDs, evidence links, honest-failure section.
- Gate registry: the canonical list of gates per assurance mode, consumed by CI and briefs, single source.

Versioning: semver tags. Projects pin a kernel version in their charter. Kernel changes ship through the kernel's own delivery pipeline (the system eats its own food).

## 6. Layer 3: Judgment roles

| Role | Lifetime | Verifier attached (deterministic) |
|---|---|---|
| orchestrator | disposable session, state in fleet/ | liveness guard, lock; TODO: periodic self-audit probe |
| investigator (scout) | one task | report contract validation, citation linter |
| plan writer | one plan | plan schema validation, citation linter, coverage checker |
| adversarial plan reviewer | one plan | finding-format validation; reviews against input report AND plan (decorrelation) |
| implementer | one phase (+fix rounds) | scope auditor, red-witness harness, full-suite wrapper, credential scoping |
| clean-room reviewer | one PR | reviews from plan acceptance criteria; verdict schema (APPROVE / FIX-ROUND) |

Carried over verbatim from current process: fresh context per role, model tier by risk, escalate-if-plan-wrong, fix rounds return to the resumed implementer.

- Decided: reviewer decorrelation is deferred. The deterministic verifier layer already decorrelates (scripts share no bias with models), and the adversarial plan reviewer reading the input report as well as the plan is kept because it costs nothing. Cross-model-family review is parked until tuition records a miss that survived every review stage.
- Design principle kept in mind: the role-to-model binding is configuration (kernel defaults, charter override), resolved by the harness adapter. Cross-vendor pairings (creator on one vendor, validator on another, on harnesses that support it such as pi) then become available without any kernel change.

## 7. Layer 4: Owner interface

**Blueprint = standing kernel + project charter.**

Charter required fields (schema-enforced; missing field blocks realization):

- identity: name, repo, kernel version pin
- delivery mode + assurance tier (section 8), yolo-class permissions if any
- irreversible decisions: stack, language, framework, core data model, tenancy model, auth model, deployment topology
- product intent: one page max, what winning looks like
- constraints: standing conventions reference (kernel) + project-specific deltas
- escalation contract: what realization must stop for (default: any irreversible choice the charter is silent on)

Boundary rule: **reversibility**. Expensive to undo goes in the charter; anything a gate can catch and a refactor can fix belongs to realization.

Charter lifecycle: written by owner (or drafted by scout, owned by owner), then adversarially reviewed before first dispatch. Probes: silence hunting (schema for structural silence, LLM for semantic silence), contradiction, feasibility.

**Decision queue.** Every escalation lands as a decision record:

```
id, project, task, question, options[], recommendation, reversibility (reversible | costly | irreversible), evidence links, status, decided, date
```

Rendered batched, not narrated per-pipeline. Approvals recorded here; the record is the audit trail.

## 8. Assurance modes

Declared per project in the charter; scout tasks are mode-agnostic.

| Mode | Pipeline | Merge authority |
|---|---|---|
| full | complete adversarial pipeline (plan, adversarial review, implement, clean-room review, gates, deploy + migration verification) | owner |
| direct-PR | implement + gates, no adversarial layers | owner |
| local-only | implement, orchestrator diff review, local fast-forward | owner approves, orchestrator merges |

The current proven process is the definition of `full`. Downgrades are declared, never improvised.

## 9. Task shapes and tuition flow

- **ship**: delivers a change via the project's mode.
- **scout**: delivers a report, never pushes; worktree is scratch, report required for teardown.
- **promote**: scout to ship in place; clean-base re-branch, scratch never rides along, repro becomes regression test.

Tuition flow: any failure mode discovered in a project produces a tuition entry; kernel-relevant tuition ships upstream as a kernel PR; project-specific tuition lands in that project's CLAUDE.md. This replaces per-repo-only memory.

## 10. Parallelism model

1. Disjointness is a **plan-time output**: `conflicts-with` and `parallelizable` per phase, adversarially reviewed.
2. Conflict pre-pass script computes file-overlap as the cheap floor; the reviewer judges semantic coupling above it.
3. Execution: disjoint phases run in parallel worktrees; merge, deploy verification, and migrations serialize through the orchestrator (release-manager duty).
4. Red-witness runs against latest main, not a frozen fork point: the question that matters is whether main still needs this change. The implementer runs it against current origin/main for fast feedback; the orchestrator re-runs it at merge time against the exact merge target, as a merge gate. A witness that was red early but comes back green at merge time means an intervening merge already covers the behavior: semantic overlap the file pre-pass cannot see, so the phase escalates instead of merging. Unrelated noise on main is filtered by the parity-counting wrapper (only the new tests may differ from main's own baseline).
5. Session model: one orchestrator per fleet (lock), parallelism inside it. Multi-orchestrator is out of scope for v1.

## 11. Migration table (current doc -> v1)

Mapping of every rule in the current process doc to target layer and form. Representative rows; complete during v1 drafting by walking the current doc top to bottom.

| Current rule (prompt) | Target | Form |
|---|---|---|
| red-witness discipline | L1 | red-witness harness |
| scope must match plan | L1 | scope auditor |
| citations must be real | L1 | citation linter |
| no orphan findings | L1 | coverage checker |
| verify deploy + migrations after merge | L1 | verifier scripts |
| implementer never creates PR | L1 | credential scoping |
| hourly cron heartbeat | L1 | event watcher + guard (replaces cron) |
| adversarial review probes | L2 | checklist files |
| honest reporting rules | L2 | report contract + schema validation |
| owner decisions never pre-empted | L4 | charter + decision records |
| ... | ... | complete during drafting |

## 12. v1 non-goals and open questions

Non-goals (explicitly deferred):

- Pipeline telemetry (cost per phase, review hit rate, flake tax): v1.1, but schemas above should not preclude it.
- Multi-orchestrator fleets.
- Production outcome loop (analytics feeding intake).
- Non-Claude harness adapters.

Resolved at first review:

1. Distribution: npm spine, thin harness plugin adapter (section 3).
2. Reviewer decorrelation: deferred; free mitigation kept (section 6).
3. Red-witness target: latest main, re-verified at merge time as a merge gate (section 10).
4. Migration: hard cutover. The current live process stops and v1 takes over; replacing the existing process is the proof that it works.

## 13. Build plan

**Construction method: the current live process builds its successor.** This document plus the current process doc form the intake report for the kernel project. The pipeline's own verification pass gets to challenge its future architecture, its plan writer phases it, its adversarial reviewer attacks it. The old process's final delivery is the new system; then cutover.

Milestones. Each ends with a deterministic exit test; no milestone starts before the previous test passes.

| # | Milestone | Contents | Exit test |
|---|---|---|---|
| M1 | Walking skeleton | kernel repo scaffold (package.json, bin/, schemas/, roles/), fleet-home init + doctor CLI, session lock, worktree pool, spawn, teardown guard, watcher + liveness guard, toy sandbox project | one trivial task lands as a PR on the toy project via spawn; teardown refuses while unlanded; watcher wakes on completion |
| M2 | Deterministic gates | red-witness harness (first), full-suite wrapper ported into kernel bin, scope auditor, citation linter, coverage checker, deploy + migration verifiers, credential scoping | all gates run green in CI on the kernel repo itself |
| M3 | Judgment layer | role briefs ported from current process doc, plan + charter + decision-record schemas, migration table walk completed (scout drafts, owner reviews) | one kernel change delivered end to end through the kernel's own full mode; release v0.1.0 to GitHub Packages |
| M4 | Cutover | pilot charter written, current pipeline drains, pilot project's next phase runs through v1, thin Claude Code plugin (hooks: project-write block, turn-end signal) | pilot phase merged and deploy-verified entirely on v1; old process retired |
| M5 | Scale-out | conflict pre-pass + merge-time witness gate (parallelism on), second project onboarded, greenfield bootstrap path | two phases in parallel worktrees merged serially without incident; project #2 running from charter alone |

Owner actions (everything else is delegated through the pipeline):

1. Create the tiphys kernel repo on GitHub. Name decided: Tiphys; npm scope @tiphys; remaining check: domains (tiphys.dev, tiphys.io) and a scout sweep for conflicts.
2. Pick the pilot project for M4 cutover.
3. Review the charter schema's irreversible-decisions field list (section 7) and adjust to taste.
4. Feed this document + the current process doc into the live pipeline as intake for the kernel project.
5. Standing duties as always: decision queue, merge approvals, charter authorship.
