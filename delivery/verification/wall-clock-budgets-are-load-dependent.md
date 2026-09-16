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
