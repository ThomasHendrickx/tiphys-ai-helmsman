# M3-P11: a crash is not a skip

- id: M3-P11
- branch: `claude/m3-p11-precondition-crash-verdict`
- created: 2026-08-13, by owner decision, in response to a finding that belonged
  to no phase
- status: SPECIFIED, not dispatched

This phase exists because the owner assigned an unowned finding to a new phase
rather than letting it sit in a register. The finding is entry one of
delivery/review/tracked-findings-register.md:1.

## Intent

**A gate command that cannot run must not report `not-applicable`.**

Today the precondition evaluator in the gate runner treats a command as "could
not run" only when the LAUNCHER fails to spawn. A launcher that spawns
successfully and runs a script that does not exist gets exit 1, which is read as
"precondition unmet", and the gate prints `not-applicable`. That line is
indistinguishable from a legitimate skip.

Root-caused by the M3-P9 hazard reviewer, with the code path quoted at
delivery/review/clean-room-m3-p9-hazard.md:1 and the attribution argued at
delivery/review/arbitration-m3-p9.md:1.

## Why it is worth a phase rather than a tracked line

**A crash that prints as a skip is a guard that cannot go red.** This repository
has paid for that exact shape at least five times: a watchdog that tested
existence rather than freshness, a control-character check blind to NUL, a
watchdog pointed at a subset of an agent's paths, an expired monitor that could
not fire, and now this.

Two consequences, and the second is the one that makes it urgent:

1. **It is in shipped code.** A consumer running a conditional gate is told
   `not-applicable` when the gate actually crashed.
2. **It degrades this build's own evidence, retroactively.** Every
   `not-applicable` this process has quoted for a conditional gate is strictly
   either a skip or a crash, and the printed line does not distinguish them.
   That includes lines quoted in already-merged work histories. Until this is
   fixed, "not-applicable" is not a readable verdict anywhere in this system.

It is also the anti-vacuity contract of
`delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md`
failing in the field, in the clause that says preconditions are data and a crash
is never not-applicable. Shipping v0.1.0 with it is shipping a counter-example to
the rule the product is built on. (That path is quoted rather than cited by line
because the branch carrying this spec also adds that file.)

## MERGE ORDER: BEFORE M3-P10, and this is an orchestrator decision with a reason

The number says eleventh; the dependency order says otherwise, and CLAUDE.md's
rule is that merge order is dependency order regardless of work order.

M3-P10 is the release phase. It publishes v0.1.0. Landing M3-P11 after it means
the first published version contains a known guard that cannot go red, and the
fix becomes a v0.1.1 whose only content is a defect we knew about at release
time.

The counter-argument, stated rather than suppressed: this delays the release the
owner wants. The mitigation is that the change is small and singular, one
condition in one evaluator, with a witness. If it turns out not to be small, the
right move is to say so and re-open the ordering rather than to grind.

**This ordering is the orchestrator's call, not the owner's instruction.** The
owner assigned the finding to M3-P11 and did not specify the order.

## Steps

1. In `src/gates/run.ts`, separate three outcomes that are currently two:
   the command RAN and its precondition was unmet (`not-applicable`), the
   command COULD NOT RUN (`error`), and the command ran and the precondition was
   met. A missing script, a non-executable file, a bad interpreter and a
   launcher failure are all the middle case.
2. Make the distinguishing evidence explicit rather than inferred from the exit
   code alone, so a script that legitimately exits 1 to signal "unmet" is not
   confused with one that exits 1 because it does not exist.
3. Emit an evaluated precondition record on every path, so the reason is DATA
   and a reader never has to guess which of the three happened.
4. Register the behaviours in `test/behaviors.json` and add witness specs.

## Acceptance criteria

1. With a gate whose `command` names a path that does not exist, the runner
   reports `error` for that gate, exits nonzero, and stdout names the missing
   path. It does NOT report `not-applicable`.
2. With a gate whose command exists and whose declared precondition is genuinely
   unmet, the runner reports `not-applicable` with an evaluated precondition
   record carrying the reason, and does not report `error`.
3. Criteria 1 and 2 are demonstrated on the SAME gate id, differing only in
   whether the script exists, so the two verdicts are shown to be
   distinguishable rather than merely both reachable.
4. A gate whose command exists but is not executable, and one whose interpreter
   line is bad, both report `error`. (Two structurally different members of the
   could-not-run class; one member is not a class.)
5. `manifest-self-check` against a package tree lacking `scripts/` reports
   `error` rather than `not-applicable`. This is the measured instance from
   delivery/review/clean-room-m3-p9-hazard.md:1 and it is the phase's
   real-world witness.
6. Every new behaviour resolves BY NAME in `test/behaviors.json`, and no
   assertion pins a count over an append-only registry.
7. `npm run build` exits 0 and `git status` is clean afterwards; the suite is
   reported with all three axes (toolchain, build state, invocation) and its
   SKIPPED count.

## What this phase deliberately does NOT do

- **It does not fix the eleven gates whose commands name unshipped paths.** That
  is the package-shape question, decided in principle by DR-0029 and belonging to
  M4. This phase makes those gates report `error` honestly instead of `not
  applicable` silently, which is the point: the packaging defect becomes VISIBLE
  rather than fixed here.
- **It does not re-audit past evidence.** Making the verdict readable from now on
  is in scope; re-deriving which historical `not-applicable` lines were actually
  crashes is not, and is recorded as unresolved rather than quietly dropped.
- **It does not touch the registry or the manifest.**

## What this spec does NOT establish

- **Nobody has measured how many historical `not-applicable` lines were crashes.**
  The claim that the verdict is currently unreadable follows from the code path,
  not from a survey, and no survey has been run.
- **The fix is ASSUMED small.** One condition in one evaluator is the
  orchestrator's reading of the reviewer's root-cause, not a measurement by
  someone who has attempted it. The merge-order argument above depends on that
  assumption and should be revisited if it proves false.
