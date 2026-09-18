#!/usr/bin/env node
import { run, usageLine } from "../src/cli.ts";

/**
 * THE TOP-LEVEL ERROR PRESENTATION HANDLER (kernel plan M3, M3-P1 step 8b;
 * D-M3-21).
 *
 * `delivery/STATE.md` carried this as an unowned seam: "clean presentation of
 * a load-time configuration error ... a seam no M1 phase owns". M3-P1 owns it
 * because M3-P1 is the first phase to add commands whose ordinary input is a
 * HAND-AUTHORED FILE that will routinely be malformed, and a validator that
 * answers malformed YAML with a stack trace is a validator nobody trusts
 * (DR-0013 YAML clause 4).
 *
 * The rule: a thrown error from any subcommand is ONE diagnostic line on
 * stderr and a nonzero exit. Never a stack trace, on either stream.
 *
 * THE DOCUMENTED USAGE-MARKING MECHANISM IS GONE, and its removal is the
 * fix rather than the loss. This docblock used to promise that "an `Error`
 * carrying `usage: true` exits 64", with an `UsageMarkedError` interface
 * beside it, and a grep over `src/` and `bin/` found ZERO code that ever set
 * the field: every command reaches EX_USAGE by returning it from its own
 * handler. A comment describing a contract nothing implements is how the
 * next implementer reaches for a mechanism that silently does nothing, so
 * the branch and the sentence are removed together and `EX_USAGE` stays the
 * value handlers return.
 *
 * SCOPE IS EXACTLY THIS HANDLER, THE HELP AFFORDANCE, AND EPIPE (D-M3-21
 * plus the DR-0047 sweep's two CLI findings). Nothing else in this file
 * changes, because a dispatcher is the last place to accumulate incidental
 * edits.
 */

function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * AN EXIT CODE MUST NOT CONTRADICT THE STATE THE COMMAND LEFT BEHIND.
 *
 * Measured before this handler existed: `tiphys lock acquire --duration 900 |
 * head -1` printed the acquired line, exited 1 on an unhandled EPIPE, and
 * left BOTH layers mutated, the local lease on disk and the shared register
 * advanced to the next counter. A wrapper of the shape
 * `if ! tiphys lock acquire | grep -q acquired` therefore took its failure
 * branch while holding the fleet, which is the one wrong conclusion the
 * exclusion commands must never produce.
 *
 * EPIPE ONLY, and that word is load-bearing. A consumer closing the pipe is
 * not a failure of the command; any OTHER write error still surfaces, so
 * this does not become a blanket swallow of output failures. Both streams
 * are covered because a short consumer of stderr is the same hazard as a
 * short consumer of stdout.
 */
function ignoreEpipe(stream: NodeJS.WriteStream): void {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") {
      return;
    }
    throw error;
  });
}

ignoreEpipe(process.stdout);
ignoreEpipe(process.stderr);

/**
 * THE HELP AFFORDANCE (DR-0047 sweep, group cli, CR-F04).
 *
 * `tiphys --help` exited 64 with ZERO bytes on stdout and the usage line on
 * stderr, so `tiphys --help | less` showed nothing, while this project's own
 * evidence uses `tiphys --help` as a probe. That satisfied M1-P1 criterion 4
 * to the letter, because `--help` is an unknown subcommand, and it is still
 * the first thing a consumer types.
 *
 * The usage text is `usageLine()`, which src/cli.ts DERIVES from the dispatch
 * table, so this cannot drift from the commands that exist. M1-P1 criterion
 * 4's contract is untouched: an unknown subcommand still prints usage to
 * STDERR with an EMPTY stdout and exit 64, and the help words alone print to
 * STDOUT with exit 0.
 */
const HELP_WORDS = new Set(["--help", "-h", "help"]);

const argv = process.argv.slice(2);
if (argv.length === 1 && HELP_WORDS.has(argv[0] as string)) {
  process.stdout.write(`${usageLine()}\n`);
  process.exitCode = 0;
} else {
  try {
    process.exitCode = await run(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`tiphys: ${singleLine(message)}\n`);
    process.exitCode = 1;
  }
}
