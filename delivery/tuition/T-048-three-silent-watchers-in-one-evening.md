# T-048: three watchers went silent in one evening, each for a different reason

- id: T-048
- date: 2026-09-29
- phase: M6 orchestration

## What happened

1. The agent tool's output file is a SYMLINK to the transcript. A freshness
   watchdog read the link's own mtime (`find -printf %T@` without `-L`), so it
   reported an agent stale while the transcript was being written.
2. A subagent's one-line `grep` never returned. No process was running, the
   transcript stopped at the tool call, and no failure notification came. The
   corrected watchdog caught it at 26 minutes; the agent was stopped and
   resumed with its context, and lost nothing.
3. A CI watcher split `id name event status conclusion` on spaces. The
   workflow `macOS smoke` has a space in its name, so no run ever read as
   completed and the watcher emitted nothing for 30 minutes.

## The rule

A watcher is only as good as its parse of the thing it watches. Before
arming one, run it once against a state you already know (a finished run, a
file you just touched) and see it report. Silence from an untested watcher is
not evidence.

Related: delivery/tuition/T-014-the-watchdog-watched-the-wrong-place-six-times.md:1
