# Tiphys Kernel Plan M4: Cutover

- status: DRAFT, revision 1, 2026-09-15.
- discharges: the SECOND half of plan decision D-19
  (delivery/plan/kernel-plan-v1.md:394), which forbids M4 dispatching without
  its own intake AND plan, decomposed at minimum into six workstreams. The
  intake is delivery/plan/m4-intake.md:1. **Neither substitutes for the other
  and D-19 requires both.**
- baseline: branch `plan/pstack-borrow-review`, cut from `main` at `3b40118`.
- decomposition: **six workstreams, twenty-seven phases, M4-P1 to M4-P27.**
  D-19's six are all present and are sections 3 to 8 below. The rollback
  procedure D-19's second limb requires is M4-P26 and section 9.

## 0. What changed between the intake and this plan, and it is not small

**Six prototype probes ran between the two documents, and four of them
overturned something this repository believed.** The full account is
delivery/verification/m4-prototype-probes.md:1 and the ten agent beacons are
committed verbatim under `delivery/evidence/m4-probes/`. A planner reading only
the intake will plan work that no longer needs doing.

The four reversals, each with its consequence for a phase below:

1. **A scrubbed child DOES authenticate.** The intake built M4-D-07 and part of
   workstream 1 on the premise that it cannot. Measured false here: the
   credential sits at an absolute path outside `$HOME`, so redirecting `HOME`
   cannot reach it, and the minimal `extraAllowlist` for model authentication is
   the EMPTY LIST. What breaks is `git push`, at a cost of exactly one name.
   **M4-P8 shrinks accordingly and its question is re-asked rather than
   answered.**
2. **The `credential-scrub` gate's verdict is INVERTED** with respect to real
   capability here: it permits the one name that grants GitHub write and refuses
   names that grant only URL rewriting. **That is a new defect and M4-P8 owns
   it.**
3. **The real credential boundary is the UID and the FILESYSTEM**, not the
   environment. The kernel's scrub is environment-only and spawns the child at
   the same uid. **No M4 evidence may report that boundary as enforced on the
   strength of the existing gate.**
4. **D-8's carve-out does not partition the operations it names.** A
   fast-forward merge in a checked-out clone rewrites tracked files, so the
   sanctioned act is a member of the forbidden set and no path-based hook can
   implement the line as written. **M4-P9 must carry the restated carve-out,
   and its Bash arm is withdrawn from the hook entirely.**

5. **The resolved model IS observable**, by a hook, at turn end, without
   trusting the agent. The intake's appendix said it was not. A hook resolved
   the real model for a subagent that claimed a different vendor's in the same
   turn. **M4-P7 is therefore designed on OBSERVATION, not self-report**, and
   the forgeability of a self-written `produced-by` is now demonstrated rather
   than argued.
6. **The sha-binding fix was BUILT and red-witnessed** in 74 lines against the
   real registry, and **the post-merge call site is not missing code**: `deploy`
   already runs on every push to `main` and reports not-applicable only because
   the declaration file is absent. **So the binding and the call site are ONE
   phase, not two**, and any phase entry below that budgets them separately is
   wrong.

Two questions the intake marked PROTOTYPE-BLOCKED are now CLOSED by measurement:
M4-D-01 (DR-0010: option 3, the hybrid; option 1 refuted for ship phases) and
M4-D-11 (a dedicated BRANCH is a real compare-and-swap, with three conditions
the recommendation omitted).

**M4-P1 was written as "run the probe" and the probe has already run.** It is
kept as a phase rather than deleted, because its deliverable (a committed
verification document plus captures) is exactly what landed, and because three
of its five questions were answered while two were not. Its entry below is
amended to say which.

## 1. What this plan inherits and does not re-argue

Fifteen records govern M4 and none is reopened here. The four that most shape
the phase list:

- **DR-0036** orders the harness adapter first and makes the kernel a subject,
  under a condition that keeps planning, review, credentials, pull request,
  merge, recovery and closeout authority with the current process.
- **DR-0037** leaves the kernel as the ONLY subject. Clause 4 of the M4
  paragraph therefore has no subject, which section 5 states rather than plans
  around.
- **DR-0041 and DR-0042** keep the exit test bound to the pilot, refuse a
  kernel-only exit test, and make the pilot reachable on an owner reboot at
  cutover entry. **M4-P27 is that trigger.**
- **DR-0010**, decided 2026-09-15 by the measurement above.

## 2. Numbering, ordering and the conflict pre-pass

**Ids are allocated once and never renumbered.** M4-P1 to M4-P27, allocated in
this document. The four drafting passes produced colliding ids and the
collisions were resolved here, before any branch existed, which is the only
moment it is free.

**`m4-p1` is a proper string prefix of `m4-p10`.** The scope gate's
evidence-ownership rule requires a boundary character after the phase id for
exactly this reason, and this milestone allocates ids above nine. Every
evidence path must carry the separator.

**Parallelism is ON only where a pre-pass proves phases disjoint** (CLAUDE.md
rule 5), and the pre-pass is written down before dispatch rather than asserted.
Each workstream section below carries its own. The cross-workstream rule:

| Constraint | Reason |
|---|---|
| M4-P2, M4-P3, M4-P4 are SERIAL, in that order | All three edit `src/spawn.ts`, and two of them edit the same twelve lines around the launch call site. Adjacency inside one function is where a union merge compiles and is wrong |
| M4-P5 and M4-P6 wait on M4-P4 | No adapter outside this process is reachable until selection exists (src/spawn.ts:463) |
| M4-P8 waits on nothing, and its scope SHRANK | Its premise was measured false |
| M4-P21 waits on M4-P20 | The witness is built and demonstrated red BEFORE the mechanism, per the red-witness rule's stronger form |
| Every cutover phase is last | The freeze point is DR-0036's condition lifting, and that condition is what keeps everything before it reversible |

**Merge order is dependency order even where work order is concurrent.**


## 3. Workstream 1: harness adapter

Ordered FIRST by
delivery/decisions/DR-0036-the-harness-adapter-leads-m4-and-the-kernel-is-the-second-subject.md:18.
Seven phases, M4-P1 through M4-P7. **Three are KERNEL phases, two are PLUGIN
phases, one is evidence and one spans both packages, and that split is not the
one the v1 plan predicts.**

### WS1.0 The correction this workstream exists to make

delivery/plan/kernel-plan-v1.md:211 says a further adapter is "not kernel
changes". That sentence is true as design intent and FALSE as a statement about
the shipped package, and the intake measured the ways it is false
(delivery/plan/m4-intake.md:250). A planner who budgets zero kernel work on the
strength of it loses a phase, which is hazard H-G. So this workstream states its
own shape up front:

| Phase | Kind | One line |
|---|---|---|
| M4-P1 | EVIDENCE (paperwork) | The harness probe: run the prototype, commit the captures, close four PROTOTYPE-BLOCKED decisions |
| M4-P2 | KERNEL | `launch` becomes async, and payload completion stops being assumed and becomes checked |
| M4-P3 | KERNEL | `ExecutorRequest` gains four fields, `ExecutorRecord` gains what was REQUESTED, and `executor.json` gets a schema |
| M4-P4 | KERNEL | Adapter selection: `--adapter`, fleet-home resolution, and the kernel's first public entry point |
| M4-P5 | PLUGIN | The npm workspace, the plugin manifest, and the Claude Code adapter |
| M4-P6 | PLUGIN | The turn-end hook, the tool-call observer, and status-line delivery |
| M4-P7 | MIXED (kernel + plugin) | The model-resolution record, all four parts of M4-D-06 in one pull request |

**M4-P2, M4-P3 and M4-P4 must all land before M4-P5, the first plugin phase.**
Each is a hard prerequisite and the reason is mechanical in every case:

- without M4-P2, an adapter that awaits an agent turn cannot satisfy the
  interface at src/spawn.ts:108, which returns `LaunchOutcome` and not a
  promise;
- without M4-P3, the request does not carry the brief path, and a brief is an
  agent payload's entire input (src/spawn.ts:62 has exactly seven fields and
  none of them is it);
- without M4-P4, no adapter outside this process can be reached at all:
  src/spawn.ts:463 hardcodes `options.adapter ?? subprocessAdapter`, and
  `SpawnOptions.adapter` at src/spawn.ts:273 is an in-process test seam whose
  only callers are tests.

M4-P1 gates the PROTOTYPE-BLOCKED criteria of M4-P5, M4-P6 and M4-P7, and does
NOT gate M4-P2, M4-P3 or M4-P4: those three are grounded entirely in this
repository's own source and no harness fact changes them. That is why the
probe is not on the critical path of the kernel work and can run concurrently
with it.

### WS1.1 Serialisation, declared rather than discovered

Parallelism is on where a recorded pre-pass proves the phases disjoint
(CLAUDE.md rule 5). **This workstream is mostly NOT disjoint and the pre-pass
is written here rather than asserted.** M4-P2, M4-P3 and M4-P4 all edit
src/spawn.ts, and two of them edit the same twelve lines: the launch call site
at src/spawn.ts:464 and its argument object at src/spawn.ts:465. Adjacency
inside one function is exactly where a union merge produces a tree that
compiles and is wrong.

- **Serial, in order: M4-P2, then M4-P3, then M4-P4.** Merge order equals work
  order for these three.
- **Concurrent with all of them: M4-P1**, which touches `delivery/` and
  `test/fixtures/` only.
- **Serial after M4-P4: M4-P5, then M4-P6.** M4-P6 edits the manifest M4-P5
  creates.
- **M4-P7 last**, because it is the only phase that needs both packages to
  exist.

A reader who wants this workstream faster should attack M4-P3, not the
ordering: it is the phase whose scope is most obviously divisible, and it is
deliberately NOT divided, for the reason in its own entry.

**Why three kernel phases and not one.** One pull request carrying the async
change, the field additions and the loader would make a plugin defect and a
kernel defect present identically to a reviewer, which is hazard H-A, the one
mechanism DR-0037 removed a mitigation for. Three heads cost three CI cycles
and buy three independently attributable reviews. DR-0031 is satisfied in each
case because each phase is a unit of self-contained value with a behaviour
change a consumer can observe, not a slice of one.

### WS1.2 Phase id prefixes are not free

`m4-p1` is a proper string prefix of `m4-p10`. The scope gate's
evidence-ownership rule requires a boundary character after the phase id for
exactly this reason (src/gates/scope.ts:545), so `delivery/review/clean-room-m4-p1.md`
does not become M4-P10's evidence. This is recorded because it has already
been got wrong once for `m3-p1` versus `m3-p11`, and because later workstreams
allocate ids above nine.

### M4-P1: The harness probe

> **AMENDED 2026-09-15, BEFORE DISPATCH: THIS PHASE HAS LARGELY ALREADY RUN.**
> Eight probe agents executed most of it ahead of the plan. The deliverable this
> phase describes, a verification document plus committed captures, exists at
> delivery/verification/m4-prototype-probes.md:1 with ten beacons under
> `delivery/evidence/m4-probes/`.
>
> **Answered by measurement:** question 1 (the primitive cannot impose the
> kernel's child environment; it is a denylist over the host environment, it
> fails open, and a surviving name carries a live credential), question 3 (a
> scrubbed child authenticates already, so the question dissolves and two new
> findings replace it), and the turn-end convergence (only `PreToolUse` blocks,
> so executor-writes-file and hook-reads-file is forced, which is what the
> kernel already does).
>
> **NOT answered, and these are what remains of this phase:** question 2, the
> launch-failed versus incomplete distinction under the primitive, which matters
> less now that option 1 is refuted but still bounds any future adapter;
> question 4, whether any hook can read the RESOLVED model; and one question the
> probes raised rather than closed, whether `PreToolUse` hooks fire at all under
> a bypass permission mode. **That last one is one run and it must happen before
> M4-P9 is designed**, because if they do not fire, a launch flag defeats the
> whole write-block and it must move out of hooks entirely.
>
> **Round budget stays 1.** What is left is three measurements and an amendment
> to an existing document.


- id: M4-P1
- branch: `claude/m4-p1-harness-probe`
- kind: **EVIDENCE.** It touches no shipped code. Its deliverable is a
  verification document plus committed captures.
- intent: Run the prototype the intake says was never run
  (delivery/plan/m4-intake.md:155), and close by MEASUREMENT the four
  prototype-blocked questions that this workstream's later phases depend on.
  A decision taken on any of them without this probe is a guess, and the intake
  says so rather than letting a recommendation read as a finding.
- grounding: Sixteen facts about Claude Code hooks, manifests and model
  resolution are documentation-derived and no hook has been fired
  (delivery/plan/m4-intake.md:991). Two of them are load-bearing and
  uncomfortable: that no plugin hook can read the resolved model after the
  fact, and that `Stop` and `PostToolUse` receive static JSON and cannot
  return an exit code while only `PreToolUse` blocks with exit code 2
  (delivery/plan/m4-intake.md:1001). If the second is right, the turn-end
  contract MUST be executor-writes-file and hook-reads-file, which is what the
  kernel already does at src/hooks.ts:38 and src/spawn.ts:108. The probe
  establishes whether that convergence is real.
- **This phase ships no throwaway code into the repository.** The probe
  harness is built in a scratch directory and discarded. What lands is the
  document and the captured transcripts, because a capture is re-readable and
  a scratch harness is not.
- files-to-touch: `delivery/verification/claude-code-harness-probe.md`
  (create), `test/fixtures/harness-probe/` (create: captured hook payloads,
  captured manifest load output, captured environment dumps),
  `delivery/plan/phase-declarations/m4-p1.json` (create).
- the five questions, each with the command that settles it:
  1. **Can a harness-primitive-backed adapter impose the kernel-built child
     environment?** Build a child env with `buildChildEnv` (src/exec/env.ts:180),
     launch an agent through the primitive with that env, and dump
     `process.env` from inside the agent turn. Settles half of M4-D-01.
  2. **Can it distinguish launch-failed from incomplete?** Force a launch
     failure (a nonexistent payload) and a mid-turn abandonment, and record
     what each is observable as. A NO removes the primitive option for ship
     phases entirely (delivery/plan/m4-intake.md:727).
  3. **How does a scrubbed child authenticate?** With HOME, XDG_CONFIG_HOME,
     GH_CONFIG_DIR, GIT_CONFIG_GLOBAL and GIT_CONFIG_SYSTEM redirected to
     empty harness-owned paths (src/exec/env.ts:68 lists the allowlist and the
     five redirections follow it), record what an agent turn can and cannot do.
     Settles M4-D-07's input, which workstream 2 also waits on.
  4. **Can any hook read the RESOLVED model?** Fire every hook the manifest
     admits and dump its payload. If no, the resolution record's identity half
     is a self-report and M4-P7 must be designed for that.
  5. **Does a Stop hook carry an exit code?** Dump its payload and its exit
     handling.
- acceptance criteria:
  1. `delivery/verification/claude-code-harness-probe.md` exists and answers
     each of the five questions with EITHER a captured command and its output,
     OR the sentence "not established" plus the attempt that failed and its
     output. A question answered from documentation is recorded as
     "documentation only" and is NOT counted as answered.
  2. Every answer cites a file under `test/fixtures/harness-probe/` by
     `path:line`, and every such file is a verbatim capture. No file in that
     tree is hand-written; the document states which codepoints were
     transliterated, with counts, if any capture carried non-ASCII
     (CLAUDE.md rule 3's transliterate-and-declare resolution).
  3. `node scripts/check-authored-bytes.mjs` exits 0 over the branch.
  4. The document carries a "what this probe did NOT cover" section naming the
     harness version probed, the account, and the regions the probe excluded.
     The reviewer's first check is that section (CLAUDE.md:333, item 3).
  5. For each of M4-D-01, M4-D-06(b), M4-D-07 and the M4-P5 manifest shape, the
     document states whether the probe CLOSES it, NARROWS it, or leaves it
     open, and a decision record is written for each one it closes.
  6. `node --test` exits 0 and reports N tests with N greater than 0, on the
     floor-satisfying toolchain, with `dist/` built, quoting the invocation,
     the interpreter version, the pass count AND the skipped count (standing
     warning 12).
- red witness: **this phase has no new behavior and therefore no red witness,
  and saying so is the point.** A document is not a guard. Its assurance comes
  from criterion 2: every claim resolves to a committed capture, so a later
  reader can re-run the probe and diff. A criterion asserting that the document
  "answers" the questions without that binding would be the H-B shape, a guard
  whose condition does not test the property that matters.
- hazard class: **a documentation-derived fact carried into a phase as though
  it were measured** (H-H, carrying a claim forward without re-verifying it),
  and **a probe whose scope is wrong returning an empty result** (the
  fix-round contract's item 3).

| Hazard | Reddens against |
|---|---|
| a documentation fact presented as measured | criterion 1's "documentation only" label, which is not counted as answered |
| a hand-written transcript standing in for a capture | criterion 2, which requires every answer to cite a fixture file by line |
| a probe that silently did not reach the interesting arm | criterion 4, the did-NOT-cover section, checked first |
| an answer that vanishes into chat instead of a record | criterion 5, which requires a decision record per closed question |

- PROTOTYPE-BLOCKED criteria: none. This phase IS the prototype.
- round budget: **1 round.** Zero subject (no value lines, no assurance lines;
  the whole diff is paperwork plus fixtures), and DR-0035's table gives one
  round for a zero subject at either impact. The impact is high and it does not
  buy a second round; what protects this phase is that its output is captures
  rather than claims.
- blocked-by: nothing. This is the first dispatch of M4.
- conflicts-with: nothing. It touches no file any other phase touches.

### M4-P2: `launch` becomes async, and completion becomes checked

- id: M4-P2
- branch: `claude/m4-p2-async-launch`
- kind: **KERNEL.**
- intent: Change `launch(request): LaunchOutcome` at src/spawn.ts:108 to return
  a promise, change the call site to await it, and repair the ONE invariant
  that the synchronous signature was silently carrying. M4-D-04 recommends YES
  and says this is the largest kernel-side edit the adapter implies and that it
  must be declared, not discovered (delivery/plan/m4-intake.md:730).
- grounding, and the part that is not in the intake. C-3 forbids the KERNEL
  auto-backgrounding (delivery/plan/kernel-plan-v1.md:94); awaiting a call is
  not backgrounding, and delivery/plan/kernel-plan-v1.md:311 already states in
  terms that the harness, not the kernel, owns the process. So the constraint
  is satisfied by construction. **What is NOT satisfied by construction is the
  scrub-root cleanup.** src/spawn.ts:500 carries the comment "Both children
  have exited (the launch is synchronous, C-3)" immediately above the
  `rmSync(scrubRoot(dir))` that removes the redirected HOME, XDG_CONFIG_HOME,
  GH_CONFIG_DIR and the two git config targets (src/exec/env.ts:68 and the
  five redirections below it). **That reasoning dies the moment `launch`
  returns a promise.** An adapter that resolves `completed` while its agent is
  still running makes the kernel delete a live child's HOME. Nothing in the
  kernel checks it: the `completed` arm at src/spawn.ts:90 is taken on the
  adapter's word.
- second grounding fact, also measured: **a second `runStepAsync` already
  exists and is module-private.** src/watcher.ts:840 is `runStep`'s shape for
  an async step, with `src/task.ts covers the sync one` in its own comment
  (src/task.ts:457). This phase promotes it rather than writing a third copy;
  T-005's one-mechanism rule is what makes that mandatory rather than tidy.
- files-to-touch: `src/spawn.ts` (edit), `src/task.ts` (edit: export the async
  step runner), `src/watcher.ts` (edit: consume the promoted runner, delete the
  private copy), `test/spawn.test.ts` (edit), `test/watcher.test.ts` (edit only
  if the promotion changes an observable message; verify first),
  `delivery/plan/phase-declarations/m4-p2.json` (create).
- steps:
  1. Verify, with a captured command, that `runStepAsync` at src/watcher.ts:840
     and `runStep` at src/task.ts:457 produce byte-identical reason strings for
     the same `what` and the same thrown error. If they differ, the promotion
     changes watcher output and that is an escalation, not a silent edit.
  2. Promote the async runner into `src/task.ts` beside `runStep` and have
     `src/watcher.ts` import it.
  3. Change `ExecutorAdapter.launch` to `launch(request: ExecutorRequest):
     Promise<LaunchOutcome>` and make `subprocessAdapter` (src/spawn.ts:155)
     an `async launch`. Its body stays synchronous inside; nothing about the
     subprocess path changes, and the work history says so with a diff.
  4. Change the call site at src/spawn.ts:464 to the async runner.
  5. **Add the completion precondition.** Before the `completed` arm is
     believed, the kernel reads `turnEndPath(fleet, taskId)` (src/task.ts:254).
     If the file is absent or does not parse, the outcome is rewritten to
     `incomplete` with a reason naming the adapter and the missing file, the
     scrub root is LEFT in place, and nothing is rolled back. If it parses, the
     spawn proceeds exactly as today.
  6. Update the src/spawn.ts:500 comment to state the new reasoning, because a
     comment asserting a dead invariant is how the next reader re-derives the
     defect.
- acceptance criteria:
  1. `npm run build` exits 0 and `git status` is clean afterwards.
  2. **Fabricated completion is refused (red witness 1).** A test adapter that
     returns `{kind: "completed", exitCode: 0}` WITHOUT invoking `hookPath`
     makes `spawnTask` return `ok: false` with a reason naming the adapter name
     and the absent turn-end path; the task worktree still exists; the scrub
     root still exists and still contains its five redirect targets. The same
     adapter, modified only to invoke `hookPath` with `0` first, returns
     `ok: true` with `exitCode` 0 and the scrub root is gone. **DANGEROUS
     STATE: an adapter's self-report of completion believed while the agent is
     still running, which today deletes the live agent's HOME and reports
     success.** Both directions asserted.
  3. **A turn-end file that exists but does not parse is also refused.** Same
     adapter, but it writes two bytes of garbage to the turn-end path instead
     of invoking the hook: `ok: false`, reason names the parse failure, scrub
     root preserved. This is the second structurally different member of the
     class "the kernel trusts an adapter's account of the payload", because the
     first member is an ABSENCE and this one is a PRESENT-BUT-WRONG artifact,
     and a check written as `existsSync` would pass this one green.
  4. **A rejected promise rolls nothing back (red witness 2).** A test adapter
     whose returned promise REJECTS after the payload has started makes
     `spawnTask` return `ok: false` with the existing "did not report whether
     the payload started" text (the text is built at src/spawn.ts:483; verify it
     verbatim before asserting on it), and the worktree, the task directory and
     the pool record all still exist. **DANGEROUS STATE: an unawaited
     rejection, which destroys a worktree that may hold real work, which is
     M1-P3's V-1 defect with a new cause.** The counterpart direction is NOT a
     differently-timed rejection: every rejection reaches the same arm at
     src/spawn.ts:475 whenever it happens. The counterpart is an adapter that
     RETURNS `{kind: "launch-failed"}`, which does roll back and leaves no
     worktree (src/spawn.ts:490). Those two are the structurally different
     pair, and conflating them is how a test ends up asserting the same arm
     twice.
  5. **C-3 is witnessed, not asserted.** A test adapter that resolves only
     after its payload has written a sentinel file makes `spawnTask` return
     after that sentinel exists. Asserted on file existence at the moment of
     return, never on elapsed time, because a timing assertion is a flake and
     a flake in the `suite` gate is a binary fact CI reads as red.
  6. The kernel exports exactly one async step runner: `grep -c "runStepAsync"
     src/watcher.ts` returns the import-site count only, and no function
     definition remains in that file. Captured in the work history.
  7. `test/spawn.test.ts`'s existing spawn behaviors all still resolve by name,
     derived from `test/behaviors.json` at run time and never from a pinned
     count (CLAUDE.md rule 5's append-only registry rule).
  8. `node --test` exits 0 and reports N tests with N greater than 0, quoting
     invocation, interpreter, build state, pass count and skipped count.
- new behaviors: `spawn-async-launch-awaited`,
  `spawn-completed-without-turn-end-is-incomplete`,
  `spawn-unparseable-turn-end-is-incomplete`,
  `spawn-rejected-launch-rolls-nothing-back`,
  `spawn-returns-after-payload-sentinel`.
- hazard class: **the kernel believing an adapter's self-report** (H-B, a guard
  whose condition does not test the property that matters), and **an async edit
  that becomes backgrounding** (C-3), and **a cleanup path that destroys live
  state** (H-J, the V-1 shape).

| Hazard item | Reddens against |
|---|---|
| a `completed` arm believed with no payload evidence | criterion 2, both directions |
| a completion check written as `existsSync`, green on a corrupt record | criterion 3, which is the second member of the class |
| a promise rejection that rolls back a worktree holding work | criterion 4 |
| the async change read as permission to background | criterion 5, asserted on a sentinel file rather than on time |
| a second async step runner diverging from the first | criterion 6 |
| the src/spawn.ts:500 comment left asserting the dead invariant | step 6 plus review; **no criterion covers a comment**, and that is stated rather than implied |

- PROTOTYPE-BLOCKED criteria: **none.** Every fact this phase rests on is in
  this repository's own source and was measured against it. This is why M4-P2
  does not wait for M4-P1.
- round budget: **3 rounds.** Large subject (the change spans three source
  files and the test file is the 761-line `test/spawn.test.ts`), high impact
  (the spawn rollback contract is a declared money path: it is the code path
  that can destroy a worktree holding an implementer's work, and M1-P3's V-1 is
  the recorded instance). DR-0035's table gives large plus high impact three
  rounds. The impact floor in DR-0035 forbids calling this low impact.
- blocked-by: nothing.
- conflicts-with: M4-P3 and M4-P4, both on `src/spawn.ts`. Merge order is
  M4-P2 first.

### M4-P3: The request contract widens, and `executor.json` gets a schema

- id: M4-P3
- branch: `claude/m4-p3-request-contract`
- kind: **KERNEL.**
- intent: Add the four fields M4-D-05 names (brief path, role, declared tier,
  phase id) to `ExecutorRequest`, add what was REQUESTED to `ExecutorRecord`,
  give `executor.json` a schema, and add the mechanism that makes a missing
  field a refusal instead of an `undefined` an adapter reads silently.
- grounding, measured: `ExecutorRequest` at src/spawn.ts:62 has exactly seven
  fields (`taskId`, `worktree`, `command`, `hookPath`, `recordPath`,
  `deadlineSeconds`, `env`) and none of them is the brief, although the brief
  is an agent payload's entire input. The brief IS available at the call site:
  `assembleBrief` returns its path at src/spawn.ts:400 and the path is pushed
  onto `createdFiles`. `ExecutorRecord` at src/spawn.ts:112 has three fields
  and is validated by no schema (delivery/plan/m4-intake.md:272). The CLI's
  flag parser refuses any unknown flag by falling through to `return undefined`
  (src/commands/spawn.ts:101), so adding a flag is a real edit and the
  usage string at src/commands/spawn.ts:28 moves with it.
- **The mechanism this phase adds, and why it is not just four fields.** Adding
  optional fields creates a new dangerous state: an adapter that needs the
  brief path, gets `undefined`, and launches an agent with no input. The
  kernel cannot fix that per-adapter, so the ADAPTER declares what it needs and
  the kernel refuses BEFORE it creates anything. The precedent is already in
  this repository and it is exact: src/commands/spawn.ts:81 rejects an
  unrepresentable `--deadline` at parse time with the comment "a usage error
  creates nothing", after that value used to raise inside the adapter once a
  worktree, a branch and a pool record existed. That is the same defect one
  field along.
- **Zero vendor names is a hard requirement of this phase.** The request
  carries the DECLARED TIER verbatim (`strongest`, `cheaper`, whatever
  `role-model-config.yaml` declares) and never a model. The tier-to-model
  mapping lives in the plugin and never in `src/`
  (delivery/plan/m4-intake.md:360, and the property is currently true).
  This phase does not introduce the mapping; M4-P7 does, in the plugin.
- **WHERE THIS SECTION DEPARTS FROM THE INTAKE, STATED RATHER THAN SLIPPED IN.**
  M4-D-05 recommends adding all of the new fields "in ONE kernel phase up
  front", and its question text lumps `ExecutorRecord`'s RESOLVED MODEL into
  that list (delivery/plan/m4-intake.md:731). This section splits it: the
  REQUESTED half lands here and the RESOLVED half lands in M4-P7. The reason is
  that the two intake recommendations are in tension and one of them has to
  give. `executor.json` is written BEFORE the payload starts, which is the
  whole basis of the launch-failed-versus-incomplete distinction
  (src/spawn.ts:112 and the comment above the write at src/spawn.ts:155
  region), while M4-D-06 part (b) requires the resolution record at TURN END
  because a harness that requests one model and is served another resolves
  mid-turn (delivery/plan/m4-intake.md:732). A resolved model in the launch
  record would therefore be a field nobody could populate honestly. M4-D-05's
  ACTUAL concern, which this split preserves, is that the fields should not
  arrive one per discovered need; they arrive in two phases, each for a stated
  structural reason, not four.

- **The phase id is CARRIED, never DERIVED.** The scope gate derives a phase id
  from the branch name (CLAUDE.md's branch-names section), and M4-D-22 leaves
  open whether that convention is the kernel's or the project's. A kernel that
  derived the phase id from a branch would settle M4-D-22 by accident, which is
  how a shipped constant becomes an un-renumberable decision.
- files-to-touch: `src/spawn.ts` (edit), `src/commands/spawn.ts` (edit: three
  flags and the usage string), `schemas/executor-record.schema.json` (create),
  `src/validate.ts` (edit: register the type in the `--type` table and the
  `auto` resolver, mirroring M3-P1 step 10 and M3-P2 step 6),
  `test/spawn.test.ts` (edit), `test/schemas.test.ts` (edit),
  `package.json` (edit: nothing, `schemas` is already in `files` at
  package.json:17; VERIFY this and record the check rather than assuming it),
  `delivery/plan/phase-declarations/m4-p3.json` (create).
- acceptance criteria:
  1. `ExecutorRequest` carries `briefPath: string`, and `role`, `declaredTier`
     and `phaseId`, each `string | undefined`. `briefPath` is NOT optional:
     `assembleBrief` has already produced it by the time the request is built,
     so an optional one would be an optionality the kernel never exercises,
     which is a field that cannot go red.
  2. **A declared requirement that is unmet creates nothing (red witness 1).**
     `ExecutorAdapter` gains `readonly requires: readonly string[]`. An adapter
     declaring `requires: ["role"]` spawned WITHOUT `--role` makes `tiphys
     spawn` exit nonzero naming the adapter and the field, and afterwards:
     `tasks/<id>/` does not exist, `git worktree list` is unchanged, `git
     branch --list` is unchanged, and no pool record exists. All four asserted,
     because "exited nonzero" is compatible with having created three of them.
     **DANGEROUS STATE: a missing required field discovered inside the adapter,
     after a worktree, a branch and a pool record exist, which is the measured
     `--deadline` defect at src/commands/spawn.ts:81 with a new field.** The
     other direction: the same adapter with `--role` supplied reaches launch.
  3. **A requirement naming a field that does not exist is refused at load, not
     at launch (red witness 1, second member).** An adapter declaring
     `requires: ["modelName"]` is refused with a reason naming the unknown
     field, and the refusal happens before anything is created. This is
     structurally different from criterion 2 because criterion 2's field exists
     and is absent, while this one's field is not in the contract at all, and a
     check written as `request[name] === undefined` would pass this one green:
     an unknown key also reads `undefined`.
  4. `tiphys validate --type executor-record <file>` exits 0 on a record
     `subprocessAdapter` actually wrote (captured from a real spawn, not
     hand-written), and exits nonzero naming the field on a record missing
     `adapter`.
  5. **Kind A dangerous-instance witness on the schema.** The schema's
     `additionalProperties: false` is removed, a record carrying an
     undeclared `model` field is accepted, and the keyword is restored and the
     same record refused. The dangerous state is a future adapter smuggling a
     vendor model name into the launch record, which is the property M4-P7
     relies on, and this criterion is what makes it checked rather than
     asserted.
  6. `ExecutorRecord` carries `requestedTier` and `requestedRole` copied
     VERBATIM from the request, and a test asserts byte equality between the
     flag value and the recorded value. It carries no resolved model: the
     record is written BEFORE the payload starts (src/spawn.ts:112 region and
     the comment above the write), so a resolved model here would be a value
     nobody could have observed. M4-P7 carries the resolved half.
  7. `grep -rniE '<the eleven vendor tokens named in the intake>' src/ bin/
     schemas/ roles/ *.yaml` returns the same four hits as before this phase,
     and the count is asserted by a TEST rather than by a grep in a work
     history, so a later edit reddens. The test derives the token list from a
     single declared constant, and the constant is cited in the work history.
  8. Every pre-existing `spawn-*` behavior in `test/behaviors.json` still
     resolves by name. Counts are derived at run time, never pinned.
  9. `npm run build` exits 0, `git status` clean, and `node --test` exits 0
     reporting N tests, N greater than 0, with invocation, interpreter, build
     state, pass count and skipped count quoted.
- new behaviors: `spawn-request-carries-brief-path`,
  `spawn-adapter-requirement-unmet-creates-nothing`,
  `spawn-adapter-requirement-unknown-field-refused`,
  `executor-record-validates`,
  `executor-record-rejects-undeclared-fields`,
  `executor-record-echoes-requested-tier`,
  `kernel-carries-no-vendor-model-names`.
- hazard class: **a widened contract whose new fields are read as `undefined`
  and proceed** (H-B), **a refusal that arrives after state exists** (H-J, the
  V-1 family), and **a vendor name entering `src/` and closing off every other
  harness** (H26 as the intake numbers it, inside mechanism H-D: a property
  asserted in prose and checked by nobody).

| Hazard item | Reddens against |
|---|---|
| a required field absent and the adapter proceeding | criterion 2, with all four post-conditions asserted |
| a requirement check that cannot distinguish absent from unknown | criterion 3, the second member |
| an unvalidated `executor.json` | criteria 4 and 5 |
| a vendor model name reaching `src/` | criterion 7, as a test rather than a prose promise |
| the phase id derived from the branch, settling M4-D-22 by accident | criterion 1's `phaseId` being carried; **and no criterion can catch a future derivation**, so the plan records it as a review checklist item instead of claiming coverage |

- PROTOTYPE-BLOCKED criteria: **none.**
- round budget: **2 rounds.** Small subject (four fields, one new schema, one
  refusal path; the schema and the validator registration are both established
  patterns with two prior instances to copy), high impact (it changes a
  published interface and it is on the path that creates worktrees). DR-0035's
  small-plus-high cell is two rounds.
- blocked-by: M4-P2 merged.
- conflicts-with: M4-P4 on `src/spawn.ts` and `src/commands/spawn.ts`. Merge
  order M4-P3 then M4-P4.

### M4-P4: Adapter selection, and the kernel's first public entry point

- id: M4-P4
- branch: `claude/m4-p4-adapter-selection`
- kind: **KERNEL.**
- intent: Make the executor seam reachable from outside the process. Add
  `--adapter <specifier>` to `tiphys spawn` with a fleet-home default, resolve
  it FROM THE FLEET HOME and never from the project clone, and give
  `@tiphys/kernel` an `exports` map so a separately published package can
  import the interface at all. M4-D-03 recommends exactly this
  (delivery/plan/m4-intake.md:729).
- grounding, measured: `grep -rn '"--adapter"' src/ bin/` exits 1;
  `grep -rn adapter src/cli.ts bin/tiphys.ts` exits 1;
  src/spawn.ts:463 is `const adapter = options.adapter ?? subprocessAdapter;`
  and the only callers that pass one are tests
  (delivery/plan/m4-intake.md:250). Separately, package.json:14 declares
  `bin` and the file declares no `main`, no `exports` and no `types`, and there
  is no `src/index.ts`, so a separately published plugin cannot import
  `ExecutorAdapter` today. These two facts are one phase because either alone
  delivers nothing: a flag with no importable type, or a type nothing can
  select, and the grounding above carries the exit-1 grep behind each half.
- **The trust boundary is the whole design, and it is the reason this is not a
  ten-line change.** Loading an adapter means executing third-party code inside
  the orchestrator process. DR-0029 Part 2c's untrusted-project-content
  boundary does not exist (delivery/plan/m4-intake.md:221) and M4-D-23
  recommends it is not built in M4. So the mitigation available is the
  RESOLUTION ROOT: the fleet home pins `@tiphys/kernel` exactly and is
  owner-controlled; the project clone is the thing under review and may contain
  anything a contributor pushed. Resolving from the fleet home is not a
  preference, it is the only thing standing between a pull request and
  arbitrary code in the merge-authority process.
- files-to-touch: `src/spawn.ts` (edit), `src/commands/spawn.ts` (edit),
  `src/adapters/load.ts` (create: the loader), `src/index.ts` (create: the
  public entry point), `package.json` (edit: `exports`, `types`, and `dist` is
  already in `files` at package.json:17), `tsconfig.src.json` (edit only if the
  entry point requires it; verify first), `test/spawn.test.ts` (edit),
  `test/adapter-load.test.ts` (create),
  `delivery/plan/phase-declarations/m4-p4.json` (create).
- acceptance criteria:
  1. `tiphys spawn --adapter <specifier> ...` resolves the specifier with Node
     module resolution rooted at the FLEET HOME. Witnessed by a real spawn
     against a scratch fleet, with the loaded adapter's `name` appearing in
     `tasks/<id>/executor.json`.
  2. **The project clone is not a resolution root (red witness 1).** A scratch
     fleet whose PROJECT CLONE contains `node_modules/evil-adapter` and whose
     FLEET HOME does not: `tiphys spawn --adapter evil-adapter` exits nonzero
     naming the fleet home as the resolution root, creates no task directory,
     and the module is never evaluated. The last clause is asserted by having
     the module write a sentinel file on import and asserting the sentinel does
     not exist, because "resolution failed" and "resolved and then rejected"
     are different facts and only the first is safe. **DANGEROUS STATE: a
     project clone under review supplying the code that runs in the
     orchestrator's own process.**
  3. **Both roots present, the fleet home wins (red witness 1, second member,
     and the SILENT one).** Same scratch fleet, but `evil-adapter` exists in
     BOTH trees with different `name` values. The spawn succeeds and
     `tasks/<id>/executor.json` carries the FLEET HOME copy's name. This is
     structurally different from criterion 2 because criterion 2 fails loudly
     and this one would succeed silently against the wrong module; a loader
     that merely added the fleet home to a search path would pass criterion 2
     and fail this one.
  4. **A module that is not an adapter is refused before anything is created.**
     Three shapes, each asserted: a module with no default export; a module
     exporting an object with no `launch`; a module exporting `launch` as a
     non-function. Each exits nonzero naming the specifier and the missing
     member, and afterwards no task directory, no worktree, no branch and no
     pool record exists. Same four post-conditions as M4-P3 criterion 2, same
     reason.
  5. **An adapter claiming the name `subprocess` is refused.** The launch
     record's `adapter` field (src/spawn.ts:113) is the only thing that says
     what ran, and a loaded adapter that names itself after the built-in one
     makes every later record ambiguous. This is the misattribution guard the
     release record already instantiates at
     src/gates/schemas/release-record.schema.json:26, applied one layer down.
  6. **The default is explicit in the record, not silent.** With no `--adapter`
     and no fleet-home field, the spawn proceeds on `subprocessAdapter` and the
     record says `subprocess`; with a fleet-home `package.json` field and no
     flag, the record names the field's adapter; with both, the FLAG wins and
     the work history quotes both records. Three arms, one assertion each.
  7. `@tiphys/kernel` exposes `ExecutorAdapter`, `ExecutorRequest`,
     `ExecutorRecord` and `LaunchOutcome` through `exports`, and a test that
     imports them from the PACKAGE NAME (not a relative path) against the built
     `dist/` exits 0. That test is floor-gated and skips without `dist/`, and
     its skip message names the dist entry it wanted, matching the nine
     existing dist-dependent tests (standing warning 12).
  8. **The `exports` map does not widen the package.** `src/spawn.ts`'s
     internals, `src/exec/env.ts` and `src/task.ts` are NOT reachable through
     the package name; a test importing one of them by package subpath fails.
     The dangerous state is an `exports` map written as `"./*": "./dist/src/*"`,
     which satisfies criterion 7 and publishes the entire kernel as API.
  9. `npm run build` exits 0, `git status` clean afterwards, `npm ci` exits 0
     against the lockfile, and `node --test` exits 0 reporting N tests, N
     greater than 0, with the complete four-part sentence.
- new behaviors: `spawn-adapter-flag-resolves-from-fleet-home`,
  `spawn-adapter-project-clone-not-a-root`,
  `spawn-adapter-fleet-home-wins-over-project`,
  `spawn-adapter-shape-refused-creates-nothing`,
  `spawn-adapter-name-collision-refused`,
  `spawn-adapter-default-recorded-explicitly`,
  `kernel-exports-executor-types`,
  `kernel-exports-do-not-widen-package`.
- hazard class: **untrusted code loaded into the authority process** (the
  absent DR-0029 Part 2c boundary), **a resolution that silently prefers the
  wrong root** (H-B), and **a published surface widened by accident and
  un-narrowable afterwards** (a semver commitment is not reversible in a patch
  release).

| Hazard item | Reddens against |
|---|---|
| project-clone code executed in the orchestrator process | criterion 2, asserted on a sentinel that proves non-evaluation |
| a search path that finds the project copy when both exist | criterion 3, the silent member |
| a malformed module discovered after a worktree exists | criterion 4, four post-conditions |
| a loaded adapter impersonating the built-in one | criterion 5 |
| the default adapter being invisible in the record | criterion 6, three arms |
| an `exports` map that publishes the whole kernel | criterion 8 |
| **the loader's own supply chain (a legitimate fleet-home adapter that is later compromised)** | **NO CRITERION.** This phase moves the boundary to the fleet home and does not defend inside it. Stated rather than implied, and it is the residue M4-D-23 leaves open |

- PROTOTYPE-BLOCKED criteria: **none for the loader.** Criterion 7's exact
  `exports` shape is informed by M4-P5's packaging work but is not blocked by
  it: the kernel's own test imports by package name against `dist/`, which
  needs no plugin.
- **Release note, and it is an open question rather than a decision here.**
  Adding `exports` is a public API commitment and therefore a release.
  Workstream 2's M4-D-08 also recommends a 0.2.0 for the verdict schema. Two
  workstreams each cutting a minor release is worse than one. Recommendation:
  ONE 0.2.0 cut after the last kernel API phase of workstreams 1 and 2, with
  this phase landing the `exports` map unreleased. The plan's release section
  decides it; this phase must not decide it alone.
- round budget: **3 rounds.** Large subject (a new loader module, a new entry
  point, a packaging change, and edits to two existing modules), high impact
  (it is the trust boundary for executing third-party code in the process that
  holds delegated merge authority under DR-0012, and a packaging commitment
  that a patch release cannot take back). Large plus high is three.
- blocked-by: M4-P3 merged.
- conflicts-with: nothing after M4-P3 merges. It is the last kernel phase in
  `src/spawn.ts` for this workstream.

### M4-P5: The plugin workspace, the manifest, and the Claude Code adapter

- id: M4-P5
- branch: `claude/m4-p5-plugin-workspace`
- kind: **PLUGIN.** The first one.
- intent: Create `@tiphys/claude-code-plugin` as a second npm package in this
  repository per
  delivery/decisions/DR-0040-the-plugin-is-a-second-package-in-the-kernel-repository.md:1,
  ship its plugin manifest, and ship the adapter that implements
  `ExecutorAdapter` over Claude Code.
- grounding, measured: the package does not exist in any form. `git ls-files |
  grep -ci plugin` returns 0 and `grep -n workspaces package.json` exits 1
  (delivery/plan/m4-intake.md:239). The only occurrence of the name
  anywhere in the tree is a comment recording DR-0008's scope reservation at
  src/commands/init.ts:16. So this phase starts from an empty directory, and
  every packaging fact below is a fact about THIS repository's existing
  configuration, not a generic npm fact.
- **Four packaging traps, each measured, each of which turns a "just add a
  workspace" into a phase.**
  1. **The test script does not see a second package.** package.json:36 is
     `node --test "test/**/*.test.ts"`, and the `suite` gate runs that script
     rather than a pattern of its own (CLAUDE.md standing warning 12's third
     axis). Plugin tests placed under `plugin/test/` would NOT run, and the
     suite would stay green while the new package is untested. Either the
     plugin's tests live under the existing `test/` tree or the script changes,
     and if the script changes, the suite count changes and the four-part
     sentence has to be re-established.
  2. **The plugin must not ship inside the kernel tarball.** package.json:17's
     `files` array admits `dist` and a list of named trees. A plugin directory
     that lands inside `dist/` through the build would be published as part of
     `@tiphys/kernel`.
  3. **The build is a two-project `tsc -b`** (package.json:33). A third project
     needs its own tsconfig and a reference, and standing warning 2 (never
     remove `"types": ["node"]`) and standing warning 4 (TS2878 on literal
     relative imports across a project reference) both bite here.
  4. **`npm ci` installs exactly the lockfile** (binding convention 2). Adding
     a workspace rewrites `package-lock.json`, and `scripts/license-gate.mjs`
     walks production packages.
- files-to-touch: `plugin/package.json` (create), `plugin/tsconfig.json`
  (create), `plugin/src/adapter.ts` (create), `plugin/src/index.ts` (create),
  the plugin manifest under `plugin/` (create; its exact filename comes from
  M4-P1's probe), `package.json` (edit: `workspaces`, and VERIFY `files` still
  excludes the plugin), `package-lock.json` (edit, generated),
  `tsconfig.src.json` (edit: project reference), `test/plugin-package.test.ts`
  (create), `test/plugin-adapter.test.ts` (create),
  `delivery/plan/phase-declarations/m4-p5.json` (create).
- acceptance criteria:
  1. `npm ci` at the repository root exits 0 with no EBADENGINE line on the
     floor-satisfying toolchain, and installs both workspaces.
  2. `npm run build` exits 0 and `git status` is clean afterwards, with the
     plugin compiled through its own project reference.
  3. **The plugin is not in the kernel tarball (red witness 1).** `npm pack
     --dry-run` in the repository root lists no path under the plugin
     directory. **DANGEROUS STATE: the plugin published as part of
     `@tiphys/kernel`, which makes two packages one and makes DR-0040's whole
     point false.** The other direction: `npm pack --dry-run` inside the plugin
     workspace DOES list the adapter and the manifest.
  4. **The plugin's tests run under the gate's own invocation (red witness 1,
     second member, and the SILENT one).** A deliberately failing assertion
     placed in a plugin test makes `npm test` exit nonzero. This is
     structurally different from criterion 3 because criterion 3 is about what
     is published and this one is about what is EXECUTED, and a repository can
     satisfy the first while the second is vacuously green. **DANGEROUS STATE:
     a second package whose suite never runs, so the `suite` gate is green and
     asserted nothing about it, which is hazard H-C one package over.** The
     failing assertion is removed afterwards and the work history quotes both
     exit codes.
  5. **The suite's four-part sentence is re-established on this head.**
     Interpreter version, build state, invocation and pass-plus-skipped counts,
     for BOTH `npm test` and a bare `node --test` from the repository root,
     because those two already disagree by two tests on this repository and the
     disagreement is a fixture at the root (standing warning 12). If this phase
     changes either number, it names the tests that moved.
  6. The plugin imports `ExecutorAdapter` from the PACKAGE NAME
     `@tiphys/kernel`, never by a relative path into `../src/`. Asserted by a
     test that greps the plugin's compiled output for `../src` and expects
     zero hits. A relative import would work inside the workspace and break
     for every consumer who installs the two packages from npm. I did not find
     a way to make this repository's own suite surface that, which is why the
     criterion asserts on the COMPILED OUTPUT rather than on a passing test.
  7. **The adapter implements the interface and nothing else.** Its module
     exports satisfy `ExecutorAdapter`, its `name` is not `subprocess`
     (M4-P4 criterion 5), and it declares `requires` (M4-P3 criterion 2).
  8. **The adapter writes its launch record BEFORE the payload starts**, and a
     test that makes the record write fail observes `launch-failed` and not
     `incomplete`. **DANGEROUS STATE: the two outcome arms transposed, so a
     launch that never happened authorizes nothing and a launch that did
     authorizes a rollback. Only `launch-failed` authorizes rollback
     (src/spawn.ts:90).** This is the V-1 defect's contract and it is the one
     thing a new adapter is most likely to get wrong.
  9. **The end-to-end criterion, phrased as a command, and it is the one the
     intake calls the single most important.** A real `tiphys spawn --adapter
     @tiphys/claude-code-plugin` against a scratch fleet produces
     `tasks/<id>/turn-end` for BOTH a zero and a nonzero payload exit code. A
     unit test against the interface does not discharge this: the measured
     defect is precisely that the seam is unreachable from the CLI.
  10. `node --test` exits 0 and reports N tests with N greater than 0.
- new behaviors: `plugin-package-not-in-kernel-tarball`,
  `plugin-tests-run-under-npm-test`,
  `plugin-imports-kernel-by-package-name`,
  `plugin-adapter-satisfies-interface`,
  `plugin-adapter-record-before-payload`,
  `plugin-adapter-launch-failure-is-launch-failed`,
  `plugin-spawn-writes-turn-end-both-exit-codes`.
- hazard class: **a second package that is packaged, built or tested by
  nothing** (H-C, a green bundle over a gate that asserted nothing), **an
  adapter that transposes the two outcome arms** (H-J, the V-1 family), and
  **an import that works here and breaks for every consumer** (H-K, measuring
  the wrong configuration).

| Hazard item | Reddens against |
|---|---|
| the plugin published inside the kernel tarball | criterion 3, both directions |
| the plugin's suite never executed | criterion 4, the silent member |
| a suite count that moved and nobody noticed | criterion 5, both invocations |
| a relative import that only works in the monorepo | criterion 6 |
| `launch-failed` and `incomplete` transposed | criterion 8 |
| the seam still unreachable from the CLI | criterion 9, a real spawn, both exit codes |
| **the agent failing to create `.git/index.lock` in its own worktree** | **NO CRITERION HERE.** Measured on the macOS pilot (delivery/verification/macos-portability-pilot-lifecycle.md:127) and it is an ENVIRONMENT property, not a plugin property. M4-P1's probe question 3 records it; if the probe finds it reproducible, a criterion is added to this phase at dispatch rather than at plan time |

- **PROTOTYPE-BLOCKED criteria: 7, 8, 9, and the manifest's filename and shape
  in files-to-touch.** All of them depend on facts about Claude Code that are
  documentation-derived today (delivery/plan/m4-intake.md:991). The prototype
  is M4-P1. Specifically: whether the adapter is primitive-backed, subprocess,
  or hybrid is M4-D-01 and it changes criterion 8's failure injection; whether
  a launch failure is distinguishable from an abandonment at all is M4-P1
  question 2 and a NO to it makes criterion 8 unsatisfiable as written, which
  would be an escalation to the orchestrator, not a relaxation by the
  implementer.
- round budget: **3 rounds.** Large subject (a new package, a new build
  project, a new adapter, packaging changes to a published package, and a
  lockfile), high impact (it is the first code that runs an agent under kernel
  control, and criterion 8 sits on the rollback contract). Large plus high is
  three. At the cap, DR-0016 applies: a fresh implementer and a third review
  contract, not a fourth round.
- blocked-by: **M4-P2, M4-P3 and M4-P4 all merged**, and M4-P1 merged for the
  prototype-blocked criteria.
- conflicts-with: M4-P6 (edits this phase's manifest), M4-P7 (adds to this
  phase's adapter), and workstream 2's write-block phase, which lands a second
  hook INTO the manifest this phase creates.

### M4-P6: The turn-end hook, the tool-call observer, and status-line delivery

- id: M4-P6
- branch: `claude/m4-p6-plugin-hooks`
- kind: **PLUGIN.**
- intent: Ship the plugin's hooks. Clause 3 of M4's paragraph names two:
  the project-write block and the turn-end signal
  (delivery/plan/kernel-plan-v1.md:368). This phase ships the turn-end half in
  full, ships the `PreToolUse` half as an OBSERVER that blocks nothing, and
  delivers the status line that M3 built the transport for.
- **Why the second hook ships as an observer, and this is a plan decision that
  should be argued with if it is wrong.** The write block is workstream 2's
  (SC-010's carve-out, D-8's working-tree-versus-refs line). A `PreToolUse`
  hook shipped here with no carve-out would either refuse the orchestrator's
  own merge path, or permit everything, and the second is a guard that cannot
  go red, which is the single mechanism this repository has paid for six times
  (H-B, H-D). So this phase ships the PLUMBING with no policy: the hook records
  every tool call's target path and blocks nothing, and it makes no safety
  claim at all. That gives workstream 2 a corpus of REAL captured hook payloads
  to write its red witnesses against, which the red-witness rule requires
  ("assertions must include real captured output from that program, not
  hand-written strings"). Workstream 2 adds the policy and the exit code 2.
- **C-1 binds the observer's output.** `tasks/<id>/tool-calls.jsonl` is
  append-only and is EVIDENCE, never state. Nothing in the kernel or the plugin
  reads current state from its tail. This is written into the file's own header
  comment and asserted by criterion 6.
- grounding: the kernel's turn-end hook is generated at src/hooks.ts:38, takes
  the payload exit code as its single argument, and exits 64 if the argument is
  not an integer (the generated script's own guard). The kernel's shipped
  adapter converts a signal death to `128 + signal` so the record always
  carries a number (src/spawn.ts:155 region, `payloadExitCode`). A new adapter
  that omits that conversion passes a non-integer and gets exit 64, which
  `spawnTask` surfaces as `incomplete` with a hook-failed reason, not as the
  true outcome. The status-line emitter exists at src/status.ts:98 and writes
  under `state/status/`; M3 shipped transport, schema and emitter and deferred
  DELIVERY to M4, which the intake assigns to this workstream at
  delivery/plan/m4-intake.md:685.
- files-to-touch: `plugin/src/hooks/turn-end.ts` (create),
  `plugin/src/hooks/tool-call-observer.ts` (create),
  `plugin/src/status.ts` (create), the plugin manifest (edit: declare the
  hooks), `plugin/src/adapter.ts` (edit: wire the turn-end invocation),
  `test/plugin-hooks.test.ts` (create),
  `test/fixtures/plugin-hook-payloads/` (create: real captured payloads from
  M4-P1), `delivery/plan/phase-declarations/m4-p6.json` (create).
- acceptance criteria:
  1. **The turn-end exit code is always an integer (red witness 1).** An agent
     turn that ends without an exit code (killed, abandoned, or ended by the
     harness) makes the adapter invoke `hookPath` with an integer, and
     `tasks/<id>/turn-end` parses with a numeric `exitCode`. **DANGEROUS STATE:
     a non-integer passed to the generated hook, which exits 64, which
     `spawnTask` reports as "the turn-end record could not be written" and
     therefore as `incomplete`, hiding the real outcome behind a hook failure.**
     Witnessed by driving the adapter with a turn that has no exit code and
     asserting the parsed record.
  2. **Second member of the same class, structurally different:** a turn that
     ends by SIGNAL produces `128 + signal`, matching the kernel adapter's own
     convention, asserted against a captured value rather than a hand-written
     one. The first member is an ABSENT code and this one is a PRESENT
     non-numeric one, and a fix written as `code ?? 0` passes the first and
     silently reports success for the second.
  3. **The hook is invoked by the ADAPTER, not by a Stop hook.** Asserted by
     construction and by a test: a `Stop` hook receives static JSON and cannot
     return an exit code (delivery/plan/m4-intake.md:1001), so a design that
     routed the exit code through it would have no code to route. The test
     asserts the turn-end file's `endedAt` is written by the process the
     adapter spawned, by comparing the recorded path against the adapter's own
     invocation log.
  4. **The observer blocks nothing (red witness 2).** With the observer
     installed, a tool call that writes into the project clone SUCCEEDS, and
     `tasks/<id>/tool-calls.jsonl` gains one line naming the tool and the
     target path. **DANGEROUS STATE: an observer that accidentally blocks,
     which would break the orchestrator's own merge path and get switched off
     in the first hour, which is hazard H-D exactly.** Both directions: the
     observer removed, the same tool call still succeeds and no line is
     appended.
  5. **The observer's record is a capture, not a summary.** Each line carries
     the hook payload verbatim plus a receipt timestamp, and a test asserts
     round-trip equality against a fixture captured in M4-P1. A summarised
     record would be useless as workstream 2's red-witness corpus, which is the
     only reason this observer exists.
  6. **Nothing reads state from the log (C-1).** `grep -rn "tool-calls" src/
     plugin/src/` shows the append site and no read site, and the assertion is
     a test over the compiled output rather than a grep in a work history.
  7. **Status lines are delivered and are valid.** An agent turn emits at least
     one status record through `emitStatus` (src/status.ts:98), `tiphys
     validate --type status-line` exits 0 on each emitted record, and
     `state/status/current.json` reflects the last state while
     `state/status/stream.jsonl` holds the history. A test asserts that
     `current.json` is the read path and the stream is not (C-1 again).
  8. **Status delivery does not fail the turn.** A status emit that fails
     (target directory removed) leaves the turn's outcome unchanged and the
     turn-end record still written. **DANGEROUS STATE: telemetry that can fail
     a delivery.** Both directions asserted.
  9. `npm run build` exits 0, `git status` clean, `node --test` exits 0
     reporting N tests, N greater than 0, with the four-part sentence.
- new behaviors: `plugin-turn-end-always-integer-exit-code`,
  `plugin-turn-end-signal-convention`,
  `plugin-turn-end-invoked-by-adapter`,
  `plugin-observer-blocks-nothing`,
  `plugin-observer-records-payload-verbatim`,
  `plugin-observer-log-never-read-as-state`,
  `plugin-status-line-delivered-and-valid`,
  `plugin-status-failure-does-not-fail-turn`.
- hazard class: **a hook that cannot go red or that goes red at the wrong
  time** (H-B and H-D), **state read from a log tail** (C-1), and **an outcome
  hidden behind a plumbing failure** (the `incomplete` arm absorbing a real
  exit code).

| Hazard item | Reddens against |
|---|---|
| a non-integer exit code surfacing as a hook failure | criterion 1 |
| a `?? 0` fix that reports success for a signal death | criterion 2, the second member |
| an exit code routed through a hook that has none | criterion 3 |
| an observer that blocks and breaks the merge path | criterion 4, both directions |
| a summarised observer record, useless to workstream 2 | criterion 5, round-trip against a real capture |
| current state read from the append-only stream | criteria 6 and 7 |
| telemetry failing a delivery | criterion 8, both directions |
| **a policy quietly added to the observer in this phase** | **NO CRITERION, and it is a SCOPE rule instead**: the write block is workstream 2's and a `PreToolUse` returning exit code 2 from this phase's files is a scope-audit failure, not a test failure |

- **PROTOTYPE-BLOCKED criteria: 1, 2, 3, 4 and 5.** All five depend on what a
  Claude Code hook actually receives and what an agent turn actually reports
  when it ends without an exit code. The prototype is M4-P1, questions 2, 4 and
  5, and the fixture corpus criterion 5 round-trips against is M4-P1's output.
  **If M4-P1 finds that no hook fires at turn end at all**, criterion 3's
  design is unaffected (the adapter invokes the kernel hook from outside) but
  criteria 4 and 5 lose their host, and that is an escalation.
- round budget: **2 rounds.** Small subject (three small modules and a manifest
  edit; the kernel side is already built and the hook contract is fixed by
  src/hooks.ts:38), high impact (the turn-end record is the watcher's wake
  signal and a wrong exit code here misreports every delivery). Small plus high
  is two.
- blocked-by: M4-P5 merged, M4-P1 merged.
- conflicts-with: M4-P7 (edits `plugin/src/adapter.ts`), workstream 2's
  write-block phase (edits the manifest and adds policy to the observer's
  hook).

### M4-P7: The model-resolution record, all four parts

- id: M4-P7
- branch: `claude/m4-p7-model-resolution`
- kind: **MIXED.** A kernel schema and consumer, a plugin writer and
  vocabulary, in ONE pull request because the four parts of M4-D-06 are one
  unit of value and DR-0031 requires a pull request to be exactly that. A
  schema with no writer asserts nothing; a writer with no consumer is a file
  nobody reads.
- intent: Deliver M4-D-06's four parts (delivery/plan/m4-intake.md:732):
  shape, timing, vocabulary ownership, and location. Discharge the
  charter-override resolver for R-075 that `role-model-config.yaml` reserves
  for the harness adapter.
- grounding, measured: no model-resolution record of any kind exists. A grep
  over `src/`, `schemas/`, `roles/`, `scripts/`, `templates/` and the three
  root YAML files for `resolved-model|model-resolution|resolvedModel|resolved-tier`
  exits 1 (delivery/plan/m4-intake.md:269). The shape to instantiate
  already exists: src/gates/schemas/release-record.schema.json:26 requires the
  verbatim subject echo as a misattribution guard, and the absent-record rule
  is already in code at src/gates/release.ts:609, where an adapter exiting 0
  with no response record is ERROR and never success.
- **The uncomfortable fact this phase is designed around.** The intake's own
  uncertainty section says no plugin hook can read the resolved model after the
  fact (delivery/plan/m4-intake.md:991). If that survives M4-P1, the resolved
  IDENTITY is a self-report and cannot be made an observation by wanting it to
  be. The record is therefore split, exactly as M4-D-06 recommends: the
  override CONDITION is observable from the environment and is recorded as
  observed; the resolved IDENTITY is recorded with its provenance stated. A
  record that claims `observed` without carrying the observation is rejected by
  the schema. **That is the difference between a design that survives either
  answer and one that quietly launders a self-report into a measurement.**
- files-to-touch: `schemas/model-resolution.schema.json` (create),
  `src/validate.ts` (edit: type table and `auto` resolver),
  `src/model-resolution.ts` (create: the kernel-side reader and the
  cross-vocabulary refusal), `plugin/src/model-resolution.ts` (create: the
  writer), `plugin/src/vocabulary.ts` (create: the family vocabulary, which is
  where vendor names are ALLOWED to live), `plugin/src/adapter.ts` (edit),
  `test/model-resolution.test.ts` (create),
  `delivery/plan/phase-declarations/m4-p7.json` (create).
- acceptance criteria:
  1. **(a) SHAPE.** `tiphys validate --type model-resolution <file>` exits 0 on
     a record the plugin actually wrote and nonzero, naming the field, on each
     of: a missing subject echo, a subject echo that does not match the request
     field by field, and an absent `vocabulary` identity. The subject echo is
     compared field by field BEFORE the outcome is read, mirroring
     src/gates/schemas/release-record.schema.json:26.
  2. **(b) TIMING.** The record is written at TURN END and not at launch, and
     a test asserts its `writtenAt` is at or after the turn-end record's
     `endedAt`. **DANGEROUS STATE: a record written at launch, which can only
     carry what was REQUESTED and is therefore a restatement of the request
     wearing the word "resolved". A harness that requests one model and serves
     another under load resolves mid-turn, and a launch-time record cannot see
     it.**
  3. **(c) VOCABULARY, and the kernel refuses to compare across one.** Two
     records carrying different `vocabulary.id` values make the kernel-side
     reader REFUSE to compare them, with a reason naming both ids; two records
     carrying the same id compare. **DANGEROUS STATE: two records from
     different vendor vocabularies compared as though their family tokens meant
     the same thing, which would make `check-dual-review`'s decorrelation
     assertion meaningless in exactly the environment DR-0038 exists for.**
  4. **(c) continued: no vendor name enters `src/`.** The test added in M4-P3
     criterion 7 still passes at this head, and the vocabulary lives entirely
     in `plugin/src/vocabulary.ts`. A test asserts the kernel-side reader never
     dereferences a vocabulary's CONTENT, only its identity. **DANGEROUS
     STATE: a tier-to-model or model-to-family mapping in `src/`, which breaks
     the property that makes a Codex or Cursor plugin possible at all.**
  5. **(d) LOCATION and the absent-record rule.** The record is adapter-written
     in the fleet home under `tasks/<id>/`, never inside the worktree
     (src/task.ts:31). An adapter that exits 0 with NO record makes the
     consumer report ERROR, never green and never not-applicable, and the
     assertion is against the text src/gates/release.ts:609 already produces
     rather than a second implementation of the rule.
  6. **Provenance cannot be laundered (red witness, and the class needs two
     members).** Member one: a record with `resolved.provenance: "observed"`
     and no observation field is rejected by the schema. Member two: a record
     with `resolved.provenance: "observed"` and an observation field whose
     value contradicts the echoed request is rejected by the reader. The first
     is a missing field and the second is a present-but-inconsistent one, and
     a schema-only guard passes the second green.
  7. **The charter override is resolved, not assumed.** A role whose
     `role-model-config.yaml` entry sets `charter-override: allowed`, running
     under a charter that overrides it, produces a record whose requested tier
     is the CHARTER's and whose `overrideApplied` is true with the charter
     path echoed; a role with `charter-override` not allowed, under the same
     charter, produces the config's tier and `overrideApplied` false. Both
     directions, and the override CONDITION is observable so it is recorded as
     observed.
  8. **Closeout copies the family token into the verdict.** The record's family
     token reaches the phase's verdict document so the pull request stays
     self-contained per DR-0031, and a test asserts the copied value equals the
     record's byte for byte.
  9. `npm run build` exits 0, `git status` clean, `node --test` exits 0
     reporting N tests, N greater than 0, four-part sentence quoted.
- new behaviors: `model-resolution-validates`,
  `model-resolution-subject-echo-required`,
  `model-resolution-written-at-turn-end`,
  `model-resolution-cross-vocabulary-refused`,
  `model-resolution-kernel-reads-identity-not-content`,
  `model-resolution-absent-record-is-error`,
  `model-resolution-observed-provenance-requires-observation`,
  `model-resolution-observed-provenance-must-agree`,
  `model-resolution-charter-override-resolved`,
  `model-resolution-family-token-reaches-verdict`.
- hazard class: **a self-report laundered into a measurement** (H-B, a guard
  whose condition does not test the property that matters), **a vendor name in
  `src/` closing off every other harness** (H26 within H-D), and **an absent
  record read as a clean result** (the recorded shape of a usage error read as
  a clean result, named in the fix-round contract's item 3).

| Hazard item | Reddens against |
|---|---|
| a launch-time record calling itself resolved | criterion 2 |
| family tokens from different vocabularies compared | criterion 3 |
| a tier-to-model mapping in `src/` | criterion 4 |
| an absent record read as green or not-applicable | criterion 5 |
| `observed` provenance with nothing observed | criterion 6, member one |
| `observed` provenance contradicting the request | criterion 6, member two |
| a charter override applied where the role forbids it | criterion 7, both directions |
| **whether the resolved identity is observable AT ALL** | **NO CRITERION CAN SETTLE THIS**, and the design is built to survive either answer. M4-P1 question 4 answers it; if the answer is no, `provenance` is permanently `self-reported` and criterion 6's first member is the whole guard |

- **PROTOTYPE-BLOCKED criteria: 2, 6 and 7's observability clause.** M4-D-06's
  timing half is explicitly prototype-blocked in the intake
  (delivery/plan/m4-intake.md:732), and criterion 6's provenance vocabulary is
  only meaningful once M4-P1 question 4 has established whether `observed` is
  ever reachable. The prototype is M4-P1.
- round budget: **3 rounds.** Large subject (a schema, a kernel reader, a
  plugin writer, a vocabulary module and an adapter edit, spanning both
  packages), high impact (the record is what DR-0038's declared single-family
  exception and `check-dual-review`'s decorrelation both rest on, and a wrong
  family token makes a governance check assert nothing). Large plus high is
  three.
- blocked-by: M4-P5 merged, M4-P6 merged, M4-P1 merged.
- conflicts-with: nothing after M4-P6 merges.

### WS1.3 Kernel and plugin, stated once so nobody has to count

**KERNEL phases: M4-P2, M4-P3, M4-P4.** Three of the seven, and they are the
correction to delivery/plan/kernel-plan-v1.md:211's sentence that a further
adapter is not kernel changes. Two more phases are partly kernel: M4-P1 is
evidence about the harness and M4-P7 is a kernel schema plus a plugin writer.

**PLUGIN phases: M4-P5, M4-P6.** Two of the seven, and neither can start until
all three kernel phases have merged.

**So the workstream is roughly two thirds kernel work by phase count, which is
the opposite of what a reader of the v1 plan expects.** Stating it in the plan
is the mitigation for hazard H-G, whose whole shape is a design-intent sentence
read as a statement about the shipped package.

### WS1.4 Every PROTOTYPE-BLOCKED criterion in one place

The intake names fourteen prototype-blocked questions across all six
workstreams (delivery/plan/m4-intake.md:155). These are this workstream's, and
the prototype is M4-P1 in every case.

| Phase | Criteria | What the probe must establish |
|---|---|---|
| M4-P5 | 7, 8, 9, and the manifest filename in files-to-touch | Whether the adapter is primitive-backed, subprocess or hybrid (M4-D-01); whether a launch failure is distinguishable from an abandonment; the manifest's real shape |
| M4-P6 | 1, 2, 3, 4, 5 | What a hook payload actually contains; what an agent turn reports when it ends without an exit code; whether any hook fires at turn end |
| M4-P7 | 2, 6, and criterion 7's observability clause | Whether the resolved model is readable after the fact at all (M4-D-06 part b) |
| M4-P2, M4-P3, M4-P4 | **none** | Every fact those three rest on was measured in this repository's own source |

**A criterion marked PROTOTYPE-BLOCKED is not a criterion to be softened by the
implementer when the probe disagrees with it.** If M4-P1 returns an answer that
makes one unsatisfiable as written, that is an escalation to the orchestrator
and a plan revision, per D-M3-16's shape. The reason this is written down is
that the alternative is an implementer relaxing an acceptance criterion inside
a fix round, where no gate can see it.

### WS1.5 Open questions this section hands up, with recommendations

Written as recommendations first, because under DR-0016 that is what reveals
whether a question was ever a question.

1. **Where does the plugin tree live: `plugin/` or `packages/claude-code-plugin/`?**
   Recommend `plugin/`, singular and at the root. `packages/` implies a
   third and a fourth package and DR-0040 is explicit that this is a second
   package "for now", naming the two triggers that reopen it. The cost of being
   wrong is one directory move. Orchestrator's to decide; no escalation.
2. **Do the plugin's tests live under the existing `test/` tree, or does
   package.json:36's glob change?** Recommend the existing `test/` tree, for
   M4-P5. The glob is what the `suite` gate runs, and this repository has
   already paid three times for an unexplained suite-count difference (standing
   warning 12). Keeping one glob keeps one number. The cost is that plugin
   tests sit beside kernel tests, which is a readability cost and not a
   correctness one.
3. **One 0.2.0 or two?** Recommend ONE, cut after the last kernel API phase of
   workstreams 1 and 2, covering M4-P4's `exports` map and M4-D-08's verdict
   schema together. This needs the workstream 2 author to agree, so it is a
   plan-level question and not M4-P4's to settle.
4. **What is the numeric boundary between a "small" and a "large" subject?**
   DR-0035 says size is value plus assurance lines with paperwork excluded
   (delivery/decisions/DR-0035-review-is-never-skipped-the-rounds-are-what-tier.md:55)
   and gives no threshold. Every round budget above declares a size and states
   its basis, which is the best available today. Recommend the plan fix a
   threshold (a first cut: large at 200 or more combined value-plus-assurance
   lines) so that two implementers reading the same phase reach the same
   budget. Without it, the dial is a judgment, and DR-0035 exists to replace a
   judgment with a table.
5. **Does the observer hook in M4-P6 belong to this workstream at all?**
   Recommend YES as plumbing and NO as policy, which is what M4-P6 says. The
   alternative is that workstream 2 builds both, which delays its write block
   behind plugin packaging work it does not otherwise need. Flagging it because
   it is a real cross-workstream seam and the two authors must agree on it
   before M4-P6 dispatches.

### WS1.6 What this section does NOT cover

Stated so a reader weighs it rather than discovering it.

1. **The credential half of M4-D-07.** It is on this workstream's critical path
   and it is workstream 2's to own (delivery/plan/m4-intake.md:733). M4-P1
   question 3 gathers the measurement; nothing here spends it. **A plugin phase
   that sets `allowPrCredentials` would bypass the credential scrub entirely
   and no gate would see it** (src/spawn.ts:267 declares the hatch,
   src/spawn.ts:273 is the field). No criterion above forbids it, because the
   forbidding belongs with the workstream that owns the constraint. **This is a
   gap between two sections and it is named rather than assumed closed.**
2. **The `PreToolUse` write block itself**, its two carve-outs, and the
   infra-hotfix bypass that the migration table flags as undesigned. All
   workstream 2.
3. **R-032's dispatch block** (refusing the next dispatch without a green
   release-verification verdict for the merged sha). It edits `src/spawn.ts`,
   so it collides with this workstream's three kernel phases and the plan must
   place it in the merge order, but the intake assigns it to cutover
   (delivery/plan/m4-intake.md:682). **Flagging the collision, not
   claiming the work.**
4. **The exit test.** DR-0041 binds it to the pilot and it falls due at cutover
   entry. Nothing in this workstream discharges it.
5. **Whether the kernel-as-subject can tell a plugin defect from a kernel
   defect.** Hazard H-A's axis 1 mitigation survives: reproduce every failure
   against `subprocessAdapter` (src/spawn.ts:155), which ships and is still the
   default at src/spawn.ts:463. Every phase above keeps that adapter working,
   and M4-P4 criterion 6 makes the choice explicit in the record. Axis 2, the
   subject-versus-instrument axis, has no mechanical control left, and no
   criterion in this workstream restores one.
6. **`pulse`.** Out of this orchestrator's reach under DR-0037, and no phase
   here touches it.
7. **A conflict pre-pass for the whole milestone.** WS1.1 records this
   workstream's internal ordering. Where these phases collide with workstreams
   2 through 6 (chiefly on `src/spawn.ts` and on the plugin manifest) is a
   milestone-level pre-pass and is not written here.

## 4. Workstream 2: authority enforcement

Owns clauses 5 and 7 of the section 1 decomposition, the project-write block,
the credential path, and the checkable half of DR-0012. It is SECOND in the
DR-0036 order, and the reason is narrow: the merge half is not on the adapter's
critical path and the credential half is
(delivery/decisions/DR-0036-the-harness-adapter-leads-m4-and-the-kernel-is-the-second-subject.md:75).
M4-P8 is therefore first in this workstream, ahead of the write block.

### 4.2.0 Phase ids, and one thing to fix before dispatch

This workstream requests a contiguous block of five phase ids and uses
M4-P8 through M4-P12 on the assumption that the harness adapter takes M4-P1
through M4-P4. **If the integration pass assigns a different block, renumber
HERE, in the plan, before it merges.** The id is not a label: the branch name
derives from it (`^claude/m[0-9]+-p[0-9]+-.+$`,
src/gates/schemas/phase-declaration.schema.json:18), the declaration filename
derives from it, and the scope auditor derives the phase id back out of the
branch name. An id allocated and then renumbered is the collision CLAUDE.md
records under the identifier schemes.

**Declaration placement, to CHECK at dispatch rather than assume.** M3-P11
changed the scope gate to read the declaration from BOTH the merge base and the
head, so an ADDED `filesToTouch` entry can ride in the phase's own pull request
(src/gates/scope.ts:110). What that paragraph does not say is whether a WHOLLY
NEW declaration file, absent from the merge base, is accepted; the merge base is
still "the yardstick for `id` and `branch`" (src/gates/scope.ts:111). Run one
probe before the first M4 branch is cut. If a new declaration on the head alone
is refused, all five declarations land as ONE commit on `main` in the M4 plan's
own pull request, which is also what DR-0031 wants: five separate grant pull
requests is three of the ten this repository already paid for.

### 4.2.1 What is fixed input, and what is genuinely missing

The policy text is NOT something to author. AGENTS.md:279 carries the clause and
AGENTS.md:287 enumerates the carve-out: merging a reviewed pull request, moving
a release tag and deleting a merged phase branch are ref updates and are the
orchestrator's; AGENTS.md:290 says editing a file in the project tree is not.
M3 shipped the STATEMENT. M4 owes the STRUCTURE, and D-8 says so in terms:
"the M4 write-block hook must encode the carve-out"
(delivery/plan/kernel-plan-v1.md:383).

Six measured facts this workstream is built on. Each was re-probed against
`plan/pstack-borrow-review` at `f7576f4` rather than inherited from the intake.

1. **Nothing implements a project-write block.**
   `grep -rn 'project-write|projectWrite|PreToolUse' src/ bin/ schemas/ roles/`
   exits 1.
2. **`extraAllowlist` exists as data and NOTHING reaches it.** The field is
   declared at src/exec/env.ts:154 and consumed at src/exec/env.ts:191, and the
   only production call site, src/spawn.ts:452, passes `parentEnv` and
   `scrubDir` and no extension. `SpawnOptions` (src/spawn.ts:257) has no field
   to carry one.
3. **`buildChildEnv` performs NO denylist intersection on the extension.**
   src/exec/env.ts:191 spreads `spec.extraAllowlist` into the copy loop
   unconditionally. An extension naming `GH_TOKEN` would cross today.
4. **The `credential-scrub` gate cannot see any of this.** It builds its OWN
   environment from `process.env` with its own scrub root and no extension
   (src/gates/credentials.ts:559), so it probes the CONSTRUCTION and never a
   real spawn. A spawn under `allowPrCredentials` (src/spawn.ts:273, guarded at
   src/spawn.ts:449) passes `env: undefined`, which src/spawn.ts:83 documents as
   "inherit the parent's environment UNCHANGED", and the gate stays green.
5. **Zero structured verdict documents exist.** `grep -rln '^kind: verdict'
   delivery/review/` exits 1 and `grep -rl '"kind": *"verdict"' delivery/` exits
   1, against 199 files in that directory. So `check-dual-review` has never run
   non-vacuously, and the migration cost of every verdict-schema change in M4-P10
   is measurably ZERO.
6. **The kernel is a MULTI-family environment, on the record.**
   delivery/review/clean-room-m3-exit-subject-criteria.md:5 records
   `produced-by: Claude, Sonnet 5 (claude-sonnet-5)` and
   delivery/review/clean-room-m3-exit-subject-hazard.md:5 records
   `produced-by: Claude Opus 5 (Anthropic model family)`. This is what gives
   DR-0038's arm a real red witness under DR-0037 (section 4.2.6).

### 4.2.2 The DR-0038 question the intake asked me to settle, settled

**The task was to establish whether the gate result type can express a third
status today, because if it cannot that is a framework change needing its own
phase. It CAN, the kernel already ships the pattern, and there is no framework
phase.** Both halves are stated, because the first half on its own reads as the
opposite conclusion.

**A fifth STATUS WORD is a framework change, and an expensive one.** The
vocabulary is closed at src/gates/result.ts:47 and the array beside it at
src/gates/result.ts:49; the exit-code table is total over exactly four
(src/gates/result.ts:70 and src/gates/result.ts:83); the shipped record schema
pins the same four (src/gates/schemas/gate-result.schema.json:27); and the
runner's counters are keyed by them in two places (src/gates/run.ts:230 and
src/gates/run.ts:1670). A fifth word reaches `counts[result.status] += 1` at
src/gates/run.ts:2132 against a key that does not exist, which is `NaN`, which
`decideAggregate`'s bad-count screen (src/gates/run.ts:1736) turns into exit 21.
That is fail-closed and it is still a rewrite of the aggregate.

**DR-0038 does not ask for a fifth word.** It asks for a status "that is neither
green nor red", that fails closed
(delivery/decisions/DR-0038-the-declared-single-family-review-exception.md:59),
that is never green by omission (:62), and whose declaration is falsifiable
(:66). `not-applicable` carrying a declaration block satisfies all four, and
**the kernel already ships exactly that shape**: DR-0014's three distinguishable
not-applicables, specified at delivery/plan/kernel-plan-m2.md:450 and delivered
at src/gates/release.ts:1041, where a declared exemption reports
`not-applicable by declaration (declared: true)` with a precondition record
whose id names the declaration (src/gates/release.ts:1047) and whose evidence
carries the provenance built at src/gates/release.ts:1028: the declaration path,
the REF it was read from, that ref's sha, and the blob's sha256.

Three consequences, all of which shape M4-P11:

- **The precondition must be a NEW one, not the existing one.** Today
  `check-dual-review`'s precondition answers only "is there any verdict document
  to compare" (scripts/check-dual-review.mjs:38). Under the exception there ARE
  two verdicts and the check DID look at them, so reusing that precondition
  would assert something false, and `not-applicable` ASSERTS that a precondition
  was evaluated and found unmet (src/gates/result.ts:15). The new precondition
  is `single-family-declared`, and what it reports unmet is the availability of
  a second family, which is true and checkable.
- **The exception narrows ONE dimension of three.** src/checks.ts:2896 declares
  `produced-by`, `framing` and `review-contract`. Only the first is relaxed.
  Framing and contract distinctness are still compared and can still go red,
  which is why this is an exception and not a switch.
- **It is invisible at bundle level unless the runner is changed, and that is
  the "nobody can hide it" half of the owner's decision.** `check-dual-review`
  is `conditional` (CLAUDE.md:302), so its `not-applicable` never reaches the
  `required gate(s) not applicable:` line (src/gates/run.ts:1718 selects on
  src/gates/run.ts:2139, which filters `applicability === "required"`). A reader
  applying CLAUDE.md's four-fact procedure sees nothing. M4-P11 therefore carries
  a small runner change: the aggregate reason line and `summary.json` name every
  gate whose not-applicable is BY DECLARATION.

**Alternative considered and rejected: make the exception nonzero at bundle
level.** That is "keep the rule strict", which the owner explicitly rejected
(delivery/decisions/DR-0038-the-declared-single-family-review-exception.md:22),
because it blocks merge entirely in a single-family environment. The exit code
stays 0 and the VISIBILITY carries the weight. Recorded as **M4-D-25**.

### 4.2.3 M4-P8: the credential path for an agent payload

- id: M4-P8
- branch: `claude/m4-p8-payload-credentials`
- discharges: M4-D-07; section 5 obligation 2 (the release-verification
  credentials binding deferred at delivery/plan/kernel-plan-m2.md:451 because
  M2-P7 and M2-P8 ran concurrently); defect 1 of the four found by use.
- depends on: nothing in this workstream. It is the adapter's critical path and
  merges first.
- grounding: facts 2, 3 and 4 of section 4.2.1, re-probed at dispatch. The
  allowlist itself (src/exec/env.ts:68) is NOT edited by this phase: the default
  list gains no name. What this phase builds is the audited route around it.
- **PROTOTYPE-BLOCKED, and only partly.** M4-D-07 marks the question "how does a
  real agent payload authenticate under the scrub" as answerable only by a
  probe. That question decides WHICH NAMES an agent needs, and it blocks
  criterion 7 alone. Criteria 1 to 6 are about the ROUTE and its refusals and
  are not blocked by it. Step 1 runs the probe and records its output; if the
  probe cannot be run, criterion 7 is struck and the phase says so rather than
  guessing a name list.
- hazard class: **a credential reaches a project payload and no artifact says
  so.** What can produce it: `allowPrCredentials` set by the plugin, which is a
  library consumer and can reach the option that the CLI cannot; an extension
  naming a token variable, which crosses with no intersection check
  (src/exec/env.ts:191); an extension with no recorded reason, so a later reader
  cannot tell an audited widening from an accident; a witness taken from the
  object `buildChildEnv` RETURNED rather than from the child, which is the
  guard-does-not-test-the-property class (H-B) and is what makes the shipped
  gate blind (src/gates/credentials.ts:559); and an adapter that widens `env`
  after the kernel handed it over (src/spawn.ts:83 forbids this in prose and
  nothing checks it).
- hazard class to criterion:

| Hazard item | Reddens against |
|---|---|
| `allowPrCredentials` set for a project payload | criterion 2, both directions |
| an extension naming a token or otherwise dangerous variable | criterion 3, two structurally different members |
| an extension with no recorded reason | criterion 4 |
| a witness read off the constructed object rather than the child | criterion 5, which asserts on a file the CHILD wrote |
| an adapter widening `env` after handover | criterion 6 |
| which names an agent actually needs | criterion 7, PROTOTYPE-BLOCKED, struck if step 1 cannot run |

- steps:
  1. Probe: launch one real agent payload through the subprocess adapter under
     the default scrub and capture what it cannot do. Record the captured
     output, not a summary of it.
  2. Add `payloadClass: "orchestrator" | "project"` to `SpawnOptions`
     (src/spawn.ts:257), REQUIRED, no default. A default is what lets a caller
     acquire the orchestrator's authority by omission.
  3. Add `extraAllowlist?: readonly { name: string; reason: string }[]` to
     `SpawnOptions` and thread it into the src/spawn.ts:452 call. The reason is
     DATA, not a comment, and an empty reason is a refusal.
  4. `buildChildEnv` refuses an extension entry that `GH_TOKEN_VARIABLES` or
     `isDangerousEnvName` matches (both already exist in
     src/gates/credentials.ts and move to a module both can import, or are
     re-exported; decide in step 4 and record which, since duplicating the
     vocabulary creates two that can drift).
  5. `spawnTask` refuses `allowPrCredentials: true` together with
     `payloadClass: "project"`, as a rollback with a reason, before the worktree
     is touched.
  6. Record the decision in `meta.json`, which the kernel already owns: scrub
     mode, every extension entry with its reason, and the refusal if one fired.
     No new file and no new owner across the seam.
  7. Ship `scripts/credential-witness.mjs`, a payload that calls
     `probeCredentialSources(process.env)` (exported at
     src/gates/credentials.ts:257) from INSIDE the child and writes the probes
     to a path the harness chose, on the scripts/stub-payload.sh pattern.
  8. Tests: `test/payload-credentials.test.ts`.
- files-to-touch: `src/spawn.ts` (edit), `src/exec/env.ts` (edit),
  `src/gates/credentials.ts` (edit, export the vocabulary only),
  `src/task.ts` (edit, `TaskMeta` fields), `scripts/credential-witness.mjs`
  (create), `test/payload-credentials.test.ts` (create),
  `schemas/` task-meta document if one exists (verify in step 1; if `meta.json`
  is unvalidated, say so and do not create a schema in this phase).
- acceptance criteria:
  1. `node --test test/payload-credentials.test.ts` exits 0 and reports N tests,
     N > 0, on node v26.6.0 with `dist/` built, invoked as stated.
  2. A `spawnTask` call with `payloadClass: "project"` and
     `allowPrCredentials: true` returns `{ok: false}` whose reason names both
     fields, and creates no worktree; the same call with
     `payloadClass: "orchestrator"` returns `{ok: true}`. RED WITNESS: against
     `HEAD~1` the first call succeeds and the child-written probe file from
     criterion 5 names the inherited token variable.
  3. `buildChildEnv` returns `{ok: false}` for an extension entry named
     `GH_TOKEN` and for an extension entry named `NODE_OPTIONS`, each reason
     naming the entry. TWO STRUCTURALLY DIFFERENT MEMBERS: the first is a
     credential, the second is code execution, and they are refused by two
     different halves of the vocabulary. RED WITNESS: against `HEAD~1` both
     names appear in the returned `env`.
  4. An extension entry with `reason: ""` is refused naming the entry; the same
     entry with a non-empty reason is accepted and the reason appears verbatim
     in `meta.json`.
  5. The child-written probe file exists after a real spawn and its contents
     are the assertion. RED WITNESS: a mutant that has the adapter add
     `GH_TOKEN` to the environment AFTER receiving it from the kernel leaves
     `buildChildEnv`'s return value unchanged and reddens this criterion. This
     is the criterion that distinguishes the phase from the shipped gate.
  6. The spawn refuses when the environment the adapter reports launching with
     differs from the environment the kernel handed it. Compared by NAME SET,
     recorded in `meta.json`.
  7. PROTOTYPE-DEPENDENT. The name list from step 1, each with its reason, is
     recorded in the work history with the captured probe output that
     established it, and the count in `meta.json` equals the count in the work
     history. Struck, with the reason written down, if step 1 could not run.
- round budget: 2 (DR-0035 floor 1, ceiling 3).

### 4.2.4 M4-P9: the project-write block hook, with BOTH carve-outs

- id: M4-P9
- branch: `claude/m4-p9-project-write-block`
- discharges: clause 7 (R-001a, delivery/requirements/migration-table.md:17),
  the hook half of clause 3, D-8 (delivery/plan/kernel-plan-v1.md:383), SC-010
  (delivery/verification/spec-coherence-report.md:126).
- depends on: the plugin package skeleton from the harness-adapter workstream.
  If that has not merged when this phase is ready, this phase creates it and the
  adapter phase consumes it; whichever way round, ONE phase creates it and the
  plan says which. Recommended location `packages/claude-code-plugin/`, since
  DR-0040 decided one repository and two packages and named no directory.
- **PROTOTYPE-BLOCKED on one thing, and it is the thing that decides the
  design.** The plugin surface is documentation-derived and no hook has been
  fired (intake section 2 item 3). What `PreToolUse` actually receives for
  `Bash` decides whether a path-based predicate can see a shell write at all.
  Step 1 fires one hook and records the payload verbatim. The criteria below are
  written so that criteria 1 to 5 hold whatever the probe returns, because they
  are stated over a PURE DECISION FUNCTION; criterion 6 is the end-to-end one
  and is the one the probe gates.
- **It owes TWO carve-outs and they ship together (H-D).** A block shipped
  without the infra-hotfix bypass is switched off in the first hour and then
  cannot go red for the rest of M4. The migration table flags the bypass as
  undesigned at delivery/requirements/migration-table.md:17, so designing it is
  this phase's work and not an inherited spec.
- **The bypass design, stated here so the phase implements rather than invents
  it.** A bypass is a FIRST-CLASS DECLARED ACT: a single JSON document in the
  fleet home naming the project, an explicit path list, a reason and an absolute
  expiry instant, written by the orchestrator. Every write it permits is
  APPENDED to a separate evidence log. **C-1 binds here and the split is why:
  the declaration is the current-state document and is rewritten in place; the
  log is append-only evidence that NO decision ever reads.** Reading the bypass
  state from the tail of the log is exactly what C-1 forbids. Recorded as
  **M4-D-26**.
- **The D-8 carve-out is keyed to the EFFECT, not to the tool name, and that is
  forced.** "Designated merge tooling" (delivery/plan/kernel-plan-v1.md:383) has
  no referent: `src/commands/` holds fifteen modules and none merges. So the
  hook cannot recognise a designated tool, and inventing one here would be
  building the merge command this workstream does not own (M4-D-09 puts it in
  cutover). The line the hook draws is the line AGENTS.md:290 draws: a write
  whose target resolves inside a project working tree and outside that clone's
  `.git/` is REFUSED; a write under `.git/` is the ref update and is permitted.
  Recorded as **M4-D-27**.
- hazard class: **a structural rule that is green because it was switched off,
  or because it never saw the write.** What can produce it: a bypass with no
  expiry, so the first hotfix disables the block permanently; a bypass whose
  current state is read from a log tail (C-1); a hook that refuses the
  orchestrator's own merge and is therefore removed (SC-010's measured
  contradiction); a path predicate that a `Bash` heredoc walks straight past; a
  hook that fails OPEN when it cannot resolve the project root, which is the
  same fail-open as an absent hook and looks identical in every log; and a
  witness that tests only the refused write, which is one member of a
  two-member class.
- hazard class to criterion:

| Hazard item | Reddens against |
|---|---|
| a working-tree write in a project clone is permitted | criterion 2 (RED WITNESS 1) |
| a designated ref update is refused | criterion 3 (RED WITNESS 2) |
| a bypass with no expiry, or past its expiry | criterion 4, member A |
| a bypass write outside its declared path list | criterion 4, member B |
| bypass state read from a log tail (C-1) | criterion 5, which deletes the log entirely and requires the decision to be unchanged |
| a `Bash` write that the path predicate cannot see | criterion 6 and the step 1 record; if the probe shows the payload does not carry a resolvable path, criterion 6 states the residual instead of claiming coverage |
| the hook failing open on an unresolvable project root | criterion 7 |
| one witness treated as a class | criteria 2 and 3 are the two members; criterion 4 carries the bypass class's own two |

- steps:
  1. Fire one `PreToolUse` hook against `Write`, `Edit` and `Bash` and record the
     payload each receives, verbatim, in the work history.
  2. Create the plugin package (or consume it) and the hook manifest.
  3. Write `decideWrite(request, projectRoots, bypass, now)` as a PURE function
     returning `permit | refuse` plus a reason. Every criterion below except 6
     is stated over this function, so they are falsifiable without firing a
     hook.
  4. The bypass declaration document, its schema, and the append-only evidence
     log that nothing reads.
  5. The hook wrapper: exit 2 on refuse (the only blocking exit, intake
     Appendix B item 2), exit 0 on permit, and exit 2 with a distinct reason on
     any internal failure. FAIL CLOSED.
  6. Tests.
- files-to-touch: `packages/claude-code-plugin/` (create, whole tree),
  `schemas/write-bypass.schema.json` (create),
  `test/project-write-block.test.ts` (create), `AGENTS.md` (edit, ONLY to point
  the projects-read-only clause at the shipped mechanism; the clause text itself
  is not rewritten), `package.json` (edit, `workspaces`, only if the adapter
  phase has not already added it).
- acceptance criteria:
  1. `node --test test/project-write-block.test.ts` exits 0 and reports N tests,
     N > 0.
  2. **RED WITNESS 1.** `decideWrite` refuses a `Write` to
     `<projectRoot>/src/app.ts`, and the hook wrapper exits 2 for the same
     request. Red against the DANGEROUS state: with the hook absent the write
     lands and the file's mtime changes, which the test asserts.
  3. **RED WITNESS 2.** `decideWrite` permits a ref update under
     `<projectRoot>/.git/refs/heads/main`, and a real `git merge --ff-only` in a
     scratch clone with the hook installed exits 0 and moves the ref. Red
     against the dangerous state: a block without the carve-out breaks its own
     pipeline's merge path, which is SC-010's recorded contradiction
     (delivery/verification/spec-coherence-report.md:126).
  4. The bypass class, TWO STRUCTURALLY DIFFERENT MEMBERS. (a) A declaration
     whose expiry is in the past does not permit a write its path list covers.
     (b) A declaration that is current does not permit a write outside its path
     list. Both refusals name the declaration and the reason it did not apply.
  5. Deleting the entire evidence log changes no `decideWrite` result, asserted
     over the full criterion-4 fixture set. This is C-1 made falsifiable: a
     decision that survives the log's deletion cannot have been reading it.
  6. With the hook installed, a real agent turn that attempts a working-tree
     write in a project clone produces no change to that clone
     (`git status --porcelain` empty, and every tracked file's sha unchanged).
     PROBE-DEPENDENT for the `Bash` arm: if step 1 shows the `Bash` payload
     carries no resolvable path, this criterion covers the file-writing tools
     only and the work history STATES the residual rather than implying
     coverage.
  7. A request whose project root cannot be resolved is REFUSED, not permitted,
     and the wrapper exits 2 naming the resolution failure.
- round budget: 3 (the ceiling: this is the phase most likely to need it, and
  DR-0035's ceiling is 3).

### 4.2.5 M4-P10: the verdict head, the medium escalation, and the first non-vacuous dual review

- id: M4-P10
- branch: `claude/m4-p10-verdict-head-and-medium`
- discharges: M4-D-08; DR-0012 condition 1's head clause
  (delivery/decisions/DR-0012-delegated-merge-authority.md:22) and condition 2
  (:23).
- depends on: nothing. Merges before M4-P11 and M4-P12, both of which read what it
  ships, and it shares two files with M4-P11 (section 4.2.8).
- **The migration cost is measurably ZERO**, which is what makes this a schema
  edit rather than a migration: `grep -rln '^kind: verdict' delivery/review/`
  exits 1 and `grep -rl '"kind": *"verdict"' delivery/` exits 1. No document
  validates under the narrower rule today, so no document has to be rewritten.
  Re-run both at dispatch; the number that matters is the one at dispatch.
- **The check cannot see a verdict's VALUE, and that is in scope here.**
  Measured against the whole body of scripts/check-dual-review.mjs: `grep -c`
  returns 0 for `APPROVE`, 0 for `severity`, 0 for `findings` and 0 for
  `produced-by`, the last because the comparison itself lives at
  src/checks.ts:3261. So two decorrelated verdicts that both REFUSE the merge
  pass it green. Shipping `head` without this leaves condition 2
  asserted by a human while condition 1 looks checked, which is the worse of the
  two states because it reads as progress.
- hazard class: **a merge precondition that reads as checked and is not.** What
  can produce it: `head` present but optional, so the old documents keep
  validating and the join key stays the directory convention
  (scripts/check-dual-review.mjs:29); `head` compared case-sensitively against a
  short sha, so two spellings of one head look like two heads; the escalation
  rule widened in the schema and not in the check, or the reverse; a check that
  counts verdicts and never reads them; and a pair of verdicts for DIFFERENT
  heads sitting in one directory and being compared as a pair.
- hazard class to criterion:

| Hazard item | Reddens against |
|---|---|
| `head` optional, so the directory convention survives | criterion 2 |
| two spellings of one head read as two heads, or two heads read as one | criterion 3, two directions |
| the medium widening in the schema only | criterion 4 |
| the medium widening in the check only | criterion 5 |
| a check that counts verdicts and never reads them | criterion 6 |
| a verdict pair for different heads compared as a pair | criterion 3 |
| the gate still never running non-vacuously | criterion 7, which is this project's first |

- steps:
  1. Re-run both migration-cost greps and record the output.
  2. `schemas/verdict.schema.json`: add `head`, REQUIRED, `type: string`,
     `pattern: ^[0-9a-f]{40}$`. Required and full-length, because an optional
     field leaves the operator convention in place and a short sha is two
     spellings of one fact. `additionalProperties` is already `false`
     (schemas/verdict.schema.json:8) so the addition is a `properties` and a
     `required` edit (schemas/verdict.schema.json:9).
  3. Widen the escalation `contains` enum at schemas/verdict.schema.json:95 from
     `["high", "critical"]` to `["medium", "high", "critical"]`. The severity
     vocabulary itself (schemas/verdict.schema.json:151) is unchanged: `low`
     stays mergeable, which is what
     delivery/decisions/DR-0012-delegated-merge-authority.md:23 says.
  4. `src/checks.ts`: the `dual-review-decorrelation` group key becomes
     `(phase, head)` rather than `phase` (src/checks.ts:3261 onward). The three
     dimensions at src/checks.ts:2896 are unchanged.
  5. New check `verdict-pair-approves`: within one `(phase, head)` group, both
     verdicts read `APPROVE`, and neither carries an unresolved finding at
     `medium` or above. This is DR-0012 condition 2 made into a predicate.
  6. `scripts/check-dual-review.mjs`: run the new check alongside the existing
     one, by id, and print the verdict COUNT and the verdict VALUES, which is
     H-C's mitigation written into the gate's own output.
  7. The two clean-room reviews OF THIS PHASE each emit a `kind: verdict`
     document carrying this phase's head, committed in this phase's own pull
     request per DR-0031.
  8. Tests: `test/verdict-head.test.ts`.
- files-to-touch: `schemas/verdict.schema.json` (edit),
  `src/checks.ts` (edit), `scripts/check-dual-review.mjs` (edit),
  `test/verdict-head.test.ts` (create), `delivery/review/` (two verdict
  documents, this phase's own).
- acceptance criteria:
  1. `node --test test/verdict-head.test.ts` exits 0 and reports N tests, N > 0.
  2. `tiphys validate --type verdict <doc>` exits 1 naming `head` for a document
     with no `head`, and exits 0 for the same document with one. RED WITNESS:
     the no-`head` document validates at exit 0 against `HEAD~1`.
  3. Two verdicts in one directory carrying DIFFERENT `head` values are not
     compared as a pair: `check-dual-review` reports them as two groups of one
     and does not report the condition satisfied. Two verdicts carrying the SAME
     `head` are one group of two. RED WITNESS: against `HEAD~1` the first pair
     is compared and reports green, because the join key is the directory
     (scripts/check-dual-review.mjs:29).
  4. A verdict reading `APPROVE` beside a finding at `severity: medium` fails
     validation naming `verdict`. RED WITNESS: against `HEAD~1` that exact
     document validates at exit 0, which is the fail-open at
     schemas/verdict.schema.json:95.
  5. A verdict PAIR in which one verdict reads `FIX-ROUND-NEEDED` reddens
     `verdict-pair-approves`. RED WITNESS: against `HEAD~1` a pair in which BOTH
     read `FIX-ROUND-NEEDED` passes `check-dual-review` green, and the test
     asserts that captured green.
  6. Deregistering `verdict-pair-approves` makes the criterion-5 fixture pass,
     which is the Kind B falsification this repository's section 2.3 rule 3
     asks for.
  7. `check-dual-review` run against this phase's own `delivery/review/`
     directory reports GREEN with `units` 2 and prints both verdict values. This
     is the gate's first non-vacuous run in the project's history; the work
     history quotes the per-gate units line, not a bundle green.
- round budget: 2.

### 4.2.6 M4-P11: the declared single-family review exception (DR-0038)

- id: M4-P11
- branch: `claude/m4-p11-single-family-exception`
- discharges: DR-0038, closing M4-D-17.
- depends on: M4-P10 merged. It edits two of the same files and it needs `head`
  to exist before it can group by it.
- **Where the declaration lives, decided.** The CHARTER, as a new
  `review-families` property. DR-0038 leaves this open
  (delivery/decisions/DR-0038-the-declared-single-family-review-exception.md:80)
  and names DR-0029's split as the test: process or predicate. "Which model
  families exist in this environment" is a fact about the PROJECT's environment,
  which makes it predicate, which makes it the project's declaration. The
  assurance-mode document is the wrong home: its vocabularies are closed by
  DR-0020 and bound to a derived check. `schemas/charter.schema.json` is
  `additionalProperties: false` (schemas/charter.schema.json:7), so this is a
  declared schema addition. Recorded as **M4-D-28**.
- **What stops a project declaring it falsely, and the honest limit.** Two
  mechanical falsifiers and one stated gap.
  - Falsifier 1, CONTRADICTION BY THE CORPUS. If the project's own committed
    verdicts carry two or more distinct canonicalised `produced-by` families,
    the declaration is contradicted and the check reports RED, not the
    exception. A project that has demonstrably used two families cannot claim
    one.
  - Falsifier 2, THE NAME MUST MATCH. The declaration names the single family;
    a verdict whose `produced-by` canonicalises to anything else is RED.
  - **The gap, stated rather than left to be found.** Neither falsifier catches
    a project that has a second family AVAILABLE and has simply never used it.
    Nothing inside the record reaches that, and the plan says so instead of
    implying the declaration is fully checked. The countermeasure is provenance,
    not detection: the declaration is read from the git object database with its
    ref, ref sha and blob sha256, on the src/gates/release.ts:1028 pattern, so
    the claim is attributable and dated even where it is not refutable.
- **An ABSENT declaration is not permission.** src/gates/release.ts:1037 states
  the rule in the kernel's own voice for the sibling case: an absent
  configuration field is error, not none, because silence is never permission.
  Here: an absent `review-families` means the cross-family requirement applies
  unchanged, so a same-family pair stays RED. This is criterion 4.
- **How this arm gets a red witness although DR-0037 leaves it no genuine
  subject.** The intake is right that M4 has no real single-family environment,
  and the derivation is short enough to print: DR-0037 leaves the kernel as the
  only subject, and section 4.2.1 fact 6 shows the kernel's own corpus already
  carrying two families. So the PERMISSIVE arm has nothing real to run against.
  The REFUSING arms do, and it is that same corpus that gives it to them. Declaring the
  exception in the kernel's own charter is FALSE, and falsifier 1 must redden
  against it. So:
  - criteria 2 and 3 (contradiction, name mismatch) are witnessed against REAL
    verdicts produced by this milestone's own reviews, not fixtures;
  - criterion 4 (absent declaration) is witnessed against the real corpus too;
  - **criterion 5, the permissive arm, is FIXTURE-ONLY and is declared as such.**
    The work history states that no real single-family subject existed in M4,
    names the fixture, and does not describe the arm as exercised. Claiming
    otherwise would be the H-A substitution: a constructed subject reported as a
    real one.
  That is three witnessed refusals and one declared-constructed permission,
  which is a better position than the intake's "no subject" implies, and it is
  stated at exactly that strength.
- hazard class: **an exception that is indistinguishable from the rule being
  met.** What can produce it: the exception reported as green; the exception
  reported through the EXISTING precondition, which would assert falsely that
  there was nothing to compare; the exception reachable by omitting the
  declaration; the exception relaxing all three dimensions instead of one; the
  exception invisible in the bundle because the gate is conditional
  (CLAUDE.md:302); and a declaration read from the working tree, where it can be
  edited after the fact.
- hazard class to criterion:

| Hazard item | Reddens against |
|---|---|
| the exception reported green | criterion 6, which asserts the status is never `green` on any arm |
| the exception reported through the existing precondition | criterion 5, which asserts the precondition ID and that its reason names the declaration |
| the exception reachable by omitting the declaration | criterion 4 |
| the exception relaxing framing or review-contract too | criterion 7, two members |
| the exception invisible at bundle level | criterion 8, the runner change |
| a declaration read from the working tree | criterion 9, provenance |
| a FALSE declaration accepted | criteria 2 and 3, against the real corpus |

- steps:
  1. `schemas/charter.schema.json`: add `review-families`, an object with
     `available` (array of strings, `minItems: 1`) and `reason` (non-empty
     string). Single-family is `available.length === 1`; the schema does not
     encode the exception, it encodes the declaration.
  2. Read the declaration out of the git object database with its provenance,
     copying src/gates/release.ts:1028 rather than writing a second reader.
  3. `src/checks.ts`: `dual-review-decorrelation` gains the exception arm on the
     `produced-by` dimension ONLY (src/checks.ts:2896 is otherwise unchanged),
     plus the two falsifiers.
  4. `scripts/check-dual-review.mjs`: emit `not-applicable` with a NEW
     precondition id `single-family-declared`, `met: false`, a reason naming the
     declaration, and evidence carrying `declared: true` and the provenance.
     The detail line follows src/gates/release.ts:1045 verbatim in shape.
  5. `src/gates/run.ts`: the aggregate reason line and `summary.json` name every
     gate whose `not-applicable` carries a declaration. Small, and it is the
     whole of the owner's "nobody can hide it".
  6. Tests: `test/single-family-exception.test.ts`.
- files-to-touch: `schemas/charter.schema.json` (edit), `src/checks.ts` (edit),
  `scripts/check-dual-review.mjs` (edit), `src/gates/run.ts` (edit),
  `test/single-family-exception.test.ts` (create).
- acceptance criteria:
  1. `node --test test/single-family-exception.test.ts` exits 0 and reports N
     tests, N > 0.
  2. FALSIFIER 1, REAL CORPUS. With `review-families.available` declaring one
     family, and the two real verdicts from M4-P10's own reviews carrying two
     distinct families, the check reports `red` and the reason names both
     observed families. The two verdicts are the committed ones, not fixtures.
  3. FALSIFIER 2. With a one-family declaration naming family X and both real
     verdicts carrying family Y, the check reports `red` naming X and Y.
  4. OMISSION. With `review-families` absent and two same-family verdicts, the
     check reports `red`, exactly as it does today. RED WITNESS direction: a
     mutant that treats an absent declaration as a declaration reports
     `not-applicable` here, and the test asserts the status word.
  5. PERMISSIVE ARM, FIXTURE-DECLARED. With a valid one-family declaration and
     two same-family verdicts differing on framing and review-contract, the
     check reports `not-applicable`, its precondition `id` is
     `single-family-declared`, `met` is `false`, and its reason names the
     declaration. Asserted on the RECORD's fields, never on the detail text.
  6. On every arm above, the status is never `green`. Asserted as a set over all
     five arms, so a future arm added without a status assertion fails this.
  7. THE EXCEPTION NARROWS ONE DIMENSION, two members. (a) A one-family
     declaration plus two verdicts sharing `framing` reports `red` naming
     `framing`. (b) The same plus two verdicts sharing `review-contract` reports
     `red` naming `review-contract`.
  8. A bundle containing the criterion-5 record exits 0 AND its reason line
     names `check-dual-review` as not-applicable by declaration, and
     `summary.json` carries the same. RED WITNESS: against `HEAD~1` the same
     bundle exits 0 with `every applicable gate is green` and the gate appears
     nowhere in the reason line, which is the bundle-level invisibility this
     criterion exists against.
  9. A declaration edited in the WORKING TREE after the commit does not change
     the check's result, and the recorded blob sha256 matches the committed
     blob. Provenance, made falsifiable.
- round budget: 2.

### 4.2.7 M4-P12: the merge preconditions and the branch-protection encoding

- id: M4-P12
- branch: `claude/m4-p12-merge-preconditions`
- discharges: clause 5 (R-064 and R-065a,
  delivery/requirements/migration-table.md:112 and
  delivery/requirements/migration-table.md:113; SC-008's structural encoding);
  DR-0012 conditions 4, 5 and 6
  (delivery/decisions/DR-0012-delegated-merge-authority.md:25, :26, :27).
- depends on: M4-P10 merged (condition 2's predicate is M4-P10's and this phase
  composes it rather than re-implementing it).
- **What is already done, so nobody plans it again.** R-064 IS DONE: the
  repository ruleset `main-protection` is `enforcement: active` with
  `deletion`, `non_fast_forward`, `pull_request` and `required_status_checks`
  naming the `gates` check. R-065a (squash-only) is an OWNER action the owner has
  deferred, correctly, and it is an M4 exit-criteria footnote rather than a
  blocker. This phase does not perform either; it makes the first CHECKABLE and
  reports the second's state.
- **This phase builds a PRECONDITION READER, not a merge command.** M4-D-09 puts
  the merge capability in the plugin at cutover and DR-0036 keeps merge authority
  with the current process for the whole of M4. What is missing today is not the
  ability to merge; it is any artifact saying the six conditions held at the head
  that was merged. So the deliverable is `tiphys gates run --only
  merge-preconditions` producing one record per condition, and the orchestrator
  reads it before merging, by hand, as DR-0036 requires.
- **REST reachability is a thing to PROBE, not a settled property.** CLAUDE.md
  records it measured both ways on different days with the cause not
  established. Condition 4 needs the API. The check therefore probes first and
  reports `error` when it cannot reach it, never `not-applicable` and never
  green: M2-C-3, and the reason src/gates/result.ts:18 spells out.
- hazard class: **a merge precondition check that is green because it could not
  look.** What can produce it: a 401 piped into a `|| true`, which is the exact
  shape CLAUDE.md records under standing warning 6 and which a watcher already
  paid for here; an API failure reported as `not-applicable`; a CI-green check
  that reads the latest run for the BRANCH rather than the run for the HEAD SHA,
  which is T-009 one scope down; a scope-audit condition satisfied by the
  existence of a scope record rather than by its status; an arbitration
  condition satisfied by a file existing; and a ruleset check that reads a
  cached or defaulted value when the API returns nothing.
- hazard class to criterion:

| Hazard item | Reddens against |
|---|---|
| an unreachable API reported as anything but error | criterion 2 |
| CI-green read off the branch rather than the head sha | criterion 3, two directions |
| the scope condition satisfied by a record's existence | criterion 4 |
| the arbitration condition satisfied by a file's existence | criterion 5 |
| the ruleset check defaulting when the API returns nothing | criterion 6 |
| the ruleset check green against a disabled ruleset | criterion 7, two members |
| a bundle green quoted as a per-condition green | criterion 8 |

- steps:
  1. Probe REST reachability and record the captured response, including the
     deliberately-invalid-token control CLAUDE.md records, so the work history
     says WHAT is authenticating.
  2. `src/gates/merge-preconditions.ts`: one record per DR-0012 condition, each
     carrying the head sha it was evaluated against.
  3. Condition 4: the check-run conclusion for the EXACT head sha, from the API.
  4. Condition 5: read the `scope` gate's own record for that head and require
     its status to be `green`; an absent record is `error`.
  5. Condition 6: an arbitration document exists for the phase AND names both
     verdict ids AND carries the same head. Existence alone is not the test.
  6. Conditions 1 and 2: compose M4-P10's predicates. Do not re-implement them.
  7. The ruleset encoding: assert `enforcement: active` and that
     `required_status_checks` names `gates`. Report R-065a's state as DATA, not
     as a verdict, since it is an owner action.
  8. Register the gate. `gate-registry.yaml` and the rendered CLAUDE.md block are
     shared with any other M4 phase adding a gate; see section 4.2.8.
  9. Tests: `test/merge-preconditions.test.ts`.
- files-to-touch: `src/gates/merge-preconditions.ts` (create),
  `test/merge-preconditions.test.ts` (create), `gate-registry.yaml` (edit,
  append one entry), `gates.manifest.json` (edit, append, union-resolved),
  `CLAUDE.md` (edit, the RENDERED gate block only, via
  `node scripts/render-agent-rules-gates.mjs --write`), `src/cli.ts` (edit only
  if gate registration requires it; verify first).
- acceptance criteria:
  1. `node --test test/merge-preconditions.test.ts` exits 0 and reports N tests,
     N > 0.
  2. With the API unreachable (a scratch environment pointing at a closed port),
     the gate reports `error` with `units` 0 and a reason naming the failure.
     RED WITNESS, and it is the one this repository has paid for twice: a mutant
     with the request wrapped in a catch that returns "unknown" reports green,
     and the test asserts the status word, not the detail.
  3. Condition 4 is red when the newest green run on the branch is for an
     EARLIER head, and green only when the run's head sha equals the head under
     evaluation. Both directions, one fixture pair.
  4. Condition 5 is red when the `scope` record for that head reads `red`, and
     red when no record exists. Two arms, two different reasons.
  5. Condition 6 is red for an arbitration document that exists and names only
     one verdict, and red for one naming a different head. TWO STRUCTURALLY
     DIFFERENT MEMBERS of "existence is not the test".
  6. With the ruleset API returning an empty body, the gate reports `error`, not
     a default.
  7. The ruleset check is red against a repository whose ruleset is
     `enforcement: disabled`, and red against one whose
     `required_status_checks` does not name `gates`. TWO MEMBERS.
  8. The work history quotes the PER-CONDITION rows from the record, with the
     head sha, and does not quote a bundle-level green as evidence about any one
     condition.
- round budget: 2.

### 4.2.8 Conflict pre-pass for this workstream

Parallelism is on only where a recorded pre-pass proves the phases disjoint
(CLAUDE.md, binding convention 5), so here is this workstream's, written before
dispatch rather than asserted after.

| Pair | Shared paths | Verdict |
|---|---|---|
| M4-P8, M4-P9 | none | DISJOINT, may run concurrently |
| M4-P8, M4-P10 | none | DISJOINT |
| M4-P9, M4-P10 | none | DISJOINT |
| M4-P10, M4-P11 | `src/checks.ts`, `scripts/check-dual-review.mjs` | **SERIALISE.** M4-P11 after M4-P10, merge order and work order both |
| M4-P10, M4-P12 | none in files; M4-P12 composes M4-P10's predicates | SERIALISE on merge order only |
| M4-P11, M4-P12 | none | DISJOINT in files. If both are in flight, see the registry note below |
| M4-P8, M4-P12 | none, unless M4-P8's step 4 adds a gate arm | Verify at dispatch; if it does, the registry note applies |

**The registry note.** `gates.manifest.json` is append-only and union-resolved
against the merge base (CLAUDE.md, convention 5). The root gate registry is NOT
on that list and the CLAUDE.md gate block is GENERATED from it, so two phases
that both add a gate row conflict textually in the rendered block even when
their code is disjoint. The rule for M4: a phase adding a gate row re-renders
with `node scripts/render-agent-rules-gates.mjs --write` AFTER merging `main`
locally and before pushing, and the `agent-rules-drift` gate is what catches a
stale render. Only M4-P12 adds a row as planned.

**And the registry test rule applies.** A test over an append-only registry
asserts BY NAME and never BY COUNT. M4-P12 adds a gate; any test that pins the
gate count is on M4-P12's declaration and is edited by it.

### 4.2.9 What this workstream does NOT deliver, stated so it is not reported as met

1. **A merge command.** M4-D-09 puts it in the plugin at cutover. This
   workstream ships the preconditions and nothing that performs a merge.
2. **DR-0029 Part 2c, the untrusted-project-content trust boundary.** M4-D-23
   recommends NO for M4, and Part 3b item 7's exclusion of
   untrusted-contributor repositories is RESTATED here rather than allowed to go
   silent: for the duration of M4, the kernel excludes them, and the reason is
   that the boundary is unbuilt, not that it is unnecessary.
3. **R-065a, squash-only.** An owner action, deferred by the owner, reported by
   M4-P12 as data and carried as an M4 exit-criteria footnote.
4. **Condition 3 of DR-0012** (both reviewers given the acceptance criteria and
   both walked them) is NOT newly checked here. It already has an instrument:
   the verdict's `criteria[]` array and the Kind B check
   `verdict-criteria-complete`. What M4-P12 adds is reading that instrument's
   result at merge time. If the check turns out not to be wired, that is a
   finding for M4-P10's grounding step, not a silent gap.
5. **The permissive arm of DR-0038 against a real single-family environment.**
   Declared fixture-only in M4-P11, for the reason DR-0037 creates.

## 5. Workstream 3: pilot bootstrap

Owns M4 clauses 1, 4 and 6 (delivery/plan/m4-intake.md:69) for the one subject
DR-0037 leaves, the kernel. Third in DR-0036's order.

Everything below was measured on branch `plan/pstack-borrow-review`, node
v22.22.2 (the container default, below the declared floor), with `dist/` absent
unless a criterion says otherwise. Every count is quoted with the command that
produced it, per standing warning 12.

### 3.0 What is left of clauses 1, 4 and 6, stated before any phase

**Clause 1 (charter written and adversarially reviewed) survives whole.** The
subject is the kernel and the charter is a copy-and-amend job, not an authoring
job (section 3.4).

**Clause 4 (seven project gates) shrinks from seven rows to two, and the other
five are discharged by DR-0028 and DR-0029 rather than by work.** This is the
migration-table re-disposition and it is phase M4-P13.

**Clause 6 (R-071, R-072, R-097 productized as bootstrap checks) has NO M4 work
left at all.** It is discharged entirely inside M4-P13. That sentence is written
here rather than left to be inferred, because a clause that quietly acquires no
phase is exactly what the intake's eleven-clause decomposition exists to prevent
(delivery/plan/m4-intake.md:67).

**The intake says clause 4 "has no subject". That is right for four rows and
wrong for two, and the difference is the whole of M4-P13's remaining work.**
Measured on the working tree:

| probe | result |
|---|---|
| `git ls-files \| grep -icE 'i18n\|locale\|messages\.json'` | 0 |
| `git ls-files \| grep -icE 'e2e\|playwright\|cypress'` | 0 |
| `git ls-files \| grep -icE 'analytics\|telemetry'` | 0 |
| `git ls-files \| grep -icE 'eslint\|biome'` | 0, and package.json declares no `lint` script |
| `git ls-files \| grep -icE '^migrations/\|prisma\|supabase'` | 1, and it is `test/fixtures/release/supabase-list-migrations-empty.json` |

So R-042, R-045, R-046 and R-050a have no subject matter. But R-041 (typecheck)
DOES: package.json's `build` script is `tsc -b tsconfig.src.json
tsconfig.test.json`, which CLAUDE.md:281 calls the type gate. And R-047
(regenerate generated manifests, diff clean) does too: the registry already
declares `agent-rules-drift` and `brief-drift`, which are regenerate-and-compare
checks, and CLAUDE.md:299 lists both. Those two rows have a real subject in the
kernel and stay M4.

### 3.1 The phase block

Three phases. The ids are PROVISIONAL and the block is contiguous so the plan's
global allocator can renumber it; branch names follow whatever id is finally
assigned, because the scope auditor derives the phase id from the branch name
and the phase-declaration schema pins the pattern at
src/gates/schemas/phase-declaration.schema.json:18.

| id | one line | kind | depends on | rounds (DR-0035) |
|---|---|---|---|---|
| M4-P13 | the migration-table re-disposition, as one change | paperwork | nothing; merges FIRST in M4 | 1 |
| M4-P14 | the DR-0029 gate CLASS vocabulary, and the kernel's own declarations | kernel | M4-P13 | 3 |
| M4-P15 | the kernel's fleet-home bring-up, and the charter blindness it exposes | mixed | M4-P13 | 2 |

**All three phase declarations land in the SAME pull request as this plan, and
that is a measured requirement rather than tidiness.** src/gates/scope.ts:875
returns RED with the detail "no phase declaration exists at ... in the merge
base" when a phase branch matches the pattern and its declaration is absent from
the merge base. M3-P11 relaxed ADDITIONS to an existing declaration
(src/gates/scope.ts:113: read from BOTH the merge base and the head, an added
entry allowed and printed), and it did NOT relax a declaration that is absent
entirely. So CLAUDE.md's standing sentence that scope declaration grants need
their own pull request is stale for AMENDMENTS and still TRUE for a phase's
FIRST declaration. Landing the three declarations with the plan costs zero extra
CI cycles; landing them separately costs three, which is exactly the waste
DR-0031 was decided against.

### 3.2 M4-P13: the migration-table re-disposition

- **phase id:** M4-P13
- **branch:** `claude/m4-p13-migration-redisposition`
- **kind:** paperwork plus one test edit
- **merge position:** first in M4, before any phase that adds, removes or
  re-buckets a requirement row

#### 3.2.1 The pinned sites: FOUR, not three, and only two are gate-coupled

The intake says the count is pinned in three sites that must move together and
that "editing any one of the three alone reddens the gate"
(delivery/plan/m4-intake.md:946). **Measured, that is wrong in both halves.**

`checkCoverage` was called directly against the real documents, varying one
thing at a time (probe script kept at `/tmp/claude-0/m4-plan/probe.mjs`):

| arm | change | perMilestone | findings |
|---|---|---|---|
| base | none | `{"M4":13,"M3":74,"M1":11,"M2":16,"M5":1}` | 0 |
| A | migration table's Milestone cell for R-045, M4 to M5 | **UNCHANGED** | **0** |
| B | Appendix A bucket for R-045, M4 to DR-0028 | M4 12, `decision` 1 | 0 |
| C | Appendix A bucket for R-045, M4 to `parked` with a note | M4 12, `parked` 1 | 0 |
| D | the same, with an EMPTY note | n/a | `missing-note` for R-045 |

Arm A is the one that matters. The coverage gate reads the migration table for
IDS ONLY (src/gates/coverage.ts:416 extracts ids with `config.inventory.idPattern`
and nothing else), and every bucket comes from the coverage table, which is
delivery/plan/kernel-plan-v1.md (src/gates/coverage.ts:178). So the migration
table's Milestone column can drift from Appendix A silently, forever.

The four sites, and which of them a gate can see:

| # | site | gate-coupled |
|---|---|---|
| 1 | the Milestone column, 13 cells in delivery/requirements/migration-table.md | **NO** |
| 2 | the prose counts sentence at delivery/plan/kernel-plan-v1.md:435 | **NO** |
| 3 | the 13 Appendix A bucket rows in the same file | YES, the coverage gate |
| 4 | test/coverage-gate.test.ts:153 to :162 | YES, the suite |

Site 2 is new information and it carries an invariant nobody checks: that same
sentence says "Buckets follow the migration table's milestone column", which is
precisely what arm A shows no gate enforces.

Site 4 pins SIX numbers, not one. The intake names test/coverage-gate.test.ts:160
(`perMilestone["M4"] === 13`). test/coverage-gate.test.ts:156
(`perKind["milestone"] === 104`) moves too, the moment any row leaves a milestone
bucket for a decision bucket.

**And the clause-map gate does not assert these counts.** The intake says it does
and that it was not run (delivery/plan/m4-intake.md:950). It was run:
`node scripts/check-clause-map.mjs --result ... --evidence ...` exits 0 printing
`clause-map: green (74 clause-map rows checked)`. It reads
delivery/plan/kernel-plan-m3.md and delivery/requirements/clause-map.json, and
`grep -c M4 delivery/requirements/clause-map.json` returns 0. It is entirely
M3-scoped and is not a site.

#### 3.2.2 The disposition rule

A row survives in M4 only if some artifact inside M4's declared scope discharges
it AND DR-0028 and DR-0029 permit that artifact to exist. Otherwise it moves,
and the destination says WHY it moved:

- **`DR-0029`** (a `decision` bucket, src/gates/coverage.ts:188) means the row is
  discharged by the ownership boundary: the rule still binds, the kernel ships
  no command for it, and the project declares it. It is not a park and not a
  deferral.
- **`M5`** means the row needs a second project to exist before anything can be
  built or witnessed, which is what M5 is (delivery/plan/kernel-plan-v1.md:370:
  "a second project onboards from charter alone via the greenfield bootstrap
  path").
- **`M4`** means it stays.

**Why the four subject-less gate rows go to DR-0029 and not to M5.** Moving them
to M5 would say a kernel deliverable falls due when a second project onboards.
DR-0029 says the opposite, and this is a normative claim read off a decided
record rather than a prediction: under the boundary at
delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md:50
the kernel ships no lint, i18n, analytics or e2e command at any milestone.
Bucketing them to M5 recreates the same false premise one milestone later,
which is hazard H-L (working a table a later decision has already changed)
reproduced by the very change meant to fix it.

**`decision` is a declared bucket kind with ZERO current users**, so this is its
first use in this repository; `parked` also has zero. Arm B above is the evidence
that the kind resolves and produces no finding.

#### 3.2.3 The thirteen rows

| row | rule | now | to | why |
|---|---|---|---|---|
| R-001a | orchestrator never writes feature code in projects | M4 | **M4** | The subject exists: the kernel clone under the fleet home's `projects/`. DR-0029 puts authority enforcement on the Tiphys side. Owned by authority enforcement, not this workstream. |
| R-041 | typecheck, zero errors | M4 | **M4** | The subject exists (`tsc -b`, package.json `build`). Retargeted: the kernel's OWN registry declares it, which is DR-0029's dogfooding sentence, not a kernel-shipped project gate. |
| R-042 | lint, zero errors, no suppressions | M4 | **DR-0029** | No linter and no `lint` script in the only subject. "What lint, format and style mean" is the project's, delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md:38. |
| R-045 | locale/i18n parity | M4 | **DR-0029** | Zero i18n files in the only subject; the kernel ships no i18n command at any milestone. |
| R-046 | analytics doc symmetry | M4 | **DR-0029** | Zero analytics files. Supersedes the L1 half of plan decision D-12 (delivery/plan/kernel-plan-v1.md:387); D-12's residue, semantic accuracy via the R-059 blast-radius probe, is untouched. |
| R-047 | generated manifests regenerated, drift committed | M4 | **M4** | The subject exists and is already green: `agent-rules-drift` and `brief-drift`. M4's remaining work is the class declaration plus a red witness. |
| R-050a | all e2e green | M4 | **DR-0029** | Zero e2e files; same as R-045. |
| R-051 | help/docs grep for touched copy | M4 | **DR-0029** | The counter-case is real and is recorded: the kernel's `usage:` strings are a copy surface and a gate could be built. It is not built, nothing in M4 consumes it, and building one is the kernel inventing a predicate DR-0029 assigns to the project. Judged against DR-0027's measured ceremony cost. |
| R-064 | merge on CI green only | M4 | **M4** | Already discharged: ruleset `main-protection` is `enforcement: active` with `required_status_checks` naming `gates` (delivery/plan/m4-intake.md:766). M4 records the evidence; the note is rewritten, the bucket is not. |
| R-065a | squash merge | M4 | **M4** | Owner-deferred 2026-09-15 and the deferral is right: nothing reads it. It stays an M4 exit-criteria footnote. A deferral inside M4 is not a re-disposition. |
| R-071 | migrations not gated on anything flakier than the deploy | M4 | **DR-0029** | The kernel has no migrations (one test fixture). This is a project's CI design rule, and it is the clearest case of a predicate DR-0029 hands to the project. |
| R-072 | per-ref CI concurrency group | M4 | **M5** | The kernel's own instance shipped in M1-P1 per D-15 (`.github/workflows/gates.yml` carries `group: gates-${{ github.ref }}`). What is left is the PRODUCTIZED bootstrap check, which needs a project to bootstrap. |
| R-097 | concurrency group and a migrations/deploys check exist before the first merge | M4 | **M5** | Same artifact as R-072, and its own note already says "greenfield bootstrap path is M5" (delivery/requirements/migration-table.md:175). |

Result, stated as numbers rather than as a claim: M4 5, M5 3, `decision` 6.

#### 3.2.4 Files to touch

- delivery/requirements/migration-table.md (13 Milestone cells, plus the Notes on
  the rows whose target form changes)
- delivery/plan/kernel-plan-v1.md (13 Appendix A rows, the counts sentence at
  delivery/plan/kernel-plan-v1.md:435, and one sentence appended to plan decision
  D-12 at delivery/plan/kernel-plan-v1.md:387)
- test/coverage-gate.test.ts
- delivery/plan/kernel-plan-m4.md (the disposition table above, as the record)
- delivery/work-history/m4-p13.md

Standing pre-authorized extras (`test/behaviors.json`, this phase's work history)
are not listed, per the scope auditor's own rule.

**Not touched, deliberately:** delivery/plan/kernel-plan-v1.md:368, the M4
paragraph itself. Amending it is a separate obligation
(delivery/plan/m4-intake.md:922) and two phases editing one file is a conflict
this plan's pre-pass must record rather than discover. M4-P13 touches only
Appendix A, the counts sentence and D-12; the paragraph rewrite is elsewhere and
merges after.

#### 3.2.5 Acceptance criteria

1. `node src/gates/coverage.ts --result <d>/result.json --evidence <d>` exits 0
   and `result.json` carries `"units": 115` and a `detail` of exactly:
   `115 inventory id(s) checked; per-kind: decision 6, milestone 98, phase 11; per-milestone: M1 11, M2 16, M3 74, M4 5, M5 3, decision 6`
   (the key order is alphabetical because src/gates/coverage.ts:798 sorts it).
2. The six pinned assertions at test/coverage-gate.test.ts:153 to :162 are
   REPLACED by ONE `assert.deepEqual` against one literal object carrying
   `totalInventoryIds`, `perKind` and `perMilestone`, so that a partial
   re-disposition cannot leave five assertions passing and one failing.
   `node --test test/coverage-gate.test.ts` exits 0 and reports N tests with
   N > 0, zero fail, and the SKIPPED count quoted.
3. A new test in test/coverage-gate.test.ts asserts, for all 115 rows, that the
   bucket in Appendix A equals the Milestone cell in the migration table for
   every row whose bucket is a bare `M[0-9]+`, and names every row where they
   differ. Rows bucketed to a `decision` or `parked` value are exempt and the
   exemption is a declared list, not a skip.
4. `node scripts/check-authored-bytes.mjs` exits 0.
5. `node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full
   --only citations --evidence <d> --base origin/main --head HEAD` exits 0 with the
   `citations` gate green and a nonzero unit count, run from a COMMITTED head and
   not from a staged tree.
6. The disposition table is committed in delivery/plan/kernel-plan-m4.md with all
   thirteen rows and a reason per row, before the first M4 gate phase dispatches
   (delivery/plan/m4-intake.md:698).

#### 3.2.6 Hazard class

| hazard | which criterion reddens against it |
|---|---|
| H-L, working a table a later decision already changed | Criterion 6. A row moved without a written reason resolved against DR-0028 or DR-0029 is a row this phase did not do. |
| H-B, a guard whose condition does not test what matters | Criterion 3, and it is the phase's real red witness. The DANGEROUS state is arm A: the migration table saying M4 while Appendix A says DR-0029, green in every gate. Two structurally different members: (i) a bucket/milestone mismatch on a row this phase moves, (ii) a mismatch on a row it does not touch, seeded in a scratch copy. Criterion 1 is green under both, measured: probe arm A changed a Milestone cell and the gate reported the identical detail with zero findings. |
| H-C, a green bundle read as a gate-level assertion | Criterion 1 quotes the coverage gate's OWN `units` and `detail` from `result.json`, not a bundle line. |
| H-H, carrying a citation forward without re-verifying it | Criterion 5, run at a committed head. Every line number in this section was read before it was written; the Appendix A rows move, so any citation into them must be re-verified at commit time. |
| H-A, subject and instrument | Not applicable and stated so: this phase runs no adapter and no plugin. The instrument is the coverage gate, and criterion 3 is a second, independent reader of the same two documents. |

### 3.3 M4-P14: the gate class vocabulary

- **phase id:** M4-P14
- **branch:** `claude/m4-p14-gate-classes`
- **kind:** kernel
- **depends on:** M4-P13 (the six rows moved to DR-0029 promise a declaration
  mechanism; this phase is the mechanism)

#### 3.3.1 Does it still belong? YES, and the intake's M4-D-19 is about the OTHER half

DR-0029 left two things undone. They have different answers and the intake
treats one of them.

**The class vocabulary (`correctness`, `scope`, `review`, declared at
delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md:65
and :78) STILL BELONGS IN M4, and it belongs here.** Three reasons, and the first is the
one that makes it not optional:

1. **M4-P13's six DR-0029 rows are a promise with no artifact until this ships.**
   "The project declares it" is a sentence about a mechanism that does not exist:
   `grep -rn '"correctness"' src/ schemas/` returns nothing, and
   src/gates/schemas/phase-declaration.schema.json has `additionalProperties:
   false` with no class field. Landing the re-disposition and not the mechanism
   is hazard H-G, a design-intent sentence read as a statement about the shipped
   package.
2. **The subject is real and immediate.**
   delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md:50
   makes the kernel "just another project under the scheme, with its own
   registry", and all three
   required classes already have kernel satisfiers: `suite` and the new
   `typecheck` entry for `correctness`, `scope` for `scope`, `check-dual-review`
   for `review`. Unlike i18n or e2e, this vocabulary can be witnessed in M4 by
   the only subject there is.
3. **DR-0029 attaches the requirement to the PHASE, not the project**
   (delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md:71),
   and phase declarations are a shipped artifact this milestone is already
   editing. The cost is one schema field and one check, not a new subsystem.

#### 3.3.2 Files to touch

The drift chain makes this list longer than it looks, and every entry was derived
by reading the checks rather than guessed:

- src/gates/schemas/phase-declaration.schema.json (the class declaration field)
- src/gates/scope.ts or a new src/gates/gate-classes.ts (the check)
- `gate-registry.yaml` (the new `typecheck` entry for R-041, and the class field
  on existing entries)
- gates.manifest.json (a registry-only gate does NOT run in CI; CLAUDE.md:270
  records that the harness invokes `--manifest`)
- CLAUDE.md (its gate block is GENERATED from the registry; `node
  scripts/render-agent-rules-gates.mjs --check` exits nonzero otherwise)
- roles/implementer.md (the same drift relationship, through
  scripts/check-brief-drift.mjs)
- test/gate-registry.test.ts (test/gate-registry.test.ts:1107 asserts that every
  registry gate CI does not run is a DECLARED divergence, so a new entry reddens
  it until the divergence list or the manifest is updated)
- scripts/m2-exit-test.sh (its PR and main expectation tables are literal id
  lists at scripts/m2-exit-test.sh:186 and :250)
- test/coverage-gate.test.ts is NOT touched here; that is M4-P13's file
- delivery/plan/phase-declarations/m4-p14.json, delivery/work-history/m4-p14.md

#### 3.3.3 Acceptance criteria

1. A phase declaration carrying no class declaration at all is RED, and the
   detail names the phase id and the missing classes. Red witness: the
   existing declarations under `delivery/plan/phase-declarations/` (21 JSON files,
   `grep -l 'gateClasses|classes' ... | wc -l` returns 0) all lack the
   field today, so the dangerous state is the CURRENT state and the check must
   be demonstrated red against a copy of a real one before the field is added.
2. A phase declaring a class `not-applicable` with an empty or absent reason is
   RED; the same declaration with a reason is green. A phase declaring a class
   `not-yet-establishable` without naming an establishing phase id is RED; with
   one, green. These are the TWO structurally different members of the class
   "silently having nothing" that
   delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md:83
   names, and one alone does not establish it.
3. `node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full
   --only typecheck --evidence <d>` reports green with units > 0, and the count is
   derived from a number the compiler prints, never a constant. Against a working
   tree carrying one deliberate type error it reports red and the detail names
   the file. Both arms captured.
4. `node scripts/render-agent-rules-gates.mjs --check` exits 0 and
   `node scripts/check-brief-drift.mjs --check` exits 0 after the registry change,
   and both are demonstrated exiting NONZERO on the intermediate commit that adds
   the registry entry without re-rendering (test/gate-registry.test.ts:778 is the
   existing witness for the first).
5. `npm ci && npm run build && npm test` exits 0, with the interpreter version,
   the build state, the invocation, the pass count AND the skipped count quoted
   in the work history, per standing warning 12.
6. `git status` is clean after `npm run build`.

#### 3.3.4 Hazard class

| hazard | which criterion reddens against it |
|---|---|
| H-B, a guard that cannot go red | Criteria 1 and 2. Criterion 1's dangerous state is the CURRENT repository, which is the strongest available form: the check must redden against real declarations, of which there are 21, before the field exists. |
| H-C, a green bundle read as a gate-level assertion | Criterion 3 reads the per-gate record's own `units`, and criterion 4 reads two exit codes directly. |
| H-D, a guard shipped without its carve-out gets switched off | Criterion 2's `not-applicable` and `not-yet-establishable` arms ARE the carve-out, and they ship in the same phase as the requirement. A class system with no declared escape is switched off in the first greenfield phase. |
| H-K, measuring the wrong configuration | Criterion 5 requires the complete sentence. Note that at `1945d69` the container default reports a failure at a head whose CI is green (CLAUDE.md:1009), so the base result is established before any failure is attributed. |
| H-A, subject and instrument | The kernel is declaring classes about its own phases using the checker it is building. The mechanical control that survives: criterion 1's red witness is taken against COPIES of existing declarations in a scratch tree, so the checker is exercised against inputs it did not author. |

### 3.4 M4-P15: the kernel's fleet-home bring-up

- **phase id:** M4-P15
- **branch:** `claude/m4-p15-fleet-bringup`
- **kind:** mixed (evidence, plus one kernel fix the bring-up exposes)
- **depends on:** M4-P13 only for merge order

#### 3.4.1 What exists and what the order must be

The remote exists: `ThomasHendrickx/tiphys-ai-helmsman-fleet`, private, empty
(delivery/plan/m4-intake.md:764). A-2's kernel half is discharged.

**The bring-up order is forced by code, and getting it wrong costs a round.**
`tiphys init` refuses any non-empty directory, and its marker set includes
`.git` (src/commands/init.ts:84 tests `entries.some((entry) =>
fleetMarkers.has(entry))`). So cloning the empty remote FIRST produces a
directory containing only `.git`, and `tiphys init` then exits 1 with "is already
initialized". The order is: `tiphys init` into a fresh empty directory, THEN
`git remote add origin`, THEN push. This is the same root cause as the
fleet-resume defect at delivery/plan/m4-intake.md:513, and it is stated here so
the bring-up does not rediscover it.

The measured checklist to reproduce, from the only recorded end-to-end bring-up
(delivery/evidence/m3-exit-test/e1-1-to-e1-5.md:53):

| step | expected |
|---|---|
| `tiphys init <fresh empty dir>` | exit 0 |
| `tiphys doctor --for full`, as init leaves it | exit 1, and this is RECORDED, not skipped |
| install `gh`, configure the remote, place the charter, clone the project | |
| `tiphys doctor --for full` | exit 0, ZERO FAIL lines |
| `tiphys lock acquire --duration <n>` then `tiphys lock status` | exit 0, held |

One intermediate state is worth naming in advance because it looks like a defect
and is not: with the charter placed but the project clone absent, `retention`
goes FAIL (not WARN) and doctor exits 1, because the check resolves retention
paths against the fleet root AND against `projects/<identity name>`
(delivery/evidence/m3-exit-test/e1-1-to-e1-5.md:98, src/commands/doctor.ts:409).

#### 3.4.2 The charter: a copy-and-amend with THREE changes, not two

The source is delivery/evidence/m3-exit-test/e1/charter.yaml, which declares all
seven irreversible decisions and validates today. The intake names two amendments
(delivery/plan/m4-intake.md:463). There is a third.

1. delivery/evidence/m3-exit-test/e1/charter.yaml:40, the constraint "The
   kernel never runs on itself before M4", is overturned by DR-0036 and must be
   replaced by DR-0036's retained-authority condition, quoted rather than
   paraphrased, so the freeze point is readable from the charter.
2. delivery/evidence/m3-exit-test/e1/charter.yaml:56, `release-verification:
   mode: reserved`. 0.1.0 is published, so the deferral reason has expired. The
   enum admits only `none` and `reserved` (schemas/charter.schema.json:117), so
   this phase either designs the field or records in writing that it stays
   `reserved` through M4. Silence leaves a shipped schema permanently reserved
   (delivery/plan/m4-intake.md:962 is the obligation; the recommendation is in
   section 3.6 below).
3. delivery/evidence/m3-exit-test/e1/charter.yaml:49, "a phase that needs more
   than two fix rounds", contradicts DR-0035, whose ceiling is 3. The same number
   is wrong one more place: `assurance-modes.yaml` carries
   `max-fix-rounds-after-review: 2`. Both are one-line edits and they must move
   together or the charter and the shipped mode data disagree about the same
   rule.

Clause 1 also requires the charter to be ADVERSARIALLY REVIEWED. Under DR-0031
that review ships in this pull request, not in one of its own.

#### 3.4.3 The blindness the bring-up exposes, and why it is in this phase

`tiphys doctor --for full` exiting 0 is NOT evidence that a charter exists.
src/commands/doctor.ts:58 lists the conditions `full` promotes to FAIL:
`gh-missing`, `remote-missing`, `retention-undeclared`, `kernel-artifacts-incomplete`.
`retention-not-applicable`, the condition a fleet with NO charter document
produces (src/commands/doctor.ts:527), is deliberately not among them, and the
comment at src/commands/doctor.ts:50 gives the reason: the generic profile leaves
it a WARN because that is the state a fleet legitimately sits in before its
charter is written.

That reason is about the GENERIC profile. Under `full` it makes the headline
criterion of this phase unable to go red against the dangerous state, which is
the shape this repository has now paid for six times (T-014). The fix and the
witness belong in one pull request because they are one unit of value: the fleet
is up, and doctor can no longer call a charterless fleet full-ready.

#### 3.4.4 Files to touch

- src/commands/doctor.ts (promote `retention-not-applicable` under `full` only)
- test/doctor.test.ts
- delivery/evidence/m4-fleet-bringup/ (the amended charter, the captured records,
  the doctor outputs for both arms)
- `assurance-modes.yaml` (the fix-round ceiling)
- delivery/plan/phase-declarations/m4-p15.json, delivery/work-history/m4-p15.md

The live charter and the fleet state live in the FLEET repository, which is not
this repository. What lands here is the charter source and the evidence, which is
what makes the phase reviewable.

#### 3.4.5 Acceptance criteria

1. `tiphys validate --type charter <fleet>/charter/kernel-charter.yaml` exits 0,
   and a mechanically produced negative copy (one required key deleted, nothing
   else changed) exits nonzero with stderr naming the deleted property. The pair
   is the witness that validation is live rather than ceremonial, exactly as
   delivery/evidence/m3-exit-test/e1-1-to-e1-5.md:34 did it.
2. Against the real remote, `tiphys init` exits 0, the fleet's initial commit
   pushes to `ThomasHendrickx/tiphys-ai-helmsman-fleet` with exit 0, and
   `git ls-remote origin` shows the pushed ref. The E1.2 run used a LOCAL BARE
   repository as origin and explicitly did not witness a real off-container fleet
   home (delivery/evidence/m3-exit-test/e1-1-to-e1-5.md:72); this criterion is
   what closes that.
3. `tiphys doctor --for full` against the fleet as `tiphys init` leaves it is
   RECORDED with its exit code, whatever it is. A run that reports only the final
   green has destroyed the evidence that setup was needed.
4. `tiphys doctor --for full` against the configured fleet exits 0 with ZERO FAIL
   lines, and the full captured output is in the evidence with every CHECK line.
5. **The blindness witness, both arms, same fleet, one variable:** with
   `charter/` emptied, the CURRENT `doctor --for full` exits 0 with
   `CHECK retention WARN ... retention is not applicable`; after the change it
   exits 1 with `CHECK retention FAIL`. Both captures in the evidence.
6. A second member of the same class, structurally different from arm 5: a fleet
   whose `charter/` holds a YAML document with no `kind: charter` already FAILs
   under `full` via `retention-undeclared`. The test asserts the two conditions
   stay DISTINCT after the change, so the fix does not collapse "no charter" and
   "misconfigured charter" into one detail string.
7. `tiphys lock acquire` exits 0 and `tiphys lock status` reports held, with the
   holder id and expiry recorded, because a later dispatch that finds the lease
   expired must record the lapse rather than silently re-acquire.
8. `npm ci && npm run build && npm test` exits 0, with interpreter, build state,
   invocation, pass count and skipped count quoted.
9. Every captured command in the evidence carries its interpreter version and the
   directory it ran in. The scratch-toolchain trap at CLAUDE.md:803 is live for
   any run from a `/tmp/claude-0` worktree.

#### 3.4.6 Hazard class

| hazard | which criterion reddens against it |
|---|---|
| H-B, a guard that cannot go red | Criteria 5 and 6, which ARE the phase's reason for existing. Criterion 4 alone is the guard that cannot go red, and saying so is the point. |
| H-E, the path that cannot be rehearsed is the one that fails | Criterion 2. The rehearsal against a local bare repository is already recorded; this criterion is the unrehearsable half, done once against the real remote, with whatever differs written down rather than closed. |
| H-K, measuring the wrong configuration | Criterion 9. Three axes compose here and a fourth (the interpreter's own path) is live for any scratchpad worktree. |
| H-J, an agent-shaped payload breaks assumptions | Not exercised and stated so: this phase spawns no agent. The macOS pilot's index-lock failure (delivery/plan/m4-intake.md:298) is an adapter criterion, not this one. |
| H-A, subject and instrument | The kernel's doctor is reporting on the kernel's own fleet. The control that survives: criterion 5's two arms differ only in the presence of a file, so a defect in doctor and a defect in the fleet stay discriminable. |
| H-H, carrying a rule forward without re-verifying it | Criterion 3. The intake's bring-up checklist is a month old; every step is re-run rather than cited. |

### 3.5 DR-0029's other undone work: the `templates/` move is NOT M4

M4-D-19 asks whether `gate-registry.yaml` moves to `templates/` before or after
the adapter ships, and revision 2 says the urgency is gone
(delivery/plan/m4-intake.md:745). **The recommendation is stronger than "after":
it is not an M4 item at all, and the M4 plan should say so rather than leave an
open decision floating through the milestone.**

Four reasons, and the fourth is the one that makes it a decision rather than a
preference:

1. **Nothing in M4 consumes it.** DR-0037 leaves one subject and that subject
   already has the registry at the root.
2. **The kernel's whole CI runs off that registry.** Moving it during M4 changes
   the gate set guarding M4's changes, which is hazard H-A with the instrument
   moving under the subject.
3. **The cost is unmeasured and a casualty is already named.**
   delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md:207
   records that nobody has established what the move breaks and names
   `charter-mode-enum-matches-modes` as a known casualty.
4. **DR-0043 already decided this exact shape.** It defers the shipped-package
   cleanup to after M4 on the ground that "the consumer who would be hurt does not
   exist yet" and that M4 is still editing those artifacts
   (delivery/decisions/DR-0043-the-shipped-package-gets-a-post-m4-cleanup.md:66).
   The registry move is the same argument about the same file. Treating it
   differently would be inconsistent with a decided record.

**Recommended disposition, to be recorded as M4-D-25:** the `templates/` move is
a NAMED LINE ITEM of the post-M4 pass DR-0043 schedules, not an M4 workstream.
The M4 plan carries one sentence saying so, and M4-D-19 closes.

**What M4 does owe, and it is separate:** the shipped registry's script gates all
point at `src/`, `bin/` and `scripts/`, none of which is in the tarball, so
`manifest-self-check` crashes for every consumer
(delivery/decisions/DR-0028-does-the-kernel-ship-any-project-gates.md:87). That
is a packaging defect, not prose, and DR-0043 does not cover it. It is NOT this
workstream's to fix, because there is no consumer in M4 to witness the fix
against; it is named here so the post-M4 pass inherits a written statement rather
than a rediscovery.

### 3.6 Open items this section hands on

1. **The charter's `release-verification` field.** Recommendation: it stays
   `reserved` through M4, with the reason WRITTEN INTO THE CHARTER, and a fresh
   `M4-D-nn` records that the designed shape now falls due at cutover with the
   kernel's own npm publication as its first real case. Designing it against one
   subject that publishes through OIDC with no long-lived credential (DR-0039's
   note that its first application may be M5) would be designing against a
   degenerate case.
2. **Conflict pre-pass inputs.** M4-P13 and the separate M4-paragraph revision
   both edit delivery/plan/kernel-plan-v1.md; M4-P14 and any other registry phase
   both edit `gate-registry.yaml`, CLAUDE.md, roles/implementer.md and
   gates.manifest.json. Neither pair is disjoint and the pre-pass must serialise
   them. M4-P15 is disjoint from both.
3. **The phase id block is provisional.** M4-P13 must merge first in M4 whatever
   number it ends up with.
4. **Citation hygiene for this section.** Every `path:line` above was read
   before it was written. Four of them point at lines M4-P13 itself moves
   (test/coverage-gate.test.ts:153, :156, :160 and the Appendix A rows). They
   resolve at the head that lands this plan, because that pull request does not
   change those files, and they ROT the moment M4-P13 merges. That is hazard
   H-H and T-015's shape: a rotted citation that stays in range resolves
   SILENTLY against the wrong line. Re-verify them in any later document that
   repeats them; do not copy them forward.

## 6. Workstreams 4, 5 and 6: fleet durability, cross-environment exclusion, cutover
# M4 plan, section 4: workstreams 4, 5 and 6

Fleet durability, cross-environment exclusion, cutover. Written against
delivery/plan/m4-intake.md, which is the input for this section and is not
re-derived here. Where this section departs from the intake it says so in the
sentence that departs.

Governing records obeyed and not reopened: DR-0012, DR-0016, DR-0028, DR-0029,
DR-0031, DR-0034, DR-0035, DR-0036, DR-0037, DR-0038, DR-0039, DR-0040,
DR-0041, DR-0042, DR-0043.

## 4.0 Numbering, ordering and what this section assumes

**Phase ids here are M4-P16 to M4-P27 and they assume workstreams 1, 2 and 3
consume M4-P1 to M4-P8.** That assumption is stated rather than hidden because
an id in this repository is never renumbered once allocated
(CLAUDE.md, identifier schemes). Reconcile the ranges once, in the plan editor's
merge of the six sections, BEFORE any declaration file is committed. After that
point the ids are fixed.

The workstream order is fixed by the intake and is not reopened here: fleet
durability fourth, cross-environment exclusion fifth, cutover last
(delivery/plan/m4-intake.md:104). Cutover is last by definition: its freeze
point is the moment DR-0036's retained-authority condition lifts, and that
condition is what keeps every earlier workstream reversible.

**Every phase declaration in this section quotes DR-0036's retained-authority
sentence verbatim.** The current process retains planning, review, credentials,
pull request, merge, recovery and closeout authority for every kernel phase
delivered this way, until the cutover workstream says otherwise
(delivery/decisions/DR-0036-the-harness-adapter-leads-m4-and-the-kernel-is-the-second-subject.md:75).
That sentence is the freeze point in workstream 6 and the reversibility
guarantee in workstreams 4 and 5, so it is data in the declaration and not
background in a reader's head.

**Round budgets** are DR-0035's, floor 1 and ceiling 3
(delivery/decisions/DR-0035-review-is-never-skipped-the-rounds-are-what-tier.md:49).
Each phase below carries its budget. At the cap the action is DR-0016's fresh
implementer plus a third review contract, not an owner question.

**A conflict pre-pass is owed and is not asserted here.** CLAUDE.md rule 5
requires a recorded pre-pass before any parallel dispatch. Section 4.4 states
the file-overlap facts this section knows; it is an input to that pre-pass and
is not a substitute for one.

---

## 4.1 Workstream 4: fleet durability

**Owns** clause 8's first and third parts, resume-after-reclamation and
fleet-state sync automation (delivery/plan/kernel-plan-v1.md:99).

**It implements against a fixed written specification.** AGENTS.md:295 says of
itself that it is a specification and not a mechanism, and fixes three
obligations: what survives (AGENTS.md:302), what is rebuilt (AGENTS.md:306),
and what doctor reports on resume (AGENTS.md:310). Disagreeing with any of the
three is a change to a shipped kernel artifact and needs its own record.

**The measured starting point, from the intake and re-stated because the
criteria below key off it.** A fleet home cloned from its remote is missing
`state/`, `worktrees/` and `projects/`, because those three are exactly the
gitignored set (src/fleet.ts:28), and `loadFleet` throws `not a fleet home`
(src/fleet.ts:87). `tiphys init` in that clone exits 1 reporting
`is already initialized`, because the marker test is a `some()` over a set that
contains `.git` (src/commands/init.ts:84). So the rehydration path does not
exist, and the interesting work is reconciliation of CONTENTS, not recreation
of a layout that is three `mkdir` calls.

### M4-P16: fleet rehydration

- **branch:** `claude/m4-p16-fleet-rehydration`
- **round budget:** 2
- **depends on:** nothing in this section. A-2's kernel half is discharged
  (delivery/plan/m4-intake.md:772 records the private fleet remote as existing).
- **files to touch:** `src/commands/resume.ts` (new), `src/cli.ts`,
  `src/commands/init.ts`, `src/fleet.ts`, `test/resume.test.ts` (new),
  `test/init.test.ts`, `test/behaviors.json`,
  `delivery/plan/phase-declarations/m4-p16.json`,
  `delivery/work-history/m4-p16.md`

**What it builds.** One new command, `tiphys resume`, registered in the command
table beside the others at src/cli.ts:31. It rebuilds the ephemeral layout in a
cloned fleet home and reports what it rebuilt. It does not reconcile task state;
that is M4-P17's report and M4-P19's reconstruction.

**Why a new command and not a flag on `init`.** `init` creates a fleet home and
refuses one that exists. `resume` requires one that exists and refuses one that
does not. Two opposite preconditions in one command is how a destructive
mis-invocation gets written. The recommendation is recorded here rather than
escalated, per DR-0016.

**Acceptance criteria.**

1. In a directory that is a git clone carrying `backlog.md`, `package.json`,
   `.gitignore`, `charter/` and `decisions/` and none of `state/`,
   `worktrees/`, `projects/`, `node bin/tiphys.ts resume` exits 0, creates
   exactly those three directories, and prints exactly three lines of the form
   `REBUILT <name>/`. Immediately afterwards `node bin/tiphys.ts doctor` prints
   `CHECK layout PASS`.
2. In a directory that is not a git repository, `resume` exits 1, writes one
   stderr line naming the absent `.git`, and creates nothing. Verified by
   comparing `find . -mindepth 1 | sort | sha256sum` before and after: the two
   digests are equal.
3. In a fleet home whose layout is already complete, `resume` exits 0 and
   prints zero `REBUILT` lines. A second consecutive invocation also prints
   zero.
4. RED WITNESS, dangerous state, member A: a fleet home that is LIVE, holding
   `worktrees/<id>/scratch.txt` with uncommitted content and
   `state/orchestrator.lock` with an unexpired lease. `resume` leaves both
   byte-identical (sha256 of each file equal before and after) and exits 0.
   A `resume` implemented as `rm -rf` plus `mkdir` passes criteria 1 to 3 and
   fails this one.
5. RED WITNESS, dangerous state, member B, structurally different from A: the
   same live fleet home where `worktrees/` exists but `state/` does not, which
   is the half-rebuilt state an interrupted resume leaves. `resume` creates
   `state/` only, prints one `REBUILT` line, and leaves `worktrees/` untouched.
   A `resume` that treats the layout as all-or-nothing fails this one and
   passes A.
6. `tiphys init` in a cloned fleet home still exits 1, and its message now
   names `tiphys resume` as the remedy. Asserted on the remedy token, not on
   the exit code alone, because the exit code is green today
   (src/commands/init.ts:84).
7. Every new behavior is registered by name in `test/behaviors.json` and
   resolves by name. No criterion asserts a test COUNT, because that registry
   is append-only (CLAUDE.md, binding conventions 5).

**Hazard class.**

| hazard | which criterion reddens against it |
|---|---|
| H-B, a guard whose condition does not test the property that matters | criteria 4 and 5: the layout check passing is what a naive rebuild optimises for, and both criteria assert CONTENT survival instead |
| H-E, the path that cannot be rehearsed is the one that fails | criterion 1 is a full rehearsal against a real clone of a real remote, so this phase has no unrehearsable step; stated rather than left implicit |
| H-J, an agent-shaped payload breaks assumptions a subprocess never tested | criterion 4's live worktree is the shape a reclaimed session leaves behind |

### M4-P17: doctor reports a post-reclaim fleet

- **branch:** `claude/m4-p17-doctor-post-reclaim`
- **round budget:** 3
- **depends on:** M4-P16 (its fixtures are the post-reclaim fleet).
- **files to touch:** `src/commands/doctor.ts`, `src/lock.ts`, `src/pool.ts`,
  `test/doctor.test.ts`, `test/behaviors.json`,
  `delivery/plan/phase-declarations/m4-p17.json`,
  `delivery/work-history/m4-p17.md`

**What it builds.** The three doctor checks AGENTS.md:310 requires and the
kernel does not have, plus the correction of the one that reports the wrong
verdict.

**Acceptance criteria.**

1. An EXPIRED lease is a FAIL, not a PASS. With `state/orchestrator.lock`
   carrying `expiresAt` one second in the past, `doctor` prints
   `CHECK lock FAIL` with a detail naming the holder id and the expiry, and
   exits 1. Today that exact input prints `CHECK lock PASS` with `(expired)`
   appended to the detail and exits 0 (src/commands/doctor.ts:274). The test
   asserts the STATUS TOKEN and the EXIT CODE; a test asserting only that the
   detail contains the word `expired` is green today and is refused at review
   as the H-B shape.
2. RED WITNESS class member for criterion 1, structurally different: a lease
   whose `expiresAt` parses to exactly the current millisecond. `isExpired`
   uses `<=` (src/lock.ts:154), so the boundary is inclusive, and the check
   must agree with the lock module rather than carry a second comparison.
   Two members, one boundary and one interior, which is the class the
   one-witness-is-not-a-class rule asks for.
3. A new `CHECK tasks` derived from `tasks/` only: a task is OPEN when
   `tasks/<id>/meta.json` exists and `tasks/<id>/turn-end` does not. In a
   fixture fleet with three tasks of which one is open, it prints
   `CHECK tasks WARN 1 open of 3 (<id>)` and names the open id. It reads no
   log tail (C-1) and probes no process (C-2), asserted by a test that greps
   the new source for `/proc`, `process.kill`, `pid` and `stream.jsonl` and
   requires zero hits.
4. A new `CHECK worktrees` reporting each entry under `worktrees/` and whether
   a pool record exists beside it (src/pool.ts:161). A worktree with no record
   is reported by id with status WARN. This is the input M4-P19 consumes.
5. A new `CHECK branches` reporting phase branches that are pushed and
   unmerged, derived from git. It is WARN and is NEVER promoted to FAIL by any
   profile. The reason is measured and is not a preference: remote branch
   deletion is refused in this container and the delete dry run exits 0 either
   way (CLAUDE.md standing warning 14), so a promotable branch check would make
   `doctor --for full` unpassable on the kernel's own fleet and would then be
   switched off, which is hazard H-D. The count is printed; the exit code does
   not move.
6. `CHECK remote` fetches and compares. After `git fetch`, it reports the
   ahead and behind counts of the fleet's HEAD against its tracked remote ref.
   RED WITNESS, dangerous state, member A: a fleet home with a remote
   configured and two commits that have never been pushed prints
   `CHECK remote WARN 2 unpushed` where today it prints
   `CHECK remote PASS remote configured (origin)` (src/commands/doctor.ts:220).
   Member B, structurally different: the fetch itself FAILS (remote URL points
   at a path that does not exist). The check reports a third status naming the
   fetch failure and never PASS. A check that swallows the fetch failure and
   falls back to the old non-empty-list test is green in member B and is the
   guard-that-cannot-go-red shape this repository has recorded six times.
7. `doctor` still prints one line per check and still exits 0 only when no
   check FAILs, and the advisory still runs last (src/commands/doctor.ts:887
   records why). The existing doctor behaviors in `test/behaviors.json` still
   resolve by name.

**Hazard class.**

| hazard | which criterion reddens against it |
|---|---|
| H-B | criteria 1, 2 and 6 member B; each is a check whose current condition is true of the dangerous state |
| H-D, a guard shipped without its carve-out gets switched off | criterion 5's explicit refusal to promote the branch check, with the measured reason |
| H-F, a milestone-closing condition evaluated as a judgment | criteria 3, 4 and 5 are the computed inputs cutover's drain predicate consumes; without them drain is a reading |
| H-K, measuring the wrong configuration | the work history quotes toolchain, build state and invocation for every suite result (CLAUDE.md standing warning 12) |

### M4-P18: fleet-state sync automation

- **branch:** `claude/m4-p18-fleet-state-sync`
- **round budget:** 3
- **depends on:** M4-P16.
- **files to touch:** `src/commands/sync.ts` (new), `src/cli.ts`,
  `src/status.ts`, `src/commands/init.ts`, `test/sync.test.ts` (new),
  `test/status.test.ts`, `test/behaviors.json`, `AGENTS.md`,
  `delivery/plan/phase-declarations/m4-p18.json`,
  `delivery/work-history/m4-p18.md`

**What it builds.** `tiphys sync`: the executable half of
AGENTS.md:230's commit-and-push discipline, which today is discharged by an
agent remembering to do it. It also lands M4-D-13's split.

**M4-D-13 is decided here as the intake recommends, and the reasoning is
recorded rather than asked.** `state/status/current.json` (src/status.ts:32)
moves to a tracked path and becomes durable; `state/status/stream.jsonl`
(src/status.ts:31) stays under `state/` and stays rebuilt. C-1 is the reason
the split exists and not a constraint the split has to dodge: `readCurrent`
opens the whole document and does not know the stream's path (src/status.ts:15),
so making the document durable changes where it lives and changes nothing about
how current state is read.

**Acceptance criteria.**

1. `tiphys sync` in a fleet home with a modified durable file and a modified
   ephemeral file commits exactly the first. Afterwards
   `git status --porcelain` lists exactly the ephemeral path and nothing else.
2. The durable set is data, not a literal list inside the command: it is
   derived from the fleet `.gitignore` written at init, so a file added to the
   ignored set is excluded by that same derivation rather than by a second list
   that can drift out of step with it. Asserted by adding a fourth ignored
   prefix to a fixture fleet and observing `sync` exclude it with no source
   change.
3. RED WITNESS, dangerous state, member A: `state/orchestrator.lock` present
   and unstaged. `sync` does not commit it, and `git show --stat HEAD` names
   zero paths under `state/` other than the relocated status document.
4. RED WITNESS, dangerous state, member B, structurally different: the operator
   ran `git add -A` first, so the lease is ALREADY STAGED when `sync` runs.
   `sync` exits nonzero with one line naming the staged ephemeral path and
   commits nothing. Member A is green under an implementation that stages a
   path list and commits; member B is not. One witness is not a class.
5. The push failure arm is written first and is reachable. With the remote URL
   pointing at a path that does not exist, `sync` exits nonzero and its stderr
   carries the first line of git's own stderr. A test asserts the exit code and
   the presence of a captured substring taken from a real failing run, never a
   hand-written message (T-003's rule, CLAUDE.md standing warning 10).
6. The commit message carries no AI model or tool name (CLAUDE.md binding
   convention 7). Asserted against a deny list held in `test/`, with two
   members, so the assertion is over a class and not over one string.
7. `tiphys status show` output is unchanged when `state/status/stream.jsonl` is
   truncated mid-line. This re-points the existing C-1 witness at the new
   layout and must be demonstrated red by pointing `readCurrent` at the stream
   in a scratch mutant, per the red-witness rule's application to fix rounds.
8. AGENTS.md:230 is amended to name `tiphys sync` as the mechanism and to stop
   describing the duty as one an agent performs by hand. AGENTS.md:295's
   sentence deferring the machinery to "a later milestone" is amended to name
   the delivering phases. Both edits are in THIS phase's declaration, because a
   shipped policy document that describes an absent mechanism is hazard H-H.

**Hazard class.**

| hazard | which criterion reddens against it |
|---|---|
| H-B | criterion 4: the already-staged arm is the one a path-list implementation cannot see |
| H-H, carrying a rule forward without re-verifying it | criterion 8 amends the two AGENTS.md clauses this phase makes false |
| H-J | criterion 5: an agent session that dies mid-push leaves the failure arm as the only observed behaviour |
| H-I, a pull request whose contents do not match its unit of value | the AGENTS.md amendment ships WITH the mechanism in one pull request, per DR-0031 |

### M4-P19: pool-record reconstruction and post-reclaim teardown

- **branch:** `claude/m4-p19-pool-record-reconstruction`
- **round budget:** 2
- **depends on:** M4-P16 and M4-P17.
- **files to touch:** `src/pool.ts`, `src/teardown.ts`,
  `src/commands/teardown.ts`, `src/commands/doctor.ts`, `test/pool.test.ts`,
  `test/teardown.test.ts`, `test/behaviors.json`,
  `delivery/plan/phase-declarations/m4-p19.json`,
  `delivery/work-history/m4-p19.md`

**The defect this closes, measured.** `tasks/<id>/meta.json` is tracked and
survives a reclaim; `worktrees/<id>.pool.json` cannot survive, because it sits
beside the worktree by design so it can never dirty the destroy-time
cleanliness check (src/pool.ts:39). Teardown then refuses without a pool record
and says so in terms (src/teardown.ts:199), so the plan's stated fallback of
manual teardown does not work post-reclaim: the manual path is itself blocked.

**M4-D-12 is decided here as the intake recommends: reconstruct for reporting,
never for destruction.**

**Acceptance criteria.**

1. With `tasks/<id>/meta.json` present and `worktrees/<id>.pool.json` absent,
   `tiphys pool list` includes the id with a `reconstructed` marker, and
   `doctor`'s `CHECK worktrees` line names it. Reconstruction is derived from
   `meta.json` and from git, never from a remembered value.
2. `tiphys teardown --task <id>` against that task still exits 1, and its
   single reason line now names the explicit flag. Today the reason names no
   remedy (src/teardown.ts:199), so the test asserts the remedy token.
3. `tiphys teardown --task <id> --from-reconstructed` exits 0 only when the
   reconstruction resolves both a project remote and a default branch. When
   either is unresolvable it exits 1 and names the missing field. The flag
   mirrors the existing explicit-destruction pattern rather than inventing a
   second one.
4. RED WITNESS, dangerous state, member A: reconstructed record plus a worktree
   holding uncommitted changes. `--from-reconstructed` refuses, removes
   nothing, and the worktree's `git status --porcelain` output is byte-identical
   before and after.
5. RED WITNESS, dangerous state, member B, structurally different: reconstructed
   record plus a CLEAN worktree whose branch carries commits not present on the
   remote default branch. `--from-reconstructed` refuses and names the branch
   tip sha. Member A is caught by the existing dirty check; member B is not,
   which is what makes the two structurally different rather than two dirty
   worktrees.
6. A reconstructed record is never written to `worktrees/<id>.pool.json`. It
   exists only in memory for the reporting and the flagged path, so a later
   reader cannot mistake a reconstruction for an original. Asserted by listing
   `worktrees/` after every criterion above.

**Hazard class.**

| hazard | which criterion reddens against it |
|---|---|
| H-B | criterion 5: the arm a naive synthesise-and-destroy implementation is green on |
| H-J, mis-classified launch failure destroying a worktree holding work | criteria 4 and 5 are exactly that class, reached from the reclaim side |
| H-E | criterion 3 is fully rehearsable against a scratch fleet; the phase names no unrehearsable step |

---

## 4.2 Workstream 5: cross-environment exclusion

**Owns** clause 8's second part, distributed lease semantics
(delivery/plan/kernel-plan-v1.md:99).

**It is a build from nothing and the kernel says so.** src/lock.ts:63 states the
exclusion domain honestly: the lease excludes within one filesystem and one
clock, and cross-environment exclusion for a fleet shared through a git remote
is M4 residue and is not claimed. There is no defect in `lock.ts` to fix. M4
adds a second layer above it.

**Three facts fix the shape of the work.** The lease file lives under the
gitignored `state/` prefix (src/fleet.ts:28), so exclusion through the shared
remote cannot be built on the current lease artifact. `lease.hostname` is
written at acquire (src/lock.ts:415) and no code compares it to anything, so
there is no environment identity to build on either. And `isExpired` compares a
lease timestamp against the local clock (src/lock.ts:153), so two environments
bring two clocks and clock skew moves inside scope. C-2 forbids the obvious
escape: no process probing, no `/proc`, no signal checks, in any of these
phases.

**There is no test to inherit**, so the red witnesses are built before the
mechanism and that is why M4-P20 exists as its own phase rather than as a
criterion inside M4-P21.

### M4-P20: the double-acquire witnesses and the compare-and-swap probe

- **branch:** `claude/m4-p20-exclusion-pre-pass`
- **round budget:** 1
- **depends on:** nothing.
- **prototype-blocked:** NO. This phase IS the prototype that unblocks M4-D-11.
- **files to touch:** `scripts/probe-cas-ref.mjs` (new),
  `test/cas-probe.test.ts` (new), `test/behaviors.json`,
  `delivery/verification/cross-environment-exclusion-probe.md` (new),
  `delivery/plan/phase-declarations/m4-p20.json`,
  `delivery/work-history/m4-p20.md`

**Why a phase and not a criterion.** M4-D-11 is PROTOTYPE-BLOCKED
(delivery/plan/m4-intake.md:745). A decision
taken on it without the probe is a guess, and the intake says so. Running the
probe inside the mechanism phase means the mechanism's design is fixed before
its own evidence exists. It is also the phase that discharges the red-witness
rule's stronger form: the witnesses are demonstrated red against TODAY's code,
before any exclusion layer exists to make them green for the wrong reason.

**Acceptance criteria.**

1. `node scripts/probe-cas-ref.mjs --remote <path>` creates a bare repository
   and two clones A and B at ABSOLUTE paths (CLAUDE.md standing warning 9: git
   resolves relative paths against the repository, not the shell), has A push a
   lease document to `refs/tiphys/lease` with
   `--force-with-lease=refs/tiphys/lease:<exact sha>`, has B push against a
   stale expected sha, and prints exactly two lines, `A accept` and
   `B refuse <first line of git stderr>`, exit 0.
2. The refusal signature in criterion 1 is CAPTURED from a real forced
   contention, never hand-written. The probe prints the raw stderr and the
   committed evidence document carries it verbatim, with the git version. This
   is T-003's rule applied to a new contention family.
3. The probe also measures the two ways the lease can be VACUOUS, and reports
   them as failures rather than as notes: (a) the remote ref does not exist at
   all, and (b) the pushing clone has never fetched the ref, so its
   remote-tracking value is stale or absent. If either accepts a push that
   overwrites another environment's value, the bare `--force-with-lease` form
   is refused for the design and the exact-sha form is mandated. This criterion
   is the anti-vacuous one: a compare-and-swap that can be satisfied without
   having seen the current value is not a compare-and-swap, and that is hazard
   H-B in the one place it would be hardest to notice later.
4. RED WITNESS against today's code, member A (concurrent): two clones of one
   fleet remote, `acquireLease` called in each against its own
   `state/orchestrator.lock`. Both return `{ok: true}`. Captured output and
   both holder ids are committed.
5. RED WITNESS against today's code, member B (sequential through the remote,
   structurally different from A): clone 1 acquires, commits and pushes
   everything it is allowed to push, then clone 2 is created FROM that push and
   acquires. Both leases are live and neither clone can see the other's,
   because `state/` never travels (src/fleet.ts:28). Member A shows the race;
   member B shows that there is no race to lose, which is the stronger
   statement and the one a reader is likely to doubt.
6. The evidence document states WHAT THE PROBE DID NOT COVER, per the fix-round
   contract's third item: clock skew is not probed in this phase; the probe
   runs against a local bare repository rather than against GitHub, so
   server-side ref-update ordering is inferred and not measured; and no
   concurrent push from two hosts was attempted.
7. One behavior registered by name in `test/behaviors.json`: the probe's
   refusal arm. The test runs the probe against a scratch bare repository and
   asserts the two printed lines and exit 0, so the probe itself is guarded
   against silently becoming a no-op.

**Hazard class.**

| hazard | which criterion reddens against it |
|---|---|
| H-B | criterion 3, which is written specifically to catch a lease that cannot refuse |
| H-E, the path that cannot be rehearsed | criterion 6 names the unrehearsed part, GitHub's own ref-update ordering, rather than letting a local probe read as a measurement of the remote |
| H-K, measuring the wrong configuration | criterion 1's absolute paths and criterion 2's captured signature |

### M4-P21: the shared exclusion register

- **branch:** `claude/m4-p21-cross-environment-lease`
- **round budget:** 3
- **depends on:** M4-P20. **prototype-blocked until M4-P20 lands.**
- **files to touch:** `src/exclusion.ts` (new), `src/lock.ts`,
  `src/commands/lock.ts`, `src/commands/init.ts`,
  `test/cross-environment-lock.test.ts` (new), `test/lock.test.ts`,
  `test/behaviors.json`, `delivery/plan/phase-declarations/m4-p21.json`,
  `delivery/work-history/m4-p21.md`

**What it builds.** A second exclusion layer above `lock.ts`, declared per
fleet home and off by default: an environment identity, a monotonic fencing
counter, and a compare-and-swap register on a dedicated git ref.

**Acceptance criteria.**

1. Declaration, not inference. A fleet home opts in through a field in its own
   `package.json`, which is already the fleet's owner-controlled pin file
   (src/commands/init.ts writes it). With the field absent, every command
   behaves exactly as it does today and the new code path is not entered,
   asserted by a test that runs the existing lock behaviors unchanged.
2. With the field set, `tiphys lock acquire` in clone A exits 0 and the ref
   `refs/tiphys/lease` on the shared remote carries A's lease document. The
   same command in clone B exits 1 with ONE line naming A's environment id and
   the expiry, and `git ls-remote` shows the ref sha unchanged, byte-identical
   to its value before B ran.
3. Environment identity is not hostname, not a pid and not a process probe
   (C-2). It is a random id generated once and written to a TRACKED fleet file,
   so it survives a reclaim and travels with the clone. Asserted by a test that
   greps `src/exclusion.ts` for `hostname`, `process.pid`, `/proc` and
   `kill(` and requires zero hits, and by a second test that clones the fleet
   and observes the same id.
4. RED WITNESS, dangerous state, member A: clone B's clock is ten minutes AHEAD
   of A's, injected through the existing `nowMs` seam (src/lock.ts:403) and
   never by changing a system clock. A's lease is unexpired by A's clock and
   expired by B's. B's takeover is REFUSED, and B's output names which
   comparison decided it.
5. RED WITNESS, dangerous state, member B, structurally different from A:
   clone B's clock is ten minutes BEHIND. B renews its own lease and A does not
   treat the renewal as stale. Member A is the takeover direction and member B
   is the renewal direction; an implementation that simply widens a tolerance
   passes one and fails the other.
6. The decision in criteria 4 and 5 is made against the fencing COUNTER where
   the register is reachable, and against the clock only where it is not, and
   the command PRINTS which of the two it used. A run that cannot say which one
   it used fails this criterion.
7. Fail closed on an unreachable register. With the remote unreachable,
   `lock acquire` under the declared field exits nonzero and does NOT fall back
   to local-only exclusion. A silent fallback is the vacuous green this
   workstream exists to prevent, so the test asserts the exit code AND that the
   local lock file was not created.
8. Release goes through the same compare-and-swap. A release attempted by a
   non-holder is refused and the register sha is byte-identical before and
   after.
9. Both M4-P20 witnesses are converted to tests and are now GREEN, and the work
   history shows each one red at the branch's first commit and green at its
   tip, with both captured runs.

**Hazard class.**

| hazard | which criterion reddens against it |
|---|---|
| H-B | criterion 7, the fallback that would make the layer green everywhere |
| H-D, a guard shipped without its carve-out gets switched off | criterion 1: the layer is opt-in per fleet home, so a fleet that cannot reach a remote is not forced to disable it globally |
| H-J | criterion 5: a reclaimed environment resuming with a clock that moved |
| H-K | criteria 4 and 5 inject the clock through a seam, so the measurement is of the code and not of the container |

### M4-P22: shared-exclusion integration and the two-environment rehearsal

- **branch:** `claude/m4-p22-shared-exclusion-integration`
- **round budget:** 2
- **depends on:** M4-P21, and on M4-P17 for the doctor check shape.
- **files to touch:** `src/commands/doctor.ts`, `src/spawn.ts`,
  `src/teardown.ts`, `src/exclusion.ts`, `test/doctor.test.ts`,
  `test/spawn.test.ts`, `test/teardown.test.ts`, `test/behaviors.json`,
  `delivery/verification/two-environment-rehearsal.md` (new),
  `delivery/plan/phase-declarations/m4-p22.json`,
  `delivery/work-history/m4-p22.md`

**Acceptance criteria.**

1. `doctor` prints `CHECK shared-lock` with exactly one of four statuses:
   `not-declared`, `free`, `held <envId> until <t>`, `unreachable <reason>`.
   The fourth is never PASS. Reporting a third status rather than forcing a
   binary is the shape DR-0038 already settled for a different check, reused
   here rather than reinvented
   (delivery/decisions/DR-0038-the-declared-single-family-review-exception.md:1).
2. RED WITNESS, dangerous state: `tiphys spawn` refuses when the shared
   register names another environment WHILE the local lease is held by this
   one. The local holdership check already passes in that state (it was built
   in M1-P4), so a test that holds neither lease is green without this feature
   and is refused at review.
3. The same for `tiphys teardown`, with one reason line, exit nonzero, and
   nothing removed.
4. A real rehearsal across two clones on two different filesystem roots is
   committed with captured output and exit codes for every step.
5. The rehearsal document NAMES what it could not reach, and this is a
   criterion rather than a courtesy: two genuinely different machines, two
   genuinely different system clocks, and GitHub's own ref-update ordering
   under concurrent pushes. The reason it matters here is T-025's: a rehearsal
   that does not perform the check the real step performs cannot fail the way
   the real step fails
   (delivery/tuition/T-025-the-one-path-that-cannot-be-rehearsed-is-the-one-that-failed.md:30).

**Hazard class.**

| hazard | which criterion reddens against it |
|---|---|
| H-B | criterion 2, whose whole point is the arm the existing guard is already green on |
| H-E | criterion 5 names the unrehearsable half instead of implying the rehearsal covered it |
| H-C, a green bundle read as a gate-level assertion | criterion 1's four statuses make an unreachable register visible per check rather than absorbed into a bundle |

---

## 4.3 Workstream 6: cutover

**Owns** clauses 2 and 11, and D-19's second limb
(delivery/plan/kernel-plan-v1.md:394).

**The retirement inventory has three roots** and only one is citable from a
linted document: `CLAUDE.md` (the agent-rules single source, CLAUDE.md:3), the
`.claude/skills` tree, and `.claude/orchestrator-next.mjs`. The other two are
quoted, not cited, because a leading dot cannot start a citation token and a
reference to them is invisible to the citations gate (CLAUDE.md rule 3b, and
the extraction table at delivery/plan/m4-intake.md:46). Sizing this workstream
as "rewrite CLAUDE.md" understates it by two artifacts.

**The retirement partition is decided and is not reopened.** Tiphys owns the
PROCESS and the project owns the PREDICATE (DR-0029), so `.claude/` is process
and goes; `scripts/` are this project's own predicate and are KEPT;
`delivery/` is KEPT, because it is the audit trail that proves replacing the
process worked.

**The freeze point is a condition, not a date**, and it lifts exactly once. It
decomposes into five independently flippable switches, from DR-0036's condition
sentence read against DR-0025's retained list
(delivery/decisions/DR-0025-controlled-pre-m4-local-pilot.md:45):

| switch | what it governs |
|---|---|
| `planning-and-scope` | the plan and every scope decision |
| `review-and-arbitration` | independent review and fix-round arbitration |
| `credentials-and-refs` | every GitHub credential and every push, pull-request, merge and branch-protection action |
| `salvage-and-recovery` | salvage and recovery when work is left incomplete |
| `closeout` | phase closeout and the post-merge duties |

Five switches rather than one event is what makes the rollback in M4-P26
partial rather than all-or-nothing, and it is why `credentials-and-refs`, the
one with owner latency, is separable from the four that are not.

### M4-P23: the retirement inventory and the rule re-verification pass

- **branch:** `claude/m4-p23-retirement-inventory`
- **round budget:** 2
- **depends on:** nothing.
- **files to touch:** `delivery/plan/cutover/retirement-inventory.md` (new),
  `delivery/plan/cutover/retirement-inventory.json` (new),
  `scripts/check-retirement-inventory.mjs` (new),
  `test/retirement-inventory.test.ts` (new), `test/behaviors.json`,
  `CLAUDE.md`, `delivery/plan/phase-declarations/m4-p23.json`,
  `delivery/work-history/m4-p23.md`

**Why `delivery/plan/cutover/`.** The citations gate treats
`delivery/plan/**/*.md` as a document AND as citation-required
(src/gates/citations.ts:240). A new tree anywhere else is not linted, and the
intake records that choosing the linted location is opting into the discipline
rather than out of it. The JSON sibling carries the machine-readable rows; the
markdown carries the reasoning and the captured commands.

**Acceptance criteria.**

1. Every rule in the three roots has exactly one row. The row count is produced
   by a committed extraction command whose output is in the work history, not
   by a human count, and the checker compares the two. A count that is asserted
   rather than derived is refused at review.
2. Every row carries a destination in a closed vocabulary of three: `PORT`
   naming the kernel artifact it moves to, `DELETE` with a reason, or `KEEP`
   with the DR-0029 side it belongs to.
3. Every row carries a `verified-by` command and its captured output,
   re-verifying the rule against `src/` at the phase's head. A row without one
   makes `node scripts/check-retirement-inventory.mjs` exit nonzero.
4. Every `PORT` row also carries a `negative-witness` command: a command that
   was RED under the old rule. This is what makes "verify not weaker"
   mechanical. The intake marks loop functions 5 and 6 as
   "PORT, verify not weaker" and that phrase is a judgment until it is a
   command.
5. RED WITNESS for the checker, member A: a row with an empty `verified-by`
   makes the checker exit nonzero. Member B, structurally different: a `PORT`
   row whose `negative-witness` command exits 0 (that is, it does not redden
   under the new artifact either) also makes the checker exit nonzero. Member A
   catches an absent field; member B catches a present-but-vacuous one, which
   is the shape that survives a field check.
6. At least one row is marked FALSE and is corrected in this phase.
   CLAUDE.md:766 states that scope declaration grants still need their own pull
   request because the scope gate reads the declaration from the merge base
   only. src/gates/scope.ts:110 records that M3-P11 changed exactly that: the
   declaration is read from BOTH the merge base and the head. Carrying that
   rule across uncritically would encode a false constraint into kernel briefs
   permanently.
7. Nothing in the three roots is DELETED in this phase. The inventory is a
   description. Deletion happens in M4-P25 and only under the constraint in
   section 4.3's rollback note.

**Hazard class.**

| hazard | which criterion reddens against it |
|---|---|
| H-H, carrying a rule forward without re-verifying it | criteria 3 and 6, the second of which is the measured instance |
| H-B | criterion 5 member B: a checker that only checks for a field's presence is the guard that cannot go red |
| H-F | criterion 1: the row count is derived, not judged |
| H-L, working a table a later decision already changed | criterion 6 is that exact case, one level down |

### M4-P24: the three loop gaps

- **branch:** `claude/m4-p24-cutover-gaps`
- **round budget:** 3
- **depends on:** the plugin package from workstream 1.
  **prototype-blocked** on M4-D-07 (how a real agent payload authenticates
  under the credential scrub), which workstream 2 owns.
- **files to touch:** `src/commands/next.ts` (new), `src/cli.ts`,
  `packages/claude-code-plugin/` (the pull-request and merge driver; exact
  paths owned by workstream 1's declaration and cross-referenced here, not
  duplicated), `test/next.test.ts` (new), `test/behaviors.json`,
  `delivery/plan/phase-declarations/m4-p24.json`,
  `delivery/work-history/m4-p24.md`

**What the gaps are.** Five of the phase-delivery loop's ten functions are
PORTS. Three are GAPS: open the pull request, merge, and the stop condition.
The kernel states in its own source that it never opens pull requests, and
M4-D-09 keeps that boundary: the pull-request and merge capability lands in the
PLUGIN, invoked by the orchestrator which holds the credential. Under DR-0036's
condition it stays with the current process for the whole of M4 regardless, so
this phase ships the capability and does not exercise the authority.

**M4-D-10 is decided here as the intake recommends: build the stop condition.**
The rule it enforces (the orchestrator does not decide when it is finished) has
three recorded violations behind it and no destination in the kernel.

**Acceptance criteria.**

1. `tiphys next` in a fleet home prints exactly one next action and exits 3
   while any in-flight item exists. It exits 0 only when every in-flight
   category is empty. The exit code is distinct from 0 and from 1 so a caller
   can tell "work remains" from "the command failed".
2. It derives its working directory from the fleet home
   (`loadFleet(process.cwd())`, src/fleet.ts:82) and contains no absolute path
   literal. Asserted by a test that greps the new source for `/home/` and
   `/tmp/` and requires zero hits. The script being retired hard-codes one
   session's scratchpad path, which is why this is a criterion and not a note.
3. The delivered-elsewhere predicate. A branch whose commits have landed on
   `main` under different shas is reported DELIVERED, not OPEN. RED WITNESS
   member A: a squash-merged branch, whose tip sha is not an ancestor of `main`
   and whose patch content is. Member B, structurally different: a branch whose
   commits landed inside ANOTHER branch's pull request, so neither its tip nor
   its patch ids appear as a contiguous run on `main`. Both are reported OPEN
   by `git branch --merged`, which is the naive implementation and the one
   delivery/STATE.md:54 names as a stop condition that cannot go green.
4. It prints what it CANNOT see as a named list: open pull requests, CI
   conclusions, and post-merge push runs. RED WITNESS: with the network
   unreachable, the cannot-see block is still printed and the exit code is
   unchanged. A command that silently degrades to a shorter answer when the
   network is gone is indistinguishable from one reporting a quiet system,
   which is the shape CLAUDE.md standing warning 6 records for watchers.
5. The plugin's `pr open` and `pr merge` each exit nonzero with one line when
   the credential is absent, and the KERNEL process never receives that
   credential. Asserted by running the kernel's own credential-scrub probe from
   INSIDE the adapter's child environment rather than by building a second
   mechanism, which is what the M2 obligation already specifies
   (delivery/plan/kernel-plan-m2.md:451).
6. Neither `pr open` nor `pr merge` is invoked by any kernel code path in M4.
   Asserted by a test grepping `src/` and `bin/` for the plugin's command names
   and requiring zero hits. This is DR-0036's condition expressed as a test
   rather than as a promise.

**Hazard class.**

| hazard | which criterion reddens against it |
|---|---|
| H-F, a milestone-closing condition evaluated as a judgment | criteria 1 and 3: the stop condition is computed and exits nonzero while work remains |
| H-B | criterion 4: an unreachable network must not make the guard quiet |
| H-G, a design-intent sentence read as a statement about the shipped package | criterion 6 tests the boundary rather than restating it |
| H-A, the kernel is both subject and instrument | criterion 6 is the mechanical half of DR-0036's retained authority; the human half stays with the current process |

### M4-P25: the freeze switches, drain, and the retirement criteria

- **branch:** `claude/m4-p25-freeze-and-drain`
- **round budget:** 3
- **depends on:** M4-P23 (inventory rows), M4-P24 (the in-flight predicate),
  M4-P17 (the doctor checks that feed it).
- **files to touch:** `src/cutover.ts` (new), `src/commands/cutover.ts` (new),
  `src/cli.ts`, `schemas/cutover-state.schema.json` (new),
  `test/cutover.test.ts` (new), `test/behaviors.json`,
  `delivery/plan/cutover/freeze-point.md` (new),
  `delivery/plan/phase-declarations/m4-p25.json`,
  `delivery/work-history/m4-p25.md`

**M4-D-15 is decided here as the intake recommends: drain is a computed
predicate over IN-FLIGHT work only.** Open pull requests, live worktrees,
dispatched agents. Branch cleanup becomes a separate owner action that does not
gate cutover, because remote ref deletion is refused in this container and the
delete dry run exits 0 either way (CLAUDE.md standing warning 14). Defining
drain as "no unmerged branches" blocks cutover indefinitely on an owner action
with no local pre-check.

**Acceptance criteria.**

1. `tiphys cutover status` prints exactly five `SWITCH <name> current|kernel`
   lines, with the five names fixed by the table in section 4.3, plus one
   `DRAIN clean|<n> in flight` line. It exits 0 only when all five read
   `kernel` AND drain is clean.
2. RED WITNESS for drain, dangerous state, member A: a fixture fleet with many
   pushed unmerged branches and ZERO in-flight items exits 0 and prints the
   branch count on an informational line. A drain predicate that counts
   branches fails this and is the definition that blocks cutover forever.
3. RED WITNESS for drain, member B, structurally different: a fixture with one
   LIVE WORKTREE and zero open tasks exits nonzero; and a third fixture with
   one OPEN TASK (meta.json present, turn-end absent) and zero worktrees also
   exits nonzero. Two structurally different in-flight members, so the
   predicate is over a class and not over one directory.
4. Every switch write records `flipped-at`, `flipped-by`, `reason` and
   `restore-to`. A write missing `restore-to` is refused, exit nonzero, and
   nothing is written. This is the criterion that makes M4-P26's rollback
   executable rather than a memory, and it is validated by the shipped schema,
   not by the command.
5. BINDING PRECONDITION, asserted by the command: no switch may report `kernel`
   while `delivery/plan/cutover/pre-freeze-ruleset.json` is absent, or older
   than the most recent switch write. That file carries the captured
   branch-protection ruleset and every credential grant AS THEY WERE before the
   first flip. It exists because M4-P26's owner-latency step cannot be
   rehearsed and its INPUT can. RED WITNESS: delete the file and observe every
   `kernel` switch report a refusal.
6. `tiphys cutover status --retirement` prints one line per `PORT` row of the
   M4-P23 inventory, each `ported` or `unported`, derived from the named kernel
   artifact existing AND from that row's `negative-witness` command being red
   under the new artifact. It exits nonzero while any row is `unported`.
7. The command mutates nothing. Asserted by a sha256 over the fixture fleet
   tree before and after every invocation in every criterion above.
8. Deletion of retired artifacts, when it happens, ships in ONE pull request
   with its replacement (DR-0031, and hazard H-I: `main` must not assert
   evidence for code it does not contain, nor carry code its evidence does not
   cover).

**Hazard class.**

| hazard | which criterion reddens against it |
|---|---|
| H-F | criteria 1, 2, 3 and 6: every closing condition is computed, and the command exits nonzero while work remains |
| H-E | criterion 5: the one step that cannot be rehearsed has its input captured in advance |
| H-I | criterion 8 |
| H-B | criterion 6: a `ported` verdict derived only from a file existing is the vacuous version, so the negative witness is part of the derivation |

### M4-P26: the rollback procedure (D-19's second limb)

- **branch:** `claude/m4-p26-rollback`
- **round budget:** 3
- **depends on:** M4-P25.
- **files to touch:** `delivery/plan/cutover/rollback.md` (new),
  `src/commands/cutover.ts`, `src/cutover.ts`,
  `scripts/rehearse-cutover-rollback.mjs` (new), `test/cutover.test.ts`,
  `test/behaviors.json`, `delivery/plan/phase-declarations/m4-p26.json`,
  `delivery/work-history/m4-p26.md`

**D-19 requires a rollback procedure for three distinct triggers: drain
reversal, freeze-point restore, and retirement criteria unmet
(delivery/plan/kernel-plan-v1.md:394). A procedure covering only "it broke"
does not discharge D-19.** The procedure below is the deliverable. It is
written as executable steps, each with the command that performs it and the
observation that proves it happened.

**What rollback is NOT.** It does not reopen the settled hard-cutover decision.
D-19 says so in its own sentence: what hard cutover excludes is dual-running
after acceptance, not recovery from a cutover that fails.

**The file half is cheap and the authority half is not.** Everything under
`.claude/` is git-tracked and revertible from history. The branch-protection
ruleset is owner-configured and the orchestrator cannot change it, so freeze
and unfreeze both carry owner latency and are not a git revert.

**Ordering when more than one trigger fires: 1, then 2, then 3.** Drain
reversal is the only one of the three that can LOSE WORK, so it goes first even
when a freeze-point restore is also indicated.

#### Trigger 1: DRAIN REVERSAL

**Fires when** `tiphys cutover status` reports a nonzero `DRAIN` line while at
least one switch reads `kernel`. That is: in-flight work exists that the old
process must handle, after drain was computed clean and cutover was entered.

1. `tiphys cutover rollback --trigger drain-reversal` sets all five switches to
   `current` in ONE atomic rewrite, then commits and pushes the fleet state
   through `tiphys sync` (M4-P18). It exits nonzero if the push did not land,
   and the failure arm is written first.
2. `tiphys cutover status --in-flight --json` enumerates the in-flight items by
   id. The output is written to
   `delivery/plan/cutover/drain-reversal-<date>.md` with the command and its
   exit code, before any item is touched.
3. For each LIVE WORKTREE: `tiphys teardown --task <id> --salvage`, which
   pushes the leavings. Where the pool record is absent because the fleet was
   reclaimed, use M4-P19's `--from-reconstructed` path. Record the exit code
   per item in the same document.
4. For each OPEN TASK with no turn-end: the agent-salvage procedure, which is
   the process artifact quoted as `.claude/skills/agent-salvage/SKILL.md` until
   M4-P23's inventory ports it. **Binding constraint that follows from this
   step: nothing in the retirement set is DELETED while trigger 1 is
   reachable.** The old path has to still exist for the rollback to have
   somewhere to go, and trigger 1 is reachable until the switches have been
   `kernel` through at least one full phase with drain clean throughout.
5. Re-run `tiphys cutover status`. The rolled-back state is five `current`
   switches and a clean `DRAIN` line, exit 0.

**Rehearsable: FULLY.** Steps 1 to 5 run against a scratch fleet with two
in-flight items of the two structurally different kinds, and the rehearsal
script asserts exit 0 at step 5.

#### Trigger 2: FREEZE-POINT RESTORE

**Fires when** work delivered under flipped switches is found to be wrong, and
authority must return to the current process for phases already run under it.
DR-0036 names the revert cost as "whatever phases ran under it", which is why
this trigger has a re-audit step and trigger 1 does not.

1. Identify the flip: `git log --format=%H -- <fleet>/cutover.json` in the
   fleet home gives the commits that moved a switch. Each switch carries its
   own `restore-to` (M4-P25 criterion 4), so restoration is reading a recorded
   value and not reconstructing an intent.
2. Restore the FILES. On a fresh branch cut from `main`, restore the retirement
   roots from the pre-freeze sha and open a pull request. The tree must be
   clean before this step and the procedure asserts it with
   `git status --porcelain` being empty, because ANY `git checkout --` in a
   tree holding uncommitted work is destructive, including when it names a
   single path (CLAUDE.md standing warning 8, which this repository has paid
   for twice).
3. Restore the AUTHORITY. This is an OWNER action with owner latency. The
   command generates the request from
   `delivery/plan/cutover/pre-freeze-ruleset.json` (M4-P25 criterion 5): the
   exact ruleset name, the exact rules to restore, and every credential grant
   to withdraw, each with its pre-flip value. The generated request is diffed
   against the live ruleset read through the API, and the diff is what the
   owner receives. An `A-n` id is requested from delivery/STATE.md, which is
   the sole allocator (CLAUDE.md, identifier schemes).
4. Re-audit every phase that ran under the flipped switches. The list is
   computed: `git log --since=<flipped-at> --name-only -- delivery/work-history/`
   gives the phases. Each is re-reviewed under the restored authority.
   DR-0012's conditions are owner-reserved and are NOT relaxed for a rollback:
   two independent clean-room reviews on different model families, no
   unresolved high or medium finding, CI green on the exact head, scope audit
   passing.
5. Record the restore in a new decision record and in delivery/STATE.md. A
   decided record is never reopened, so the restore is a NEW record and never
   an edit to DR-0036.

**UNREHEARSABLE STEP, NAMED, WITH THE PROPERTY THAT MAKES IT SO.** Step 3
cannot be rehearsed together with steps 1, 2, 4 and 5. **The property is that
the branch-protection ruleset is a single live object on one repository owned
by the owner: there is no second instance to rehearse against, and no dry run
that distinguishes allowed from refused.** The precedent is measured twice in
this repository and both measurements have the same shape, a rehearsal that
does not perform the check the real step performs:

| rehearsal | reported | what the real step did |
|---|---|---|
| `git push --dry-run --delete origin <branch>` | `- [deleted]`, exit 0 | refused, HTTP 403 (CLAUDE.md standing warning 14) |
| `npm publish --dry-run --provenance` | exit 0 | refused by the registry, 422 (delivery/tuition/T-025-the-one-path-that-cannot-be-rehearsed-is-the-one-that-failed.md:40) |

T-025 also records the transferable practice, and it is the one applied here:
writing the asymmetry down BEFORE the action is what makes the failure a known
cost rather than an accident
(delivery/tuition/T-025-the-one-path-that-cannot-be-rehearsed-is-the-one-that-failed.md:57).

So step 3 is rehearsed in its PREPARATION and not in its EXECUTION: the
rehearsal asserts that the generated request is complete, that every field has
a recorded pre-flip value, and that the diff against the live ruleset is
non-empty when a rule has moved. It asserts nothing about whether the owner's
change will be accepted, and the procedure says so in the document rather than
letting a green rehearsal imply it.

**Step 4 is also not rehearsable in full**, for a different and smaller reason:
it consumes real review capacity on real phases, and a rehearsal with fabricated
verdicts would be the exact fabrication DR-0012's conditions exist to prevent.
Its rehearsable half is the PHASE LIST computation in step 4's first sentence,
which runs against a fixture repository.

#### Trigger 3: RETIREMENT CRITERIA UNMET

**Fires when** the switches read `kernel` and drain is clean, but
`tiphys cutover status --retirement` exits nonzero: one or more `PORT` rows is
`unported`, or a ported destination is WEAKER than the rule it replaced. This is
the trigger that catches a cutover which completed on paperwork.

1. `tiphys cutover status --retirement` lists the failing rows by id, exit
   nonzero. The list is the work item; no reading of the inventory is required
   to produce it.
2. For each row, choose: port it properly, or revert the retirement of the
   source artifact. Reverting the source artifact uses trigger 2 step 2's
   mechanism, which is a file restore and is cheap.
3. A row whose destination EXISTS but is WEAKER is decided by its
   `negative-witness` command (M4-P23 criterion 4), not by a reading. The
   witness was red under the old rule; retirement is refused until it is red
   under the new artifact too. This is what turns the intake's
   "PORT, verify not weaker" from a judgment into a command.
4. Repeat from step 1 until exit 0, or, if a row cannot be ported within its
   DR-0035 round budget, flip the switches back under trigger 2. A row that
   consumes its budget is DR-0016's fresh-implementer case and is not an owner
   question.

**Rehearsable: steps 1 to 3 FULLY**, against a fixture inventory carrying one
deliberately weaker destination. Step 4's flip-back inherits trigger 2 step 3's
unrehearsable execution and nothing more.

#### Acceptance criteria for M4-P26

1. `delivery/plan/cutover/rollback.md` contains all three triggers, each with
   numbered steps, each step naming the command that performs it and the
   observation that proves it happened. A trigger without an observation per
   step fails review.
2. `tiphys cutover rollback --trigger drain-reversal` performs trigger 1 step 1
   atomically: either all five switches move or none does. RED WITNESS: inject
   a write failure after the second switch and assert the file still reads five
   `kernel` values, with no partial state on disk.
3. `node scripts/rehearse-cutover-rollback.mjs` runs trigger 1 end to end
   against a scratch fleet carrying two structurally different in-flight items
   (a live worktree and an open task) and exits 0.
4. The same script runs trigger 3 steps 1 to 3 against a fixture inventory with
   one weaker destination and exits nonzero at step 1, then exits 0 after the
   row is ported. Both arms are captured in the work history.
5. The script REFUSES to rehearse trigger 2 step 3 and prints one line naming
   the property that makes it unrehearsable. A rehearsal script that silently
   skips a step is the T-025 shape one level up, so the refusal is explicit and
   is asserted by a test.
6. The generated owner request for trigger 2 step 3 is complete: every field in
   `pre-freeze-ruleset.json` appears in it with its pre-flip value. RED WITNESS,
   member A: remove one field from the captured ruleset and assert the
   generator exits nonzero naming it. Member B, structurally different: leave
   every field present but make one field's value EMPTY, and assert the
   generator also exits nonzero. Member A catches an absent key; member B
   catches a present-but-useless value, which is the arm a key check is green
   on.
7. Trigger 2 step 2 refuses to run in a tree with uncommitted changes, exit
   nonzero, nothing touched. RED WITNESS: a dirty tree with a modified file
   under a retirement root, asserted byte-identical after the refusal.
8. The rollback document states what the procedure does NOT cover: it does not
   restore work an agent held only in its own session (AGENTS.md:302 already
   fixes that boundary), it does not undo an npm publish, and it does not
   delete a remote ref, because this container cannot.

**Hazard class.**

| hazard | which criterion reddens against it |
|---|---|
| H-E, the path that cannot be rehearsed is the one that fails | criterion 5, which makes the unrehearsable step refuse loudly instead of being skipped quietly, and criterion 6, which rehearses its input |
| H-B | criterion 6 member B, and criterion 2's partial-write injection |
| H-F | criterion 1: every step has an observation, so no step closes on a judgment |
| H-H | criterion 8: the procedure states its own boundary rather than letting a later reader assume it covers more |
| H-A, kernel as both subject and instrument | trigger 2 step 4 keeps DR-0012's owner-reserved conditions unrelaxed, which is the human control the intake says cannot be replaced from inside the record |

### M4-P27: the cutover-entry trigger and the exit test's first conjunct

- **branch:** `claude/m4-p27-cutover-entry-trigger`
- **round budget:** 2
- **depends on:** M4-P22 (cross-environment exclusion delivered is one limb of
  the trigger) and M4-P25 (the computed preconditions).
- **files to touch:** `delivery/plan/cutover/entry-trigger.md` (new),
  `scripts/check-cutover-entry.mjs` (new),
  `scripts/probe-pilot-readonly.mjs` (new),
  `test/cutover-entry.test.ts` (new), `test/behaviors.json`,
  `delivery/plan/phase-declarations/m4-p27.json`,
  `delivery/work-history/m4-p27.md`

**The trigger is DR-0042's, restated as steps and not re-decided.** DR-0041
bound the exit test's first conjunct to the pilot and made it fall due at
cutover entry on a written trigger
(delivery/decisions/DR-0041-the-exit-test-stays-bound-to-the-pilot-and-the-kernel-is-not-its-subject.md:121).
DR-0042 superseded that trigger's second clause: the pilot's reachability is an
owner action and not a state of the world, so the trigger is re-probe read-only,
ask the owner to reboot, then run the test as written
(delivery/decisions/DR-0042-reading-the-pilot-is-allowed-and-the-pilot-can-be-rebooted.md:53).
The amendment option stays in reserve and its bar goes UP.

**The trigger, as steps.**

1. **Compute the preconditions.** `node scripts/check-cutover-entry.mjs` exits
   0 only when all four of these hold, and names the failing one otherwise:
   (a) `tiphys cutover status` reports `DRAIN clean`; (b) the cross-environment
   exclusion behaviors registered by M4-P21 and M4-P22 resolve by name in
   `test/behaviors.json` and their tests pass; (c)
   `tiphys cutover status --retirement` reports zero `unported` rows;
   (d) `delivery/plan/cutover/pre-freeze-ruleset.json` is present and newer
   than the most recent inventory change.
2. **Re-probe the pilot, read-only.** `node scripts/probe-pilot-readonly.mjs`
   records the pilot's current state into
   `delivery/verification/pulse-re-probe.md`. This is the first ACT after the
   preconditions because everything downstream depends on facts the intake
   itself calls a month stale (delivery/plan/m4-intake.md:150). DR-0037 stands:
   this orchestrator does not WORK on the pilot, and reading is the whole of
   what is permitted.
3. **Ask the owner to reboot the pilot session.** This is an owner action. An
   `A-n` id is requested from delivery/STATE.md, which is the sole allocator;
   the plan does not pick a number. Before asking, verify the reboot has not
   already happened, because asking for work that already exists costs the
   owner the attention DR-0016 exists to protect.
4. **Run the exit test as written, on the pilot**, with this orchestrator
   verifying the pushed evidence read-only. The second conjunct, "the old
   process is retired", is this repository's own and is discharged by M4-P23
   through M4-P26; it is not blocked on step 3.

**Acceptance criteria.**

1. `delivery/plan/cutover/entry-trigger.md` states the four steps above, each
   with its computed precondition and its command.
2. `node scripts/check-cutover-entry.mjs` exits 0 when all four arms hold, and
   exits nonzero naming the failing arm when any one is forced false. RED
   WITNESS: each of the four arms individually forced false in a fixture, four
   captured runs in the work history. Four members rather than two, because the
   arms are independent and a checker that short-circuits on the first is green
   on the other three.
3. `scripts/probe-pilot-readonly.mjs` performs no write of any kind. Asserted
   by a test that greps the script for every write verb it could use (`POST`,
   `PATCH`, `PUT`, `DELETE`, `push`, `gh pr`, `gh issue`) and requires zero
   hits, and by a second assertion that the only git operations it invokes are
   `ls-remote` and `clone --depth 1`. Two independent assertions, because a
   grep over verbs and a whitelist over operations fail differently.
4. The probe's failure arm is written first and is reachable: with the pilot
   unreachable, it exits nonzero and writes the reason into the evidence
   document. It does NOT report an empty result as a clean one. This
   repository has been bitten three times by a search whose scope was wrong
   returning an empty result indistinguishable from an absence.
5. The entry-trigger document records that the amendment option is in reserve
   with a raised bar, and cites DR-0042 for why. It does not re-argue the
   decision.
6. The document names what the trigger does NOT settle: whether the pilot
   returns as a SUBJECT for the non-cutover workstreams or only for the exit
   test. DR-0042 assumes the narrower reading and says so explicitly
   (delivery/decisions/DR-0042-reading-the-pilot-is-allowed-and-the-pilot-can-be-rebooted.md:87).

**Hazard class.**

| hazard | which criterion reddens against it |
|---|---|
| H-F | criterion 2: cutover entry is a computed predicate with four named arms, not a reading |
| H-B | criterion 4: an unreachable pilot must not read as a clean probe |
| H-H | criterion 5: DR-0042 is cited rather than restated, so a later reader cannot act on a paraphrase that has drifted |
| H-A | criterion 3: the read-only boundary is tested, which is the one control that keeps the pilot an independent subject |

---

## 4.4 Merge order, parallelism, and what this section owes the pre-pass

**Merge order is dependency order, always, even where work order is
concurrent** (CLAUDE.md binding convention 5).

```
M4-P16  -> M4-P17 -> M4-P19
M4-P16  -> M4-P18
M4-P20 -> M4-P21 -> M4-P22
M4-P23 -> M4-P25 -> M4-P26 -> (with M4-P22) M4-P27
M4-P24 -> M4-P25
```

**What this section knows about disjointness**, offered as INPUT to the
required pre-pass and not as the pre-pass:

- M4-P20 touches no file any other phase in this section touches. It is
  dispatchable concurrently with M4-P16 from the first day of the workstream
  block.
- M4-P23 touches `CLAUDE.md` and a new tree. Of the phases here, only M4-P18
  touches `AGENTS.md`, which is a different file. M4-P23 is concurrent with all
  of workstream 4.
- M4-P17, M4-P19 and M4-P22 all touch `src/commands/doctor.ts`. They serialise
  against each other.
- M4-P18, M4-P24, M4-P25 and M4-P26 all touch `src/cli.ts`, which is a
  five-line command table (src/cli.ts:31). That is a conflict the pre-pass
  should judge rather than a reason to serialise four phases; the pre-pass
  records the judgment either way.
- `test/behaviors.json` is append-only and is resolved as a union against the
  merge base. It never re-serialises a phase, and no criterion in this section
  asserts a count over it.

---

## 4.5 Decisions taken in this section, recorded rather than escalated

Each is an orchestrator decision under DR-0016, taken because the analysis
yields a recommendation worth defending, which is the test the record sets for
whether a question was ever a question. Each needs a `DR-nnnn` allocated
against the whole git history before use, because a retired id is never reused.

| open decision | taken as | where |
|---|---|---|
| M4-D-11, where the distributed lease lives | a dedicated git ref used as a compare-and-swap register through `--force-with-lease`, with the EXACT-SHA form mandated | M4-P20 criterion 3, M4-P21 |
| M4-D-12, may reconciliation reconstruct a pool record | reconstruct for reporting, never for destruction, with an explicit flag for the destructive path | M4-P19 |
| M4-D-13, does status move to a tracked path | split: `current.json` becomes durable and tracked, the stream stays ephemeral | M4-P18 |
| M4-D-10, does M4 build a kernel stop condition | BUILD IT, deriving its working directory and carrying a delivered-elsewhere predicate | M4-P24 |
| M4-D-15, what does drain mean | a computed predicate over in-flight work only; branch cleanup is a separate owner action that does not gate cutover | M4-P25 |

M4-D-09 (who opens pull requests and merges) is cited in M4-P24 and is
workstream 2's to record, because the credential half sits there.


## 9. What this plan does NOT settle

Stated so nothing here is reported as covered when it is not.

1. **The exit test's subject.** DR-0041 defers it to cutover entry and DR-0042
   makes the pilot reachable on an owner reboot. M4-P27 is the trigger. This
   plan does not amend the exit test and its bar for doing so is deliberately
   high.
2. **Three probes that have not run**, listed in M4-P1's amendment. One of them,
   whether `PreToolUse` hooks fire under a bypass permission mode, gates M4-P9's
   design and is one run.
3. **The vacuity question for a third gate status.** A probe established that
   the never-green-by-omission rewrite fires only for `status === "green"`, so a
   VACUOUS third status appears constructible. That was a READING of the code
   and not a run. It is exactly the shape M2-C-2 exists against and M4-P11 must
   re-measure it rather than inherit it.
4. **Whether the HTTP 403 on non-`refs/heads/*` namespaces originates at GitHub
   or at the agent proxy.** The two available signals disagree and the control
   arm cannot be run from this container. M4-P21 plans on a `refs/heads/*`
   branch, which is the form measured to work, and the question stays open.
5. **The post-M4 package cleanup** (DR-0043) is not an M4 workstream and no
   phase here delivers it.
6. **Whether the pilot returns as a working subject**, as opposed to returning
   only for the exit test. DR-0042 assumes the narrower reading. If the wider
   one is ever taken, DR-0037's contention argument returns and workstream 5
   becomes its precondition.

## 10. The four drafting passes, and what each did not cover

This plan was drafted in four concurrent passes and assembled here. Each pass
stated the limits of its own search, and those statements are preserved inside
the workstream sections rather than summarised away. The assembly added three
things the passes could not: the id allocation across colliding drafts, the
cross-workstream pre-pass in section 2, and section 0's reconciliation against
probe results that landed after the drafts were written.

**The assembly did not re-derive the phases.** Every acceptance criterion below
is as its drafting pass wrote it, with phase ids renumbered and M4-P1 amended.
A clean-room review of this plan should treat that as its first check.

## 11. Revision 2, 2026-09-16: two phases added for defects found by review

Two defects in SHIPPED code were found on 2026-09-16, both by clean-room review
of other phases, and neither is owned by any of the twenty-seven phases above.
The binding rule of this plan is that if it is not written here, it is not being
made, so they are written here rather than dispatched against nothing.

Both are added as phases rather than folded into an existing one, because the
fix-round contract forbids widening a phase to carry a defect its branch did not
introduce, and both belong to `src/gates/`, which no M4 phase declares.

Ids M4-P28 and M4-P29 are freshly allocated. Checked against the whole history,
not the current tree, per the never-reuse rule. Captured:

```
$ git log --all --oneline -S'M4-P28'
$ git log --all --oneline -S'M4-P29'
$ grep -o '^### M4-P[0-9]*' delivery/plan/kernel-plan-m4.md | grep -o '[0-9]*$' | sort -n | tail -1
27
```

Both searches return no commits, and the highest existing id is 27.

### M4-P28: the coverage gate stops measuring machine load

**Branch:** `claude/m4-p28-coverage-instrument`

**The defect.** `src/gates/coverage.ts:235` defines
`REGEX_EXEC_TIMEOUT_MS = 250` and applies it at src/gates/coverage.ts:257 as a
WALL-CLOCK budget, reporting at src/gates/coverage.ts:261 that a pattern "did
not complete within 250ms". The word "complete" presents elapsed time as
evidence about the regex. It is not. Measured at load 33, one million executions
of `^(?:R-[0-9]+[a-z]?)$` against a six-character input take 154.2 ms in total,
0.000154 ms each, so a single execution is roughly 1.6 million times under the
budget. Both patterns observed failing are anchored with no nested quantifier
and no alternation over a repeated group, so no catastrophic backtracking is
available to them at any input length.

**Why it is a phase and not a note.** `coverage` is a REQUIRED gate in `full` and
`direct-pr` modes, `src/gates/` is inside DR-0027's shipped surface, and the
path is the user-visible `tiphys gates run`. It fails in the direction that
costs most, a correct branch reported wrong, and three independent parties have
now hit it. The second-order cost is an agent trained to wave a required gate
through.

**Acceptance criteria, falsifiable.**

1. The guard's verdict does not change with machine load. Witness: the two
   patterns and inputs recorded in
   delivery/verification/wall-clock-budgets-are-load-dependent.md:1 evaluate to
   the same verdict at load under 5 and at load over 45, ten runs each, zero
   differing verdicts.
2. A genuinely catastrophic pattern is still caught. Witness: a nested-quantifier
   pattern against an input that forces exponential backtracking is reported,
   and it is reported at load under 5, where a wall-clock budget would be most
   likely to let it pass.
3. The two members of criterion 2's class are structurally different, not one
   pattern twice.
4. `node --test test/coverage-gate.test.ts` exits 0 and reports N tests, N > 0,
   with the SKIPPED count quoted.

**Explicitly NOT in scope.** Raising the constant. That keeps the instrument and
only moves the load at which it lies, so it is named here as a rejected option
rather than left available to an implementer in a hurry.

**Files to touch:** `src/gates/coverage.ts`, `test/coverage-gate.test.ts`,
`test/behaviors.json`, `delivery/work-history/m4-p28.md`.

### M4-P29: three gate CLIs stop truncating their own reports

**Branch:** `claude/m4-p29-gate-cli-exit`

**The defect.** `process.exit(main(...))` at the CLI entry point of three shipped
modules: src/gates/credentials.ts:691, src/gates/red-witness.ts:574 and
src/gates/suite.ts:1142. The registry invokes the four gates they serve as
subprocesses, so their stdout is a PIPE, and `process.stdout.write` to a pipe is
asynchronous while `process.exit` does not wait for the queue to drain. Measured:
58,890 bytes arrive intact, 118,890 bytes arrive as 65,466, one pipe buffer. The
same code to a FILE loses nothing, which is why it survives casual testing.

**Severity, stated honestly.** LATENT. The largest gate stdout in any captured
evidence is 2,425 bytes, thirty times below the trigger, so nothing is losing
evidence today. No verdict can change through this path either, because the exit
code survives; what is lost is the evidence, which for this project is its own
kind of serious. The plausible future trigger is `suite`, whose subject is
another program's output and whose suite now reports 846 tests.

**Acceptance criteria, falsifiable.**

1. Each of the three entry points sets `process.exitCode` and does not call
   `process.exit` with a computed status.
2. A report larger than one pipe buffer survives. Witness: a gate run producing
   over 128 KiB of stdout, piped, arrives byte-complete; the same run before the
   change arrives truncated at approximately 65,536 bytes.
3. The exit code is unchanged in every arm. Witness: green, red, not-applicable
   and error each produce the same status before and after.
4. `node --test` exits 0 and reports N tests, N > 0, with the SKIPPED count.

**Files to touch:** `src/gates/credentials.ts`, `src/gates/red-witness.ts`,
`src/gates/suite.ts`, their tests, `test/behaviors.json`,
`delivery/work-history/m4-p29.md`.

### What this revision did NOT cover

- **`scripts/*.mjs`.** Only `src/` and `bin/` were grepped for the
  `process.exit` pattern. The script gates were not examined and may carry it.
- **stderr.** Only stdout was measured for truncation.
- **The other patterns the coverage gate compiles.** Two were timed, the two a
  reviewer reported. One of the rest may genuinely backtrack, which would be a
  real finding the current instrument is too noisy to surface.
- **Whether either defect has ever affected a CI run here.** No run was checked
  for either signature, so the claim is about the mechanism, not about damage
  already done.
- **Sequencing against the other twenty-seven.** Neither phase touches a file on
  any existing phase's declaration, so the conflict pre-pass is not re-derived
  here; that check is owed before either is dispatched concurrently.
