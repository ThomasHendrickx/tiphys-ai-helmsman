# Spec Coherence Report: Tiphys Intake Verification

Date: 2026-08-04

## Inputs verified

1. `/home/user/tiphys-ai-helmsman/delivery/intake/orchestrated-delivery-process.md` (the process document, "process doc" below)
2. `/home/user/tiphys-ai-helmsman/delivery/intake/orchestrated-delivery-v1.md` (the v1 blueprint, "blueprint" below)

## Method

Both documents were read in full. Every rule, component, and milestone in the blueprint was cross-checked against the process doc, against the rest of the blueprint, and against the settled-decisions list (npm distribution and @tiphys scope, topology, assurance modes, reversibility boundary, build-with-current-process, deferred decorrelation, merge-time red-witness, hard cutover, and the queued owner decisions), so no settled item is re-litigated here. Each BUILD component and each milestone exit test was additionally probed for logical and technical feasibility as specified, not for effort.

Declared incompleteness is not treated as a finding: the blueprint's "skeleton" status (v1 line 5), the migration table's "representative rows, complete during v1 drafting" note (v1 lines 172, 186), and the orchestrator's "TODO: periodic self-audit probe" (v1 line 105) are announced gaps with owners, not silences or contradictions.

Citation convention: "process" = orchestrated-delivery-process.md, "v1" = orchestrated-delivery-v1.md, line numbers per the files as read on 2026-08-04.

---

## Findings

### SC-001

- Category: contradiction
- Severity: low

The two documents disagree about what the adversarial plan reviewer is allowed to see, and the process doc disagrees with itself. The process doc's role table says the reviewer sees "The plan + the code, nothing else" (process line 20), yet section 1d requires the same reviewer to "check every input finding is fixed-or-parked" (process line 72), which cannot be done without access to the input report's finding list. The blueprint states the reviewer "reviews against input report AND plan (decorrelation)" and describes this as "kept because it costs nothing" (v1 lines 108, 114), that is, as existing practice, which the role table's "nothing else" denies. The behavior itself is settled (decorrelation decision, v1 section 6); only the documents' descriptions conflict.

Evidence: process lines 20, 72; v1 lines 108, 114.

Recommended disposition: resolve-in-plan. When role briefs are ported in M3 (v1 line 214), the adversarial plan reviewer brief should state the settled visibility (input report + plan + code); the process doc's role table should be corrected in the same change so the two documents agree.

### SC-002

- Category: contradiction
- Severity: medium

The fleet home's durability contradicts the durability principle both documents insist on. Blueprint principle 4 says "All truth lives in files, worktrees, and git" (v1 line 19), and the process doc's resilience section says "Durable state lives outside the chat: the plan and work histories in the repo, pipeline state in a task list, everything pushed. Assume the container dies hourly" (process lines 197-198), with a recorded incident of unpushed work dying twice (process lines 109-110). Yet the blueprint declares "fleet/ local, per-machine, gitignored as a whole" (v1 line 50), and that gitignored directory holds the per-project charters (v1 line 51), the backlog (v1 line 52), and the owner decision records that section 7 calls "the audit trail" (v1 lines 54, 140). As specified, a machine loss or container reclaim destroys the charters, the decision audit trail, and the queue, which is exactly the failure class the process was tuned against.

Evidence: v1 lines 19, 50-57, 140; process lines 109-110, 197-198.

Recommended disposition: resolve-in-plan. The fleet home is already specified as a small npm project (v1 line 62); make it a private git repository with push discipline, and narrow the gitignore to genuinely ephemeral entries (state/ beacons, locks, scratch worktrees). Flag the resolution vetoable since decision records may contain material the owner does not want in any remote.

### SC-003

- Category: contradiction
- Severity: low

The topology diagram and the npm distribution decision describe two different places for the kernel to live. The diagram shows `kernel/` as a top-level directory beside `fleet/` and `projects/` (v1 lines 44-52), while the decided distribution bullet says the kernel "ships as an npm package (source lives under projects/ like any project...)" and reaches a fleet home through package.json and npm install (v1 line 62), that is, through node_modules, not a checkout. The diagram appears to predate the npm decision. This is a documentation inconsistency, not a design conflict, but it will confuse the M1 scaffold if taken literally.

Evidence: v1 lines 44-52 versus v1 line 62.

Recommended disposition: resolve-in-plan. Redraw the topology in the plan: kernel source is a clone under projects/, the consumed kernel is the pinned npm dependency inside the fleet home, and no top-level kernel/ directory exists on a fleet machine.

### SC-004

- Category: silence-irreversible
- Severity: high

Neither document decides the implementation language and runtime for the kernel's executable surface, and by the blueprint's own rules this is an owner decision that blocks realization. Layer 1 is described as "bash + CI + git config" (v1 line 33), but section 4 specifies substantial BUILD components (red-witness harness, scope auditor, citation linter, coverage checker, deploy and migration verifiers, credential scoping; v1 lines 80-85) and M1 requires a "fleet-home init + doctor CLI" (v1 line 212), none of which are assigned a language. npm distribution (settled, v1 line 62) guarantees Node is present but does not decide bash versus Node, or JavaScript versus TypeScript, for kernel bin/. The charter schema itself lists "stack, language" among irreversible decisions whose absence blocks realization (v1 line 127), and principle 3 plus the escalation contract forbid realization from improvising an irreversible choice on blueprint silence (v1 lines 18, 129). Every M1 and M2 deliverable is written in this undecided language; deciding it late means rewriting the whole toolbelt, which is milestone-scale rework.

Evidence: v1 lines 18, 33, 62, 80-85, 127, 129, 212-213.

Recommended disposition: escalate-to-owner. Ship options with a recommendation (for example: TypeScript for anything with parsing or schema logic, thin bash only where a shell one-liner genuinely suffices) and get the call before M1 planning completes.

### SC-005

- Category: silence-irreversible
- Severity: medium

The schema technology and artifact file formats are undecided even though every artifact in the system depends on them. Section 5 says each kernel artifact "gets a schema or template file" (v1 line 89), section 7 says charter fields are "schema-enforced; missing field blocks realization" (v1 line 121), and placement rule 3 requires LLM output "in a schema a script structurally validates" (v1 line 30), but no document says what the schema system is (JSON Schema, a TypeScript validation library, YAML rules, markdown with validated frontmatter) or what format the artifacts themselves are written in. Charters, plans, decision records, status lines, and reports across every current and future project will be authored in this format; changing it later means migrating every artifact and every validator in every fleet, which is on the expensive side of the section 7 reversibility boundary (v1 line 130).

Evidence: v1 lines 30, 89-97, 121, 130.

Recommended disposition: escalate-to-owner, with a concrete recommendation in the plan (for example: markdown artifacts with structured frontmatter validated by JSON Schema, so humans read prose and scripts validate structure). A defensible alternative is resolve-in-plan flagged vetoable, but since the charter schema is itself one of the affected artifacts and the owner must author charters by hand, the owner should see the choice.

### SC-006

- Category: silence-irreversible
- Severity: low

The published package names under the settled @tiphys scope are undecided. The scope is settled (v1 line 220) and M3 publishes v0.1.0 (v1 line 214), but nothing names the package or packages: one kernel package or a split (kernel, Claude Code plugin adapter per v1 line 62), and under what names. Published npm names are effectively permanent once depended on (registry unpublish policies), and the M4 fleet homes and plugin will pin them.

Evidence: v1 lines 62, 214, 220.

Recommended disposition: resolve-in-plan with a named recommendation (for example @tiphys/kernel and @tiphys/claude-code-plugin), flagged vetoable to the owner alongside the already-queued naming checks (domains, conflict sweep, v1 line 220).

### SC-007

- Category: silence-irreversible
- Severity: medium

The runtime substrate the orchestration layer runs on is implied in two incompatible directions and never declared. The blueprint's infrastructure assumes a persistent per-machine environment: "fleet/ local, per-machine" (v1 line 50), spawn allocates a "window" (v1 line 75), locks are per-fleet-per-machine (v1 lines 73, 168), and the watcher is a resident process sleeping on fleet files (v1 line 71). The process doc that defines the building environment assumes the opposite: reclaimable cloud containers ("Assume the container dies hourly", process line 198; environments reclaimed mid-run, process lines 109-110) and an hourly cron firing into a session (process lines 192-196). Whether Tiphys orchestrators run on a persistent local machine under a terminal multiplexer, in cloud sessions, or both determines the shape of watcher, spawn, lock, and teardown, which is most of M1; building for the wrong substrate is milestone-scale rework. The settled thin-adapter decision covers harness integration, not the substrate the fleet lives on.

Evidence: v1 lines 50, 71-76, 168; process lines 109-110, 192-198.

Recommended disposition: escalate-to-owner. The blueprint reads as intending a persistent local machine; confirm that explicitly, and record what, if anything, M1 must do to stay runnable from cloud sessions during construction.

### SC-008

- Category: contradiction
- Severity: medium

Merge authority in full mode is specified inconsistently. The blueprint's assurance table gives full mode and direct-PR "merge authority: owner", explicitly contrasted with local-only where "owner approves, orchestrator merges" (v1 lines 148-150), implying the owner personally merges in full mode. But the parallelism model says "merge, deploy verification, and migrations serialize through the orchestrator (release-manager duty)" (v1 line 166), which has the orchestrator performing merges in full-mode parallel execution. The process doc, which is "the definition of full" (v1 line 152), says only "Merge on CI green only" with no owner approval step anywhere in its merge section (process line 158), while the blueprint's owner-duties line says "merge approvals ... as always" (v1 line 225), asserting a current practice the process doc never records. Who actually clicks merge, and whether owner approval is a gate or the merge act itself, changes the credential-scoping design (v1 line 85) and the M5 serialization mechanics.

Evidence: v1 lines 148-150, 152, 166, 225; process line 158.

Recommended disposition: resolve-in-plan with a suggested resolution flagged vetoable: "merge authority: owner" means the owner grants approval per PR, and the orchestrator executes the merge serially as release manager; encode the approval as a deterministic check (for example an approving review from the owner) so the rule is structural per principle 6.

### SC-009

- Category: contradiction
- Severity: low

The coverage checker's pass condition omits one landing place the process doc allows. The process doc requires every input finding to land in "a phase, a decision, an open question, or parked-with-a-reason. No orphans" (process lines 66-67). The blueprint's deterministic coverage checker passes only findings "referenced by a phase, decision, or parked item; orphans fail" (v1 line 81). A plan carrying a legitimate open question would fail the script, unless open questions are meant to be represented as decision records with open status, which no document states. For a deterministic gate the enumeration must be exact.

Evidence: process lines 66-67; v1 line 81.

Recommended disposition: resolve-in-plan. State in the plan schema and coverage checker spec that an open question is a decision record with status open (which also feeds the section 7 decision queue naturally), or add open-question as a fourth accepted reference type.

### SC-010

- Category: contradiction
- Severity: low

The read-only rule on projects/ contradicts the orchestrator's merge duties as literally specified. The topology declares "projects/ clones; read-only for the orchestrator" and "orchestrator never writes to projects/" (v1 lines 59, 63), and the M4 plugin enforces this structurally with a "project-write block" hook (v1 line 215), per principle 6 that rules must be structural (v1 line 21). But local-only mode has the orchestrator perform a "local fast-forward" merge (v1 line 150) and the release-manager duty serializes merges through the orchestrator (v1 line 166); a merge writes to the project clone's git refs, and a structural write-block that does not know the carve-out would break its own pipeline's merge path.

Evidence: v1 lines 21, 59, 63, 150, 166, 215.

Recommended disposition: resolve-in-plan. Scope the rule precisely: the orchestrator never writes working-tree content or commits in projects/; ref updates through the designated merge tooling are the explicit release-manager carve-out, and the write-block hook must encode that carve-out.

### SC-011

- Category: infeasibility
- Severity: medium

Full mode's deploy and migration verification cannot run as specified on projects with no deployment, including the kernel itself, yet two milestone exit tests require exactly that. Full mode's pipeline includes "deploy + migration verification" (v1 line 148); the deploy verifier's contract is "poll platform API until deployment READY or timeout" (v1 line 82) and the migration verifier compares applied migrations to repo migrations (v1 line 83). The kernel is an npm library with no deployment platform and no migrations. M2's exit test requires "all gates run green in CI on the kernel repo itself" (v1 line 213), and M3 requires "one kernel change delivered end to end through the kernel's own full mode" (v1 line 214). As specified, either these gates cannot run on the kernel (milestone cannot exit) or they are vacuous no-ops reported as green, which violates principle 5 (evidence over claims, v1 line 20) and produces a "deterministic exit test" (v1 line 208) that tests nothing. The gate registry is defined per assurance mode only (v1 line 97), with no stated mechanism for per-project gate applicability beyond free-form charter deltas.

Evidence: v1 lines 20, 82-83, 97, 148, 208, 213-214.

Recommended disposition: resolve-in-plan. Give gates declared preconditions in the gate registry (for example "project declares a deploy target in its charter"); a gate whose precondition is unmet reports not-applicable, never green; exit tests assert the applicable subset explicitly. For the kernel, define the release-verification analogue (published package installable and importable at the released version) so M3's exit test verifies something real.

### SC-012

- Category: contradiction
- Severity: medium

The M3 release target conflicts with the settled npm scope unless an unstated GitHub organization exists. M3's exit test says "release v0.1.0 to GitHub Packages" (v1 line 214). GitHub Packages' npm registry requires a package's scope to match the GitHub user or organization that owns the hosting repo, so publishing under the settled @tiphys scope (v1 line 220) requires a GitHub organization named tiphys; owner action 1 covers creating the kernel repo but says nothing about an organization (v1 line 220). GitHub Packages also requires authentication even to install public packages, which adds a token requirement to every fleet home's "npm install is the upgrade" path (v1 line 62). This does not re-litigate the settled npm-distribution or scope decisions; it flags that the registry named in M3 is in tension with them.

Evidence: v1 lines 62, 214, 220.

Recommended disposition: escalate-to-owner. Options: (a) publish to the public npmjs registry under @tiphys (simplest install path, scope availability already queued for the conflict sweep), or (b) keep GitHub Packages, create the tiphys GitHub organization, and accept authenticated installs in every fleet home. Note the possible overlap with the already-queued "elevated GitHub permissions" decision bundle; if org creation is tracked there, only the registry choice itself needs a decision here.

### SC-013

- Category: contradiction
- Severity: low

The construction method and the M3 exit test leave the delivery process for late-milestone kernel work ambiguous. Section 13 states "the current live process builds its successor" and "The old process's final delivery is the new system; then cutover" (v1 line 206), and cutover is M4 (v1 lines 202, 215). But M3's exit test is "one kernel change delivered end to end through the kernel's own full mode" (v1 line 214), which is a run on Tiphys before M4. Taken literally, the documents do not say whether that self-delivery is a one-off controlled exit test or a switchover point, nor which process delivers kernel changes between M3 exit and M4 cutover, and during M5.

Evidence: v1 lines 202, 206, 214-216.

Recommended disposition: resolve-in-plan. State explicitly: the M3 self-delivery is the exit test's controlled exception, executed under current-process supervision; all other kernel work through the end of M4 cutover ships via the current process; from M4 exit onward the kernel is its own pilot-class project on v1.

---

## What was checked and found sound

The following were probed and found coherent across both documents; their absence from the findings is a verified pass, not an unchecked area.

- Design principles ordering and the placement rule (v1 sections 0-1): internally consistent; every toolbelt entry maps cleanly to placement rule 1 or 2.
- The four-layer model and change paths (v1 section 2): consistent with the topology and with the tuition flow in section 9.
- Toolbelt contracts (v1 section 4): watcher, liveness guard, session lock, worktree pool, spawn, teardown, full-suite wrapper, scope auditor, citation linter, and credential scoping are each individually feasible as one-line contracts; credential scoping (no PR creation, no merge for implementers) is enforceable with fine-grained token permissions, matching the "token scope or branch protection" claim. Exceptions are recorded as SC-011 (deploy and migration verifiers on non-deploying projects) and SC-009 (coverage checker enumeration).
- Role model continuity (process section 0 versus v1 section 6): lifetimes, fresh-context rule, fix rounds to the resumed implementer, escalate-if-plan-wrong, and model-tier-by-risk carry over consistently, apart from SC-001.
- Red-witness mechanics (process 2c, v1 lines 80 and 167): the harness contract (baseline SHA parameter) is compatible with the settled latest-main target and the merge-time re-verification gate; the green-at-merge escalation rule and the parity-based noise filter are logically coherent.
- Assurance modes (v1 section 8): full mode's pipeline matches the process doc stage list; downgrade-by-declaration matches "never improvised", apart from the merge-authority ambiguity in SC-008.
- Task shapes and tuition flow (v1 section 9): scout, ship, promote are mutually consistent with teardown's scout carve-out and the no-scratch-rides-along rule; the tuition split (kernel PR versus project CLAUDE.md) matches the layer model.
- Parallelism model (v1 section 10): plan-time disjointness, the conflict pre-pass as a cheap floor with reviewer judgment above it, serialized merges, and the single-orchestrator lock are internally consistent and consistent with M5's exit test.
- Migration table sampled rows (v1 section 11): each present row's target layer and form agrees with sections 4 and 5 and with the process doc rule it migrates; the heartbeat-to-watcher row is a declared replacement, not a contradiction. Completion of the table is declared work in progress and was not audited for completeness.
- Milestone ordering (v1 section 13): the M1-M5 dependency chain is sound (skeleton before gates before judgment before cutover before scale-out); each exit test is deterministic in form, with the substantive exceptions in SC-011 and SC-013.
- Charter schema and decision queue (v1 section 7): field list, lifecycle, and the decision record schema are internally consistent; the reversibility boundary is stated once and used consistently, and this report applied that boundary when classifying category B findings.

## Honest failures: what could not be verified and why

- Firstmate provenance: six toolbelt components are marked BORROW from "firstmate" (v1 lines 6, 71-76), but no firstmate source is present in this repository, so the claim that these patterns exist and work as described could not be verified. If firstmate is not actually available at build time, six BORROW rows silently become BUILD rows and M1's scope grows.
- Claims about the current process's track record: statements such as "proven, 1+ week" (v1 line 6) and the process doc's incident anecdotes (process sections 1a, 4, 8) are historical claims with no artifacts in this repository; they were taken as given, not verified.
- External name availability: the @tiphys npm scope, the tiphys GitHub name, and the domains are flagged in the blueprint for a scout sweep (v1 line 220); no registry or network checks were performed by this pass, so SC-012 addresses only the documents' internal coherence, not real-world availability.
- The full-suite wrapper marked EXISTS (v1 line 77): its current implementation lives in some current-process project not present here; parity-counting behavior as described could not be inspected.
- Migration table completeness: the table is explicitly partial and being completed by other work; this pass verified only the rows present and did not attempt to enumerate unmapped process-doc rules, to avoid duplicating that in-flight work.
