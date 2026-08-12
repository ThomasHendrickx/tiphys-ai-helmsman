# Two findings from one afternoon: contention-induced flakes, and a hole in the claim grep

- date: 2026-08-12
- author: orchestrator
- status: both recorded as findings with mechanisms; NEITHER is a demonstrated
  cause, and the experiments that would settle them are named and were not run.

## Finding 1: the orchestrator's own optional work injected wall-clock flakes

Two independent agents hit intermittent suite failures inside one window, and
the best available explanation is CPU contention that the orchestrator caused.

**What was measured.** The delta verifier's first `npm test` run reported 620
tests, 618 pass, 2 fail, exit 1; its second reported 620/620/0, exit 0. The two
failures were named rather than shrugged at:

- `test/watcher.test.ts:432`, `assert.equal(immediate.status, 3, ...)`, the
  third of three CLI spawns inside a **0.4 second** heartbeat interval,
  asserting the third is not yet due. Observed `actual: 0`, meaning more than
  0.4s of wall clock passed between spawns.
- `test/coverage-gate.test.ts:189`, `actual: 'error', expected: 'green'`.

The harness fix round independently recorded an intermittent failure in the
same window.

**The load, measured on this 4-core box.** It reached **13.00** while both
agents ran suites AND the orchestrator ran a full `npm test` in a scratch
worktree to settle an OPTIONAL question about an unowned finding. Killing the
orchestrator's run dropped the one-minute figure to **6.56** against a
fifteen-minute **10.43**, so the optional work was roughly HALF the load.

**The corroborating arm.** `npm test` is green in CI on every run today,
including on the branch whose local run flaked, on runners that are not
oversubscribed. Same suite, same code, same day.

**The mechanism, and it extends
delivery/tuition/T-014-the-watchdog-watched-the-wrong-place-six-times.md:1's
third-reading postscript by one step.** That postscript records that an
orchestrator filling its waiting time with heavy local commands starves the
critical path. This is the next consequence: **it also injects wall-clock flakes
into the very measurements it is waiting for**, and those flakes are then
attributed to the code under test by agents who cannot see the load. A timing
assertion with a 0.4 second budget is not measuring the program when the box is
at three times its core count.

Both agents attributed their failures correctly and independently, to standing
warning 11 rather than to a defect, and the delta verifier proved with a control
arm at the pre-delta commit that its own delta touched none of the affected
files. Neither could see the load. The orchestrator supplied it to both, and
both incorporated it.

**NOT ESTABLISHED, and this is the whole caveat.** No experiment ties the load
to these specific failures. The figures are real, the CI-green arm is real, and
the correlation is one afternoon with two data points. The cheap experiment that
would settle it, and which was NOT run: pin a load generator at three times the
core count and run `test/watcher.test.ts:419` repeatedly, counting failures
against an unloaded baseline. Until that exists this is a correlation with a
plausible mechanism, not a cause.

## Finding 2: the claim grep has a hole shaped exactly like its own purpose

Found by the M3-P6 round-2 delta verifier, against the grep it was obeying, and
reported unprompted.

**This is a SECOND and different hole from the one already recorded, and saying
so is the point.** CLAUDE.md:348 already documents that the grep is LINE-BASED
while the prose is hard-wrapped, so a multi-word phrase straddling a wrap is
invisible; that gap was measured across four documents and found real and small.
This finding is about the ALTERNATION'S VOCABULARY, not about wrapping. The
phrase that escaped here would have escaped on a single unwrapped line, because
the words are simply not in the list. Conflating the two would make the wrap fix
look like it closed this, and it does not.

The binding grep at CLAUDE.md:338 is:

```
grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to'
```

The alternation carries `cannot be` and **no other `cannot X` form**. The
verifier's strongest universal claim used the words **`cannot fire`** and passed
the grep untouched. It caught the claim by reading its own report, not by the
mechanism, and restated it in place as a deduction with its two dependencies
named.

**This is the shape this repository keeps paying for**: a guard whose condition
does not test the property that matters is green and worthless. The grep exists
precisely because a reminder is not mechanical
(delivery/tuition/T-006-unexecuted-claims-about-the-world.md:1), and the
mechanical thing has a gap that admits the strongest class of claim it was built
to catch. The claim that slipped through was an impossibility claim, which is
the category T-006 names first.

**Candidate additions, explicitly NOT validated:** `cannot fire`, `cannot
reach`, `cannot happen`, `can never`, `will never`, `guaranteed`, `ensures`,
`all cases`, `every case`, `by construction`, `trivially`.

**MEASURE BEFORE WIDENING.** A pattern that fires on hundreds of legitimate
sentences is worse than the gap, because it teaches every future author to skim
the output, and a guard people skim is a guard that is not running. Nobody has
counted the hits of the widened alternation over `delivery/`. One instance is
not a corpus. The widening also applies to BOTH forms this project requires,
line-based and wrap-insensitive.

## What neither finding does

- **Neither proposes a change to a binding file.** Finding 1 has no fix, only a
  rule about orchestrator behaviour already recorded in T-014. Finding 2's fix
  is a one-line edit to `CLAUDE.md` whose fallout is unmeasured, and this
  project has twice found that a newly applicable check reddens things nobody
  expected.
- **Neither was reviewed.** Both are the orchestrator's own write-up, one of
  them of another agent's discovery.
- **Finding 2 rests on a single reported instance.** The verifier's account was
  not independently reproduced here; the grep's text was read and the absence of
  `cannot fire` confirmed, which establishes the HOLE but not that anything else
  has ever slipped through it.
