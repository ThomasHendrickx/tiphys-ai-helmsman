# The post-merge watcher reported GREEN about a different workflow than the one
# that matters, and every answer it gave was correct

Found 2026-09-16 by the orchestrator, in its own tooling, while checking why CI
had not fired on another branch. Recorded because the answers being right is
what makes this worth writing down rather than what excuses it.

## What it did

T-009 requires a merge to be incomplete until the post-merge `push` run on the
new `main` head is observed to completion, because `main` was once red for four
hours and twenty-one minutes while every pull-request check was green.

`pushwatch.sh` implemented that by listing push runs on `main` and taking

    (j.workflow_runs || []).find(x => x.head_sha === SHA)

This repository runs TWO workflows, `gates` and `macOS smoke`, so the listing
carries two entries per sha and `find` returns whichever is first.

Measured on `main` at `b4dd6ff`:

| run id | workflow | state at the moment the watcher exited 0 |
|---|---|---|
| 35117648416 | `macOS smoke` | completed success |
| 35117648319 | **`gates`** | **in_progress** |

The watcher latched `35117648416` and printed POST-MERGE PUSH RUN GREEN. It was
reporting the macOS job while the gate bundle was still running.

## Why it is worth recording even though nothing went wrong

Re-checked afterwards, all seven merges made that day carry BOTH workflows
completed and successful on the push arm. So every conclusion the watcher
produced was true.

That is the point. A guard whose condition does not test the property it claims
is green and worthless, and it is worthless whether or not its answers happen to
be right, because it could not have said otherwise. This project has recorded
that shape at least six times and the watcher was written to enforce the rule
that exists because of it.

There is a second, sharper reading. This watcher was BUILT for T-009, whose
whole lesson is "a gate result is evidence only for the configuration it ran
under". It then treated a result from one workflow as evidence about another.
The tool embodied the exact substitution its own rule forbids.

## A second defect in the same file, found while fixing the first

An earlier version latched the run ID after finding it once, because the listing
endpoint had transiently DROPPED a run it had already returned: the watcher
printed `id=35101638428` twice and then `ABSENT`, while a direct read of that id
said completed success.

The latch fixed that symptom and made this defect permanent, because it latched
one run and followed it forever. Both are now gone. The check is evaluated fresh
each cycle over EVERY run on the sha, and a listing that transiently drops the
sha reports ABSENT, which is honest, rather than a green about one workflow.

## The fix, and what green means now

Green requires EVERY run on the sha to be completed AND successful. One pending
run keeps the whole thing pending; one failure fails it and NAMES the workflow.
The output carries the roster, so a reader sees what was actually checked:

    16:07:26 completed success [macOS smoke=success gates=success]

## What this does NOT establish

`prwatch.sh`, the sibling that watches a pull request's checks, WAS audited
against this defect rather than assumed clean, and it does not carry it: it
filters over every check run on the head, requires zero failing and zero
pending, and prints the roster. Read at prwatch.sh lines 19 to 23.

What remains unestablished: why the listing endpoint transiently dropped a run
it had already returned. That was observed once, never explained, and the new
all-runs check reads the same listing, so it is exposed to the same behaviour.
It now fails SAFE, reporting ABSENT rather than a green, but "fails safe" is a
property of the code and not a theory of the cause.

Nor does this audit cover the watchers as a class. Two of the three written this
session carried a defect of this shape, which is a poor enough rate that the
next one should be audited before it is trusted rather than after.

## A third watcher defect, same family, found the same afternoon

`prwatch.sh` reported `ABSENT no check runs for this sha yet` on pull request
#155 for forty-five minutes, once a minute, honestly, and uselessly.

The cause was not delay. `mergeable_state` was **dirty**: the pull request had a
merge conflict with its base, and GitHub does not run `pull_request` workflows
when it cannot compute the merge commit. The run was never going to arrive.

A control settles it rather than leaving it to argument: pull request #158,
opened minutes later on a branch that had been merged forward, produced both
workflow runs within seconds of its push.

**"Waiting" and "waiting forever" were indistinguishable in the output**, which
is the same shape as the other two defects in this file, and the third instance
in one afternoon. The watcher now reads `mergeable_state` whenever no check runs
exist, prints it, and EXITS 3 naming the conflict when it is dirty, because a
merge conflict is work now and ahead of CI rather than something to keep polling.

Witnessed against #155 itself:

    !! 16:48:32 9474c7d ABSENT no check runs for this sha yet -- and
       mergeable_state=dirty, so NO RUN WILL EVER FIRE.
    == PR #155 has a MERGE CONFLICT with its base. Resolve it; that is work now.

### The rate is the finding

Three watchers were written in one session and all three carried a defect of
this family: one reported green about a different workflow, one latched a run
the listing later dropped, and one could not tell an absent run from an
impossible one. None of them could go red for the thing it was watching.

That is not three unlucky bugs. A watcher is a guard, and this repository's
most-repeated defect is a guard whose condition does not test the property it
claims. Writing one quickly, under time pressure, while the thing it watches is
already in flight, reproduces that defect reliably. **The next watcher should be
given a failing case before it is trusted**, exactly as the red-witness rule
requires of any other guard, rather than audited after it has been believed.
