# DR-0036: the harness adapter leads M4, and the kernel is the second subject

- id: DR-0036
- project: tiphys-kernel
- task: M4 sequencing, raised while closing the pstack borrow review
- question: M4 names six workstreams and does not order them. Which goes first,
  and does the kernel become a subject of its own process before M4 exit rather
  than after it?
- reversibility: the ORDER is reversible at any time and costs re-sequencing
  only. The self-hosting half is reversible while the current process still
  holds authority, which is the condition below, and is expensive to reverse
  once the current process has been retired.
- vetoable: no, this is the owner's own instruction
- revert-cost: re-ordering the workstreams costs a plan revision. Withdrawing
  self-hosting costs whatever phases ran under it, which is why the authority
  condition exists.
- status: **DECIDED BY THE OWNER, 2026-09-15.**
- decided: the harness adapter workstream goes first, delivered as
  `@tiphys/claude-code-plugin`; the kernel becomes a second subject alongside
  `pulse`, under the current process's authority
- date: 2026-09-15

## The decision, in the owner's terms

> the harness specific one (I'll make the one for Claude code first) is next
> up. That way we have the full setup and it can also be used to improve
> itself.

## What it changes, and what it does not

**It does not reopen DR-0034.** `pulse` remains the M4 pilot. The Claude Code
plugin is already inside M4's declared scope: the M4 paragraph names "the thin
Claude Code plugin" and D-19's second workstream is "harness adapter (Claude
Code hooks, executor integration)", both at
delivery/plan/kernel-plan-v1.md:368. Ordering that workstream first is a choice
D-19 leaves open, not a change to what M4 delivers.

**It does not waive D-19.** M4 still may not dispatch without its own intake
and plan decomposed into the six workstreams
(delivery/plan/kernel-plan-v1.md:394). Putting the adapter first changes the
order of the plan's phases, not whether the plan exists. The intake is the next
artifact and this record does not substitute for it.

**It does change settled decision 6.** delivery/plan/kernel-plan-v1.md:38 says
nothing runs on Tiphys before M4, with two controlled exceptions to date: the
M3 exit test's self-delivery, and DR-0025's macOS portability pilot. The
kernel's own plan already ends at self-hosting, at
delivery/plan/kernel-plan-v1.md:368: "From M4 exit onward the kernel is its own
pilot-class project on v1 (SC-013)." This pulls that forward from M4 EXIT to
M4 EXECUTION, and that is the part of this decision with teeth.

## Why the kernel is the right second subject

**It is the case DR-0034 deliberately deferred.** DR-0034 chose greenfield and
recorded the cost in the same breath: greenfield "never tests ADOPTING an
existing codebase, which is the more common real use and the one where the
kernel's assumptions about `delivery/`, branch naming and gate registries
collide with another project's conventions", and that this was "deferred, not
solved" (delivery/decisions/DR-0034-pulse-is-the-pilot-and-the-controls-are-cut.md:29).

The kernel IS an existing codebase with its own `delivery/`, its own branch
naming, its own gate registry and its own CI. Pointing Tiphys at it exercises
precisely the collision DR-0034 named. So this is not a substitute for `pulse`
and not a cheaper version of it. The two subjects test disjoint halves: `pulse`
tests charter-to-first-release from an empty directory, the kernel tests
adoption of a repository that already has opinions.

**It supplies its own work queue.** delivery/plan/pstack-borrow-review.md:1
carries eight items, each with a named failure, a verify command and a fix-round
budget under DR-0035. Five are text edits. That is a queue of small, real,
cheap-to-fail subjects for a new adapter, which is what a first run should have.

## The condition, and it is not optional

**The current process retains planning, review, credentials, pull request,
merge, recovery and closeout authority for every kernel phase delivered this
way, until the cutover workstream says otherwise.** Tiphys owns the bounded
local lifecycle and nothing else.

That is DR-0025's control structure, reused verbatim rather than reinvented
(delivery/decisions/DR-0025-controlled-pre-m4-local-pilot.md:1). It is the
condition that keeps this reversible: while the current process holds the merge
path, a plugin defect cannot land unreviewed.

**The hazard it exists against, stated plainly.** When the kernel is both the
subject and the instrument, a defect in the plugin and a defect in the kernel
present identically. This repository's dominant recorded failure is a guard
that cannot go red, and self-hosting is that shape by construction. The
mitigation is not cleverness, it is that a second pair of eyes outside the loop
keeps the merge authority.

## What M4's intake must now settle

Named here so the intake is measured against them rather than being allowed to
omit them:

1. The order of the remaining five workstreams, given the adapter is first.
2. What the adapter must implement, against the seam that already exists:
   `ExecutorAdapter` and the executor record at src/spawn.ts:106, the turn-end
   contract in src/hooks.ts, and the child environment in src/exec/env.ts.
3. The model-resolution contract, generic across harnesses: the kernel declares
   intent, the adapter reports what it actually resolved, the kernel compares,
   and zero vendor names enter `src/`. This subsumes what was candidate 9 of
   the borrow review.
4. DR-0010, which is `status: open` with "no action required before M4" and is
   therefore now due.
5. Per-subject entry conditions for `pulse` and for the kernel, since they are
   not the same.
6. The cutover workstream's rollback procedure, which D-19 requires and which
   this decision makes more load-bearing: a failed cutover now has a kernel
   mid-adoption as well as a pilot mid-flight.
