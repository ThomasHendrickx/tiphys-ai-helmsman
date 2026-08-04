# Plan review round 4: external cross-model review

- date: 2026-08-04
- reviewer: GPT 5.6 (external model family), submitted by the owner
- plan baseline reviewed: revision 5 (commit 9bc93fd era)
- verdict: FIX-ROUND-NEEDED
- approval boundary stated by the reviewer: architecture and milestone sequence approved; M1 phase structure approved with fixes F-01 to F-05; M1 dispatch not approved before those fixes; M2/M3 approved as outline only; M4/M5 not yet plannable from current detail.
- provenance note: this file records the external review as received. Typography is normalized to repo conventions (dashes and special characters); wording is unchanged. Finding IDs are namespaced EXT-F-nn in pipeline references to avoid collision with internal PR-nnn IDs.

## Findings summary

| ID | Severity | Finding | Required change |
|---|---|---|---|
| F-01 | High | Lease renewal and takeover are not safely serialized | Define expired-renewal behavior and one atomic mutation protocol |
| F-02 | High | tiphys init assumes Git author configuration | Make initialization work in clean/cloud environments |
| F-03 | High | Worktrees may branch from stale local default branches | Define fetch and exact base-SHA behavior |
| F-04 | Medium | M1 exit test mixes deterministic automation with a human merge dependency | Split machine exit evidence from owner authorization |
| F-05 | Medium | Monotonically increasing test counts are a weak and gameable acceptance rule | Replace with explicit test discovery/parity expectations |
| F-06 | Medium | M4 contains several architecture-bearing systems in one paragraph | Require separate detailed planning before M4 dispatch |
| F-07 | Medium | M3-P4 is a 74-requirement catch-all | Split it by artifact family during detailed M3 planning |
| F-08 | Low | "Healthy" doctor permits important operational WARN states | Define readiness profiles rather than one generic exit result |
| F-09 | Low | Apache attribution handling is conditional but not mechanically protected | Add dependency/license auditing before release |

## F-01: Lease renewal and takeover race (High)

Current plan: the lease is acquired using O_EXCL; can be renewed by the current holder; can be explicitly taken over after expiry; uses temporary-file-plus-rename for renewal and takeover; verifies the result by rereading.

Problem: the plan does not state that renewal must fail once the lease has expired. Possible sequence: (1) holder A's lease expires; (2) holder B reads the expired lease and starts takeover; (3) holder A resumes and starts renewal; (4) both replace the same file; (5) one operation overwrites the other. Read-after-write detects some interleavings, but it is not a substitute for serializing the decision and replacement. In some orderings, one actor can briefly believe it owns the fleet and perform another mutation before discovering the loss. This matters because the lock is the structural implementation of "one orchestrator per fleet".

Required plan change:

```
renew:
- fails if the lease is expired;
- succeeds only while holderId matches and expiresAt is still in the future.
takeover:
- succeeds only if the observed lease is still the lease being replaced;
- serializes with renew, release and competing takeover operations.
all lock mutations:
- use one shared atomic mutation primitive;
- command ownership is not considered valid until that primitive completes.
```

Add concurrent tests for: renew versus takeover; takeover versus takeover; release versus takeover; paused holder attempting renewal after expiry; mutation attempted using the losing holder ID.

## F-02: Clean-environment Git initialization (High)

Current plan: tiphys init performs git init and an initial commit; its acceptance criterion requires at least one commit. The doctor checks whether Git exists, but not whether author name and email are configured.

Problem: a clean machine or reclaimable cloud session may have Git installed without user.name and user.email. The initial commit then fails. This directly affects the dual-substrate decision: persistent local machines and reclaimable cloud sessions are intended to be first-class.

Required plan change, choose one explicit behavior:
- Option A: tiphys init requires Git identity; doctor reports missing identity as FAIL.
- Option B: tiphys init creates its own deterministic machine-authored initial commit using command-scoped author and committer environment variables.
- Option C: tiphys init creates the files but does not commit automatically.

Reviewer recommendation: Option B for the fleet bootstrap commit. Do not modify the user's global Git configuration. Add an acceptance criterion running init with an empty temporary HOME and no global Git config.

## F-03: Undefined worktree base (High)

Current plan: the pool creates a worktree "from the project's default branch head."

Problem: "default branch head" is ambiguous: local main; origin/main; remote default branch resolved through origin/HEAD; the last fetched remote SHA. A stale local branch could create a phase from an outdated baseline. That undermines phase isolation, scope assumptions, red-witness behavior, and later merge conflict analysis. The blueprint explicitly makes evidence, restartability and current-main verification foundational.

Required plan change, specify something equivalent to:

```
1. Resolve the project's configured remote and default branch.
2. Fetch that branch.
3. Record the fetched base SHA in task meta.
4. Create the task branch directly from that exact SHA.
5. Fail rather than silently use a stale local branch when fetch fails,
   unless an explicit offline mode was selected.
```

Acceptance tests: local main behind origin/main; local main ahead of origin/main; detached HEAD; missing origin/HEAD; fetch failure; task metadata contains the exact base SHA.

## F-04: Deterministic exit test versus human merge (Medium)

Current plan: the full M1 exit procedure requires spawning work, opening a PR, proving teardown refusal, merging, then proving teardown succeeds, in "one uninterrupted run."

Problem: the merge depends on owner authority and potentially human timing. That makes the milestone test partly deterministic and partly operational. The owner-approval boundary is important and should remain. The problem is treating it as one uninterrupted machine test.

Required plan change, split the exit evidence:

```
Stage A: automated pre-merge witness
- task spawned; branch pushed; PR open; watcher woke; teardown refused.
Stage B: owner-authorized transition
- approval recorded; orchestrator merges.
Stage C: automated post-merge witness
- merged SHA verified; teardown succeeds; task closes; evidence bundle validates.
```

The milestone can still require all three stages. It should not imply that a human approval is an uninterrupted script step.

## F-05: Test-count growth as acceptance (Medium)

Current plan: several phases require a total test count strictly greater than the previous phase.

Problem: this verifies growth, not coverage or discovery integrity. It encourages retaining redundant tests merely to preserve count, splitting one meaningful test into several trivial tests, avoiding legitimate consolidation, and coupling each phase to a historical count. The original process's stronger rule is discovery parity: passed + failed + skipped + did-not-run must equal discovered.

Required plan change, for M1 use explicit minimum named behaviors:

```
- expected test files are discovered;
- each phase's newly required behavior has at least one identified test;
- test runner reports zero unaccounted tests;
- no previously registered required behavior disappears.
```

A temporary count floor is acceptable in the walking skeleton, but it should not be the principal acceptance criterion.

## F-06: M4 is materially under-planned (Medium)

M4 currently combines: the pilot charter; adversarial charter review; old-pipeline drain and hard cutover; Claude Code plugin; project-write enforcement; turn-end integration; all project-specific gate wiring; merge configuration and branch protection; cloud-session execution; cross-environment locking; fleet synchronization; recovery after session reclamation. These are not one implementation phase. Several define security, authority, durability and distributed coordination.

Required change: before M4 starts, require a dedicated M4 intake and plan with at least these workstreams: pilot bootstrap (charter, project configuration, gate applicability); harness adapter (Claude Code hooks and executor integration); authority enforcement (project-write block, credentials, approval and merge); fleet durability (commit/push protocol, recovery, reconciliation); cross-environment exclusion (distributed lease semantics); cutover (drain, freeze point, rollback and retirement criteria). Do not let "hard cutover" prevent a technically defined rollback procedure. Hard cutover can mean no dual-running after acceptance; it should not mean no recovery path if the cutover itself fails.

## F-07: M3-P4 is too broad (Medium)

The requirements appendix allocates 74 rows to M3, and M3-P4 is described as completing the migration-table walk into briefs, checklists, templates and policies. The plan already recognizes this as the largest porting surface and says it must be phased by artifact.

Required change, make that statement binding: M3-P4 may not be dispatched as one phase. Detailed M3 planning must divide migration by: (1) role briefs; (2) review checklists; (3) orchestrator policy; (4) reporting/work-history templates; (5) tuition flow; (6) assurance-mode behavior. Each subphase needs its own requirements coverage input and orphan check.

## F-08: Doctor readiness semantics (Low)

Current plan: doctor exits successfully when there are no FAIL results. Therefore it may exit 0 while reporting no Git remote, no gh, watcher not running or scheduled.

Problem: that is reasonable for a generic health inspection, but "doctor exits 0" cannot then mean "ready to run the full pipeline."

Required change, define profiles: tiphys doctor; tiphys doctor --for local-only; tiphys doctor --for direct-pr; tiphys doctor --for full; tiphys doctor --for watch. The applicable profile promotes required WARN conditions to FAIL. This aligns with the plan's own later precondition semantics: inapplicable gates should be N/A, never green.

## F-09: Third-party license evidence (Low)

The plan correctly distinguishes copying MIT code (requires retaining the applicable notice), reimplementing a protocol (does not copy copyrighted source), and excluding a component whose license was not verified.

Required change, before the first public release add a deterministic release check that:

```
- inventories production dependencies;
- checks license metadata is present;
- rejects unknown or explicitly prohibited licenses;
- verifies THIRD-PARTY-NOTICES when copied third-party code is declared;
- packages LICENSE and any required notices into npm pack output.
```

This can land in M3 release engineering rather than M1.

## Reviewer's strengths assessment (recorded for the file)

Spec disagreement handling excellent (every SC finding dispositioned exactly once); decision ownership strong; M1 decomposition good; acceptance criteria mostly concrete and executable; firstmate borrowing disciplined (protocol harvesting separated from code copying); dual-substrate scope honest; compiled/source parity unusually well considered; watcher design strong; M1 exit harness strongly falsifiable; requirements coverage comprehensive and auditable.
