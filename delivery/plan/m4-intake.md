# Tiphys kernel: M4 intake

- status: DRAFT, revision 1, 2026-09-15.
- discharges: the first half of plan decision D-19
  (delivery/plan/kernel-plan-v1.md:394), which forbids M4 dispatching without
  its own intake AND plan. This is the intake. The plan
  (`delivery/plan/kernel-plan-m4.md`) is a separate artifact and this document
  does not substitute for it.
- baseline: branch `plan/pstack-borrow-review` at `542fde1`, cut from `main` at
  `3b40118`. Every measurement below was taken against that tree unless it
  names another.
- governing records read and NOT reopened: DR-0012, DR-0016, DR-0020, DR-0025,
  DR-0028, DR-0029, DR-0031, DR-0034, DR-0035, DR-0036.

## 0. Why this document sits in `delivery/plan/` and not `delivery/intake/`

Two reasons, both mechanical.

`delivery/intake/` holds the two OWNER-SUPPLIED documents this build executes.
Both are input. An agent-authored document placed beside them is the kind of
category mixing that later makes a reader treat a derived claim as a premise.

The second reason is a gate. The citations gate lints
`delivery/plan/**`, `delivery/verification/**`, `delivery/decisions/**`,
`delivery/tuition/**`, `delivery/requirements/**` and `delivery/STATE.md`, and
REQUIRES substantive citations only in the first two. `delivery/intake/**` is in
neither list, so an intake placed there is not linted at all. The declared roots
are at src/gates/citations.ts:207. Putting this document under
`delivery/plan/` opts it into the discipline rather than out of it.

The cost is real, and it has TWO shapes rather than one, which matters because
they fail differently. Measured by calling the gate's own `extractCitations` and
`classifyPathAgainstRoots` against six strings:

| written in prose | extracted as a citation | outcome |
|---|---|---|
| `checklists/clean-room.yaml:38` | YES, 1 token | matches no declared root: **RED** |
| `gate-registry.yaml:283` | YES, 1 token | matches no declared root: **RED** |
| `templates/warnings.md:1` | YES, 1 token | matches no declared root: **RED** |
| `.claude/orchestrator-next.mjs:44` | **NO, 0 tokens** | invisible to the gate: neither red nor green |
| delivery/STATE.md:7 | YES, 1 token | resolves |

So four SHIPPED kernel trees (`checklists/`, `templates/`, `witness/` and
root-level `*.yaml`) produce a RED citation, while `.claude/**` produces no
citation at all because a leading dot cannot start the token. **The second is
the more dangerous one**: a red is loud, and a reference that silently is not a
citation lets a document look as though it cited its subject when it cited
nothing. Every reference to any of those paths in this document is therefore
QUOTED, deliberately and not by oversight. The gap was first recorded for
`checklists/` in
delivery/decisions/DR-0035-review-is-never-skipped-the-rounds-are-what-tier.md:43,
and it is open decision M4-D-18 below.

## 1. What M4 is: the one-line paragraph, decomposed

The whole of M4's scope in the approved plan is ONE paragraph on ONE line,
delivery/plan/kernel-plan-v1.md:368. There is no per-clause structure in it, so
anything dropped is dropped silently. It decomposes into ELEVEN clauses:

| # | Clause | Owning workstream |
|---|---|---|
| 1 | The pilot charter is written AND adversarially reviewed | pilot bootstrap |
| 2 | The current pipeline drains | cutover |
| 3 | The thin Claude Code plugin ships, two hooks: project-write block (SC-010 carve-out per D-8), turn-end signal integrating the M1 hook contract | harness adapter (hook 2), authority enforcement (hook 1) |
| 4 | Project-specific gate wiring for the pilot: R-041, R-042, R-045, R-046, R-047, R-050a, R-051 | pilot bootstrap |
| 5 | Repo merge config and branch protection: R-064, R-065a, SC-008 structural encoding | authority enforcement |
| 6 | CI patterns productized as bootstrap checks: R-071, R-072, R-097 | pilot bootstrap |
| 7 | The orchestrator-side project-write block: R-001a | authority enforcement |
| 8 | The DR-0007 residue (PR-201) in four parts | fleet durability, cross-environment exclusion, harness adapter |
| 9 | Owner action A-2 falls due | owner action, not a workstream |
| 10 | D-19: intake plus plan plus a rollback procedure | this document, plus cutover |
| 11 | The exit test: the pilot's next phase runs through v1, merged and deploy-verified entirely on v1; the old process is retired | cutover |

**The mapping is not one-to-one and clauses 1, 2 and 9 are the ones a naive
six-bucket decomposition loses.** Clause 9 has no workstream at all: it is an
owner action, and section 7 below carries it rather than letting it fall
between buckets.

Clause 8 expands, per delivery/plan/kernel-plan-v1.md:99, into FOUR items:
resume-after-reclamation (what survives, what is rebuilt, how doctor reports a
post-reclaim fleet); cross-environment lease exclusion through the shared fleet
remote; fleet-state sync automation; and the cloud-session executor adapter.
The fourth belongs to the harness adapter workstream and is the one most easily
lost between the two durability workstreams, because the paragraph lists it
alongside three fleet items.

### 1.1 The order, which the plan leaves open and DR-0036 fixes

D-19 names six workstreams and does not order them. DR-0036 orders the first:
the harness adapter leads, delivered as `@tiphys/claude-code-plugin`, and the
kernel becomes a second subject alongside `pulse`
(delivery/decisions/DR-0036-the-harness-adapter-leads-m4-and-the-kernel-is-the-second-subject.md:18).

The remaining five are ordered here, with the reason for each position, as
DR-0036 item 1 requires:

1. **Harness adapter.** Owner-ordered. It is also the only workstream whose
   absence has already cost something measurable: the running pilot dispatched
   its plan writer OUTSIDE the kernel because no agent adapter exists
   (delivery/verification/dr-0034-premise-check.md:102).
2. **Authority enforcement.** Second, NOT because cutover needs it last but
   because the adapter's credential question is inside it. DR-0036's condition
   keeps merge, pull-request and credential authority with the current process
   for every self-hosted phase, so the merge half of this workstream is not on
   the adapter's critical path; the CREDENTIAL half is
   (delivery/decisions/DR-0036-the-harness-adapter-leads-m4-and-the-kernel-is-the-second-subject.md:75).
3. **Pilot bootstrap.** Third for `pulse` and partly concurrent for the kernel
   subject, because the kernel's entry conditions are cheaper (section 9).
4. **Fleet durability.** Fourth. It is gated on owner action A-2 and has a
   fixed written specification to implement against, AGENTS.md:295.
5. **Cross-environment exclusion.** Fifth, and this is a deliberate demotion.
   It is a BUILD from nothing (src/lock.ts:63 disclaims it explicitly) and
   there is no second real environment to witness it against until A-2 and the
   fleet-durability work land. Building distributed semantics before a second
   environment exists is the M1-P3 shape: machinery for a state the milestone
   never enters.
6. **Cutover.** Last by definition. Its freeze point is the moment DR-0036's
   retained-authority condition lifts, and that condition is what keeps every
   earlier workstream reversible.

## 2. How this intake was derived, and what the derivation did NOT cover

Per the fix-round contract's third item, which this document holds itself to:
a search whose scope is wrong returns an empty result indistinguishable from an
absence of defects.

**The derivation.** Ten discovery slices were dispatched concurrently across
five workflows, each returning structured facts with a path-and-line citation,
a stated consequence, and an owning workstream. They returned 267 established
facts, 70 hazards and 56 open questions. The slices were: M4's existing
obligations; the kernel-side adapter seam; the Claude Code plugin surface;
DR-0010; authority enforcement; fleet durability; cutover; the two subjects;
the model-resolution contract; and a hazard register.

**What it did NOT cover, named rather than left to be discovered:**

1. **`pulse` was not re-probed at intake time.** Every statement about `pulse`
   in this document is second-hand, from
   delivery/verification/dr-0034-premise-check.md:32, whose own clones were two
   days stale when it was written. `pulse` runs in a session this orchestrator
   does not own, and delivery/STATE.md:71 instructs it not to touch either
   repository. Everything here about `pulse` is therefore a claim about a
   document, not about the repository. The M4 plan must re-probe before any
   `pulse`-facing phase is written.
2. **No prototype was run.** Fourteen of the fifty-six open questions are marked
   answerable only by a prototype (can a harness primitive impose the kernel's
   child environment; can it distinguish launch-failed from incomplete; how does
   a scrubbed child authenticate). None was probed. Section 6 marks each as
   PROTOTYPE-BLOCKED, and a decision taken on any of them without the probe is
   a guess.
3. **The plugin surface was read from documentation, not exercised.** The
   sixteen facts about Claude Code hooks, plugin manifests and model resolution
   come from `code.claude.com` documentation pages. No plugin was written and no
   hook was fired. Documentation is evidence about an intent, not about a
   build.
4. **The M2 and M3 plans were searched for M4 deferrals with a token grep.** The
   command was `grep -n M4 delivery/plan/kernel-plan-m2.md
   delivery/plan/kernel-plan-m3.md`. Deferrals phrased as "at cutover", "the
   pilot" or "a real consumer" WITHOUT the literal token `M4` are outside what
   that search reaches, and at least one such row exists
   (delivery/requirements/migration-table.md:75 carries "per-project wiring at
   cutover"). Section 5 lists what was found; it is a floor, not a ceiling.
5. **delivery/STATE.md's decision register is twenty records stale and was not
   used as a source.** delivery/STATE.md:1560 is the last register row;
   DR-0017 through DR-0036 are absent from it. The open-decision list in
   section 6 comes from reading all 34 files in `delivery/decisions/` directly.
   Repairing the register is M4 paperwork, listed in section 10.

## 3. The state of the world, measured

Three columns matter and the project keeps conflating them: what SHIPS, what is
DESIGNED AND NOT BUILT, and what is MISSING. A plan that treats the second
column as the first loses a phase to discovery.

### 3.1 What ships and is a fixed input

| Thing | Where | What it means for M4 |
|---|---|---|
| The executor seam, two members | src/spawn.ts:106 | The adapter implements `{name, launch(request)}` and nothing else |
| The launch record contract | src/spawn.ts:112 | Adapter writes `tasks/<id>/executor.json` BEFORE the payload |
| The three-arm outcome | src/spawn.ts:90 | Only `launch-failed` authorizes rollback; `incomplete` never does |
| The turn-end hook, harness-neutral | src/hooks.ts:38 | Adapter runs `node <hookPath> <exitCode>`; it must not reimplement the record |
| The child-environment allowlist | src/exec/env.ts:68 | Exact names only; five credential-store pointers REDIRECTED, not dropped |
| The per-invocation extension point | src/exec/env.ts:154 | `extraAllowlist` exists as data, and is the only auditable widening route |
| Fail-closed env construction | src/exec/env.ts:180 | A staging failure aborts the whole build; the guarantee is construction, not a check |
| The task directory sits outside the worktree | src/task.ts:31 | The plugin may write nothing into the worktree |
| Model INTENT, complete | `role-model-config.yaml` | Six roles bound to a tier plus a family POLICY; names no model, no executor, no harness |
| The absent-record rule, in code | src/gates/release.ts:609 | Adapter exit 0 with no response record is ERROR, never success |
| The generic adapter-response shape | src/gates/schemas/release-record.schema.json:26 | A precedent to instantiate, including the verbatim subject echo as misattribution guard |
| The fleet-resume SPECIFICATION | AGENTS.md:295 | Says of itself that it is a specification and not a mechanism |
| The projects-read-only clause with its carve-out enumerated | AGENTS.md:279 | Merge, tag move, branch delete are ref updates and are the orchestrator's; editing a file is not |

### 3.2 What is DESIGNED AND NOT BUILT

Each of these has a decided record behind it and zero code. A plan citing any
of them as though the mechanism existed is planning on a false premise.

- **DR-0029's ownership split.** The kernel ships no command and no threshold,
  and `gate-registry.yaml` becomes an example under `templates/`
  (delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md:50).
  Measured: `templates/` holds seven files and none is a gate registry;
  `gate-registry.yaml` is still at the repository root and still in
  package.json's `files` array; and the correctness/scope/review class
  vocabulary does not exist (`grep -rn '"correctness"' src/ schemas/` returns
  nothing).
- **DR-0028's framing.** The kernel ships the gate CONTRACT and ZERO project
  gates (delivery/decisions/DR-0028-does-the-kernel-ship-any-project-gates.md:12),
  and says in terms that it decides the framing of M4's intake. The migration
  table's seven project-gate rows at delivery/requirements/migration-table.md:75
  still read the pre-decision way and have not been amended.
- **DR-0029 Part 2c's trust boundary.** Project skills reach workers only,
  fenced as untrusted, never the orchestrator. Probed: `grep -rniE
  'untrusted|project skill|fenced' src/ bin/ schemas/` returns four hits, ALL of
  them about markdown code fences in the citations gate and none about project
  content. Part 3b item 7 excludes untrusted-contributor repositories only
  "until the 2c trust boundary is built and verified", and no milestone owns
  building it.
- **DR-0035's fix-round dial.** The table is decided
  (delivery/decisions/DR-0035-review-is-never-skipped-the-rounds-are-what-tier.md:49)
  and nothing counts fix rounds. The shipped `assurance-modes.yaml` carries
  `max-fix-rounds-after-review: 2` against DR-0035's ceiling of 3, described in
  its own comment as data a brief cites and not an enforcement engine.
- **The fleet-resume story.** AGENTS.md:295 is the specification; there is no
  implementation. `grep -rn 'reclaim|resume|reconcil' src/` returns three
  comments and no code.

### 3.3 What is MISSING, with the probe that established it

- **`@tiphys/claude-code-plugin` does not exist in any form.**
  `git ls-files | grep -ci plugin` returns 0; `grep -n workspaces package.json`
  exits 1. The only occurrence of the name anywhere is a comment recording
  DR-0008's scope reservation, at src/commands/init.ts:16. The leading
  workstream starts from an empty directory.
- **The kernel publishes no library entry point.** package.json:14 has `bin`
  and no `main`, no `exports`, no `types`, and there is no `src/index.ts`. A
  separately-published plugin cannot import `ExecutorAdapter` today.
- **There is no way to select an adapter from outside the process.**
  src/spawn.ts:463 hardcodes `options.adapter ?? subprocessAdapter`. Probed:
  `grep -rn '"--adapter"' src/ bin/` exits 1, and `grep -rn adapter src/cli.ts
  bin/tiphys.ts` exits 1. `SpawnOptions.adapter` is an in-process test seam and
  the only caller that ever passes one is a test. **So the plan's own sentence that a further adapter
  is "not kernel changes" (delivery/plan/kernel-plan-v1.md:211) is true as design
  intent and false as a statement about the shipped package**, and an M4 planner
  who budgets zero kernel work on the strength of it loses a phase.
- **`launch` is synchronous.** src/spawn.ts:108 returns `LaunchOutcome`, not a
  promise, and the call site runs it inside a synchronous step. An agent-based
  adapter that awaits anything cannot be plugged in without changing the
  interface and the call site.
- **Nothing implements a project-write block.**
  `grep -rn 'project-write|projectWrite|PreToolUse' src/ bin/ schemas/ roles/`
  exits 1. The rule exists only as the AGENTS.md:279 prose clause.
- **There is no merge command.** `src/commands/` holds fifteen command modules
  (brief, checklist, doctor, gates, init, lock, mode, plan, pool, spawn, status,
  teardown, tuition, validate, watch) and none of them merges; `grep -rn merge
  src/cli.ts` exits 1. The kernel states in its own source that it never opens
  pull requests. "Designated merge tooling", the entire subject of the D-8
  carve-out at delivery/plan/kernel-plan-v1.md:383, does not exist as an
  artifact.
- **No model-resolution record of any kind exists.** A grep over `src/`,
  `schemas/`, `roles/`, `scripts/`, `templates/` and the three root YAML files
  for `resolved-model|model-resolution|resolvedModel|resolved-tier` exits 1.
- **`executor.json` is validated by no schema.** It is unvalidated JSON, which
  is acceptable for a deadline and unacceptable for a merge precondition.
- **No cross-environment exclusion exists and none is claimed.** src/lock.ts:63
  states the lease excludes within one filesystem and one clock. Two clones of
  one fleet remote each get their own lock file and both acquire. There is also
  no test to inherit: `grep -rln 'cross-environment|two environments|shared
  remote' test/` exits 1.

### 3.4 Four defects found by USE, which no gate here caught

These are INPUT to M4, not candidates to rediscover. Three come from the
running pilot (delivery/verification/dr-0034-premise-check.md:102) and one from
the macOS portability pilot.

1. **`tiphys spawn` ships no agent adapter and scrubs the child environment, so
   a real agent payload cannot authenticate.** The pilot dispatched its plan
   writer outside the kernel as a result. This is the harness adapter
   workstream's first acceptance criterion, already stated by a real consumer.
2. **`tiphys validate --type verdict --context .` cannot pass in a downstream
   fleet**, because it resolves plan, work-history and assurance-mode documents
   at the context root.
3. **`dual-review-decorrelation` hard-requires two distinct `produced-by`
   families with no declared override**, so a single-family environment can
   satisfy it only by recording something false. The pilot's owner overrode it
   by decision record and both reviewers escalated rather than write a false
   family.
4. **The agent could not create the shared git worktree index lock**, so it
   could not commit and the current process had to recover the work
   (delivery/verification/macos-portability-pilot-lifecycle.md:136). The same
   pilot recorded that the sandbox's host READ boundary is broader than
   credential scrubbing alone implies. Both are adapter-hardening criteria,
   already measured.

Defects 2 and 3 are ADOPTION defects, and this repository's own delivery is
poorly placed to surface them: its documents sit where the resolver looks, and
its two most recent clean-room reviews record two different model names
(delivery/review/clean-room-m3-exit-subject-criteria.md:5 and its sibling). I
did not check every review in the directory, so the weaker claim is the one
made: no instance of either defect has been reported here, and the structural
reason why is visible. That is the class DR-0034 deferred and DR-0036
un-deferred by making the kernel a subject.

## 4. The six workstreams

Each names what it owns, what already exists, what it must build, and the
hazards that bind it. The hazard ids are section 8's.

### 4.1 Harness adapter (FIRST, per DR-0036)

**Owns:** clause 3's turn-end half, clause 8's cloud-session adapter, the
model-resolution contract (DR-0036 item 3), and DR-0010.

**The seam is real, typed, small and already documented.** Its entire surface
is three files: src/spawn.ts:106 (the interface), src/hooks.ts:38 (the
generated turn-end hook), src/exec/env.ts:180 (the child environment). The
adapter's obligations are exactly three: write `tasks/<id>/executor.json` at
its `recordPath` BEFORE the payload starts, launch the payload in the task
worktree, and ensure the turn-end file is written by invoking `hookPath` with
the payload's exit code. All state crosses as files and exit codes, never
terminal inspection.

**File ownership across the seam, complete.** The kernel writes `brief.md`,
`meta.json`, `turn-end-hook.mjs` and the `scrub-env/` tree; the ADAPTER writes
`executor.json`; the HOOK writes `turn-end`; a scout payload writes `report.md`.
No other file in `tasks/<id>/` has an owner, and the pilot's ad-hoc
`implementer-final.md` is exactly that gap made visible (M4-D-14).

**What it must build, and most of it is KERNEL work:**

1. **Adapter selection.** A flag, a fleet-config field or a name registry, plus
   a loader, plus a decision about loading third-party code into the kernel
   process. None exists. (M4-D-03)
2. **The synchronous-launch question.** An agent turn is long and `launch` is
   synchronous. Either the adapter blocks for the whole turn, or the signature
   becomes async and the call site changes with it. Constraint C-3
   (delivery/plan/kernel-plan-v1.md:94) forbids the KERNEL auto-backgrounding;
   delivery/plan/kernel-plan-v1.md:311 permits the reading that the HARNESS owns
   the process. Both readings are defensible and they lead to different kernels.
   (M4-D-04)
3. **Fields the request does not carry.** `ExecutorRequest` has exactly seven
   fields (src/spawn.ts:62) and the brief path is not among them, although the
   brief is an agent payload's entire input. Nor is the role, the declared tier,
   or the phase id. (M4-D-05)
4. **A resolution record.** Nothing carries what model actually ran. (M4-D-06)
5. **The plugin itself:** manifest, a `PreToolUse` hook for the write block
   (that half belongs to 4.2), a turn-end hook, and the tier-to-model mapping,
   which must live in the plugin and never in `src/`.

**The zero-vendor-names property is currently TRUE and cheap to keep.** A grep
over `src/`, `bin/`, `schemas/`, `roles/` and the root YAML files for eleven
vendor tokens yields four hits and none is a model name. Any tier-to-model or
model-to-family mapping in `src/` breaks the property that makes a Codex or
Cursor plugin possible at all (H26).

**Hazards: H7, H10, H13, H16, H26, H30, H64, H65, H66, H67, H69, H70.**

**The single most important acceptance criterion, phrased as a command.** A
real `tiphys spawn` invocation (or its M4 successor) that launches an agent
through the plugin and produces `tasks/<id>/turn-end` with BOTH a zero and a
nonzero exit code. A unit test against the interface is not evidence: the
measured defect is precisely that the seam is unreachable from the CLI (H30).

### 4.2 Authority enforcement

**Owns:** clauses 5 and 7, the project-write block, credentials, approval and
merge.

**The policy text is a fixed input, not something to author.** AGENTS.md:279
already enumerates the carve-out (merge, tag move, branch delete are ref
updates and are the orchestrator's; editing a file in the project tree is not).
M3 shipped the STATEMENT; M4 owes the STRUCTURE.

**The write-block hook is not a deny rule, and SC-010 says so in advance.**
delivery/verification/spec-coherence-report.md:126 records the contradiction:
local-only mode has the orchestrator perform a local fast-forward merge, and a
merge writes to the project clone's refs, so "a structural write-block that does
not know the carve-out would break its own pipeline's merge path". D-8 draws
the line at working-tree content versus refs
(delivery/plan/kernel-plan-v1.md:383). The hook therefore needs TWO red
witnesses, because one witness is not a class: an ordinary working-tree write in
a project clone must be REFUSED, and a designated-merge-tooling ref update must
SUCCEED (H57).

**It owes TWO carve-outs, not one.** D-8's release-manager ref-update carve-out,
and an infra-hotfix bypass that the migration table itself flags as undesigned
at delivery/requirements/migration-table.md:17. A block shipped without the
second will be switched off in the first hour and then cannot go red for the
rest of M4 (H12).

**The credential half is the hardest open design problem in M4 and it is on the
adapter's critical path.** Two states exist today and neither is correct for a
real agent on a repository holding financial data:

| State | Behaviour | Reachable from |
|---|---|---|
| Default scrub | Allowlist admits no credential-capable name at all; HOME redirected to an empty harness-owned directory | `tiphys spawn` |
| `allowPrCredentials` | BOTH children inherit the parent environment UNCHANGED, including any pull-request-capable credential | library consumers only |

**`allowPrCredentials` at src/spawn.ts:267 is a total credential-scrub bypass
that no gate observes, and the plugin will be a library consumer.** The
`credential-scrub` gate probes the CONSTRUCTION of the environment, never a real
spawn, so a run that bypassed the scrub is invisible to it. This intake requires
that the plugin may not set it for any project payload, and that every crossing
name goes through `extraAllowlist` with a written per-name reason. (M4-D-07,
H13, H31)

**Four DR-0012 conditions have no automated check.** Condition 1 is checked
minus its head clause; conditions 2 (no unresolved high or MEDIUM finding), 4
(CI green on the exact head), 5 (scope audit passes) and 6 (arbitration
recorded) are asserted by a human. Two specific, currently-reachable fail-opens:

- **A verdict cannot say which head it reviewed.** schemas/verdict.schema.json
  has `additionalProperties: false` and no head field, so the join key is the
  phase and the head binding is an OPERATOR CONVENTION about a directory,
  enforced by nothing. The check's own source says so at
  scripts/check-dual-review.mjs:30.
- **A verdict reading APPROVE beside an unresolved MEDIUM finding validates at
  exit 0 and passes the check.** The schema's escalation rule fires on
  `{high, critical}` only (schemas/verdict.schema.json:95) while DR-0012
  condition 2 bars medium too. That is a one-enum-value fix in a shipped schema.
  (M4-D-08)

And the check itself cannot see a verdict's VALUE: within its whole body there
is not one occurrence of `APPROVE`, `severity` or `findings`. Two decorrelated
verdicts that both REFUSE the merge pass it green (H14).

**Hazards: H2, H12, H13, H14, H15, H17, H31, H57, H59.**

### 4.3 Pilot bootstrap

**Owns:** clauses 1, 4 and 6, for TWO subjects with different entry conditions.

**For `pulse`, this is RECONCILIATION, not bootstrap.** The pilot is already
running, with a charter, a dispatch plan, two of its own decision records, a
delivered M1-P1 with dual review and a live deployment target
(delivery/verification/dr-0034-premise-check.md:32). Planning a from-scratch
charter phase for it would duplicate work another session has done and collide
with it mid-flight (H51). The first `pulse`-facing act is a re-probe, and
whether this orchestrator touches `pulse` at all is an owner question (M4-D-16).

**For the kernel, the charter is a copy-and-amend job.** One authored kernel
charter exists, as exit-test evidence, declaring all seven irreversible
decisions. Two clauses must change: the constraint that the kernel never runs
on itself before M4, which is exactly what DR-0036 overturns, and
release-verification, now that 0.1.0 is published.

**The measured bring-up checklist**, from the only recorded end-to-end fleet
bring-up: `tiphys init` exit 0; `tiphys doctor --for full` exit 1 ON THE FLEET
AS INIT LEAVES IT; then exit 0 only after `gh` was installed, a push target
configured, the charter placed and the project clone realized; then
`tiphys lock acquire` exit 0. **A fresh fleet is not full-ready out of init**
and no plan should assume otherwise. Note also the gap: a fleet with NO charter
at all is not promoted to FAIL on the retention axis, so "doctor green" is not
evidence that a charter exists.

**The gate wiring cannot be done by copying.** Registry commands are
repo-relative paths into the kernel clone (`command: [node,
src/gates/coverage.ts]`) and the runner spawns them with cwd set to the gated
repository, so on `pulse` they do not resolve. Worse, `src/`, `bin/` and
`scripts/` are NOT in the published tarball while `gate-registry.yaml` is, so
every script-verified gate a consumer installs points at an unshipped tree. The
acceptance criterion must be that each declared gate LAUNCHED and asserted a
nonzero unit count on the consumer's own head, read per-gate, not a bundle-level
green (H32, H54).

**A live inconsistency to reconcile in passing:** `assurance-modes.yaml` carries
`max-fix-rounds-after-review: 2` against DR-0035's ceiling of 3. One line, plus
whatever cites it.

**Hazards: H32, H38, H42, H51, H54, H62.**

### 4.4 Fleet durability

**Owns:** clause 8's first and third parts: resume-after-reclamation, and
fleet-state sync automation.

**It implements against a fixed written specification**, AGENTS.md:295, which
says of itself that it is a specification and not a mechanism, and fixes three
obligations: what survives (only what is committed and pushed), what is rebuilt
(worktrees, evidence, build output, leases), and what doctor reports on resume.
Disagreeing with it is a change to a shipped kernel artifact.

**Measured, not inferred, with the probe in each row:**

| Probe | Result |
|---|---|
| Clone a fleet home from its remote, run `tiphys doctor` | `CHECK layout FAIL missing state/, worktrees/, projects/`; `loadFleet` throws `not a fleet home` |
| `tiphys init .` inside that clone | `is already initialized`, exit 1, because the marker test is a `some()` over a set containing `.git` (src/commands/init.ts:84) |
| `mkdir -p state worktrees projects` | `CHECK layout PASS`; doctor then exits 1 only on the Node floor |

So **a fleet home restored from its remote is not a fleet home to this kernel**,
and there is no rehydration path through `init`. The fix is three empty
directories, which makes this workstream small in code and large in
specification: the interesting work is reconciliation of CONTENTS, not
recreation of the layout.

**Four doctor gaps, each with a red witness available today:**

1. An EXPIRED lease reports PASS, with the detail string "lease held by" for a
   lease the lock module itself calls expired. AGENTS.md:295's clause requires
   doctor to report which leases are expired and who last held them.
2. There is no check over `tasks/` (open work), over worktrees or pool records,
   or over unmerged phase branches. The third is an explicit AGENTS.md
   obligation with no implementation anywhere.
3. The remote check (src/commands/doctor.ts:196) asserts only that
   `git remote` returns a non-empty list. Probed: `grep -n fetch
   src/commands/doctor.ts` exits 1, so it does not fetch and does not compare
   local HEAD with the remote. "remote PASS" is therefore not evidence that
   anything was pushed.
4. Nothing in the kernel commits or pushes fleet state after bootstrap. The
   discipline is currently discharged by an agent remembering to do it, which
   this repository has twice recorded as not surviving a busy session.

**The survivable/rebuilt split is asymmetric inside one task**, and
reconciliation has to bridge exactly that: `tasks/<id>/meta.json` is tracked and
survives, while `worktrees/<id>.pool.json` cannot, because it sits beside the
worktree by design so it can never dirty the destroy-time cleanliness check.
Teardown then refuses without a pool record, so the plan's stated fallback of
"manual teardown" does not work post-reclaim: the manual path is itself blocked
(M4-D-12).

**Hazards: H19, H20, H22, H23, H35, H66.**

### 4.5 Cross-environment exclusion

**Owns:** clause 8's second part: distributed lease semantics.

**It is a BUILD from nothing and the kernel says so.** src/lock.ts:63 states
the exclusion domain honestly and disclaims the rest. There is no defect in
`lock.ts` to fix; M4 adds a second layer above it.

**The artifact that would have to travel is the one git is configured never to
carry.** `state/orchestrator.lock` is under the gitignored `state/` prefix
(src/fleet.ts:28), so exclusion "through the shared fleet remote" cannot be
built on the current lease file at all. Either a new tracked artifact, or a
transport outside git. A third shape neither the plan nor DR-0007 considers:
`git push --force-with-lease` over a dedicated ref IS a genuine compare-and-swap
(M4-D-11).

**The one field that could distinguish environments is inert.** `lease.hostname`
is written at acquire and no code compares it to anything. There is no
environment identity and no fencing token.

**Clock skew moves from "not our problem" to "inside scope".** `isExpired`
compares a lease timestamp against the local clock and the beacon's future
tolerance is five seconds. Two environments have two clocks, so any lease or
beacon that travels between them inherits a skew assumption the kernel has
never had to hold. C-2 forbids the obvious escape: no process probing, no
`/proc`, no signal-0 checks, ever (H21).

**There is no red witness to inherit**, and the red-witness rule's stronger form
binds: at least two structurally different double-acquire shapes, demonstrated
red against today's code, BEFORE any mechanism is written (H18).

**Hazards: H18, H21, H34, H58.**

### 4.6 Cutover

**Owns:** clauses 2 and 11, and D-19's second limb.

**The retirement inventory has exactly three roots**, and only one of them is
citable from a linted document: `CLAUDE.md` (the agent-rules single source,
CLAUDE.md:3), the `.claude/skills` tree (four SKILL.md files plus two reference
briefs), and `.claude/orchestrator-next.mjs` (the computed stop condition).
Sizing this as "rewrite CLAUDE.md" understates it by two artifacts, one of
which has no kernel counterpart at all.

**The phase-delivery loop's ten numbered functions ARE the cutover checklist
nobody has written.** Their destinations, measured:

| Loop function | Destination | Status |
|---|---|---|
| 1 worktree from merged main | `tiphys pool create` | PORT |
| 2 brief and dispatch | `tiphys brief compose`, `tiphys spawn` | PORT |
| 3 scope audit | `tiphys gates run --only scope` | PORT |
| 8 teardown | `tiphys teardown` | PORT |
| completion exposure | `tiphys watch` | PORT |
| 5 clean-room review | roles/clean-room-reviewer.md, `checklists/clean-room.yaml` | PORT, verify not weaker |
| 6 fix rounds | roles/implementer.md clause claim-grep | PORT, verify not weaker |
| 4 open the PR | NONE | **GAP** |
| 7 merge | NONE | **GAP** |
| the stop condition | NONE | **GAP** |

Five are ports and the cutover work for them is a NEGATIVE witness that the old
path is unused, not new code. Three are gaps. **The kernel states in its own
source that it never opens pull requests**, and `grep -rniE 'pull request'` over
`src/` and `bin/` returns six comment lines and no call site. Steps 4 and 7 are
the most authority-laden in the loop and silence here strands them (M4-D-09).

**There is no kernel stop condition**, and the binding rule that the
orchestrator does not decide when it is finished has no destination. The script
being retired is itself already partly broken: it hard-codes one session's
scratchpad path as a string constant, defaults to milestone `m3`, and prints a
next action for a phase whose code landed inside another branch, which
delivery/STATE.md:46 calls "a stop condition that cannot go green". **Do not
port its merged-ness predicate**; a replacement needs a notion of
delivered-elsewhere (M4-D-10).

**At least one rule in the retirement set is now FALSE.** `CLAUDE.md` still
says scope declaration grants need their own pull request because the scope gate
reads the declaration from the merge base only; src/gates/scope.ts:110 changed
that in M3-P11. A migration that carries the rules across uncritically encodes a
false constraint into kernel briefs permanently. Every rule is re-verified
against `src/` with a captured command before being carried OR deleted (H45).

**Standing warnings MOVE, they do not die.** The kernel appends
`<fleet>/warnings.md` verbatim to every brief, so cutover must produce a `pulse`
warnings file and a kernel warnings file, and they are not the same file.

**The retirement partition is already decided and must not be reopened.**
"Tiphys owns the PROCESS. The project owns the PREDICATE." So `.claude/` is
process and goes; `scripts/` (check-authored-bytes, check-dual-review,
license-gate, render-agent-rules-gates) are this project's own predicate and are
KEPT; `delivery/` is kept, because it is the audit trail the blueprint calls the
proof that replacing the process worked.

**The freeze point is already written, as a condition rather than a date.**
DR-0036's retained-authority sentence IS the freeze point, and it lifts
exactly once. It decomposes into DR-0025's five retained items, so **write the
freeze as five independently flippable switches, not one event**: planning and
scope; independent review and fix-round arbitration; every GitHub credential and
every push, pull-request, merge and branch-protection action; salvage and
recovery; closeout. Rollback flips them back.

**Rollback, and the split that keeps it honest.** Rollback of the FILES is
cheap and should be said so, because everything under `.claude/` is git-tracked
and revertible from history. Rollback of AUTHORITY is the expensive half:
DR-0036 names the revert cost as "whatever phases ran under it". The
branch-protection ruleset is owner-configured and the orchestrator cannot change
it, so freeze and unfreeze both have owner latency and are not a git revert.
D-19 requires three distinct triggers, not one: **drain reversal**,
**freeze-point restore**, and **retirement criteria unmet**. A procedure
covering only "it broke" does not discharge D-19.

**Drain must be a computed predicate, not a judgment.** Measured in this
repository right now: open pull requests 0, `git worktree list` one entry, and
delivery/STATE.md:44 records nothing in flight. But 132 remote branches are
pushed and unmerged, this container cannot delete a remote ref, and the delete
dry-run exits 0 reporting success either way. **If drain is defined as "no
unmerged branches" then cutover blocks indefinitely on an owner action with no
local pre-check.** Define drain over IN-FLIGHT work (open pull requests, live
worktrees, dispatched agents) and track branch cleanup as a separate owner
action that does not gate cutover (M4-D-15, H49).

**And drain is per subject.** One subject runs in a session this orchestrator
cannot observe, so `pulse`'s freeze point must be negotiated with the session
that owns it, not declared here (H50).

**Hazards: H36, H43, H44, H45, H46, H49, H50, H60, H63.**

## 5. Obligations M4 carries that the v1 paragraph does NOT name

The decomposition in section 1 covers the paragraph. These were recorded
elsewhere and are exactly the class that gets dropped, because a planner
decomposing one line has no reason to look for them. Derivation and its limits
are in section 2, item 4.

| # | Obligation | Recorded at | Workstream |
|---|---|---|---|
| 1 | **R-032's ENFORCEMENT half.** M2 built the deploy verifier and the verdict record keyed to the verified sha and documented the consumption contract; it added no dispatch block. M4 must wire spawn to refuse the next dispatch without a green verdict record for the merged sha. Kernel code, touching src/spawn.ts | delivery/plan/kernel-plan-m2.md:601 | cutover |
| 2 | **Release-verification CREDENTIALS binding.** Specified and not built because M2-P7 and M2-P8 ran concurrently. Per-invocation and per-adapter; the allowlist is never replaced by a denylist and never disabled; the extension may never include a pull-request-capable or push-capable credential, which is checkable by running the credential-scrub probe from INSIDE the adapter's child environment rather than by building a second mechanism | delivery/plan/kernel-plan-m2.md:451 | authority enforcement |
| 3 | **The charter-override RESOLVER for R-075.** M3 ships the configuration; the resolver is the M4 harness adapter | `role-model-config.yaml` header | harness adapter |
| 4 | **Status-line DELIVERY.** Transport, schema and emitter shipped in M3; delivery is M4 (D-M3-14) | delivery/plan/kernel-plan-m3.md | harness adapter |
| 5 | **Gate behaviour on a codebase unlike this one is unwitnessed until M4**, and no M2 gate examines a downstream project's suite, "which is where CR-604 actually lived, and that gap closes at M4" | delivery/plan/kernel-plan-m2.md:574 | pilot bootstrap |
| 6 | **Two of three assurance modes execute for the first time.** D-M3-10 makes direct-pr and local-only declarative data with no enforcement engine, "because the kernel never runs them before M4" | delivery/plan/kernel-plan-m3.md | pilot bootstrap |
| 7 | **The charter coherence check**, declined for M3 with the stated reason that the predicate could not be written until a real charter arrived at M4's pilot (D-M3-29). `pulse` deploys to a live target, so the reason has expired | delivery/plan/kernel-plan-m3.md | pilot bootstrap |
| 8 | **DR-0020's three closed vocabularies.** Assurance mode ids (three), stage ids (thirteen), role ids (six), each with extension deferred to "a real pilot consumer". The kernel's own process uses stages that are not among the thirteen (arbitration, delta verification), so the kernel-as-subject IS that consumer | schemas/assurance-modes.schema.json:160 | cutover |
| 9 | **Three unfalsified exit-test stages.** DR-0034 cut the M3 exit test's three falsification controls, leaving its "measures rather than merely passes" claim unsupported for Kind A schema validation, Kind B derived-check invocation, and review-contract distinctness | delivery/decisions/DR-0034-pulse-is-the-pilot-and-the-controls-are-cut.md:59 | cutover |
| 10 | **DR-0014's residue**, bounded and localized: the charter's release-verification field is reserved and not designed, and its real shape is settled by the first real project charter at M4's pilot | schemas/charter.schema.json:110 | pilot bootstrap |
| 11 | **DR-0029 Part 2c**, the untrusted-project-content trust boundary, whose absence is what makes Part 3b item 7 exclude untrusted-contributor repositories. No milestone owns building it | delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md:106 | authority enforcement |

**Item 8 is the one most likely to be missed by any scan**, because DR-0020 is
a DECIDED record. A grep for `status: open` finds DR-0010 and nothing else; a
decided record carrying M4 work is invisible to it.

**The migration table's thirteen M4 rows must be resolved against DR-0028 and
DR-0029 IN this intake's successor plan, row by row, before any gate phase
dispatches.** The seven project-gate rows still assign each an L1 KERNEL
artifact, and DR-0028 says the kernel ships zero project gates. The coverage
and clause-map gates assert the per-milestone bucket counts
(delivery/plan/kernel-plan-v1.md:435), so a disposition rewrite must either keep
the counts or amend them deliberately (H62).

## 6. Open decisions

Numbered `M4-D-nn`, a fresh scheme for this milestone, allocated here and never
renumbered. **The repository already carries two shapes for this and they
disagree**: M2 used `M2-D-nn` and M3 used `D-M3-nn`. This milestone follows M2's
shape, so a reader searching for `D-M4-` will find nothing. That is a choice
between two existing conventions, not a new one, and it is stated so the search
is not wasted. Each carries a recommendation, because under DR-0016 writing the
recommendation first is what reveals whether a question was ever a question.

**Three are genuinely the owner's** (marked OWNER): one needs access no agent
holds, one narrows an owner-reserved condition, one was already named as an
owner decision when it was raised. The rest are the orchestrator's to decide and
record.

**Fourteen questions across these decisions are PROTOTYPE-BLOCKED.** A decision
taken on one of those without running the probe is a guess, and this document
says so rather than letting a recommendation read as a finding.

| id | Question | Disposition |
|---|---|---|
| M4-D-01 | **DR-0010: does the Claude Code adapter implement `ExecutorAdapter` over the harness's native orchestration primitive, over plain subprocess, or hybrid?** | ORCHESTRATOR, PROTOTYPE-BLOCKED. Recommend option 3, the hybrid DR-0010 itself preliminarily recommends: subprocess for ship phases, primitive-backed for read-only fan-out. Option 1 is refuted ON THE RECORD by DR-0010's own six-item list of what the primitive does not provide. **Two probes must run first** and both are one-day experiments: can a primitive-backed adapter impose the kernel-built child environment, and can it distinguish `launch-failed` from `incomplete`? A NO to either removes option 1 for ship phases entirely. **Also: split the record.** Half (b), whether M3 review-stage fan-out targets the primitive, was answered NO and SHIPPED; the deciding record must state both dispositions or the M3 half gets re-litigated (H6) |
| M4-D-02 | **Does `@tiphys/claude-code-plugin` live in this repository as an npm workspace, in its own repository, or only as a CLI driver that never implements `ExecutorAdapter`?** | ORCHESTRATOR. Recommend an npm WORKSPACE in this repository, published as its own package. Reason: the adapter requires kernel changes (section 3.3), and DR-0031 requires a pull request to carry all its own evidence; a separate repository splits the adapter's evidence from the kernel edits it depends on, which is the exact defect measured at `bdec27d`. It also requires adding an `exports` map to `@tiphys/kernel`, which is a public API surface decision and a release |
| M4-D-03 | **Where does adapter SELECTION live?** | ORCHESTRATOR. Recommend `--adapter <specifier>` on `tiphys spawn`, with a fleet-home `package.json` field as the default, resolved by Node module resolution FROM THE FLEET HOME and never from the project clone. The fleet home already pins `@tiphys/kernel` exactly and is owner-controlled, which makes it the right trust boundary for loading adapter code |
| M4-D-04 | **Does `launch` become async?** | ORCHESTRATOR. Recommend YES, in a kernel phase that lands BEFORE any plugin phase. C-3 forbids the kernel AUTO-BACKGROUNDING; awaiting a call is not backgrounding, and delivery/plan/kernel-plan-v1.md:311 already permits the reading that the harness owns the process. This is the largest kernel-side edit the adapter implies and it must be declared, not discovered (H64) |
| M4-D-05 | **Does `ExecutorRequest` gain a brief path, a role, a declared tier and a phase id, and does `ExecutorRecord` gain a resolved model?** | ORCHESTRATOR. Recommend adding all of them in ONE kernel phase up front rather than per discovered need. An agent payload's whole input is its brief and the request does not carry the path; each later addition is a schema-and-test change, and the fix-round contract's dominant measured waste is fixing the instance when the defect is the mechanism |
| M4-D-06 | **The model-resolution contract: what shape, where does the record live, who owns the family vocabulary, and when is it written?** | ORCHESTRATOR, one PROTOTYPE-BLOCKED input. Recommend, in four parts. (a) SHAPE: instantiate src/gates/schemas/release-record.schema.json:26 rather than inventing one, including the verbatim subject echo compared field by field before the outcome is read, which is the misattribution guard. (b) WHEN: at TURN END, not at launch, because a harness that requests one model and is served another under load resolves mid-turn; whether that is real for Claude Code is the prototype. (c) VOCABULARY: the PLUGIN ships the family vocabulary, keeping vendor names out of `src/` as a hard requirement, and the record carries the vocabulary's identity so the kernel refuses to compare records from different vocabularies. (d) LOCATION: adapter-written in the fleet home, with closeout copying the family token into the verdict so the pull request stays self-contained per DR-0031. **An absent record is ERROR, never green and never not-applicable**: copy src/gates/release.ts:609 rather than re-arguing the rule |
| M4-D-07 | **How does a real agent payload authenticate under the credential scrub, and may the plugin set `allowPrCredentials`?** | ORCHESTRATOR, PROTOTYPE-BLOCKED. Recommend: `extraAllowlist` wired through `spawnTask` (it exists as data at src/exec/env.ts:154 and nothing reaches it), with a WRITTEN per-name reason for every crossing name; `allowPrCredentials` FORBIDDEN for any project payload, as a declared constraint. The red witness must be observed FROM INSIDE the agent turn, because the gate probes the constructed environment and a guard that checks only the object is the cannot-go-red shape this repository keeps paying for (H13, H31, H67) |
| M4-D-08 | **Does `schemas/verdict.schema.json` gain a `head` property, and does its escalation rule widen from `{high, critical}` to include `medium`?** | ORCHESTRATOR. Recommend BOTH, in one kernel phase, released as 0.2.0. The migration cost is measurably ZERO: `grep -rln '^kind: verdict' delivery/review/` exits 1, so no document validates under the narrower rule today. Without the first, DR-0012 conditions 1 and 4 stay asserted rather than checked; without the second, APPROVE beside an unresolved medium finding passes at exit 0 |
| M4-D-09 | **Who opens pull requests and merges after cutover?** | ORCHESTRATOR. Recommend NOT the kernel: it states in its own source that it never opens pull requests and that boundary is deliberate. Recommend the capability lands in the PLUGIN, invoked by the orchestrator which holds the credential, and that under DR-0036's condition it stays with the current process for the whole of M4. It is therefore a CUTOVER deliverable, not an adapter one, and it is the freeze point's most authority-laden switch |
| M4-D-10 | **Does M4 build a kernel stop condition, or does retirement accept that the false-stop mechanism is lost?** | ORCHESTRATOR. Recommend BUILD IT. The rule it enforces has three recorded violations behind it and no destination in the kernel. The replacement must DERIVE its working directory rather than hard-coding a scratchpad path, must carry a delivered-elsewhere predicate (the existing one cannot go green for a phase whose code landed in another branch), and must exit nonzero while work remains, because a nonzero exit is a fact that cannot be reported around |
| M4-D-11 | **Does the distributed lease live in the tracked fleet tree, outside git, or on a dedicated git ref?** | ORCHESTRATOR, PROTOTYPE-BLOCKED. Recommend a dedicated ref used as a compare-and-swap register through `git push --force-with-lease`, a shape neither the plan nor DR-0007 considers. It needs no new service, it is a genuine CAS, and its safety does not depend on comparing two machines' wall clocks, which matters because the tolerance today is five seconds and C-2 forbids the obvious escape. The probe is whether the remote honours `--force-with-lease` atomically |
| M4-D-12 | **May reconciliation RECONSTRUCT a pool record from `tasks/<id>/meta.json`?** | ORCHESTRATOR. Recommend reconstruct-for-reporting, never-for-destruction: a reconstructed record may drive doctor output and salvage, and a destructive teardown against one requires an explicit flag, mirroring the existing `--delete-branch-force` pattern. Teardown refuses without a pool record today and says so rather than guessing, so the plan's stated "manual teardown" fallback does not work post-reclaim |
| M4-D-13 | **Does status move to a tracked path, or does AGENTS.md stop calling the pipeline-state file durable?** | ORCHESTRATOR. Recommend SPLITTING them: `current.json` (the document that says where the pipeline stands) moves to a tracked path and becomes durable; the append-only stream stays under `state/` and stays rebuilt, because C-1 forbids reading current state from a log tail and committing a per-event stream is a worse shape than the problem |
| M4-D-14 | **Is there a declared adapter-owned result file?** | ORCHESTRATOR. Recommend YES, `tasks/<id>/result.md`, adapter-owned, optional, never inside the worktree. The gap was filled ad hoc once already by a pilot wrapper writing `implementer-final.md`, which nothing in the kernel writes; each adapter re-inventing it is worse than one declared path |
| M4-D-15 | **What does "the current pipeline drains" mean?** | ORCHESTRATOR. Recommend a COMPUTED predicate over IN-FLIGHT work only: open pull requests, live worktrees, dispatched agents. All three are currently zero for this repository. Branch cleanup becomes a separate owner action that does not gate cutover, because deletion is refused here and the dry run exits 0 either way, so including it makes cutover block on an owner action with no local pre-check |
| M4-D-16 | **Does this orchestrator touch `pulse` or `pulse-fleet` at all, and if so how is single-orchestrator exclusion enforced across two sessions?** | **OWNER.** Not a recommendation question: two orchestrators against one fleet is the exact contention the session lock exists to prevent, and the exclusion that would arbitrate it is the thing M4 is building. delivery/STATE.md:71 records the standing instruction not to touch either repository. Three of M4's six workstreams are about `pulse`, so the partition must be stated before any of them is planned |
| M4-D-17 | **For a project with one model family available, how is DR-0012's dual cross-model review condition satisfied?** | **OWNER.** DR-0012's conditions are owner-reserved and the orchestrator may not narrow them. Measured by use: the check has no exemption arm, and the pilot's only exits were a false `produced-by` value or an out-of-band decision record. Neither is acceptable as designed behaviour. The orchestrator's view, offered rather than decided: a DECLARED and RECORDED single-family arm that the check reports as a distinct status, never as green |
| M4-D-18 | **Are `checklists/**`, `templates/**`, `witness/**` and root `*.yaml` added to the citation roots?** | ORCHESTRATOR. Recommend YES for those four. Recommend NO for `.claude/**`, for a different reason than the section 0 table might suggest: a dotted path is not extracted as a citation token AT ALL, so adding it as a root would change nothing without also changing the token grammar, and the tree is being retired anyway. Four shipped kernel trees currently produce a red citation from the kernel's own documents, which is the same adoption collision biting the kernel itself |
| M4-D-19 | **Does `gate-registry.yaml` move to `templates/` before or after the adapter ships?** | ORCHESTRATOR. Recommend AFTER, and not during cutover. The kernel's whole CI runs off that registry; moving it during the milestone that depends on it changes the gate set guarding the change. DR-0029 records that nobody has measured what the move breaks and names `charter-mode-enum-matches-modes` as a known casualty |
| M4-D-20 | **Which of DR-0020's three closed vocabularies open, and to what?** | ORCHESTRATOR. Recommend opening STAGE ids and ROLE ids to a project-declared extension carrying a recorded reason, and keeping MODE ids closed because they are bound to `assurance-modes.yaml` by a derived check. The kernel's own process has stages outside the thirteen, so the kernel-as-subject is precisely the "real pilot consumer" DR-0020 deferred to |
| M4-D-21 | **Release-verification credentials where a platform offers no read-only scope: accept a write-capable credential in the orchestrator's environment, or declare that project's verification `none` with a reason?** | **OWNER.** Raised at delivery/plan/kernel-plan-m2.md:626 as "the one genuine owner decision this re-grounding surfaced", explicitly due at M4's pilot. `pulse` deploys to a live target, so it is now live, and no decision record exists for it |
| M4-D-22 | **Does the kernel keep its `claude/mN-pM-<slug>` branch convention when Tiphys drives it, or does the branch pattern become project-supplied?** | ORCHESTRATOR. Recommend project-supplied, in pilot bootstrap. The pattern is hardcoded in a SHIPPED schema (src/gates/schemas/phase-declaration.schema.json:18) and the branch name is what derives the phase id, so no adopted project can use its own convention. This is the concrete, measurable form of the collision DR-0034 deferred and DR-0036 un-deferred |
| M4-D-23 | **Is DR-0029 Part 2c (the untrusted-project-content boundary) an M4 deliverable?** | ORCHESTRATOR. Recommend NO for M4, and recommend RESTATING Part 3b item 7's exclusion explicitly in M4's plan rather than letting it go silent. Neither subject has untrusted contributors, and building a prompt-injection boundary with no adversary to witness it against is machinery for a state the milestone never enters |
| M4-D-24 | **Where does the DR-0035 round counter live, and what happens at the cap?** | ORCHESTRATOR. Recommend DERIVING the count from artifacts (review documents in `delivery/review/`, commits on the phase branch) rather than remembering it, in a named file, because a rule that depends on memory has twice been recorded here as not surviving. At the cap the action is DR-0016's fresh implementer plus a third review contract, written as a command. DR-0029 forbids a threshold in the kernel, so the threshold is the project's declaration and the kernel at most ships the contract for expressing one |

## 7. Owner actions

`delivery/STATE.md` is the sole allocator of `A-n` ids. This section REQUESTS
ids rather than picking them, per the identifier-scheme rule, and the register
entries are written when the ids are granted.

| Action | State | Why it is the owner's |
|---|---|---|
| **A-2 (existing), remaining half.** Make `ThomasHendrickx/pulse` and `ThomasHendrickx/pulse-fleet` PRIVATE | **HALF DONE.** A durable fleet remote exists, which is what A-2 asked for in substance. It is PUBLIC and A-2 asked for private, for a personal finance project. No credential was found; the exposure accrues going forward | This session's credentials return `permissions.admin` false. No agent can change it. The register at delivery/STATE.md:1613 still reads as though the whole action were outstanding and is stale in the direction that overstates the work |
| **A-n REQUESTED: a second private fleet remote, for the KERNEL's own fleet home** | NOT STARTED. No kernel fleet home exists anywhere: a probe over `/home/user`, `/home/user/*` and `/root` found none, and this clone is missing seven of the nine layout entries | A-2's text is per-fleet-home, so DR-0036's second subject is a second instance of the same owner action. It gates fleet durability and cross-environment exclusion, both of which need a real remote to test against |
| **A-n REQUESTED: branch protection and merge configuration** on the kernel repository, `pulse` and `pulse-fleet` (R-064 required checks, R-065a squash-only) | NOT STARTED. Both are repository SETTINGS, not code. The register carries no item for branch protection; A-2 covers only the fleet remote | Elevated access the orchestrator does not hold. The M4 exit test's "merged entirely on v1" conjunct presumes these exist |
| **A-3 (existing).** A real scoped implementer token and a real orchestrator token, so `credential-token` can derive its assertion from captured responses | NOT STARTED. The gate reports `not-applicable` naming A-3 when the token is absent, and deliberately reports `error` when it is present, refusing to assert against an invented API response shape | Without it the scoped-token half of credential authority ships unverified, and M4's exit evidence must say so rather than let the bundle read green (H17) |
| **A-4 (existing).** Remote branch deletion | BLOCKED, and there is no non-destructive way to confirm it in advance. 132 remote branches are pushed and unmerged; `git push --dry-run --delete` exits 0 reporting success regardless | Ref deletion is refused with HTTP 403 while ordinary pushes from the same credentials succeed. M4-D-15 recommends keeping this OFF cutover's critical path precisely so it cannot block the milestone |

## 8. Hazard register

Seventy hazards were returned; they collapse to twelve mechanisms. Each is
stated as the MECHANISM, not the instance, per the fix-round contract. The
`Hn` ids are the raw ids, retained so a plan can trace back.

| id | Mechanism | Precedent | Binding mitigation |
|---|---|---|---|
| H-A (H8, H15, H22, H33, H47, H52, H59, H68) | **The kernel is both subject and instrument, so a plugin defect and a kernel defect present identically.** Eight of the seventy hazards are this one mechanism | Named in the record that created it: "self-hosting is that shape by construction", and this repository's dominant recorded failure is a guard that cannot go red | Hold DR-0036's retained-authority condition rather than eroding it, AND make the attribution mechanical: every kernel-subject failure is reproduced against the SUBPROCESS adapter, no plugin, before it is attributed. Without that step every red is ambiguous and the round attacks the wrong half. State, in the plan, how anyone would NOTICE the condition eroding |
| H-B (H7, H13, H14, H18, H25, H29, H30, H44, H54, H57, H67) | **A guard whose condition does not test the property that matters.** Eleven instances, each in a different subsystem | Six recorded variants already: the watchdog testing existence; the watchdog including the orchestrator's own worktrees; the expired watchdog; the ASCII check blind to NUL; the delete dry-run; the stop condition that cannot go green | Every M4 acceptance criterion names the DANGEROUS state it reddens against, and a class needs two structurally different members. Specifically: the write-block needs a refused write AND a permitted ref update; the credential witness is observed from inside the agent turn; the exclusion witness is two clones both acquiring against today's code |
| H-C (H14, H25, H32, H38, H54) | **A green bundle read as a gate-level assertion, on a gate that asserted nothing.** `check-dual-review` has NEVER run non-vacuously: zero verdict documents exist against 199 files in `delivery/review/`, and the registry admits it | T-009 one scope smaller, already documented in the agent rules with a four-fact reading procedure | Quote per-gate units, never a bundle green. For `check-dual-review` additionally quote the verdict COUNT and the verdict VALUES. On a consuming project, enumerate and justify every `not-applicable`, because an all-not-applicable bundle is green and worthless |
| H-D (H12, H31, H16, H44) | **A guard shipped without its carve-out gets switched off rather than fixed**, and then cannot go red for the rest of the milestone | The migration table itself flags the undesigned infra-hotfix bypass; the pilot already dispatched outside the kernel because the scrub had no agent-shaped path | The bypass ships in the SAME phase as the block, as a first-class declared and logged act, with a red witness on each arm. The credential path is settled by a running prototype BEFORE acceptance criteria are written |
| H-E (H19, H36, H60) | **The path that cannot be rehearsed is the one that fails.** Cutover and reclaim recovery both have this shape | Measured: the first real publish of 0.1.0 was refused by the registry after four dry runs all exited 0 | Each rollback step is individually rehearsable, and the steps that are NOT are NAMED with their unrehearsable property stated. At least one reclaim rehearsal happens in a genuinely fresh container against the real remote, with the residual written down rather than closed |
| H-F (H43, H63) | **A milestone-closing condition evaluated as a judgment rather than computed.** "Drain", "retired" and "the phase ran on v1" are all this shape | Three recorded false stops, each a judgment presented as a status report; the fix was a script exiting nonzero while work remains | Drain and the retirement criteria are RUNNABLE, exit nonzero while any criterion is unmet, and are demonstrated red BEFORE the first deletion |
| H-G (H10, H64) | **A design-intent sentence read as a statement about the shipped package.** "A future harness is a new thin adapter, never a kernel change" is true as intent and false today | The repository's recorded dominant failure is a claim about the world that was never executed | The adapter workstream's first phase is a KERNEL phase, declared as such, with src/spawn.ts:463 and package.json:14 cited as probed evidence rather than the plan's sentence |
| H-H (H45, H20, H23, H40, H61) | **Carrying a rule, a register entry or a citation forward without re-verifying it.** Four measured instances: a false `CLAUDE.md` rule, a stale A-2 register entry, a twenty-record-stale decision register, and STATE.md line citations that rot on every append | T-015: a citation into a newest-at-top file rots on every append, and a re-run caught it every time. Rule 3b: fourteen of fifteen rotted citations resolved SILENTLY against the wrong line | Every rule carried or deleted is re-verified against `src/` with a captured command. Prefer stable-order documents over `delivery/STATE.md` for citations; where unavoidable, re-verify immediately before the commit that lands the document |
| H-I (H46, H56) | **A pull request whose contents do not match the unit of value it claims to deliver**, in either direction | Measured at `bdec27d`: `main` asserted review evidence for code it did not contain, and neither the gate nor any review caught it | Deletion and replacement ship in ONE pull request. For a separate plugin package, M4-D-02 decides up front whether its evidence lives in this repository at all |
| H-J (H35, H65, H66, H69, H70) | **An agent-shaped payload breaks assumptions a subprocess never tested**: abandonment with no deadline, mis-classified launch failure destroying a worktree holding work, an agent that cannot write `.git/index`, an adapter writing session state into the worktree | The V-1 data-loss defect is why `launch-failed` and `incomplete` are distinct at all; the macOS pilot measured the index-lock failure and it is why that pilot's verdict is partial | Every M4-era agent spawn carries a deadline, supplied by the plugin rather than trusted to the operator. Both outcome arms get a red witness. "The agent completes one local commit in its own worktree with a clean tree afterwards" is probed BEFORE the first real run. The plugin's file-ownership contract is declared up front |
| H-K (H42, H51, H58) | **Measuring the wrong configuration, or measuring a subject someone else is changing.** Four axes already compose for a suite result: interpreter, build state, invocation, and the interpreter's own path | At `1945d69` the container default reports a failure at a head whose CI is green, so a red on the default toolchain is no longer proof of a red branch | Every M4 suite result is a COMPLETE sentence: interpreter version, build state, invocation, pass count AND skipped count. The base result is established before any failure is attributed to a change. `pulse` has no established base at all, so the first phase touching it records one |
| H-L (H62, H37, H2) | **Working a table that a later decision has already changed.** The migration table's seven gate rows still read pre-DR-0028 | DR-0028 states in terms that it decides the framing of M4's intake, and the table was never amended | Section 5's resolution is done row by row IN the plan before any gate phase dispatches, keeping the asserted bucket counts or amending them deliberately |

## 9. Entry conditions, per subject

DR-0036 item 5 requires these separately, "since they are not the same". They
are not, and the asymmetry runs the opposite way to the intuition: the kernel is
the CHEAPER subject to start and the HARDER one to trust.

### 9.1 `pulse`

1. **A-2's remaining half is done**: both repositories private, before any fleet
   state is pushed. This is the one entry condition with a deadline attached,
   because a fleet repository accumulates work histories and review evidence
   about a personal-finance application and flipping visibility later does not
   unpublish what was already fetched.
2. **M4-D-16 is answered**: which session owns `pulse`, and how exclusion is
   enforced across two of them.
3. **The pilot is RE-PROBED** and its current state written into the plan.
   Everything this intake says about `pulse` is a claim about a document.
4. **M4-D-17 is answered**, or `pulse` cannot record a truthful review under the
   shipped kernel.
5. **A base suite result is recorded**, since `pulse` has none.
6. Charter validated, and shown inside DR-0029 Part 3a and outside Part 3b, with
   any Part 3c degraded property declared in the mode rather than discovered.

### 9.2 The kernel

1. **A fleet home exists for it**, with its own private remote (the requested
   `A-n`). `tiphys init` refuses a non-empty directory that is not already a
   fleet home, so this is a SEPARATE fleet home with the kernel clone realized
   under its `projects/`, per D-5. Not a conversion of this checkout.
2. **The charter is copied from the exit-test evidence and amended in two
   places**: the constraint that the kernel never runs on itself before M4,
   which DR-0036 overturns, and release-verification, now that 0.1.0 is
   published.
3. **`tiphys doctor --for full` exits 0 with zero FAIL lines**, which needs `gh`
   on PATH, a configured remote, a charter declaring retention, and complete
   kernel artifacts. It will NOT be green straight out of `init`.
4. **M4-D-22 is answered** (the branch pattern), because the kernel's own
   convention is what the scope gate derives a phase id from, and the adoption
   question is whether that convention is the kernel's or the project's.
5. **The work queue includes at least one SOURCE subject**, not only prose.
   delivery/plan/pstack-borrow-review.md:222 supplies eight items with named
   failures, verify commands and DR-0035 round budgets, and FIVE of them are
   text edits. Eight green text edits would prove nothing about the adapter's
   hard paths, which is H39: the entry condition must state, per subject, WHICH
   of the plugin's paths that subject exercises, so a count becomes a sentence
   about coverage.
6. **DR-0036's retained-authority condition is quoted into every phase
   declaration**, not assumed as background.

### 9.3 What self-hosting makes invisible, stated because it cannot be fixed

The M3 exit test recorded its own residual and it is exactly this blind spot:
the bound is only over interventions somebody NOTICED, and an intervention that
filled a gap without either party noticing is not in the record, so no check
over the record can see it
(delivery/evidence/m3-exit-test/supervision-rules.md:71).

Nothing found in this intake closes it with a better ledger, and the only
mechanism anyone has proposed for it is an observer outside the loop, which is
why DR-0036's condition keeps merge authority with the current process. I did
not find a way to detect an unnoticed intervention from inside the record; that
is a statement about this search, and the next reader is invited to try. The plan's mitigation is DR-0025's four-column ledger per
phase, written INCREMENTALLY: what Tiphys did, what the wrapper did, what the
current process did, and where authority crossed. DR-0025 states its own failure
condition in the same terms: the pilot fails if its final report rounds the gaps
up into a claim of self-hosting.

## 10. What this intake does NOT settle, and hands to the plan

1. **Phase decomposition.** No phase ids, no branch names, no files-to-touch
   lists, no acceptance criteria. That is the plan's job and D-19 requires it
   separately.
2. **A conflict pre-pass.** Parallelism is on where a recorded pre-pass proves
   the phases disjoint. None is written for M4.
3. **The migration table's thirteen M4 rows, resolved row by row against
   DR-0028 and DR-0029.** Section 5 states the obligation and does not perform
   it, because changing a row's disposition moves counts that two gates assert.
4. **A plan revision amending delivery/plan/kernel-plan-v1.md:38 and
   delivery/plan/kernel-plan-v1.md:368 in place.** DR-0036 moves self-hosting
   from M4 exit to M4 execution, and the plan still reads the old way. A
   cross-reference is not enough: the plan outranks agent rules in the
   precedence order, so a stale plan sentence beats a fresh decision record in a
   careless read (H41).
5. **Repairing `delivery/STATE.md`'s decision register**, twenty records stale.
6. **The fourteen prototype probes.** They are named in section 6 and none has
   been run.
7. **`pulse`'s actual current state.** Section 2 item 1.

## Appendix A: the derivation, reproducible

Facts established: 267. Hazards: 70, collapsing to 12 mechanisms. Open
questions returned: 56, collapsing to 24 decisions. Slices: 10, run as 5
concurrent workflows of 2 agents each, because the workflow concurrency cap is
per workflow and this container reports 4 CPUs.

Every fact carries a path-and-line citation and a stated consequence. The raw
slice output is not committed: it is agent output, and this document is the
artifact. What IS committed is every claim it supports, with the citation that
settles it, which is the durability rule's requirement.

The claim grep was run against this document in both forms, line-based and
wrap-insensitive, per the agent rules. Its hits are the quoted statements of
absence, each carrying the probe command that established it, and the two
universals in section 3.3 ("nothing implements", "there is no merge command"),
both of which name the grep that returned nothing.

## Appendix B: what this document is uncertain about

Stated so a reader can weigh it rather than having to discover it.

1. **The Claude Code plugin surface is documentation-derived.** Sixteen facts
   about hooks, manifests and model resolution come from published
   documentation. One of them is load-bearing and uncomfortable: **no plugin
   hook can read the resolved model after the fact.** If that is right, the
   model-resolution contract's "the adapter reports what it actually resolved"
   cannot be satisfied by observation, and the record's `resolved` block is a
   self-report by the agent or an inference from the resolution ORDER. M4-D-06
   is written to survive either answer, by having the adapter report the
   override CONDITION (observable from the environment) separately from the
   resolved IDENTITY (self-reported), but this needs the prototype.
2. **`Stop` and `PostToolUse` hooks receive static JSON and cannot return an
   exit code**; only `PreToolUse` blocks, with exit code 2. So the turn-end
   contract must be executor-writes-file, hook-reads-file, which is what the
   kernel already does. This is convergent and cheap, and it is stated here
   because a design that assumed the hook could carry the exit code would have
   been discovered wrong in the phase.
3. **The 132-branch figure and the zero-open-pull-requests figure** were
   measured through the GitHub API from this container. REST reachability here
   has been measured BOTH ways on different days and the cause of the difference
   is not established. Re-probe before relying on either number.
