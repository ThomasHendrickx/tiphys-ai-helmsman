# DR-0010: Harness-native orchestration primitive as an executor implementation

- id: DR-0010
- project: tiphys-kernel
- task: stage-2-execution (raised during M1-P3 verification)
- question: The build harness now offers a native multi-agent orchestration primitive (deterministic script control flow spawning disposable agents, with structured outputs and parallel fan-out). The blueprint was written before this existed. Should the Claude Code harness adapter (M4) implement the kernel's ExecutorAdapter on top of that primitive, and should any judgment-layer fan-out (M3 review stages) target it?
- reversibility: reversible (it is an adapter implementation choice behind an interface the kernel already owns), but it shapes how thin the harness adapter really is and how much orchestration the kernel needs to own itself
- status: **DECIDED BY THE ORCHESTRATOR, 2026-09-15, under DR-0016.** Reported
  to the owner rather than asked, because a measured probe refuted one option
  outright and the record's own preliminary recommendation survived.
- decided: **OPTION 3, the hybrid.** Plain subprocess execution for ship phases.
  The harness primitive is available for READ-ONLY judgment fan-out, where no
  credential-scrub claim is made. Option 1 is REFUTED BY MEASUREMENT for ship
  phases.
- date: 2026-08-04 (raised), 2026-09-15 (decided)
- half (b), the M3 question, was answered NO and SHIPPED before this decision;
  see the split below, so it is not re-litigated

## Why this was raised

During the M1-P3 fix-round verification, the orchestrator ran a five-lens adversarial verification with per-finding refutation using the harness's own workflow primitive. The owner observed that this looks structurally like what Tiphys is being built to do, and asked whether the system was already running on itself.

It was not, and it must not be before M4 (settled owner decision). But the observation is architecturally real: a harness-native primitive now provides deterministic control flow over disposable agents, which is one of the shapes the kernel formalizes.

## What the primitive does and does not provide

Provides: deterministic control flow (loops, conditionals, fan-out) over disposable agents; structured outputs validated at the tool boundary; parallel execution with a concurrency cap; a per-run journal and same-session resume.

Does not provide, and these are precisely the kernel's reasons to exist:
- Durable fleet state. The run's truth lives in session context and a run journal, not in files, worktrees, and git. A container reclaim loses it. Blueprint principle 4 requires the opposite.
- Deterministic verification. Its checks are LLM lenses; the kernel's gate layer is scripts with exit codes (placement rule, blueprint section 1). LLM verification of LLM work is exactly what the kernel refuses to rely on where computation is possible.
- Exclusion and isolation. No session lock, no per-task worktree, no credential scoping, no teardown guard.
- Owner interface. No charter, no decision records, no escalation contract.
- Structural coverage. No orphan-finding checker, no citation linter, no scope auditor; the no-orphans discipline in this run was enforced by hand.
- Portability. It is one harness's capability. The kernel is distributed by npm and pinned per fleet, and must survive a harness change (blueprint section 3).

## Options for M4

1. Implement the harness adapter's ExecutorAdapter on top of the primitive: the kernel dispatches a phase, the adapter runs it as a workflow step. Keeps the kernel's contracts and state, borrows the harness's execution machinery.
2. Keep the adapter on plain subprocess or window execution (the M1 local implementation), and treat the primitive as unrelated tooling.
3. Hybrid: subprocess execution for ship phases (which need worktree isolation and durable evidence), primitive-backed execution for read-only fan-out shapes such as multi-lens review, where isolation matters less and parallel judgment is the whole point.

## Preliminary recommendation (not a decision)

Option 3, decided properly at M4 with evidence. The M1-P3 verification is a data point that primitive-backed fan-out is strong for read-only judgment work, and equally a data point that it carries none of the durability the ship path requires: the same session had an implementer die mid-fix-round holding uncommitted work (tuition T-002), which the kernel's own salvage and teardown contracts exist to handle and the primitive does not address.

## Cost observation worth carrying into assurance-tier policy

That verification cost roughly 700k tokens and an hour of wall time for one fix round on one phase. This is a concrete instance of why assurance is tiered and declared per project rather than improvised (blueprint section 8). The kernel should make that spend an explicit mode choice, not something an orchestrator can decide to do quietly on a routine phase.

## Evidence

- Blueprint distribution and adapter decision: delivery/intake/orchestrated-delivery-v1.md section 3.
- Placement rule (computable work is a script, not an LLM): delivery/intake/orchestrated-delivery-v1.md section 1.
- Durability principle: delivery/intake/orchestrated-delivery-v1.md section 0, principle 4.
- Assurance tiers: delivery/intake/orchestrated-delivery-v1.md section 8.
- ExecutorAdapter contract and the M1/M4 obligation split: delivery/plan/kernel-plan-v1.md, M1-P4 section and section 3.
- Agent death and salvage in this same session: delivery/tuition/T-002-agent-death-mid-fix-round.md.


## THE DECISION, 2026-09-15

DR-0036 put the harness adapter first in M4 and named this record as due
(delivery/decisions/DR-0036-the-harness-adapter-leads-m4-and-the-kernel-is-the-second-subject.md:105).
M4's intake recorded the question as prototype-blocked on two probes. Both were
run. This section records the answer and the evidence.

### The question splits, and only one half was ever live

**Half (b), whether M3 review-stage fan-out should target the primitive, was
answered NO and SHIPPED.** `role-model-config.yaml` names no harness, no
executor and no model, and says so in its own header. This decision does not
reopen it. The record's question text still contains both halves, which is why
the split is stated here rather than left to a reader.

**Half (a), whether the M4 executor adapter implements `ExecutorAdapter` on the
primitive, is what is decided.**

### Option 1 is refuted by measurement, not by argument

The probe ran the harness's own agent-launch path in this container, with a
unique sentinel exported by the parent, and compared it to the kernel's
`subprocessAdapter` as a control. Four arms:

| arm | result |
|---|---|
| no settings | sentinel VISIBLE, `GH_TOKEN` visible, 174 variables |
| settings `env` key set to empty | sentinel name still PRESENT, value blanked. JSON cannot express "undefined" |
| sandbox deny, dependencies missing | **"Sandbox disabled ... Commands will run WITHOUT sandboxing", exit 0.** Sentinel and token fully visible |
| sandbox deny, dependencies installed | sentinel ABSENT, token ABSENT, **193 variables** |

**The control:** `buildChildEnv` plus `subprocessAdapter.launch` gives SEVEN
variables, built from `{}`, with the sentinel and the token absent and the
adapter reporting `{"kind":"completed","exitCode":0}`.

Seven built from nothing, against 193 built by subtraction. That is the
refutation, and it has three parts:

1. **It is a DENYLIST wearing an allowlist's name.** 174 in, 193 out: two names
   removed and twenty-one added by the sandbox layer. src/exec/env.ts:18 records
   why this shape was rejected once already, in finding M2R-004.
2. **It fails OPEN.** With the sandbox dependencies missing, the harness prints
   that it is running without sandboxing and exits 0. A guard that cannot go
   red, in the one place the kernel's whole credential guarantee lives.
3. **One name survives an explicit deny and carries a live credential.** Denying
   all 172 launcher names left 35; additionally denying all 21 sandbox-injected
   names left 32. `GIT_SSH_COMMAND` is among the survivors and carries a proxy
   auth token. It is on the kernel's own dangerous-variable vocabulary at
   src/gates/credentials.ts:155, **so a primitive-backed ship adapter would
   redden the kernel's own `credential-scrub` gate on every run, with no name
   left to deny.**

### What the probe did NOT establish, stated because it changes how far this generalises

- The in-process subagent tool's input schema could not be read: the probe ran
  at subagent depth and that tool is not served there. The claim that it exposes
  no per-launch environment parameter is an INFERENCE from the agent-definition
  fields and the child-env builder, not a captured schema.
- Every positive result came from a WEAKENED sandbox. The default profile failed
  to start in this container and only the weaker nested form ran. Whether a
  full-strength sandbox injects the same twenty-one variables is unknown.
- The measurement is this container, this harness build. Re-probe before relying
  on it elsewhere.
- The probe INSTALLED two packages to make the sandbox arm runnable, so a later
  agent asking "is the sandbox available here" gets a different answer because
  of this probe. Disclosed rather than left to be discovered.

### Why this is the orchestrator's decision and not the owner's

DR-0016 escalates only when two or more options are genuinely comparable. Option
1 is refuted on the record by this record's own six-item list of what the
primitive does not provide, and now by measurement. Option 2 versus option 3 is
not a tie either: option 3 is this record's own preliminary recommendation, it
costs nothing to adopt, and nothing in the probe weakens it. Read-only judgment
fan-out makes no credential-scrub claim, so the refutation above does not reach
it.

### What M4 must carry from this

1. The adapter is a SUBPROCESS adapter. It hands `request.env` to every child
   and never widens it.
2. **The fail-open is a finding in its own right**, independent of which option
   wins. Any future use of the harness sandbox for isolation must test that the
   sandbox actually started, because it reports success when it did not.
3. A red witness for the adapter must observe the child's environment FROM
   INSIDE the child. The construction probe cannot tell a scrubbed run from an
   unscrubbed one.
