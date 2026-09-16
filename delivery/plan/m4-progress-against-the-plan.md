# M4 progress against the plan, and why the remaining work is blocked

Measured 2026-09-16 by mapping every phase id the plan names against `main`,
against the pushed branches, and against the open pull requests. Written because
the owner asked for it and a status given only in chat is lost.

## The count

The plan names THIRTY phases, M4-P1 through M4-P30.

| state | count | phases |
|---|---|---|
| merged to `main` | 4 | M4-P13, M4-P15, M4-P16, M4-P20 |
| in flight, branch pushed | 8 | M4-P1, M4-P2, M4-P10, M4-P11, M4-P19, M4-P23, M4-P26, M4-P27 |
| not started | 18 | the rest |

## The stop-condition script reports a DIFFERENT denominator, and it is right to

`.claude/orchestrator-next.mjs` prints "4/12", not "4/30", and that is not a
defect to fix so much as a limit to know. It derives the phase set from three
artifacts that only exist once a phase has begun: a declaration on `main`, a
work history on `main`, or a pushed branch. A phase that is planned and
undispatched has none of the three, so it is not merely uncounted, it is never
examined.

That is the SAME shape the script's own comment warns about for a hard-coded
count, one level out: a set derived from artifacts is a claim about the phases
that have artifacts. The fix, if it is wanted, is a fourth harvesting source
that reads the plan's own phase table. It is recorded here rather than done,
because the script's job is the stop condition for work IN FLIGHT and widening
it would make it exit nonzero for the whole milestone from the first day.

## Capacity is not the constraint. The code shape is.

This is the finding worth carrying. Of the eighteen unstarted phases, the
conflict pre-pass found exactly ONE dispatchable, and the reasons are structural:

- **`src/cli.ts` serialises four phases.** M4-P12, M4-P18, M4-P24 and M4-P25
  each add a command, and every command registers in one dispatch table. The
  parallelism ceiling for this milestone is not the agent cap and not the CPU
  count; it is that a kernel whose commands live in one table serialises every
  phase that adds one.
- **`src/spawn.ts` blocks three more**, M4-P3, M4-P4 and M4-P8.
- **M4-P5, M4-P6 and M4-P7 are dependency-blocked rather than conflict-blocked.**
  They are the plugin half of M4 and they need the adapter seam that M4-P2,
  M4-P3 and M4-P4 build between them.
- **M4-P14 has ZERO file overlap with any live unit and is still blocked.** It
  edits `gate-registry.yaml`; `CLAUDE.md`'s gate block is GENERATED from that
  registry; the `agent-rules-drift` gate compares them row for row on both CI
  events; and `CLAUDE.md` belongs to M4-P23 until it lands. Two files with no
  path in common, coupled by a generator and a gate that checks the generation.
  A pre-pass built on set intersection misses that by construction.

## One phase is the head of a chain of six

M4-P2 holds `src/spawn.ts`. M4-P3 and M4-P4 wait on that file. M4-P5, M4-P6 and
M4-P7 wait on the seam those three build. So five phases sit behind M4-P2, and
M4-P2 is the branch currently red on macOS: after a launch-failed the worktree
is not rolled back, Linux is green on every gate, and no local run can see it.

That single platform-specific defect is therefore holding the largest part of
the remaining plan, which is a better reason to fix it properly than its
severity label alone suggests.

## The decision this raises, put to the owner rather than taken

The `src/cli.ts` bottleneck is a choice and not a law. Either the four
command-adding phases merge strictly one after another, at roughly one CI cycle
each plus review, or one small phase makes command registration additive and
unblocks all four at once. The second also helps M5, and it changes the kernel's
public command surface, which is why it is the owner's call. The pre-pass named
the bottleneck and explicitly declined to decide it
(delivery/plan/m4-conflict-pre-pass.md:1).

## What this does NOT establish

It does not say the eighteen unstarted phases are still all wanted: the plan has
been revised three times and a later revision could retire or merge some of
them. Nothing here re-reads each phase's section to confirm it is still in
scope. The blocking analysis is the pre-pass's, computed on 2026-09-16 against
the units live THEN; as units land, the blocks move, and it should be recomputed
before any wave is dispatched rather than carried forward from this document.

## The stack cost came due, exactly where the pre-pass said it would

M4-P11 branches from M4-P10 rather than from the base, because M4-P10 holds
`src/checks.ts` and M4-P11 extends its verdict-pair checks. The pre-pass recorded
that as a DEPENDENCY rather than a conflict, and recorded the risk in advance:
M4-P10 was already in review with a FIX-ROUND-NEEDED verdict, so its head would
move, and M4-P11 would have to rebase before merging.

That is now measured rather than predicted. M4-P11's fix round returned with its
own work sound and its gate bundle carrying three reds that are NOT its own:

- `suite` red with 26 findings, all "behavior <id> does not resolve". Ruled out
  as load by re-running the gate alone (still 26) and then measured at the PRIOR
  head in a separate clone, where the finding SETS are IDENTICAL, both sides of
  the set difference empty. All three of the round's own behaviors resolve.
- `scope` red on a stale simulation whose `origin/main` predated the
  declarations landing.
- `red-witness` error on four of M4-P10's stale mutation anchors, plus the
  fortieth witness.

None of the three can be assessed while M4-P10 is unmerged, because they are
properties of the stack and not of the branch. So the ordering is forced:
M4-P10's second fix round needs its delta verification, M4-P10 merges, M4-P11
rebases onto `main`, and only then is M4-P11's bundle a statement about M4-P11.

**The scheduling consequence, recorded because it was got wrong once today.** A
delta verification for M4-P23 was dispatched ahead of M4-P10's, which is the
wrong order: M4-P23 unblocks nothing and M4-P10 unblocks M4-P11. With an agent
cap of two, dispatch order IS the schedule, so a queue ordered by readiness
rather than by what it unblocks silently lengthens the critical path. The
M4-P23 unit was stopped seconds in and M4-P10's dispatched in its place.

## One finding that is nobody's phase and should not be lost

M4-P11's derivation D7 searched every git subcommand that applies an implicit
cwd pathspec, across `src`, `bin` and `scripts` rather than only the two files
the phase changes. It found the same coordinate mismatch one level out, in
`src/gates/suite.ts`, `src/gates/citations.ts`, `src/gates/scope.ts` and
`src/witness/run.ts`: all issue repository-root-relative paths with a cwd the
gate runner takes from `process.cwd()`. Only the witness gate resolves the top
level first.

None of those files is on M4-P11's declaration and the finding is pre-existing,
so the round wrote it down rather than widening itself, which is correct. It
predicts a real defect for any consumer running `tiphys gates run` from anywhere
but the repository root, and it needs a phase id of its own.
