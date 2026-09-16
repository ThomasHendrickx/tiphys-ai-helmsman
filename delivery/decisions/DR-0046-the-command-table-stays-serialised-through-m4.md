# DR-0046: the command table stays serialised through M4, and the reason is that the agent cap binds first

- id: DR-0046
- project: tiphys-kernel
- task: M4 wave-2 pre-pass follow-up
- question: `src/cli.ts` is named by four remaining M4 phases, because every new
  command registers in one dispatch table. Should it be refactored to an
  additive registration so those phases stop serialising on it?
- reversibility: reversible either way. Doing it later costs the same refactor;
  doing it now costs a phase that holds the file while it runs.
- vetoable: yes, and cheaply, because nothing has been built on this.
- revert-cost: none yet; this decides not to start.
- status: **DECIDED BY THE ORCHESTRATOR**, under DR-0016, because the analysis
  produced a recommendation it would defend and therefore there was no question
  to put to the owner.
- decided: NO refactor during M4. The four phases merge in dependency order on
  the table as it stands.
- date: 2026-09-16

## Why this is not an owner question

DR-0016 is explicit: escalate only when two or more options are genuinely
comparable AND the consequence is high impact and costly to reverse. Write the
recommendation first, because doing so is what reveals whether a question was
ever a question. Asking the owner something whose answer was already obvious
costs them the focus they were spending elsewhere, and that is a failure of the
system rather than caution.

Here the recommendation is clear, so this is recorded rather than asked.

## The finding that raised it

The wave-2 pre-pass computed which remaining phases could be dispatched
concurrently and found that only one of eighteen could. Four of the blocked ones
(M4-P12, M4-P18, M4-P24, M4-P25) name `src/cli.ts`, and they name it for the
same reason every time: every new command registers there. The pre-pass named
the bottleneck and explicitly declined to decide it, at
delivery/plan/m4-conflict-pre-pass.md:100.

**One sentence of that framing is wrong and it is the sentence this record turns
on.** delivery/plan/m4-conflict-pre-pass.md:98 says the parallelism ceiling "is
not the agent cap or the CPU count". At the time it was written that was a claim
about file overlap and it was made without checking the cap against the
dispatchable count. The cap is two. The file blocks four phases. Two is the
smaller number, so the cap binds first and the file does not set the ceiling.

## The reason, and it is a measurement rather than a preference

**The parallelism ceiling for this milestone is TWO, and it is not set by the
file.** The owner capped concurrent agents at two (DR-0044). The container
reports 4 CPUs and a per-workflow cap of `min(16, CPUs - 2)`, so even without
the owner's instruction one workflow runs two agents. Refactoring `src/cli.ts`
raises a ceiling that is not the binding one.

So the refactor buys nothing while the cap is two. It costs:

- **A phase that HOLDS `src/cli.ts` for its whole life**, which blocks the same
  four phases it is meant to unblock, plus any other phase adding a command,
  for the duration. The cure is the disease while it runs.
- **A merge-order change in the middle of a milestone.** Four phases currently
  merge in a known dependency order on a table whose shape they were planned
  against. Changing the registration mechanism under them invalidates their
  files-to-touch lists and therefore their scope declarations.
- **A refactor with no behaviour change is the hardest kind to witness.** The
  red-witness rule wants a test red without the change and green with it, and
  "the same commands are registered, differently" does not naturally produce
  one. That is a poor phase to run under this repository's own rules.

## What would change this decision

Two things, and both are measurable rather than matters of taste:

1. **The agent cap rises above two.** Then the file becomes the binding
   constraint and the arithmetic reverses.
2. **The dispatchable set falls below two because of this file.** The cap only
   binds while at least two phases are dispatchable. If `src/cli.ts` ever leaves
   fewer than two phases dispatchable, it is costing throughput directly and
   this record should be reopened as a new decision record, never edited.

The second is the one to watch, and it is checkable at every wave: count the
dispatchable phases in the pre-pass and compare with the cap. A wave whose
dispatchable set is one has hit it.

## What this record does NOT settle

Whether the additive registration is the right design when it is eventually
done. Nothing here evaluates the shape of the refactor; it decides only that M4
is the wrong time. The kernel ships commands to consumers, so the question comes
back at v0.2.0 whatever happens in M4, and it will deserve its own analysis
then.

Nor does it settle the other blocked phases. M4-P11 and M4-P22 block on
`src/checks.ts` and `src/spawn.ts`, M4-P15 and M4-P17 on
`src/commands/doctor.ts`, M4-P21 on `src/commands/init.ts`. Those are ordinary
file overlaps between two phases each, not a table every phase must touch, and
they are not what this record is about.
