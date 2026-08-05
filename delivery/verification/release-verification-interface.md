# Release verification: interface design investigation

- Date: 2026-08-05
- Subject: the interface DR-0014 decided in principle but deliberately left
  unshaped (`delivery/decisions/DR-0014-release-verification-interface.md`,
  its "what follows from it, and what does not" section),
  and its consequences for M2-P7 and for the M3 charter schema.
- Requested by: the orchestrator, on the owner's reframing recorded in
  DR-0014's decision section.
- Method: read the governing documents and the delivered M1 code; then
  captured real responses from three live platforms through authenticated
  read-only connectors, so that the shape claims in this report are
  observations rather than recollections. Every platform claim below carries
  one of three labels: **CAPTURED** (observed today, appendix A holds the
  record), **READ** (read from a file in this repository, cited by line), or
  **GENERAL, UNVERIFIED HERE** (reasoning from background knowledge with no
  check available from this environment).
- Constraint observed: read-only. No file in this repository was modified
  other than the creation of this one. No plan, no decision record, and no
  source file was touched. No write call was made against any platform.
- Scope limit stated up front: this is a design report. It recommends; it
  does not decide. Section 8 is the part that says what must not be decided
  yet, and it is as much of the deliverable as section 2.

---

## 0. Answers, in one place

1. **One concept, two instances.** Deploy verification and migration
   verification are two instances of one pluggable post-merge verification
   contract, not two gates with two contracts. Argument in section 1. This
   changes M2-P7's centre of gravity, as DR-0014 anticipated, but it does not
   reduce the gate table's two entries to one; contract singular, registry
   entries plural.
2. **The interface is locate-then-observe, kernel-clocked, subprocess-bounded,
   with five outcomes and a subject the kernel owns.** Section 2. The most
   consequential single finding: the M2 plan's configuration shape
   (`{endpoint, statusPath, readyValue, failureValues}`,
   `delivery/plan/kernel-plan-m2.md:357`) cannot express two things that real
   platforms do, and one of them is precisely the incident this gate exists
   to prevent.
3. **Mobile store submission does not belong in this interface.** The
   bounded, machine-checkable half (the build reached the store as an
   artifact) does; the third-party review outcome is a different concept
   wearing the same word, and the interface should say so. Section 3.
4. **Not-applicable must be a positive declaration with a reason, read from
   the merge base, and separated from both misconfiguration and unmet
   precondition into three distinct statuses.** Section 4.
5. **Adapters are executables the kernel spawns, never modules the kernel
   loads**, and the kernel's own reference adapters use exactly the same
   boundary so no privileged path exists. Section 5.
6. **Credentials reach an adapter as a per-verification, named-variable
   extension of the M2-P8 allowlist, never as a relaxation of it**, and the
   read-only-token question is a genuine owner decision, not a design detail.
   Section 6.
7. **Ship the contract, the loop, the subprocess boundary, a
   migrations-command adapter and an http-json adapter with fixtures derived
   from the captures in appendix A. Do not ship a Hetzner adapter, a store
   adapter, or a Vercel failure vocabulary that nobody has observed.**
   Section 7.
8. **Nine things must not be decided yet**, each with the evidence that would
   settle it. Section 8.

Section 9 records three observations for the orchestrator that are not design
questions but would cost a phase if they went unnoticed, including a decision
record number collision that currently makes M3-P1's `blocked-by` resolve to
the wrong document.

---

## 1. One concept or two

### 1.1 The requirement, not the table

The requirement is one sentence, and it is one sentence about two things:

> After every merge: verify migrations actually applied to production AND the
> production deploy reached READY, before the next phase starts. Never assume
> the platform did its job, one run discovered deploys silently not spawning,
> and another discovered migrations being skipped by a flake while the code
> deployed anyway.
> (`delivery/intake/orchestrated-delivery-process.md:165-168`, paraphrased to
> remove the non-ASCII dash; the original is at those lines.)

Read the two incidents as failure modes rather than as domains. Both are the
same failure:

- The pipeline believed a post-merge side effect had happened.
- Nothing outside the pipeline was asked.
- The belief was false, and the next phase started on top of it.

That is one defect class with two instances. The question a gate must answer
is identical in both: **is the state the merge was supposed to produce
actually present in the world outside the repository?** For a deploy the
state is "the code is running"; for migrations it is "the schema is applied".
Everything that is contract-level is shared:

| Contract dimension | Deploy | Migrations |
|---|---|---|
| When it runs | after merge, before next dispatch | after merge, before next dispatch |
| What it is about | the merged commit | the merged commit |
| What it gates | the next dispatch (R-032, `delivery/requirements/migration-table.md:64`) | the next dispatch |
| Outcome vocabulary needed | satisfied, failed, pending, absent, not-applicable, error | the same |
| Can be absent for a project | yes (local-only project) | yes (no database) |
| Must fail closed | yes (M2-C-3, `delivery/plan/kernel-plan-m2.md:55`) | yes |
| Needs an independent authority | yes, that is the whole point | yes |
| Can be fooled by trusting the deploying process | yes | yes |

The blueprint's toolbelt table lists them as two rows
(`delivery/intake/orchestrated-delivery-v1.md:82-83`), and the M2 plan builds
them in one phase with two modules
(`delivery/plan/kernel-plan-m2.md:357-358`). Neither of those is an argument.
A table lists components; it does not assert that they have different
contracts.

### 1.2 The strongest argument for two, and why it fails

The honest case for two contracts is structural, not cosmetic:

> A migration check is a set comparison. It has an answer the instant it is
> asked: compare the repository inventory with the applied inventory, and the
> difference is the verdict. A deploy check is a wait: it observes an external
> state machine that has not finished, so it needs a poll loop, an interval, a
> deadline, and a timeout verdict. One is decidable, the other is a race
> against a clock. Putting them behind one interface forces the decidable one
> to carry machinery it does not need.

This is the argument to beat, and it does not survive two observations.

First, the asymmetry is not real in the direction claimed. A migration check
is not always immediately decidable. In the exact incident the requirement
names, migrations were "skipped by a flake while the code deployed anyway":
the migration job is a job, and a job can be queued, running, or never
started. Asking the applied inventory one millisecond after merge and
reporting `failed` because the job has not run yet would produce a red on
every merge. A migration verifier that is honest about the incident it guards
needs exactly the same pending-with-a-deadline semantics as a deploy
verifier.

Second, the machinery cost is zero for the degenerate case. If the contract
is "the kernel calls the adapter, the adapter returns an outcome, and the
kernel loops until terminal or deadline", then an adapter that always returns
a terminal outcome on the first attempt is loop-free in practice: one call,
one record, done. The loop costs the migration adapter nothing and buys it
the pending case it turns out to need.

### 1.3 The answer, and what it changes

**One contract. Two instances. Two registry entries.**

- One contract, because everything in the table in 1.1 is shared and the only
  differences (HTTP versus a local command, seconds versus minutes, whether
  the platform assigns an identifier) are inside the adapter. This is the
  same shape as `ExecutorAdapter` (`src/spawn.ts:84-98`), where a subprocess,
  a multiplexer window and a cloud session differ in transport and not in
  contract.
- Two registry entries, because a project must be able to declare one and not
  the other, and the evidence bundle must show two lines rather than one
  aggregate that hides which half was skipped. Collapsing to a single gate id
  would make "migrations were not checked" invisible inside a green
  `release-verify` record, which is the M2-C-2 vacuous-green hazard wearing a
  new hat.

Concretely for M2-P7, the cheapest correct shape:

- One module implementing the contract, the loop, the record and the
  subprocess boundary.
- `src/gates/deploy.ts` and `src/gates/migrations.ts` become thin entry points
  that name a declared verification and call that module, so the manifest
  keeps its two static entries exactly as `delivery/plan/kernel-plan-m2.md:71-72`
  declares them, and no gate-runner or exit-test arithmetic changes.
- The generalization to N charter-declared verifications is M3's, where the
  registry is already per-mode and charter-aware
  (`delivery/plan/kernel-plan-m3.md:664-680`). M2 should not build it; see
  section 8 item 4.

One further consequence that the M2 planner needs and that follows from the
requirement rather than from this report's preferences: **release
verification is not a pull-request gate.** It runs after merge, against a
commit that exists only once the merge has happened. Its appearance in the
PR bundle can therefore only ever be `not-applicable`, on every repository,
forever, not merely on this one. The M2 gate table already predicts
`not-applicable` in both bundle columns
(`delivery/plan/kernel-plan-m2.md:71-72`); what should be written down is that
this is structural. The real call site is the orchestrator's post-merge step
with the merged sha as an argument, which is what M2-D-11 defers to M4
(`delivery/plan/kernel-plan-m2.md:485`). Keeping the entries in the manifest
for uniform reporting is right; letting a reader think the PR bundle
exercises them is not.

---

## 2. The interface

### 2.1 Worked outward from the five cases

The owner named four cases and the requirement adds a fifth. Working outward
means asking what each genuinely needs, and refusing to let the easiest one
(a single HTTP GET returning a status string) set the contract.

| Case | How the release is identified | Where the truth lives | Terminal states reachable | Latency |
|---|---|---|---|---|
| Vercel | platform-assigned deployment id, discoverable from the commit sha plus the target (**CAPTURED**, appendix A.1) | platform API | success observed; failure vocabulary not observed | seconds to minutes (**CAPTURED**: 318 seconds from `buildingAt` to `ready` on one production deployment) |
| Self-hosted (Hetzner class) | there is no platform release object; the running service is the only witness (**GENERAL, UNVERIFIED HERE**) | the service itself, or the CI job that pushed it | reachable only if the service reports its version | seconds to minutes |
| Local-only | no release object exists at all | nowhere | none | not applicable |
| Mobile store | submission id plus version and build number (**GENERAL, UNVERIFIED HERE**) | store connect API | processing states are bounded; the review outcome is not | hours to days for review (**GENERAL, UNVERIFIED HERE**) |
| Migrations | the migration id set | the target database, or an inventory command | immediately decidable once the job has run | seconds, after an unbounded wait for the job |

Two structural demands fall straight out of this table, and neither is
expressible in the M2 plan's current configuration shape.

**Demand 1: absence is a first-class observation, and it needs a locate step.**

The incident is "deploys silently not spawning". In that state there is no
deployment to poll. A configuration of the form
`{endpoint, statusPath, readyValue}` (`delivery/plan/kernel-plan-m2.md:357`)
presumes a known endpoint for a known release object; whoever wrote the
endpoint had to already know the deployment existed. A poller built that way
cannot detect the exact failure it is named after. The contract must instead
be two steps:

1. `locate(subject)` returns a release handle or the distinguished value
   `absent`.
2. `observe(handle)` returns a terminal outcome or `pending`.

`absent` is not `pending` and is not `error`. It is a legitimate early
observation (the platform has not created the object yet) that becomes
`failed` at the deadline with the reason `no release object for subject`.
That single distinction is what makes the gate able to catch incident one.

**Demand 2: terminality and verdict are not one field, and the verdict field
may be absent while pending.**

**CAPTURED** (appendix A.2): GitHub Actions workflow runs on this very
repository carry `"status"` and `"conclusion"` as separate fields. Completed
runs carry both (`"status":"completed","conclusion":"success"` and
`"status":"completed","conclusion":"cancelled"` both observed). The one
in-progress run in the capture carries `"status":"in_progress"` and **no
`conclusion` key at all**.

Consequence, stated plainly because it is an acceptance criterion that would
have shipped wrong: M2-P7 acceptance criterion 3
(`delivery/plan/kernel-plan-m2.md:366`) says a response whose body lacks the
configured status pointer is `error`. Against a real GitHub Actions run that
is still in flight, a pointer at `conclusion` is absent, and that criterion
would classify a perfectly healthy in-progress deploy as `error`. Fail-closed
is right; classifying "not finished yet" as "cannot reach a verdict" is not.

The fix is not a second pointer. It is to move extraction out of the
interface entirely. **An adapter returns an outcome; it does not return a
path.** JSON-pointer extraction is a feature of one generic adapter
(`http-json`), configured per project, and the kernel never learns what a
`statusPath` is. This is the single largest change this report asks of
M2-P7's design, and it is the change that makes third-party adapters possible
at all: a Play Console adapter has no JSON pointer to offer.

### 2.2 The outcome vocabulary

Six values, of which five are outcomes an adapter may report and one is
reserved to the kernel.

| Value | Meaning | Who may report it |
|---|---|---|
| `satisfied` | the release is present and complete for this subject | adapter |
| `failed` | the platform reached a terminal state that is not success | adapter |
| `pending` | an object exists for this subject and has not reached a terminal state | adapter |
| `absent` | no object exists for this subject yet | adapter |
| `not-applicable` | a precondition was evaluated and found unmet, or the project declared none | adapter (precondition), kernel (declaration) |
| `error` | no verdict could be reached: unreachable, unauthenticated, unparseable, contract violation | adapter and kernel |

Mapping to the M2 `GateResult` statuses (`delivery/plan/kernel-plan-m2.md:150`)
is the kernel's job and must be total and written down, because a mapping
invented per adapter is how a project ends up with a green that means
something else:

- `satisfied` maps to `green` with `units` 1 per verification satisfied.
- `failed` maps to `red`.
- `not-applicable` maps to `not-applicable`.
- `error` maps to `error`.
- `pending` and `absent` are **never terminal**. They are loop states. At the
  deadline the kernel converts both to `red`, with distinct reasons
  (`deadline reached, last observed <value>` and `deadline reached, no release
  object for subject`). An adapter cannot return a status the kernel reports
  as green without an observation, and it cannot make pending mean pass.

Note what is deliberately not in this list: there is no `unknown`, no
`skipped`, and no `warn`. The M1 record shows why (`delivery/plan/kernel-plan-m2.md:55`,
M2-C-3): a soft state is where a false green hides.

### 2.3 Identity: what is being verified, and who owns the mapping

**The kernel owns the subject. The adapter owns the mapping. The adapter must
echo the subject back.**

The subject is what the kernel knows for certain the moment a merge happens:

```
subject = {
  repository,          # owner/name or a project-declared identifier
  integrationRef,      # the branch merged into, normally "main"
  mergedSha,           # the sha on integrationRef after the merge
  mergedAt,            # ISO-8601 instant, from the merge, not from the poll
  phaseId              # which phase's merge this was, for the record only
}
```

Everything else (deployment id, build id, workflow run id, migration set,
submission id) is platform vocabulary, and the kernel must never learn it.
The adapter maps subject to platform identity and **must record the resolved
identity verbatim in its response**, so a human reading the evidence can see
which object was inspected.

The captured Vercel data shows why this mapping is not trivial and why the
kernel must not attempt it:

- **CAPTURED**: a single commit sha appears on more than one deployment.
  `929d387be1fc2d1c9464d172b9610947076ccf9e` appears twice in the capture, once
  with `"target": null` and once with `"target": "production"`. Matching on sha
  alone would let a verifier report `satisfied` from a preview build while
  production never deployed. The mapping key is at minimum
  (project, target, sha), and even that is one-to-many over time because of
  redeploys and rollbacks (`"isRollbackCandidate"` is a captured field).
- **CAPTURED**: the production deployment's `meta.githubCommitSha` is the
  squash sha on `main` (`61b964beb868730e3c195ab032c2822fe62a65cf`), which is
  a different sha from every branch deployment in the same pull request. A
  verifier keyed to the branch head would find a healthy READY deployment
  belonging to a different commit. That is a verifier that can be fooled while
  reporting an observation, which is worse than no verifier.

The kernel's defence against both is one rule, cheap and mechanical: the
**subject echo check**. The adapter's response must contain the subject the
kernel passed. The kernel compares it field by field and reports `error` on
any mismatch, before looking at the outcome. An adapter that verified
something else can no longer report success for this subject by accident.

### 2.4 Time, and C-3

C-3 forbids auto-backgrounding (`delivery/plan/kernel-plan-m2.md:50`), and
`src/spawn.ts:131-143` records the same discipline in the delivered code: the
payload runs to completion before the call returns, and there is no daemonize
path to forget to guard. Release verification must inherit that exactly.

The division of labour:

- **The kernel owns the clock.** Interval, deadline, maximum attempts, and the
  verdict at the deadline are the kernel's, taken from configuration the
  kernel validated. The adapter never sleeps, never loops, never schedules,
  and never decides what a timeout means.
- **The adapter performs one bounded observation per invocation.** One
  locate-plus-observe, promptly, then exit.
- **Every attempt writes a record**: attempt number, wall-clock instant, the
  outcome, the resolved identity, and the transport-level detail (for HTTP,
  the status code; for a command, the exit code). M2-P7 criterion 1 already
  demands exactly-three-polls arithmetic (`delivery/plan/kernel-plan-m2.md:364`);
  this generalizes it.
- **Timeout is `red`, never `not-applicable` and never a soft pass.** A
  release that has not happened by the deadline has not happened. The record
  names the last observed outcome and the elapsed seconds.

Because the adapter is a subprocess (section 5), the per-attempt bound is
enforceable rather than promised: the kernel kills an attempt that overruns
its per-attempt timeout and records that attempt as `error`, and an adapter
that hangs cannot hang the kernel. An in-process adapter interface could not
offer that, which is one of the two reasons the boundary is a process.

One consequence to state rather than discover: total suite wall time now
includes real-clock waits, which CLAUDE.md standing warning 11 already warns
about for lease waits. Deadlines belong in configuration with a documented
default, and tests must use short deadlines against loopback stubs, never the
production default.

### 2.5 The contract, sketched

Stated as data, because the boundary is a process and the only things that
cross it are JSON and an exit code (the M1-P4 precedent, `src/spawn.ts:84-98`).

Request, passed to the adapter (recommended: a file path in argv, contents
JSON, so nothing sensitive lands in a process listing):

```
{
  "contractVersion": "1",
  "verification": "deploy",            # the declared verification's id
  "subject": { ...as in 2.3... },
  "config": { ...adapter-specific, from project configuration... },
  "attempt": { "number": 3, "deadline": "2026-08-05T09:12:00Z" },
  "recordPath": "<absolute path the adapter writes its response to>"
}
```

Response, written by the adapter to `recordPath`:

```
{
  "contractVersion": "1",
  "adapter": "vercel",
  "subject": { ...echoed verbatim... },
  "outcome": "satisfied" | "failed" | "pending" | "absent"
             | "not-applicable" | "error",
  "resolved": { "kind": "deployment", "id": "dpl_...", "target": "production" },
  "observedAt": "2026-08-05T09:07:14Z",
  "observation": { "raw": <verbatim extract>, "detail": "<one line>" },
  "reason": "<required for failed, absent, not-applicable and error>"
}
```

Rules the kernel enforces on that response, each of which is a fail-closed
rule and each of which corresponds to a way a verifier can be fooled:

1. Exit code 0 with no response file written is `error`, not success. This is
   the same rule M2-P1 step 7 already applies to gates
   (`delivery/plan/kernel-plan-m2.md:155`), and it matters more here.
2. A response that fails schema validation is `error`, naming the field.
3. A response whose echoed subject differs from the passed subject is
   `error` (2.3).
4. `satisfied` with no `resolved` identity is `error`. A verifier that cannot
   say what it looked at did not look.
5. `satisfied` with no `observation` is `error`. The same rule in the other
   direction: a claim with no captured evidence behind it is treated as
   unknown, which is the repository's standing evidence rule applied to a
   machine.
6. An unrecognized `contractVersion` is `error`, naming the versions the
   kernel accepts. Loud failure on the unknown, exactly as M2-D-04 chose for
   schema keywords (`delivery/plan/kernel-plan-m2.md:478`).
7. An `outcome` value outside the enum is `error`, never coerced.

### 2.6 What the kernel guarantees it will never do

A verifier that can be fooled is worse than none, because it converts an
unchecked assumption into a recorded, cited, evidenced assumption. The
guarantees below are the anti-fooling surface, and each names the way it
would otherwise be defeated.

1. **Never report `green` without an observation record naming the resolved
   release identity and the subject.** (Defeats: an adapter that returns
   success from a cache, a stub, or an empty response.)
2. **Never accept an outcome for a subject the adapter did not echo.**
   (Defeats: verifying the previous release, the branch build, or another
   project.)
3. **Never treat absent, unparseable, unauthenticated, unreachable or
   unknown-valued as pending or not-applicable.** These are `error` at the
   attempt level and `red` at the deadline. (Defeats: an expired token
   producing a permanent soft pass, which is the M1-P5 stranded-claim shape
   that made a watcher pass silently and permanently.)
4. **Never derive the verdict from the process that performed the release.**
   The verifier must read an authority independent of the deploying command.
   An adapter whose observation is "the deploy command exited 0" is not a
   verifier, and the kernel should say so in the reference adapters' module
   documentation. (Defeats: incident one exactly. The pipeline that suffered
   it already believed it had deployed.)
5. **Never let a run-time input downgrade a required verification.** Only the
   declared configuration at the merge base can make a verification
   not-applicable (section 4). (Defeats: turning verification off inside the
   branch that needs it off, which is the widening attack M2-P4 step 4 already
   defends against for scope, `delivery/plan/kernel-plan-m2.md:269`.)
6. **Never auto-background, never poll past the deadline, never return a
   pending state as a pass.** (C-3, and section 2.4.)
7. **Never write a credential value into any evidence record.** Names only.
   (M2-P7 criterion 9, `delivery/plan/kernel-plan-m2.md:372`.)
8. **Never let an adapter own the clock or the timeout verdict.** (Defeats:
   an adapter that quietly waits forever, or one that decides its own timeout
   means success.)
9. **Never report `satisfied` for a subject whose release object was created
   before the merge.** Recommended as a coherence check the kernel can perform
   generically, because the adapter reports `observedAt` and the kernel knows
   `mergedAt`: a release object whose creation instant precedes the merge is
   almost certainly the previous release. Whether this is a hard `error` or a
   recorded warning needs one real counter-example before it is fixed; see
   section 8 item 8.

---

## 3. The mobile case

**Ruling: an App Store or Play review outcome does not belong in this
interface, and the interface should say so in its own documentation rather
than leave the gap for an implementer to fill by inventing.**

The reasoning is from the gate's purpose, not from the difficulty:

- The gate exists to answer "may the next phase start" inside one dispatch
  loop (R-032, `delivery/requirements/migration-table.md:64`).
- Under C-3 the answer is produced by a foreground poll with a deadline
  (section 2.4).
- A store review is decided by a third party on a timescale of hours to days
  (**GENERAL, UNVERIFIED HERE**; I have no store connection to capture from,
  and I will not pretend a number).
- Therefore the gate has exactly two available behaviours, and both are
  wrong: block the pipeline for days, or use a deadline shorter than the
  review and convert every submission into a red. A verification that is
  structurally red on the happy path trains its operator to ignore it, which
  is worse than not having it.

What genuinely does fit, and should be modelled as an ordinary verification
because it is bounded and machine-checkable:

- The build was uploaded and accepted for processing by the store, at the
  expected version and build number, for the merged commit.
- Processing (the store's own automated ingestion, as distinct from human
  review) reached a terminal state.

That half catches the mobile analogue of incident one, which is the upload
silently not happening, and it is the half that a release verifier can
actually assert. It is also the half a project can wire without a special
kernel concept.

What to do with the review outcome, stated as a deferral rather than a
design: it is a **long-running release milestone**, not a gate. Its natural
shape in this kernel is a durable record plus a resumable check owned by the
watcher (the component that already exists to answer "has something changed
since I last looked" without a resident process), and an owner-facing status
line entry. That is a different mechanism with a different lifetime, and
designing it now would be building machinery for a state no milestone
reaches, which is the M1-P3 failure the M2 plan is explicitly trying not to
repeat (`delivery/plan/kernel-plan-m2.md:510`). Section 8 item 5 records it
with the evidence that would settle it.

The interface should carry one written rule that makes this boundary
enforceable rather than advisory: **every verification must be able to reach a
terminal outcome within its declared deadline, and a deadline is bounded by a
kernel-declared maximum.** An adapter whose honest answer is "days" fails
that rule by construction and is thereby told, at configuration time, that it
is the wrong concept. Choosing the maximum is section 8 item 6.

---

## 4. Not-applicable as a declared configuration

DR-0014 makes not-applicable a legitimate declared choice rather
than only an unmet precondition. That requires splitting one status into
three distinguishable states, because they have different meanings to a
reader and different consequences for trust.

| State | Status reported | Record carries | What it means |
|---|---|---|---|
| Declared none | `not-applicable` | `declared: true`, `reason`, and the declaration's source and blob sha256 | the project asserts it has no remote release to verify |
| Precondition unmet | `not-applicable` | `declared: false`, the precondition id, and the evidence of its evaluation | configured, but this repository state does not trigger it (no migrations directory, for instance) |
| Misconfigured | `error` | the field or resource that could not be resolved | a configuration exists and is broken: adapter not found, credential variable unset, endpoint missing |

The third row is the load-bearing one. M2-C-3 already states the rule
(`delivery/plan/kernel-plan-m2.md:55`): a check that cannot reach a verdict is
`error`, never `not-applicable`, because not-applicable asserts that a
precondition was evaluated and found unmet. Release verification is where
that rule earns its keep, because a misconfigured verifier and a
deliberately-absent verifier look identical in a summary line and mean
opposite things.

### 4.1 What stops a project from silently disabling verification it needs

Four defences, in increasing order of cost, of which the first three are
mechanical and the fourth is a recommendation to the M3 planner.

1. **Silence is never permission.** The declaration must be positive and
   specific. An absent configuration field is `error`, not `none`. This
   mirrors the rule the M2 plan already adopted for missing invocation
   parameters (`delivery/plan/kernel-plan-m2.md:55`): absent is an error, not a
   quiet skip. A project that has not thought about release verification finds
   out at the first merge, not never.
2. **A reason is required, and it is surfaced.** `none` without a non-empty
   reason is `error`. The reason appears in the verification record, in the
   milestone evidence bundle, and in the status line. Disabling verification
   should cost visibility, which is the same mechanism the M2 coverage
   checker uses for parked rows (`delivery/plan/kernel-plan-m2.md:338`, a
   parked row with an empty note is red).
3. **The declaration is read from the merge base, not the head.** Exactly the
   anti-widening rule the scope auditor uses
   (`delivery/plan/kernel-plan-m2.md:269`), and for exactly the same reason: a
   phase must not be able to switch off, inside its own branch, the check that
   would have caught it. The record carries the declaration path and its
   merge-base blob sha256, so a reviewer can see which text authorized the
   skip.
4. **Recommended to the M3 planner: a charter coherence check.** The charter
   already requires `deployment topology` among its irreversible decisions
   (`delivery/intake/orchestrated-delivery-v1.md:126`,
   `delivery/plan/kernel-plan-m3.md:468-469`). A charter that declares a
   non-local deployment topology and declares release verification `none` is
   internally contradictory, and that contradiction is checkable across two
   fields of one document. This is a Kind B derived check in M3's own
   vocabulary (`delivery/plan/kernel-plan-m3.md:791-799`), it costs one check
   and no new artifact, and it is the only one of the four defences that can
   catch a project that lies to itself deliberately rather than by omission.
   I recommend it, and I flag that the exact predicate ("non-local topology")
   needs a real charter to be written against; see section 8 item 4.

One further recommendation, offered because DR-0014 itself classifies this
interface as costly to change (its reversibility field): **a change from a
declared verification to `none` should be in the charter's
`escalation-contract` stop-for list**, so it becomes an owner decision rather
than an implementer's edit. The charter already has the field
(`delivery/plan/kernel-plan-m3.md:470-472`). This is a one-line addition to a
default list, and it is the difference between "the owner chose to run
without verification" and "verification stopped happening".

---

## 5. Registration and loading

### 5.1 The options, and what each costs

The constraints are fixed: the kernel is an npm package, fleet homes pin a
version (`delivery/intake/orchestrated-delivery-v1.md:99`), and distribution
is npm-maximal with a thin harness adapter (settled). The kernel ships zero
runtime dependencies today (`delivery/plan/kernel-plan-m2.md:478`).

**Option A: kernel-shipped adapters only, selected by id.** Rejected by
DR-0014 in principle. Recorded for completeness only.

**Option B: npm package loaded in-process.** The charter names a package,
the fleet home installs it, the kernel imports it and calls an exported
function.
Costs: arbitrary third-party code runs inside the kernel's process, with the
kernel's file handles and the kernel's environment, which makes guarantee 7
of section 2.6 (never write a credential into evidence) unenforceable rather
than enforced. A hanging adapter hangs the kernel, so the per-attempt timeout
of section 2.4 becomes advisory. It introduces a version-compatibility
surface between the pinned kernel and an independently versioned adapter, and
it forces adapters to be JavaScript. It also puts a third-party package into
the fleet home's dependency tree, which lands in the EXT-F-09 license gate's
inventory (`delivery/plan/kernel-plan-m3.md:1883-1889`).
Benefit: types, and no process spawn per attempt.

**Option C: project-supplied executable, spawned as a subprocess.** The
configuration names an argv; the kernel writes a request file, spawns the
command, waits with a hard per-attempt timeout, reads the response file,
validates it.
Costs: no compile-time typing of the adapter (mitigated by schema validation
at the boundary, which is stronger than typing because it also holds for
adapters not written in TypeScript); one process spawn per attempt, which is
negligible against poll intervals measured in seconds.
Benefits: it is the boundary the kernel already uses everywhere. Every
toolbelt boundary is a subprocess with an exit code (FM-060, adopted at
`src/spawn.ts:84-98` and again as M2-D-07,
`delivery/plan/kernel-plan-m2.md:481`). It makes the per-attempt timeout real.
It works for any language, which matters because the honest self-hosted
adapter is often a shell script that curls a version endpoint or asks a
service manager a question. It needs no loader, no resolution algorithm, and
no compatibility matrix. And it composes with M2-P8's allowlisted child
environment (section 6) instead of fighting it.

**Option D: both B and C.** Costs the union of B's hazards plus a second
mechanism to document, test and review.

### 5.2 Recommendation

**Option C, and additionally: the kernel's own reference adapters use the
same boundary.**

A kernel-shipped adapter should be a subcommand of the kernel binary
(`tiphys verify-adapter vercel <request-file>`) that a project could equally
well have named itself in configuration. That single choice is what keeps the
contract honest: if the shipped adapters went through a privileged in-process
path, a defect in the subprocess boundary would be invisible until the first
third party hit it, which is the shape of every "it works for us" interface
failure. Making the kernel eat the same boundary means the contract is
exercised on every run of the kernel's own reference adapters.

Two supporting rules:

- The response carries `contractVersion` and the kernel refuses an
  unrecognized value loudly (section 2.5 rule 6).
- The adapter's argv is committed project configuration under scope audit,
  never assembled at run time from an environment variable, because an
  adapter path that can be redirected at run time is a way to make a verifier
  report anything.

Option B is not foreclosed. It becomes worth revisiting when a real project
demonstrates that the subprocess boundary costs it something concrete, which
is a discovery, not a prediction. Section 8 item 9.

### 5.3 Where release verification differs from the executor adapter precedent

DR-0007's executor adapter is the right model and the brief is correct to
name it. Three differences must be designed in rather than inherited:

1. **The boundary is a process, not a TypeScript interface.**
   `ExecutorAdapter` is an in-process interface with one shipped
   implementation (`src/spawn.ts:95-98`, `src/spawn.ts:144`), and that is
   appropriate because M1 ships every implementation itself. Release
   verification adapters are written by parties the kernel will never review.
2. **The failure mode is inverted, so the evidence obligations are heavier.**
   An executor adapter that fails is immediately visible: the task did not
   start. A release verifier that fails produces a green record and a silent
   lie. That asymmetry is why section 2.6 exists at all and why the executor
   contract needs nothing equivalent. The `ExecutorAdapter` contract is
   deliberately tiny ("the ENTIRE contract is", `src/spawn.ts:85-93`); this one
   cannot be, and the extra weight is all evidence rules rather than
   behaviour.
3. **It is called repeatedly, against a clock, so the loop belongs to the
   kernel.** `launch` is called once per task. `observe` is called until
   terminal or deadline. Everything about intervals, deadlines and timeout
   verdicts is therefore kernel-side, and an adapter that tries to own any of
   it is a contract violation rather than a style disagreement.

---

## 6. Credentials

### 6.1 The mechanism

M2-P8 builds an allowlisted child environment with credential-store pointers
redirected rather than dropped (`delivery/plan/kernel-plan-m2.md:388-389`,
M2-D-13 at line 487). A verifier adapter spawned as a subprocess inherits
that default: nothing. That default is correct and must not be relaxed.

The design that gives an adapter its token without weakening it:

1. The project's verification configuration declares credential **names**,
   never values: `credentials: ["VERCEL_TOKEN"]`. Names-only in configuration
   and names-only in evidence, which M2-P7 criterion 9 already requires
   (`delivery/plan/kernel-plan-m2.md:372`).
2. The kernel resolves each named variable from the orchestrator's own
   environment and injects exactly those variables into that one adapter's
   child environment, as a **per-invocation extension of the M2-P8 allowlist**.
   The allowlist stays an allowlist; it gains named entries for the duration
   of one spawn and for one adapter. It is never replaced by a denylist and
   never disabled.
3. A named credential that is not resolvable is `error` (misconfiguration,
   section 4), never a silent unauthenticated request that a platform answers
   with a 401 that some parser then reads as pending.
4. The verification allowlist extension may never include a
   pull-request-capable or push-capable credential. This is checkable with the
   mechanism M2-P8 is already building: run the same capability probe
   (`credential-scrub`, `delivery/plan/kernel-plan-m2.md:392`) from inside the
   verifier's child environment. Reuse, not a second mechanism.
5. Nothing about this belongs in CI secrets by default. Release verification
   runs after merge in the orchestrator's environment, not in the pull-request
   check (section 1.3), so the credential lives where the orchestrator lives.

### 6.2 What needs an owner decision

Three items, flagged rather than assumed:

1. **Read-only tokens where the platform supports them, and what to do where
   it does not.** The principle is obvious: a verifier reads. Whether each
   target platform can issue a token that can only read is a per-platform
   fact I cannot verify from here (**GENERAL, UNVERIFIED HERE**: platform
   token models vary, and at least some issue account-wide or team-wide tokens
   whose scoping is coarse). The decision the owner faces is what happens when
   a platform offers no read-only scope: accept a write-capable token in the
   orchestrator's environment, or declare that verification `none` with a
   reason. Both are legitimate; improvising either is not.
2. **Who provisions them.** This is the same class as owner action A-3
   (`delivery/plan/kernel-plan-m2.md:497`), and it should be raised the same
   way, per platform, when a pilot project exists. The orchestrator has no
   such credential and must never assume one.
3. **Whether release verification credentials may ever reach a spawned
   implementer.** Recommendation: no, never, by the same reasoning that keeps
   pull-request credentials away from implementers (R-008). An implementer has
   no reason to talk to a deployment platform, and a credential that reaches
   the child of a child is a credential nobody is scoping. Stating it as a
   rule now costs nothing; discovering it later costs a phase.

---

## 7. What to ship first, and what not to

### 7.1 The minimum that proves the contract works

Five things, in this order. Together they are testable end to end without any
external network, which is what makes them shippable in M2 under the phase's
own captured-response rule (`delivery/plan/kernel-plan-m2.md:356`).

1. **The record and its schema**: subject, outcome enum, resolved identity,
   observation, reason, contract version. Plus the total mapping from outcome
   to `GateResult` status (section 2.2), implemented in one place.
2. **The kernel-owned poll loop**: interval, deadline, per-attempt timeout,
   one record per attempt, the timeout verdict, and the conversion of
   `pending` and `absent` at the deadline.
3. **The subprocess boundary and its seven fail-closed rules** (section 2.5),
   each with a red-witness against the dangerous state rather than against the
   absent feature: an adapter that exits 0 writing nothing, one that echoes a
   different subject, one that claims `satisfied` with no resolved identity,
   one that returns an out-of-enum outcome, one that hangs past its
   per-attempt timeout.
4. **`migrations-command` adapter.** Local, no network, fully testable.
   Repository inventory from a declared directory and pattern; applied
   inventory from a project-declared command. Ships with the id-comparison
   semantics and the content-drift comparison where the applied inventory
   exposes a checksum, exactly as the M2 plan already specifies
   (`delivery/plan/kernel-plan-m2.md:358`).
5. **`http-json` adapter.** The generic one, and the one that carries the
   JSON-pointer extraction that section 2.1 removes from the interface.
   Testable against a loopback stub replaying real captured responses, which
   is what T-003 lesson 4 demands (`delivery/tuition/T-003-fix-rounds-need-verification.md:28`)
   and which is now possible: appendix A holds a real Vercel deployment object
   and real GitHub Actions run fields, and both can be committed under
   `test/fixtures/` as captures with provenance.

That set proves the contract because it exercises both the locate-then-observe
shape and the degenerate immediate-terminal shape, both a network-transport
adapter and a local-command adapter, and every fail-closed rule.

### 7.2 Reference adapters: buildable against real captures, versus invented

**Buildable now, grounded in captures:**

- `migrations-command`, entirely local.
- `http-json`, with fixtures byte-derived from appendix A.
- The **locate** half of a `vercel` adapter: list deployments for a project,
  filter on `meta.githubCommitSha` equal to the subject sha **and** `target`
  equal to the declared target, report `absent` when the filter is empty and
  `satisfied` when the matched record's `readyState` is `READY`. Every field
  named in that sentence is captured (appendix A.1). The locate half is also
  the half that catches incident one, so this is not a consolation prize.
- A `github-actions` adapter: locate the workflow run for the subject sha on
  the declared workflow, then map `status` and `conclusion`. Both fields and
  their pending behaviour are captured (appendix A.2). This is the natural
  adapter for the self-hosted case whenever the deploy is driven by a CI
  workflow, because the CI record is an authority independent of the deploy
  command (guarantee 4 of section 2.6).

**Not buildable now, and would be invented if attempted:**

- **The Vercel failure vocabulary.** All twenty deployments in the capture are
  `READY`. I have observed neither an error state nor an in-progress state,
  and I decline to write down the value names I believe exist. The safe
  shipping rule, which needs no such list: **`READY` is the only satisfying
  value; every other observed value is recorded verbatim and treated as
  `pending` until the deadline, at which point it becomes `red` naming the
  last observed value.** Unknown never becomes green, and the adapter needs no
  failure list to be safe. It will be slower to fail than it could be, and
  that is the correct trade until a failure record is captured (section 8
  item 1).
- **Whether `state` or `readyState` is authoritative** when they differ. Both
  were present and both were `READY` in the capture, so the question is
  untouched by my evidence (section 8 item 1).
- **A Hetzner adapter.** There is no platform release object to poll. Hetzner
  Cloud's API is about servers, not application deployments (**GENERAL,
  UNVERIFIED HERE**), so any "Hetzner adapter" would be an invented
  project-specific convention wearing a platform's name, which is precisely
  the T-003 hazard DR-0014 cites. The honest self-hosted reference is the
  version-echo pattern: the running service reports the commit sha it is
  serving, and `http-json` compares it against the subject. That places one
  obligation on the project (the service must report its version), and the
  kernel should say so plainly rather than synthesize an answer it cannot get.
- **Any store adapter.** Section 3.
- **The dispatch block.** Already deferred to M4 by M2-D-11
  (`delivery/plan/kernel-plan-m2.md:485`) and unaffected by this report.

### 7.3 One warning to carry into M2-P7's brief

The migration verifier's not-applicable rule needs one asymmetry stated, and
the capture is why. **CAPTURED** (appendix A.3): the Supabase management API's
`list_migrations` returned `{"migrations":[]}` for two separate
`ACTIVE_HEALTHY` production projects. An empty list from an applied-migration
inventory is therefore a real, observable response from a real, healthy
project, and it means "this inventory source does not know about this
project's migrations", not "there are no migrations".

M2-P7 criterion 7 says a declared migrations location containing zero
migrations is `not-applicable`
(`delivery/plan/kernel-plan-m2.md:370`). That is right for the **repository**
inventory. It must not be extended to the **applied** inventory: a non-empty
repository inventory with an empty applied inventory is the exact incident
("migrations skipped by a flake while the code deployed anyway") and must be
`red`, never `not-applicable`. The two inventories are not symmetric and the
plan should say so in the phase, not leave it to the implementer.

---

## 8. What must not be decided yet

Each item states what is undecided, why deciding it now would be invention,
and the specific evidence that settles it.

1. **Vercel's non-success status vocabulary, and which of `state` and
   `readyState` is authoritative.** All captured deployments are `READY` with
   both fields agreeing. Settled by: capturing at least one failed deployment
   record and one in-flight record from a real project (a deliberate build
   failure in a scratch project suffices), plus any record where the two fields
   differ. Until then, ship the conservative rule of 7.2 and no failure list.
2. **Whether the interface must distinguish "built" from "serving".**
   **CAPTURED**: the deployment object carries an `alias` array and an
   `aliasError` field, and on a healthy production deployment `aliasError` is
   `null`. The existence of a separate alias error strongly suggests a
   deployment can be READY without being the thing users reach, which is a
   distinct failure the interface may need to express. I observed only the
   healthy shape. Settled by: capturing one record with a non-null
   `aliasError`, or one READY production-target deployment that is not aliased
   to the production domain.
3. **Which applied-migration inventory is authoritative per stack, and whether
   checksums are available.** Grounded by the capture in 7.3: the obvious
   hosted API is not automatically the answer. Settled by: on the pilot
   project, capturing the output of that project's real applied-migration
   query alongside its repository inventory, and recording whether a checksum
   column exists. Until then, content drift stays the recorded limitation the
   M2 plan already carries (`delivery/plan/kernel-plan-m2.md:459`).
4. **Whether release verification generalizes to N charter-declared
   verifications, and the exact charter field shape.** M2 should keep two
   static manifest entries (section 1.3). The charter field is M3's, and M3
   should reserve the space rather than design it, exactly as DR-0014's
   impact section instructs. Settled by: the first real project charter, at M4's pilot,
   which is also what settles the coherence-check predicate of section 4.1
   item 4.
5. **Long-running release milestones (the store review case).** Settled by: a
   real mobile project charter and one observed submission timeline. Not
   before M4, and it is a different mechanism (watcher plus durable record),
   not an extension of this interface.
6. **The kernel's maximum deadline, and the default poll interval.** These
   are numbers, and inventing numbers is how a gate becomes a nuisance.
   Settled by: measuring real releases on the pilot. The one captured data
   point is a 318-second Vercel production build (appendix A.1), which is
   already enough to say that a 60-second default would be wrong, and not
   enough to say what is right.
7. **Where the verifier runs: the orchestrator's post-merge step only, or
   also in CI.** This report argues post-merge only (section 1.3), and that
   determines where credentials live (section 6.1 item 5). Settled by: M4's
   pilot wiring, which is where the dispatch block lands anyway.
8. **Whether the release-object-older-than-the-merge check (guarantee 9) is a
   hard error or a recorded warning.** Settled by: one real counter-example,
   most plausibly a platform that reuses or backdates a record on redeploy.
   Ship it as a recorded observation first, promote it to an error when a real
   case shows it is safe to.
9. **Whether in-process npm adapters (option B) are ever admitted.** Settled
   by: a real project demonstrating a concrete cost of the subprocess
   boundary. Prediction is not evidence.

---

## 9. Observations for the orchestrator

Not design questions, and not findings against any merged code. Each is
checkable and each would cost a phase if it went unnoticed.

**O-1. RESOLVED by the orchestrator, 2026-08-05: DR-0013's number was
claimed twice.** As this report found it, the record
`delivery/decisions/DR-0014-release-verification-interface.md` held this
subject, while both plans used DR-0013 for the JSON Schema validator
implementation question: `delivery/plan/kernel-plan-m2.md:121`, `:478` and
`:499` ("DR-0012 and DR-0013 are claimed"), and in M3 at
`delivery/plan/kernel-plan-m3.md:415-416`, `:509`, `:2416`, `:2427`,
`:2429-2430` and `:2527-2529`. The operative consequence was at
`delivery/plan/kernel-plan-m3.md:639`, where M3-P1's `blocked-by` reads
"DR-0013 (validator implementation)": that dependency resolved to a decided
record about release verification, so M3-P1 appeared unblocked while its
actual blocker had no record at all.

Resolution, and it went the other way from what this report's subject would
have preferred: the plans' claim is older, is merged to `main`, and is cited
in twelve places across two plans and two plan reviews, while the release
verification record had not yet reached `main`. So the release verification
record was renumbered to DR-0014, and the validator decision was written up at
the filename the M3 plan already named,
`delivery/decisions/DR-0013-schema-validator-implementation.md`, transcribing
the plan's own options and recommendation rather than reinventing them. The
renumbering is recorded in DR-0014 itself. Everywhere below, references to
this report's subject read DR-0014.

**O-2. M2-P7 acceptance criterion 3 misclassifies a healthy in-flight run.**
`delivery/plan/kernel-plan-m2.md:366` makes an absent status pointer `error`.
Captured evidence (appendix A.2) shows a real in-progress GitHub Actions run
carrying no `conclusion` key. If M2-P7 keeps pointer-based extraction at the
interface level this criterion needs a pending clause; section 2.1 recommends
removing pointer extraction from the interface entirely, which dissolves the
criterion instead of patching it.

**O-3. The gate table's two not-applicable columns are structural, not local.**
`delivery/plan/kernel-plan-m2.md:71-72` predicts `not-applicable` for `deploy`
and `migrations` in both bundles. That is not a property of this repository
having no deploy target; it is a property of a post-merge check appearing in a
pre-merge bundle (section 1.3). Worth stating in the plan so that a later
reader does not conclude the exit test exercised these gates in anger.

---

## Appendix A: captured platform evidence

Method: authenticated read-only connector calls made from this session on
2026-08-05. No write call of any kind was made. Values below are transcribed
from the responses; commit messages, account identifiers and hostnames are
omitted or truncated deliberately, both because they are not evidence for
anything here and because this repository is ASCII-only and the captured
messages are not. Field names and status values are verbatim.

### A.1 Vercel deployment records

Source: Vercel connector, `list_deployments` for one project (20 records) and
`get_deployment` for one of them, 2026-08-05.

Fields present on a single deployment object, verbatim keys:
`id`, `name`, `url`, `type`, `state`, `createdAt`, `creator`, `project`,
`meta`, `alias`, `target`, `regions`, `buildingAt`, `ready`, `readyState`,
`source`, `aliasError`.

Values observed on the current production deployment:

- `"state": "READY"` and `"readyState": "READY"` (both present, both equal)
- `"target": "production"`
- `"source": "git"`, `"type": "LAMBDAS"`
- `"aliasError": null`
- `"alias"` is an array of five hostnames including the project's apex domain
- `"buildingAt": 1785881489393`, `"ready": 1785881807886`, a difference of
  318493 ms, so roughly 318 seconds from build start to ready
- `meta.githubCommitSha`: `61b964beb868730e3c195ab032c2822fe62a65cf`
- `meta.githubCommitRef`: `main`
- other `meta` keys relevant to identity: `githubCommitOrg`, `githubCommitRepo`,
  `githubRepoId`, `githubPrId` (present on branch deployments, absent on the
  observed production ones), `branchAlias`

Across the 20 listed deployments:

- every `state` value observed was `READY`; no error, queued, building,
  initializing or canceled record appeared
- `target` was either `"production"` or `null`
- the sha `929d387be1fc2d1c9464d172b9610947076ccf9e` appears on two distinct
  deployment ids, one with `"target": null` and one with
  `"target": "production"`
- `isRollbackCandidate` appears as a per-deployment boolean, `true` on two
  records

### A.2 GitHub Actions workflow runs

Source: GitHub connector, `list_workflow_runs` for
`ThomasHendrickx/tiphys-ai-helmsman`, 2026-08-05. The full response was
written to a session tool-results file and inspected by pattern; the strings
below are verbatim matches from it.

- Completed runs carry both fields together:
  `"status":"completed","conclusion":"success"` and
  `"status":"completed","conclusion":"cancelled"` were both observed.
- The one in-flight run carries `"status":"in_progress"` followed
  immediately by `"workflow_id"`: **no `conclusion` key is present on that
  object at all.** A search for `"conclusion":null` across the whole response
  returned zero matches, so the field is omitted rather than nulled.
- Identity fields observed per run: `head_sha`, `head_branch`, `event`
  (`pull_request` and `push` both observed), `run_attempt`, `workflow_id`,
  `check_suite_id`, `display_title`.

### A.3 Supabase applied-migration inventory

Source: Supabase connector, 2026-08-05.

- `list_projects` returned three projects, all with
  `"status":"ACTIVE_HEALTHY"`, two of them named as production and
  development environments of one live application.
- `list_migrations` against two of those projects, including the production
  one, returned `{"migrations":[]}` in both cases.

Interpretation, kept separate from the observation: this does not establish
that those projects have no migrations. It establishes that an empty applied
inventory is a response a real, healthy project produces from a plausible
inventory source, which is why section 7.3 insists the applied side and the
repository side are not symmetric.

### A.4 What could not be captured from here

- Any non-success deployment state from any platform.
- Any store connect API, of either vendor.
- Any Hetzner or generic self-hosted deployment record.
- Any platform token-scoping capability (section 6.2 item 1).

Each of these is named in section 8 with the capture that would settle it.
None of them is described in this report as though it had been observed.
