# A wall-clock budget used as a proxy for algorithmic complexity is load-dependent

- date: 2026-09-16
- found by: M4-P26's implementer, while reporting an incomplete suite result
  rather than waving it through. Confirmed independently here.
- status: a real defect in a shipped gate. Not assigned to a phase, because no
  M4 phase owns `src/gates/coverage.ts`.

## What it is

src/gates/coverage.ts:260 runs a candidate regex inside a sandbox with a
wall-clock timeout, and treats exceeding that timeout as evidence of
catastrophic backtracking:

```
pattern ... did not complete within 250ms against a value of length N
(possible catastrophic backtracking)
```

**Wall clock is not a measure of algorithmic complexity.** It is a measure of
complexity DIVIDED BY available CPU. The check therefore reddens for a
well-behaved pattern whenever the machine is busy, and the message it prints
names a cause that is not the cause.

## Measured, and the orchestrator caused it

This container has 4 CPUs. Ten implementer agents were dispatched concurrently,
each of them running the full suite. Load average reached **46.61** during
M4-P26's run and was **32.97** when this document was written, with 35 node
processes live.

| condition | `test/coverage-gate.test.ts` |
|---|---|
| under that load, inside a full-suite run | 1 to 3 failures, all the 250ms message |
| solo, same head, same interpreter, same build state | 17 tests, 17 pass, 0 fail, 0 skipped, on three separate runs |

Two implementers hit it independently. One reported it as a load flake with the
isolation run as evidence; the other reported that its branch "has NOT been
observed fully green in one full-suite run, and that is stated rather than waved
through".

## Why this matters more than a flaky test

**It inverts the red-witness discipline.** The whole method here is: establish
the base, change one thing, and attribute the difference. A check whose verdict
depends on ambient load makes the base non-reproducible, so a real failure and a
contention artefact are indistinguishable at the moment of attribution. This
project has already recorded that a red on the default toolchain is no longer
proof of a red branch; this is a second axis of the same problem, and it is one
the orchestrator creates by fanning out.

**And it fails in the safe direction only by luck.** It reddens spuriously,
which is loud. A budget tuned the other way, or a machine fast enough that a
genuinely catastrophic pattern completes inside it, gives the silent failure
instead.

## What to do, and what NOT to do

**Do not raise the number.** That trades one arbitrary threshold for another and
makes the real detection later.

The sound forms, in order of preference:

1. **Bound the work, not the time.** Backtracking limits, input-length caps, or
   a regex engine with linear guarantees measure the property directly.
2. **Measure CPU time rather than wall clock**, which removes contention but not
   machine-speed variation.
3. **If a wall-clock budget is kept, make it declare itself.** A timeout must
   report "could not establish within budget under load L" as its own status,
   not as a finding about the pattern. Under M2-C-3 a check that cannot reach a
   verdict reports ERROR, never a verdict it did not earn.

## The orchestration consequence, which is immediate

**Every suite result taken while other agents are running is suspect for this
file.** Reviewers must not treat a `coverage-gate` failure as a finding against
the phase under review without an isolation run, and implementers reporting a
red must say what the load was.

It also means concurrency is not free in this repository in a way nobody had
written down: ten agents on four CPUs do not merely run slower, they change what
the tests say.

## What is NOT established

- Whether any OTHER check in the suite carries a wall-clock budget. Only this
  one was found, by following the failures, and no systematic search was run.
- Whether the same failure occurs in CI, where the machine is different and the
  fan-out does not exist.
- The actual complexity of the patterns involved. Nobody has shown that they are
  well-behaved; the isolation runs show only that they finish inside 250ms on an
  idle machine, which is the same weak evidence the budget itself provides.

## Recurrence, 2026-09-16: I did it again, with a number

The entry above was written after my own fan-out reddened a gate. That did not
stop it happening a second time, eight days later, which is the shape tuition
T-005 and T-006 both record: a rule that depends on remembering does not survive
a busy session.

Measured. Eleven clean-room reviewers were dispatched at 02:11 across eight
workflows: dual rounds for M4-P2, M4-P10 and M4-P16, single rounds for M4-P1,
M4-P13, M4-P20, M4-P23 and M4-P27. Load before dispatch was 10.08 on four CPUs.
Eight minutes later:

```
$ cat /proc/loadavg
45.96 29.43 20.98 55/739 11671
```

**45.96 is inside the 46 to 57 band this document already names as the band that
reddens `coverage`.** Every one of those eleven reviewers is instructed to
re-run the suite and the gates itself, which is the right instruction, and each
one is doing it on a machine that eleven reviewers have loaded.

So a red reported by any of them is ambiguous at the moment it is written, and
the ambiguity is mine rather than theirs.

## What I did about it, which is not what I should have done

I did not reduce the concurrency, because stopping a workflow mid-review
destroys work in progress and the reviewers were already several minutes in.
Instead I started a one-line-per-minute load log at 02:19 so that any red a
reviewer reports can be CORRELATED with the load at that minute, rather than
argued about afterwards from memory.

That is a mitigation and not a fix. **The fix is to treat dispatch concurrency
as a variable of the test environment, in the same class as the interpreter, the
build state, the invocation and whether the tree is a git checkout.** This
repository now has five such axes and four of them were found the same way:
two honest agents reported different numbers for one head and somebody refused
to average them.

The operational rule, stated so the next dispatch can follow it mechanically:
read `/proc/loadavg` BEFORE dispatching a wave, and if the wave will put the
one-minute figure above roughly 40 on this four-CPU box, either stage it or
instruct every agent in it to record the load alongside every timing-sensitive
result it reports. The second is cheaper and loses nothing.

## Settled 2026-09-16: the instrument cannot measure what it claims to measure

Everything above treats this as a load-dependent FLAKE to be worked around. It
is not. It is a defect in shipped code, and the measurement that settles it is
one command.

**Three independent witnesses now exist, and they satisfy the two-member rule.**

1. My own fan-out, load 46 to 57, against 17 tests that pass 17/17 solo.
2. The M4-P2 implementer, recorded in its work history.
3. The M4-P2 clean-room reviewer, load 53 to 66, hitting **two tests that are
   different from the implementer's**, which is what makes this a class rather
   than one flaky test seen three times:

   ```
   pattern ^(?:R-[0-9]+[a-z]?)$ did not complete within 250ms against a value of length 6
   pattern ^(?:M([0-9]+)-P[0-9]+)$ did not complete within 250ms against a value of length 5
   ```

4. The M4-P13 clean-room reviewer, load 55 to 67 on nproc 4, hitting **two more
   patterns, different again from both**, and reporting that both tests pass IN
   ISOLATION on the same tree, interpreter and build state at load 67:

   ```
   ^(?:DR-[0-9]{4}|D-[0-9]+|M2-D-[0-9]+)$   against a 2-character value
   ^(?:parked)$                             against a 5-character value
   ```

   **`^(?:parked)$` is the member that ends the argument.** It is a literal
   string, anchored at both ends, with no quantifier, no character class and no
   alternation. There is no input on which it can backtrack, because there is
   nothing to backtrack over. A 250 ms budget cannot be exceeded by matching a
   six-character literal against a five-character value except by the process
   not running.

   Four witnesses, six structurally different patterns, three different agents
   and one orchestrator, on three occasions. The class rule asks for two.

### Those two patterns cannot backtrack, so the red is false BY CONSTRUCTION

The budget at src/gates/coverage.ts:235 is `REGEX_EXEC_TIMEOUT_MS = 250`,
applied as a wall-clock `timeout` at src/gates/coverage.ts:257 and reported as
"did not complete within 250ms" at src/gates/coverage.ts:261. The word
"complete" is the claim: it presents elapsed time as evidence about the regex.

Measured, on this box, at load average 33:

| pattern | input | 1,000,000 executions | per execution | budget / this |
|---|---|---|---|---|
| `^(?:R-[0-9]+[a-z]?)$` | `R-094a` | 154.2 ms | **0.000154 ms** | 1,621,000x |
| `^(?:M([0-9]+)-P[0-9]+)$` | `M3-P1` | 49.3 ms | **0.000049 ms** | 5,071,000x |
| `^(?:parked)$` | `parked` | 93.8 ms | **0.000094 ms** | 2,665,000x |
| `^(?:DR-[0-9]{4}\|D-[0-9]+\|M2-D-[0-9]+)$` | `D-15` | 69.4 ms | **0.000069 ms** | 3,602,000x |

The per-execution column is the total divided by 1,000,000. That is stated
because the throwaway script that produced these first printed the total divided
by 1,000 and labelled it "each", which would have understated the margin by
three orders of magnitude in the direction that makes the gate look defensible.
The figures above are recomputed; the script's label was wrong and its totals
were not.

A MILLION executions of the first fit inside the budget meant for ONE. A single
execution is roughly 1.6 million times under it. Both patterns are anchored,
have no nested quantifier and no alternation over a repeated group, so there is
no catastrophic backtracking available to them at any input length; the inputs
here are six and five characters.

For one of those executions to exceed 250 ms, the process must be descheduled
for a quarter of a second. **That is a fact about the machine, and the gate
reports it as a fact about the regex.**

### Why this is worse than a flake

- It is in SHIPPED code, `src/gates/coverage.ts`, reached by the user-visible
  `tiphys gates run`, so it is inside DR-0027's blocking surface rather than
  outside it.
- `coverage` is a REQUIRED gate in `full` and `direct-pr` modes, so a false red
  blocks a merge.
- CI runners are shared and loaded. This repository has been treating the
  failure as local noise because it was first seen locally.
- It fails in the direction that costs most: a correct branch reported wrong.
  An agent trained by three of these to wave the gate through is the second-order
  cost, and CLAUDE.md already names that pattern for the default-toolchain red.

### The fix, and what it owes

Wall clock is the wrong instrument for backtracking. The property being guarded
is complexity of the match, and the honest ways to reach it are a step-bounded
engine, a static analysis of the pattern for the nested-quantifier shapes, or a
budget expressed in work rather than time. Any of those is a real change, not a
constant bump: RAISING 250 ms to a larger number keeps the same instrument and
only moves the load at which it lies.

Its red witness is already written above, and it has the two structurally
different members the class rule requires. Its GREEN witness is the table in
this section: the same patterns, unloaded, at six orders of magnitude under
budget.

**What this derivation did NOT cover.** Only two patterns were timed, the two
the reviewer reported. The other patterns the gate compiles were not examined
and one of them may genuinely backtrack, which would be a real finding the
current instrument is too noisy to surface. Nor was the gate run under
controlled load to find the threshold at which it starts lying; the three
observations are 46-57, 53-66 and an unrecorded load, which bracket nothing
precisely. And no CI run has been checked for this signature, so whether it has
ever reddened a real pull request here is unknown.
