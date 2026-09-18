# T-037: the absent arm of the push watcher returned success

**Measured:** 2026-09-17, 09:32:47 UTC.

## What happened

`pushwatch2.sh` was armed on `2d8596c1`, the `main` head created by merging
pull request 175. Fifteen seconds later it printed:

```
  09:32:47 ABSENT no push run on this sha yet
== post-merge push run GREEN on 2d8596c1c99bb771a55241b173ad5d9e845675f3
```

Those two lines contradict each other and the script printed both. The run did
not exist yet; GitHub had not created it. The watcher called that GREEN.

## The mechanism, which is not "a missing case"

The node fragment classifies the runs it finds and signals the result through
its EXIT CODE: 2 for a failure, 1 for pending, 0 for green. The absent case was
written as

```
if(!rs.length){console.log("ABSENT no push run on this sha yet");return}
```

`return` inside the `end` callback falls off the end of the program, and a node
process that falls off the end exits **0**. So the one state that means "I have
no evidence" was encoded as the one code that means "I have good evidence".

The mechanism is: **a status is communicated by exit code, and one arm reaches
the exit by falling through instead of setting it.** That is not specific to
this script. Any arm that ends in `return`, a bare `break`, or an uncaught early
path inherits whatever the default exit is, and the default is success.

## The witness

Both arms run against the same input, an empty run list:

| arm | printed | exit |
|---|---|---|
| `return` (the defect) | `ABSENT no push run on this sha yet` | **0** |
| `process.exit(1)` (the fix) | `ABSENT no push run on this sha yet` | **1** |

The printed line is IDENTICAL. Only the exit differs, which is why reading the
output did not reveal it and why the two contradictory lines above were the only
visible symptom.

## Blast radius, measured rather than assumed

Every `push`-event run on `main` was listed and checked, not just the recent
ones:

```
GET /actions/runs?branch=main&event=push&per_page=60
```

Thirty distinct `main` heads. Twenty-nine carry `gates=success` AND
`macOS smoke=success`. The thirtieth is `2d8596c1`, whose run was still
`in_progress` at audit time. **So the defect produced exactly one false GREEN,
on the merge that found it, and no earlier merge was wrongly certified.**

Why it did not bite before: every earlier arming happened after the run already
existed, so the absent arm was never taken. The arming that found it was fifteen
seconds after the merge.

## Why this is the third time

delivery/tuition/T-030-the-push-run-watcher-watched-the-wrong-workflow.md:1
records the same watcher watching the WRONG WORKFLOW: it took the first run from
a listing carrying two, so it reported green while `gates` was still running.
That was fixed by requiring every run on the sha to be completed and successful.
This is the same watcher failing on the state BEFORE any run exists.

CLAUDE.md:496 already names the shape, inside the T-008 dispatch contract: a
guard whose condition does not test the property that matters is green and
worthless. The repeated form
here is narrower and worth naming on its own: **the no-evidence state is the one
most likely to be encoded as success, because success is the default.**

## The rule

When a checker signals through an exit code, write the NO-EVIDENCE arm first and
give it an explicit nonzero exit. Then prove it: run the checker against an input
that produces no evidence and read the exit code, not the output.
