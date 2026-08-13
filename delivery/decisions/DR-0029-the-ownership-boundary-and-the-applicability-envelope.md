# DR-0029: the ownership boundary, and where Tiphys does NOT apply

- id: DR-0029
- project: tiphys-kernel
- status: **BOUNDARY DECIDED BY THE OWNER, 2026-08-13. ENVELOPE DRAFTED BY THE
  ORCHESTRATOR AT THE OWNER'S INSTRUCTION AND AWAITING THEIR CONFIRMATION.**
  The two halves are marked separately below and must not be read as one
  sign-off.
- resolves: DR-0028
- governs: the framing of M4's mandatory intake (plan decision D-19)
- date: 2026-08-13

## Part 1: the boundary. DECIDED BY THE OWNER.

The owner's words:

> I expect tiphys to take full ownership on making the orchestration work,
> dispatching workers, making sure they deliver, that up front is known what to
> deliver, that it is able to come from high level requirements and make that
> into a plan and execute that and deliver that.
>
> But the actual output, the code type, the tests that need to be run, the
> actual checks of what makes done done are project specific and even personal.
> We therefore foresee that those project specific parts are hooked in for
> tiphys to work. That means that skills that are project specific and needed to
> write the correct code come also from the repository, that linting scripts
> etc, come from the project, what makes it good to actually open the PR comes
> from the project, what green looks like is project specific.
>
> Tiphys is ruthless on making sure green is green and not greenish yellow. That
> nothing else passes, but not to define what green actually is within the
> project itself.

Restated as the operative rule:

**Tiphys owns the PROCESS. The project owns the PREDICATE. Tiphys enforces that
green is green; it does not define green.**

| Tiphys owns | The project owns |
|---|---|
| orchestration, dispatch, worker liveness | what the code is, and how it is written here |
| requirements to plan to execution to delivery | which tests exist and what they run |
| knowing UP FRONT what is to be delivered | what lint, format and style mean |
| the gate CONTRACT and the anti-vacuity machinery | every gate COMMAND and every threshold |
| the role briefs and the dispatch discipline | project-specific skills |
| refusing a green that was not earned | what makes a pull request ready |

Consequence, and it settles DR-0028: **the kernel ships no command and no
threshold.** Its current `gate-registry.yaml` becomes an EXAMPLE under
`templates/`, and the kernel becomes just another project under the scheme, with
its own registry. It dogfoods the extension point rather than being exempt from
it.

## Part 2: the three clarifications. DECIDED with Part 1.

### 2a. Classes, not commands, and they attach to the PHASE

The kernel requires a phase to declare at least one gate in each required CLASS.
It never says what the command is.

| class | meaning | status |
|---|---|---|
| `correctness` | something executable that fails when the code is wrong | required |
| `scope` | the change is the change that was promised | required |
| `review` | an independent read happened, with a recorded verdict | required |
| lint, e2e, i18n, deploy, docs, anything else | project's business | **kernel has no opinion** |

**The requirement attaches to the PHASE, not the project.** "This project must
have a correctness gate" is unsatisfiable on day zero. "This phase either asserts
correctness or declares when it will" is satisfiable from the first commit and is
checkable per change rather than once at onboarding. This refinement came from
the owner's greenfield challenge and is the load-bearing correction to the
original proposal.

A phase may declare a class **not-applicable with a recorded reason**, or
**not-yet-establishable naming the phase that will establish it**. The second is
an IOU with a due date, not a waiver: it is data, it is visible, and it is
carried forward, so a phase 7 still saying "correctness: see phase 2" is LOUD.

The property being protected: **you can start from nothing; you can never
SILENTLY have nothing.**

### 2b. The anti-vacuity meta-contract is the actual product

Every project-supplied gate must satisfy this, and the kernel enforces it:

1. **Units, or it is not green.** A gate reports how many things it asserted.
   Zero units asserted is VACUOUS, not green.
2. **A demonstrated red witness.** The project supplies the mutation that makes
   its gate fail; the kernel verifies the gate actually reddens against it. A
   gate never demonstrated red is `unwitnessed` and cannot contribute to green.
3. **Preconditions as DATA, never prose.** `not-applicable` is a computed verdict
   from a declared precondition. **A crash must never render as not-applicable.**
4. **Exit code is evidence, not proof.** A gate declares what its codes mean.

Zero units is vacuous only when a gate CLAIMS a population and asserted nothing.
A gate correctly reporting "no changed service methods in this diff" is
not-applicable with a computed reason, which is already how the kernel works and
is not the failure this rule targets.

This clause is where "ruthless" actually lives. It is entirely project-agnostic,
and it is what a project would otherwise have to build from scratch every time.

### 2c. Skills are a different channel with a trust boundary

Gates and skills were grouped in the owner's statement and are separated here
deliberately, because a gate is a command and an exit code that the kernel can
verify mechanically, and a skill is PROSE THAT STEERS A MODEL, which it cannot.

- Project skills reach **workers only, never the orchestrator.**
- They are **additive and advisory**. They may say how to write code here. They
  may NOT alter authority, scope, the gate set, or the definition of done; those
  come from declarations, which are data the kernel parses.
- The kernel's role briefs are **not overridable** by project skills.
- They are injected into worker briefs in a fenced section labelled as untrusted
  project content.

**The security shape, named now rather than at M4:** project-supplied prose that
instructs an orchestrator is a prompt-injection surface. Without this boundary,
anyone who can land a pull request in a consuming repository can steer the
orchestrator that has authority to write code and open pull requests elsewhere.

## Part 3: the applicability envelope. ORCHESTRATOR DRAFT, NOT YET CONFIRMED.

The owner's instruction: "tighten the exact scope where Tiphys works in and does
not work in. Not be usable for is as important as when it is usable."

Everything in Part 3 is the orchestrator's proposal. It is written as
definitively as it can be so that it is ARGUABLE, not because it is settled.

### 3a. Tiphys APPLIES when all of these hold

1. **The intent is stateable before the work starts.** You can say what done
   looks like in advance. This is the single hardest gate and the one that
   excludes the most.
2. **The work lands as a reviewable change in version control.** No diff means no
   scope audit, no merge base, no review.
3. **Done is decidable by something other than opinion**, for at least the
   `correctness` class, or the phase declares when it will be.
4. **The work decomposes into phases with a dependency order.**
5. **The horizon is longer than one sitting.** Continuity across sessions is what
   the kernel is FOR; a change that fits in one conversation does not need it.
6. **A wrong merge costs more than the process does.** This is the economic test
   and it is the one this project learned the hard way.

### 3b. Tiphys DOES NOT APPLY to these, and this list is normative

**1. Spikes and exploration.** The output is knowledge, not a landed change, and
the intent is not stateable in advance. Tiphys should be OFF, not bent around it.
Forcing a delivery process onto exploration is how processes get resented, and
the IOU mechanism in 2a is the wrong tool for "I do not know what I am building
yet."

**2. Work where a human is the only oracle.** Design taste, copy, visual polish.
"Is this good?" has no falsifiable form. The kernel can still CARRY the change,
but it cannot assert done, and it must not pretend the `review` class stands in
for a judgement no gate made.

**3. Trivial single changes.** A typo, a version bump. The process costs more
than the change. This is measured rather than asserted: this project spent about
1.66 million tokens in one day verifying scaffolding that ships nothing, recorded
at delivery/decisions/DR-0027-reviews-target-shipped-value-not-ceremony.md:17.

**4. Incident and emergency response.** The contract assumes review rounds are
affordable. During an outage they are not. Explicitly out of scope; a process
that is ignored under pressure is worse than one that declares it does not apply.

**5. Work outside version control.** No repository, no Tiphys.

**6. Discovery and requirements work, where the requirements ARE the
deliverable.** The kernel consumes an intent; it does not manufacture one.

**7. Repositories with untrusted contributors**, until the 2c trust boundary is
built and verified. Project skills flow into workers, so the trust model
currently assumes contributors are trusted.

### 3c. Applies in a DEGRADED band, honestly labelled

- **A project with no CI.** Usable in local-only mode; gates run locally and the
  evidence is local. What is lost is the independent-runner property, and that
  loss must be stated in the mode rather than discovered.
- **A project with no tests yet.** Usable, with `correctness` declared
  not-yet-establishable and the establishing phase named. Visible, not silent.
- **A solo project with no second reviewer.** The `review` class needs a
  different satisfier than dual cross-model review, and the kernel should say so
  rather than let one reviewer count as two.

### 3d. What Tiphys is NOT, stated because the adjacent tools exist

It is not a CI system: it delegates checking to the project's gates and reads
their verdicts. It is not a task tracker. It is not a code generator. It is the
thing that makes those produce a trustworthy green.

## What this record does NOT establish

- **Part 3 is not confirmed.** The owner asked for it to be drafted; drafting is
  not agreement, and the boundary in Parts 1 and 2 stands independently of it.
- **The class list in 2a is a proposal, not a derivation.** `scope` and `review`
  are defensible as process-level. `correctness` is the contested one: a project
  could argue its correctness gate is a human reading the diff, and the pilot
  should be allowed to fight that out.
- **No cost has been measured.** Nobody has established what moving the kernel's
  registry to `templates/` breaks. `charter-mode-enum-matches-modes` is required
  and unconditional today and forces a consumer to replicate this repository's
  charter shape exactly, so it is a known casualty rather than a free win.
- **It does not open the closed vocabularies.** DR-0020 shipped mode, stage and
  role ids closed at v0.1.0 on a reversibility argument that still holds.
  Widening is backward compatible and is the M4 question; this record does not
  pre-empt it.
- **It touches two of D-19's six mandatory M4 workstreams.** The M4 paragraph at
  delivery/plan/kernel-plan-v1.md:368 names six; fleet durability,
  cross-environment exclusion, authority enforcement and cutover are untouched
  here.
- **The greenfield argument rests on ONE worked example**, this repository's own
  M1-P1, which began from an empty folder and carried twelve falsifiable
  acceptance criteria including a red witness (introduce a deliberate type error,
  the build must exit nonzero). One example is one example. Nobody has shown the
  pattern holds for a project whose first phase must BUILD its gate
  infrastructure rather than inheriting node and npm, and that is exactly the
  case clause 2a's not-yet-establishable IOU exists to cover.
