# process.exit() truncates a piped gate report at 64 KiB, and three shipped gates use it

- date: 2026-09-16
- raised by: the M4-P23 clean-room reviewer, as a MEDIUM it explicitly could not
  force: "I did NOT demonstrate truncation in any of the three; the mechanism is
  present and the trigger has not been forced, and I state that rather than
  implying otherwise."
- status: **forced, bounded, and LATENT.** Real, reproducible, in shipped code on
  the user-visible path, and no gate currently produces output within an order of
  magnitude of the trigger.

## The sites

Three shipped modules end their CLI entry point with `process.exit(main(...))`:

```
$ grep -rn 'process\.exit(' src/gates/*.ts | grep -v exitCode
src/gates/credentials.ts:691:    process.exit(gateMain(process.argv.slice(2)));
src/gates/red-witness.ts:574:  process.exit(main(process.argv.slice(2)));
src/gates/suite.ts:1142:  process.exit(runSuiteGate(process.argv.slice(2)));
```

The three lines are src/gates/credentials.ts:691, src/gates/red-witness.ts:574
and src/gates/suite.ts:1142.

They are reached by `tiphys gates run`, because the registry invokes all four of
the gates they serve as SUBPROCESSES rather than by import:

```
credential-scrub: [node, src/gates/credentials.ts, credential-scrub]
credential-token: [node, src/gates/credentials.ts, credential-token]
suite:            [node, src/gates/suite.ts, --pin-root, src, --pin-root, bin, --pin-root, test]
red-witness:      [node, src/gates/red-witness.ts]
```

A spawned child's stdout is captured through a PIPE, which is the dangerous
state. That matters because the same code is harmless in the other one.

## Forcing it, and the threshold

Two scripts differing in one line, `process.exit(0)` against
`process.exitCode = 0`, both writing N lines to stdout, both piped to `wc -c`:

| lines | bytes wanted | `process.exit()` got | `process.exitCode` got | |
|---|---|---|---|---|
| 500 | 5,390 | 5,390 | 5,390 | intact |
| 2,000 | 22,890 | 22,890 | 22,890 | intact |
| 5,000 | 58,890 | 58,890 | 58,890 | intact |
| 10,000 | 118,890 | **65,466** | 118,890 | **TRUNCATED** |
| 100,000 | 1,288,890 | **539,752** | 1,288,890 | **TRUNCATED** |

The cut is at roughly 65,536 bytes, one pipe buffer. `process.stdout.write` to a
pipe is asynchronous, `process.exit` does not wait for the queue to drain, and
everything past the buffer is lost.

**The same code to a FILE loses nothing**, which is why this survives casual
testing: writes to a regular file are synchronous.

```
to a pipe:  process.exit() 4,409 lines of 200,000   process.exitCode 200,000
to a file:  process.exit() 200,000                  process.exitCode 200,000
```

## Why it is LATENT rather than live, stated so nobody over-reacts

The largest gate stdout found anywhere in this session's captured evidence is
**2,425 bytes**, from a `red-witness` run. The next four are between 804 and
1,076. That is more than twenty times below the intact figure and nearly thirty
times below the trigger.

So no gate is losing evidence today. The correct severity is the one the
reviewer gave it, and the correct action is to fix it before something grows
into the trigger rather than after.

**The plausible near-term trigger is `suite`.** It is the one gate whose subject
is another program's output, the suite currently reports 846 tests, and node's
reporter prints on the order of 80 bytes per test. That is roughly 68 KB, which
is on the wrong side of the line measured above. Whether the gate FORWARDS that
output or only summarises it is not established here and is the thing to check
before deciding this is comfortable.

## What this derivation did NOT cover

- **Whether `suite` actually forwards the reporter's output.** Not measured. A
  size probe of the gate run from this clone returned zero bytes, which means the
  probe was wrong rather than that the gate is silent, and it was not chased.
- **stderr.** Only stdout was measured. `process.exit` truncates a piped stderr
  by the same mechanism and no stderr size was probed.
- **The fourth site.** `src/hooks.ts:51` is `process.exit(64)` on a usage error
  with nothing written before it, so the mechanism cannot bite there; it is
  named rather than silently excluded.
- **Whether any gate's VERDICT could change.** It could not through this path:
  the verdict comes from the exit code, which survives intact. What is lost is
  evidence, which for this project is its own kind of serious, but it is not the
  same as a gate reporting the wrong colour.
- **`scripts/*.mjs`.** Only `src/` and `bin/` were grepped. The script gates were
  not examined and may carry the same pattern.

## The fix, and the witness it owes

Replace `process.exit(main(...))` with `process.exitCode = main(...)` at the three
sites. The red witness is the table above, which is already two structurally
different members of the class (a size just under the buffer and a size well
over it) plus the pipe-versus-file control that shows the mechanism is the pipe
and not the volume.

This is NOT M4-P23's to fix. Its branch changes no file under `src/`, and the
fix-round contract's rule against widening a phase applies. It needs its own
change, owned by a phase that owns `src/gates/`.

## A note on how the threshold was first measured wrongly

The first run of the table above reported zero bytes for every row and would
have read as total truncation at 500 lines. The heredoc writing the probe was
unquoted, so the shell substituted inside it before `node` ever ran:

```
/bin/bash: line 18: for (let i = 0; i < $n; i++) process.stdout.write(\`line \${i} ${'x'}\`);
process.exit(0);
: bad substitution
```

Three rows of confident TRUNCATED came out of a program that had not been
written, and the give-away was there in the same output.

It is the same family as the pipe-exit-status error that misread this morning's
`check-dual-review` probe: a usage error read as a clean result, which the
fix-round contract names as one of three things that have bitten this project.
Quote the heredoc, and check that the probe produced a non-empty control before
believing its treatment arm.
