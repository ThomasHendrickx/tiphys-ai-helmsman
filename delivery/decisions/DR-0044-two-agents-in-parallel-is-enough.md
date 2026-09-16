# DR-0044: two agents in parallel is enough, and the fan-out rule is withdrawn

- status: **DECIDED** by the owner, 2026-09-16
- supersedes in part: the "Agent concurrency is PER WORKFLOW, and the fix is more
  workflows" section at CLAUDE.md:1157
- raised by: the owner, unprompted, after a session-limit kill

## The decision, in the owner's words

> "No longer maximise the parrallel tasks, one big container running 2 agents in
> parallel is enough. Let run what you have now, but our weekly limit has reset
> again."

Three separate instructions, and they are recorded separately because they have
different lifetimes:

1. **Standing, binding:** dispatch at most ONE workflow at a time. With the
   per-workflow cap of `min(16, CPUs - 2)` and `nproc` of 4, that is two agents
   running concurrently. Do not open a second workflow to get around the cap.
2. **One-off:** the eight workflows already running at the time were not to be
   killed. They were left alone.
3. **Context, not an instruction:** the weekly limit had reset. So the reason for
   this decision is NOT budget scarcity, and reading it as "we are short of
   tokens, go slower" would be wrong.

## What this reverses, and the reversal is the interesting part

CLAUDE.md:1157 says the opposite, and says it emphatically: "The fix is N
workflows of 2, not one workflow of 2N", with the note that "the owner has had to
point this out TWICE". That section was written BECAUSE the owner objected to
seeing only two agents at a time.

So the same person has now asked for both, and neither request was unreasonable
when it was made. What changed between them is measured:

- **The box is four CPUs.** Fourteen agents drove the one-minute load average to
  **69**, against 10 before the fan-out.
- **A required gate lies at that load.** `coverage` uses a 250 ms WALL-CLOCK
  budget as a backtracking proxy, and four independent parties reported false
  reds on six structurally different patterns in that load band. One of the
  patterns is `^(?:parked)$`, which cannot backtrack at all. Full account in
  delivery/verification/wall-clock-budgets-are-load-dependent.md:1.
- **Every agent re-runs the suite**, which is the expensive thing, so agents
  contend with each other for exactly the resource their evidence depends on.
- **Fourteen concurrent agents spent roughly 2.4 million subagent tokens** and
  died together at a quota boundary with no leading indicator, recorded as
  delivery/tuition/T-028-the-whole-fleet-died-at-one-instant-and-every-watchdog-said-live.md:1.

The first request optimised throughput and was right about throughput. The second
optimises for evidence that can be trusted, and on a four-CPU box those two are
in genuine conflict. **More parallelism here does not buy more work, it buys more
work whose measurements are suspect.**

## What the orchestrator does differently, mechanically

- One workflow in flight. Before dispatching, check that nothing else is
  running; if something is, queue rather than launch.
- The args-filtered script pattern at CLAUDE.md:1167 STAYS. It is still the right
  way to write a dispatch script. What is withdrawn is re-invoking it once per
  pair to run several at once.
- The written pre-dispatch statement at CLAUDE.md:1184 stays, and its third
  number is now expected to be 2. That section says "If that third number is 2,
  the dispatch is wrong". **That sentence is now inverted: if it is more than 2,
  the dispatch is wrong.**
- Add the token estimate T-028 asks for. A clean-room review measured 150,000 to
  490,000 subagent tokens here, a fix round 115,000 to 400,000.

## Why this is a decision record and not a CLAUDE.md edit yet

CLAUDE.md is owned by M4-P23 for the duration of that phase, which is the
conflict pre-pass working as intended, and M4-P23 is mid fix round. Editing the
file here would create the collision the pre-pass exists to prevent. This record
is the durable home until that phase merges, and the CLAUDE.md amendment is
queued behind it along with two others (the claim grep's passive-voice gap, and
the fourth suite qualifier).

**This record is binding from now, not from the day CLAUDE.md is amended.** A rule
that waits for a file to be free is a rule that depends on remembering, which is
what T-005 and T-006 say does not survive.

## What is NOT settled by this

- **Whether two is the right number, as opposed to simply fewer than fourteen.**
  Nobody has measured the load at which `coverage` starts lying; the four
  observations bracket 46 to 69 and nothing below that was tested. Two is the
  owner's call and it is safe; it is not derived.
- **Whether the CPU count is the real constraint.** Load 69 on four CPUs is the
  correlate, but these agents wait on model calls rather than on CPU, and
  CLAUDE.md:1157 records a run where ten agents sat at load 0.03. Both
  observations are real and they are not reconciled here.
- **What to do with a phase that genuinely needs two agents at once**, such as a
  dual cross-model review. Two IS the cap, so a dual review still fits in one
  workflow. Nothing in the current pipeline needs more.
