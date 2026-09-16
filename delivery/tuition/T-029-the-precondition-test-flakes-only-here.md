# The precondition test flakes only in this container, five times, and the error
# is self-refuting every time

Registered 2026-09-16 after the fifth occurrence, so the next person to meet it
does not spend a round re-deriving that the file exists. It is NOT called a
flake: "flake" is not a root cause in this repository, and the cause here is
genuinely open.

## The test

`test/gates.test.ts`, "a precondition command exiting nonzero is error, not a
skip, whenever a path-shaped argv element cannot be opened: unreadable, after an
option, or carrying whitespace".

## The occurrences

| when | context | reported |
|---|---|---|
| M4-P13 bundle | orchestrator clone, full bundle | failing test, no detail captured |
| M4-P15 suite | orchestrator clone, `npm test` | `ERR_MODULE_NOT_FOUND` for `src/task.ts` |
| M4-P19 suite gate | orchestrator clone, suite gate ALONE | failing test at load 1.92 |
| M4-P2 round 2 union | a subagent's throwaway clone | `ERR_MODULE_NOT_FOUND` for `src/validate.ts` |
| M4-P10 bundle | orchestrator clone, full bundle | failing test |
| M4-P26 verification | a subagent's own clone, suite+scope gate | failing test at load 5.20, green at load 8.59 |

Six occurrences, in at least three different clones, by at least three different
agents. ZERO occurrences in CI, across every pull request this milestone.

The sixth is the best-controlled: the agent established that `test/gates.test.ts`
and `src/gates/run.ts` are BYTE-IDENTICAL to the merge base before attributing
anything, so base and branch are the same program for that test, then recorded
one red and one green at the same head.

## Why the error refutes itself

In the two occurrences where the message was captured, the subprocess reported
`ERR_MODULE_NOT_FOUND` for a source file. Checked immediately afterwards, at the
same head and with a clean `git status --porcelain`, the file EXISTS on disk, is
tracked, is in the HEAD tree, and is on `main`. A subprocess did not see a file
that was there.

The test's own assertion text already classifies this shape correctly, which is
why it is registered rather than chased: it says the run "did not reach a
verdict, which is an environment failure rather than a wrong verdict".

## What has been ruled out, and what has not

RULED OUT: load. The obvious reading is that this is the wall-clock family, like
`test/coverage-gate.test.ts`, whose 250ms budget at src/gates/coverage.ts:235 is
genuinely load-dependent. It is not the same thing. This test failed at load
average **1.92** and passed at load **13.38** on the same head, which is the
wrong direction for a load explanation.

RULED OUT: the branch. It has failed on four different branches, and in every
case the file it names is not one the branch changes.

NOT ESTABLISHED: the cause. But there is now a LEAD, contributed by the sixth
observation and worth following before anyone starts from scratch:

> the test chmods shared paths and spawns a child under an unprivileged uid,
> which makes a concurrency race plausible, and plausible is not measured

That fits the evidence better than load does. It explains why the failure is
CONCURRENCY-shaped rather than SLOWNESS-shaped, why it appears when other work
is touching the same filesystem, why `ERR_MODULE_NOT_FOUND` names a file that
exists (an unprivileged child losing traversal on a path whose mode is being
changed by a sibling), and why CI never sees it: a CI runner executes one job
with nothing else contending.

It is a hypothesis. Nobody has forced it. But the seventh occurrence narrowed it
to a specific mechanism candidate, which is worth more than the hypothesis alone.

### The helper modifies SHARED CONTAINER STATE, not test-local state

`grantTraversalWhenUnderTmp` at test/gates.test.ts:3517 walks UP from its target
to `tmpdir()`, chmod-ing every ancestor:

    while (current.startsWith(`${temp}/`)) {
      chmodSync(current, statSync(current).mode | 0o055);
      current = dirname(current);
    }

When the repository is under `/tmp`, that chain includes **`/tmp/claude-0` and
`/tmp` themselves**. Those are shared with every other process in the container,
including concurrently running agents with their own clones.

CLAUDE.md already records half of this from the other direction: `/tmp/claude-0`
is `drwx------`, and an agent whose worktree sits under it "opens `/tmp/claude-0`
incidentally and the interpreter becomes reachable as a side effect". That entry
treats the side effect as benign. It is benign for the agent that causes it; what
was not considered is that the same chmod is a WRITE to state other processes
depend on.

The chmod is read-modify-write and only ADDS bits, so two concurrent grants
converge. What is NOT established is whether anything ever REMOVES them: a
cleanup, the container, or another test. A grant that is lost between the chmod
and the child's spawn produces exactly this failure, an unprivileged child unable
to traverse to a file that exists.

### The experiment that would settle it

Run the full suite with `--test-concurrency=1` several times. Node runs test
FILES in parallel by default, and `test/gates.test.ts` and `test/witness.test.ts`
are the only two that chmod shared ancestors. If the failure disappears at
concurrency 1 and persists at the default, the race is intra-suite and the fix is
in the helper. If it persists at concurrency 1, the contention is with something
outside the suite and the fix is to stop touching `/tmp` at all.

Neither run has been done. It is written down because it is cheap, decisive, and
nobody has done it in seven occurrences.

## SETTLED, 2026-09-16, AND IT IS NOT THE RACE THIS ENTRY EXPECTED

The concurrency experiment above was never needed. A cheaper one settles it, and
the answer is an ORDERING DEPENDENCY inside a single file rather than a race
between files.

Same head, same toolchain, same clone, same single-test invocation, ONE variable:
the mode of `/tmp/claude-0`, which is the directory holding both the checkout and
the fetched Node 26 interpreter.

| mode of `/tmp/claude-0` | result |
|---|---|
| `700`, the container default | **exit 1**, ERR_MODULE_NOT_FOUND on `src/cli.ts` from the unprivileged child |
| `705`, after `chmod o+rx` | **exit 0**, 1 pass, 0 fail |

That is the whole mechanism. `runCliUnprivileged` drops to an unprivileged uid
and spawns `process.execPath`; at `700` that uid cannot traverse into
`/tmp/claude-0`, so the child cannot resolve the repository's own source, and the
test's assertion correctly reports it as an environment failure rather than a
wrong verdict.

### Why it looked like a race, and why re-running "fixed" it

The helper walks UP from the path it is given, adding `0o055` at each ancestor
strictly under `/tmp`, and it only ever ADDS bits. Nothing removes them. So:

- A test given a fixture under `mkdtemp` (here `/tmp/tiphys-gates-*`) grants
  traversal for THAT tree and never touches `/tmp/claude-0`.
- A test given a path under `/tmp/claude-0` grants it for the whole session.

Whether the first kind of test succeeds therefore depends on whether the second
kind has ALREADY RUN. That is a dependency on execution order, and the order
changes with file-level concurrency, with `--test-name-pattern`, and with which
tests a filtered run includes at all.

The mode transition was visible in the measurement and is the proof rather than
the theory: in the passing arm `/tmp/claude-0` went from `705` to `755` during
the run, which is exactly `0o705 | 0o055`, so the helper did reach it. In the
failing arm it stayed at `700`, because the test aborted at the spawn before
anything reached that call.

**"Re-run it alone and it passes" worked for the same reason, and it is worse
than a workaround: it is a self-erasing bug.** The first full run that includes a
`/tmp/claude-0`-rooted test leaves the directory open, so every later run in that
container passes. The advice earlier in this entry to re-run and quote both
results was right about honesty and wrong about the cause.

### What to do about it

For a local run, grant and restore explicitly rather than depending on which
tests happened to run first:

```
chmod o+rx /tmp/claude-0     # before
chmod 700  /tmp/claude-0     # after, back to the container default
```

The repository's local-green driver now does this with a trap, so the restore
happens even when the suite fails.

### Why it has never been seen in CI, now explained rather than observed

CI checks the repository out under the runner's workspace, not under a `0700`
scratch directory, and it does not use a fetched interpreter under one either.
Both halves of the precondition are absent there. That is a statement about the
two environments, so it predicts the flake will stay CI-invisible rather than
merely recording that it has been.

### What this still does NOT establish

Whether `test/witness.test.ts`, the other file that chmods shared ancestors, has
the same ordering dependency. It was not exercised in either arm. And nothing
here says the helper SHOULD grant traversal for the interpreter as well as the
repository; that is a real gap in `test/` and closing it is a change to shipped
test code, which is a phase's work and not a tuition entry's.

## How to behave when you meet it

Re-run it alone and re-run the suite. In every recorded case both come back
green at the same head. Then quote BOTH results rather than only the green one,
because a test that passes on the second attempt is not the same fact as a test
that passes.

Do NOT skip, disable or quarantine it. It guards a real property, the whole
point of which is that a precondition command failing is an ERROR and not a
silent skip, which is this repository's most-repeated defect shape.
