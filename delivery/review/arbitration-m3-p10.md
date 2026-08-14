# Arbitration, M3-P10: two reviews, one APPROVE, one REQUEST CHANGES, and why the disagreement is not a conflict

- date: 2026-08-14
- arbitrator: orchestrator
- reviews: delivery/review/clean-room-m3-p10-criteria.md:1 and
  delivery/review/clean-room-m3-p10-hazard.md:1, both landing in THIS pull
  request under DR-0031 rather than in pull requests of their own
- head reviewed by both: `8d056f6`
- outcome: **FIX ROUND 1 DISPATCHED.** It does not merge yet.

## The two verdicts differ and the reviewers do not

The criteria reviewer independently re-derived all seven acceptance criteria
and returned APPROVE with one LOW-MEDIUM. The hazard reviewer returned REQUEST
CHANGES with three HIGHs. That is not a contradiction, and reading it as one
would be the mistake this pairing exists to prevent.

**Every criterion is MET as literally written, and the phase is still not
safe.** The criteria the plan wrote ask whether the machinery is READY. Nothing
in them asks whether the irreversible action it guards can happen by accident.
The criteria reviewer said so itself, naming the hazard lens's ground as the
first item in what its review does not establish.

This is the second consecutive phase where both reviewers reported the criteria
met and one of them requested changes anyway. That is the argument for having
criteria AND an adversarial lens rather than either alone, and it is now
measured twice rather than asserted.

## What the round trip cost and what it bought

| step | outcome |
|---|---|
| implementation | 9 commits, all seven criteria met as written, criterion 6 declared NOT MET |
| criteria review | APPROVE, 1 LOW-MEDIUM, every criterion independently reproduced including the falsified prediction inside criterion 1b |
| hazard review | REQUEST CHANGES: 3 HIGH, 3 MEDIUM, 3 LOW, and **2 attacks RUN AND REFUTED** |
| this arbitration | one fix round, decomposed into three mechanisms rather than eleven findings |

**The two refutations are worth as much as the charges.** The hazard reviewer
attacked zero-unit vacuity and found the gate really does rewrite it to error,
exit 21, on the direct path CI uses. It attacked the dependency growth the
implementer had flagged and found all ten production licences correct, the maps
exact, and the `commonmark` attribution right. Both were plausible defects that
the reviewer measured instead of charging, and the register is better for not
carrying them.

## The three mechanisms, which is what the fix round is dispatched against

The fix-round contract binds here: name the MECHANISM, not the finding. Eleven
findings collapse into three, and the round is scoped to the three.

### M1: a guard is asserted by its TEXT, never EVALUATED

HRB-3 (HIGH) and HRB-11 (MEDIUM) are the same defect. The only automated guard
over `npm publish` is `assert.match(publish.if, /dry-run/)`, so three separately
inverted guards, including publish-always, all pass it exit 0. And
`requested="${{ inputs.version }}"` is interpolated by Actions before the shell
runs, so a dispatch passing the literal `$declared` makes the version-agreement
refusal agree with anything and `$(...)` executes.

The mechanism is one sentence: **the check tests the SHAPE of the guard rather
than its BEHAVIOUR.** A test that greps a condition is not a test of the
condition. This repository has the same shape recorded three times over under a
different name, the guard whose condition does not test the property that
matters, and every prior instance was found green and worthless.

HRB-4 (LOW, `== false` coercion, reachability not established) is the same
family one step down and is folded in because the fix touches the same line,
not because its reachability was established. It was not.

### M2: a check MODELS the thing it is supposed to READ

HRB-1 (HIGH), HRB-6 (MEDIUM) and HRB-7 (MEDIUM) are one mechanism in three
programs. The licence inventory walks the MANIFEST instead of reading the
installed tree, so it goes green over a GPL-3.0-only package planted in a copy
of the real tree, measured two ways. The contamination probe answers a question
that is neither necessary nor sufficient for Node's resolution, and reports
clean under a symlink, under `NODE_PATH`, and under a parent `node_modules`.
And `gate-registry.yaml`, which SHIPS, asserts that no publish path can skip
the licence gate, which `--ignore-scripts` was measured to falsify.

The mechanism: **the program answers a proxy question and reports the answer as
though it were the real one.** HRB-7 is the worst of the three despite its
severity label, because the false claim is in a shipped artifact and DR-0027's
test is reachability, not severity.

### M3: the artifact is never executed before it is published

HRB-5 (HIGH) and HRB-10 (LOW). The rehearsal never runs release verification,
and the real run runs it AFTER the publish. A one-word change to `files` ships
a completely broken package past both pack tests, the workflow's own pack
check, and the licence gate, and only the post-publish step catches it, which
is after the irreversible action. Under `--ignore-scripts` the pack listing is
a function of build state, 181 entries against 60, so check 5 can be green over
a listing containing no code at all.

The mechanism: **every pre-publish check inspects a LISTING; nothing installs
the thing and runs it.** This is the same shape as M2 one level up, and it is
kept separate because the fix is different: M2 is "read instead of model", M3
is "execute instead of inspect".

## Reachability, stated per mechanism because DR-0027 makes it the test

DR-0027 gives `scripts/`, `test/` and `.github/` one round with findings
recorded rather than blocking, UNLESS they make a shipped artifact wrong. All
three mechanisms clear that bar, and the argument is given rather than assumed:

- M1 and M3 guard `npm publish`, which is the one action in this milestone with
  no clean undo. A defect that lets a wrong artifact reach the registry does not
  merely make a shipped artifact wrong, it IS the shipped artifact being wrong.
- M2 includes a false assertion inside `gate-registry.yaml`, which is on the
  `files` list and therefore ships as itself.

So this is not a scaffolding round being verified for ceremony, which is the
failure DR-0027 was written to stop. It is the release path.

## What is NOT in the round, and why

- **CR-001 is RESOLVED, not carried.** The criteria reviewer reported that the
  work history's claim of an unreachable GitHub API did not reproduce in its
  session. The orchestrator re-measured rather than averaging two honest
  accounts: every probe returns 200, and a deliberately INVALID token gets the
  same 200 and the same rate limit, which shows the proxy substitutes
  credentials and the token value is irrelevant. Standing warning 6 is corrected
  in place. Nothing for this phase to fix; the work history's claim was
  inherited from a binding document and was true when written.
- **HRB-8 (LOW)** is folded into M2's fix rather than tracked, because the
  release-verify witness has to change anyway and leaving it asserting the wrong
  thing while its subject changes is how a witness silently stops witnessing.
- **Criterion 6 stays NOT MET.** It is the milestone exit test, it is its own
  dispatch, and nothing in this round changes that.

## What this arbitration does NOT establish

- **It does not re-derive either review.** Their measurements are taken as
  reported, with two exceptions the orchestrator checked itself: HRB-11's
  interpolation defect, read directly out of the workflow source, and CR-001,
  re-measured in full.
- **It does not claim eleven findings are exhaustive.** The hazard reviewer
  names what it did not attack; that list is inherited unexamined.
- **It does not predict that one round closes all three mechanisms.** DR-0027
  caps this branch at two, and the second is the last. If round 1 leaves a
  mechanism open, round 2 is spent on it and anything still open after that is
  recorded and merged or the branch is abandoned.

## A note that is not a finding: the hazard reviewer died and lost nothing

It was killed by a server-side 529 at 518 lines, mid-sentence. Its working tree
was clean and all four of its commits were already on its remote branch, so the
orchestrator pushed nothing and salvaged nothing; it resumed the same agent,
which finished to 899 lines.

That is worth recording because delivery/tuition/T-002-agent-death-mid-fix-round.md:1
records the opposite outcome from an implementer that died with uncommitted
edits to the lock's mutation primitive, and the incremental-beacon rule in
CLAUDE.md's dispatch contract was written in response to it. **This is the first
time a real death has tested that rule in this project, and the answer was a
pause rather than a loss.** It is recorded here rather than as a tuition entry
because tuition is for failure modes and this is a mechanism working.
