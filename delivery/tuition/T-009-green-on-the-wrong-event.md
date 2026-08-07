# T-009: main was red for four hours and twenty-one minutes while every PR check was green

- id: T-009
- project: tiphys-kernel
- date: 2026-08-07
- stage: M2 tail, PRs #25 through #30
- kernel-relevant: yes (the gate-result contract and what "CI is green" is allowed to mean)

## What happened

The `gates` workflow fires on two events, and they run DIFFERENT bundles:

- `pull_request`: the strong PR bundle, `--phase` derived from `github.head_ref`.
- `push` to `main`: the weaker `--bundle main`, with no `--phase` at all.

`scripts/m2-exit-test.sh` derived `--phase` unconditionally and died when it
could not. The derivation, captured from the pre-fix file
(`git show 5f9b058:scripts/m2-exit-test.sh`, lines 1108 to 1115):

```
  case "${branch}" in
    claude/*)
      phase=$(printf '%s' "${branch}" | sed -n 's#^claude/\(m[0-9][0-9]*-p[0-9][0-9]*\).*#\1#p')
      ;;
  esac
  if [ -z "${phase}" ]; then
    die "could not derive --phase from branch \"${branch}\"; pass --phase explicitly (lowercase, e.g. m2-p9)"
  fi
```

The only `case` arm is `claude/*`, so a branch literally named `main` leaves
`phase` empty and reaches the `die`. The main bundle therefore failed before it
ran a single gate:

```
m2-exit-test: FAILED: could not derive --phase from branch "main"; pass --phase explicitly (lowercase, e.g. m2-p9)
##[error]Process completed with exit code 1.
```

That line is byte-identical in all FIVE consecutive push-to-main runs:

| head | run | started (UTC) | conclusion |
|---|---|---|---|
| 9bb379b | 31181975748 | 13:17:51 | failure |
| f2df10a | 31194180984 | 15:45:11 | failure |
| 8cadeac | 31195603829 | 16:02:15 | failure |
| d6a0057 | 31199547255 | 16:51:14 | failure |
| 5f9b058 | 31201335688 | 17:14:00 | failure |
| 4515b48 | 31203260305 | 17:38:47 | success (the fix, #30) |

Last green before the run of reds: `ef6a796`, 10:57:13. The defect entered with
`9bb379b` (M2-P9, #25, the exit-test harness itself) and `main` was red from
13:17:51 to 17:38:47: **four hours and twenty-one minutes**.

Every `pull_request` run in that window was green, because the PR event supplies
`--phase` on the command line, so the derivation block above is skipped
entirely. The two steps are mutually exclusive by event
(`sed -n '84,101p' .github/workflows/gates.yml`):

```
      - name: M2 exit test (pull request)
        if: github.event_name == 'pull_request'
        run: >
          scripts/m2-exit-test.sh
          --no-build
          --bundle pr
          --base "${{ github.event.pull_request.base.sha }}"
          --head "${{ github.event.pull_request.head.sha }}"
          --phase "$(printf '%s' "${{ github.head_ref }}" | sed -E 's#^(claude/)?(m[0-9]+-p[0-9]+).*#\2#')"
          "${{ runner.temp }}/m2-exit-evidence"
      - name: M2 exit test (push)
        if: github.event_name != 'pull_request'
        run: >
          scripts/m2-exit-test.sh
          --no-build
          --bundle main
          "${{ runner.temp }}/m2-exit-evidence"
```

The PR step passes `--phase`; the push step passes none. One code path, two
call sites, and only one of the call sites could ever reach the defect.

## The two failures, and neither is "a bug shipped"

Bugs ship. These are the parts worth paying for.

### 1. The orchestrator merged four more PRs onto a red main and did not look

`f2df10a`, `8cadeac`, `d6a0057` and `5f9b058` were each dispatched, reviewed,
and merged AFTER `main` was already red, by an orchestrator that declared each
one green. The declaration was true and irrelevant: it was read off the PR
check, and the PR check is the event that cannot fail this way.

The orchestrator did not notice at any point in four hours. It noticed because
the OWNER asked: "main ci run was red. is it flaky?"

This is T-008's shape one level up. T-008 was a missing beacon on a dispatched
agent; the answer was a freshness watchdog armed in the same turn. Here the
signal EXISTED, was published by GitHub, and was never read, because the
orchestrator's definition of green was "the check I was already watching."
Watching a green thing is not supervision of the red one.

**The mechanism, stated the way the fix-round contract demands it:** a gate
result is only evidence for the configuration it ran under. `gates` green on
`pull_request` is not `gates` green. It is `gates` green ON THE PR EVENT, and
it says nothing at all about the arm the other event takes.

### 2. The round before had already fixed the same mechanism, one arm over

`f2df10a` (#27) is titled "exit harness requires scope green only on
phase-branch runs". It fixed the harness's assumption that a run always has a
phase, in the SCOPE-EXPECTATION arm, by adding `resolve_scope_expect` which
branches on exactly the question "is this a phase-branch run?".

It did not fix the PHASE-DERIVATION arm, which asks the same question and dies
on the same answer. In the pre-fix file (`git show 5f9b058:scripts/m2-exit-test.sh`)
the two sit TWELVE LINES APART in the same block: the `die` at line 1114, the
`resolve_scope_expect` call it was added for at line 1126. The round that
introduced the second one had the first one on screen.

That is the fix-round contract's named failure verbatim: **the fix addressed
the instance the reviewer named, when the defect was the mechanism.** The
mechanism was "the harness assumes every run has a derivable phase." Its call
sites are enumerable. Nobody enumerated them, because the contract's item 2
(publish the derivation) and item 3 (state what it did not cover) are written
for phase fix rounds and this was an orchestrator-side hotfix, so the contract
was never opened.

`f2df10a`'s own CI was, of course, green. It was a pull_request run.

## What was already known and did not help

- CLAUDE.md documents the two event types and the workflow file's own comments
  describe the `push` fallback in detail ("On a push to main `github.head_ref`
  is empty ... the push (main) bundle does not run scope, so it is unaffected
  either way"). The asymmetry was UNDERSTOOD and WRITTEN DOWN, in the file, by
  the people it then bit.
- Knowing that two configurations exist does not cause anyone to check both.
  That is the T-006 result again: a documented norm does not survive a busy
  session. Only a mechanism does.

## Binding consequence

1. **A merge is not complete until the post-merge `push` run on the resulting
   `main` head is observed to completion.** Not the PR check on the branch: the
   run whose head sha is the new tip of `main`. The orchestrator watches that
   run, and the phase is not closed until it is green.
2. **Where a program's behaviour forks on the CI event, both arms need a
   witness.** `test/m2-exit-test.test.ts` now carries
   `m2-exit-main-bundle-needs-no-phase`, red against the dangerous state (the
   unguarded derivation) and green with the guard. The PR arm was already
   witnessed; only one of the two was, and the unwitnessed one is the one that
   broke.
3. **An orchestrator-side hotfix to shared harness code is a fix round and owes
   the fix-round contract**, including the mechanism statement, the published
   derivation, and the statement of what the derivation did not cover. #27 was
   treated as too small for that, and #30 is the cost of the exemption.

## Why this belongs in the kernel and not in a habit

The kernel's gate contract already distinguishes green, red, error,
not-applicable and vacuous, precisely so that "the gate did not really run" is
reported differently from "the gate passed". This incident is that same
distinction at
the layer ABOVE the gate: the RUN did not really run, and the orchestrator read
it as passing, because it read a different run.

A gate result that does not carry the configuration it ran under is a result
that can be honestly reported and still be false. That is a kernel-level
property, and it is the argument for the exit-test harness recording the bundle
and the derived inputs into its evidence directory rather than emitting a
verdict alone.

## Evidence

- The five red runs and the green fix run, table above, from
  `GET /repos/.../actions/runs?event=push&branch=main`.
- The failing line, extracted identically from all five job logs:
  `m2-exit-test: FAILED: could not derive --phase from branch "main"`.
- `git log --oneline ef6a796..4515b48`: the six commits spanning the window.
- `git show f2df10a -- scripts/m2-exit-test.sh`: the sibling arm fixed one
  round earlier, `resolve_scope_expect`, branching on the same predicate.
- The fix: PR #30, merged as `4515b48`, guarding phase derivation behind the
  bundle selection.
- The witness: `test/behaviors.json` key
  `m2-exit-main-bundle-needs-no-phase`.
- The owner's question that surfaced it, 2026-08-07: "main ci run was red. is
  it flaky?" It was not flaky. It was deterministic, five for five.
