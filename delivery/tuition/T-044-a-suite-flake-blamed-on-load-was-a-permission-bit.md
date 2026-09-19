# T-044: the tuition entry existed, was settled, and was not read

**The failure this entry is named after is NOT an open question and was never
this entry's to explain.** It is fully settled at
delivery/tuition/T-029-the-precondition-test-flakes-only-here.md:1, which
identified the mechanism on 2026-09-16, two days before this entry was opened.
Read that one. This one records why a second entry got written at all.

The filename is left as it was allocated, because a retired or misleading id is
never renumbered in this project and the correction belongs in the open.

## What happened

The orchestrator met an intermittent failure of the precondition test, re-ran it
on a quiet container, saw green, and reported to the owner that the cause was
concurrent load from two agents running their own suites.

Every part of that was already answered in a committed file:

- **Load was RULED OUT in writing**, with better evidence than the orchestrator
  had: the test failed at load average 1.92 and passed at 13.38, which is the
  wrong direction for a load explanation.
- **The real mechanism was already measured.** `/tmp/claude-0` at mode `700`
  denies traversal to the unprivileged uid `runCliUnprivileged` drops to, so the
  child cannot resolve the repository's own source. At `705` the same single-test
  invocation passes.
- **The 700-to-755 transition the orchestrator later "discovered" is in that
  entry too**, and is explained there as exactly `0o705 | 0o055`, the helper
  walking up and adding bits.
- **"Re-run it and it passes" was already named as a self-erasing bug**, because
  the first run that includes a `/tmp/claude-0`-rooted test leaves the directory
  open for every later run in that container.

So the orchestrator re-derived a settled result, less completely, and published a
first draft of this entry claiming to have closed an open question. It had not.

## The mechanism, which is not about permissions at all

**A tuition entry that exists and is not read costs exactly what one that was
never written costs.** This project's durability rule says truth lives in files
so a session's memory can be lost safely. That only works if the files are read
at the moment the question arises, and "have I met this before" is a question a
busy session answers from memory by default.

The failure is cheap to prevent and was not prevented:

```
grep -rl '<the failing test name or file>' delivery/tuition/
```

One command, run before attributing an intermittent failure to anything. It
would have returned T-029 immediately.

This is the same shape the project has recorded repeatedly for rules (T-005,
T-006, T-039): a step that runs because someone remembers it does not survive a
busy session. Here it applies to the RECORD rather than to a rule, which is a
worse case, because the whole durability argument rests on the record being
consulted.

## What the sweep did contribute, kept narrow

Four new occurrences, a third module name, and one clean confirmation of T-029's
settled mechanism. They are recorded in T-029 itself, where a reader of that
failure will find them, rather than here.

## The rule

Before attributing an intermittent failure, grep `delivery/tuition/` for the test
or file. Before reporting a cause to the owner, name the variable you think is
responsible and read its value on both arms. Re-running until green is not a
control arm: it cannot distinguish any two causes that both vary between runs.
