#!/usr/bin/env node
import { EX_USAGE, run } from "../src/cli.ts";

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
 * stderr and a nonzero exit. Never a stack trace, on either stream. A usage
 * error (an `Error` carrying `usage: true`) exits 64; everything else exits
 * 1.
 *
 * SCOPE IS EXACTLY THIS HANDLER (D-M3-21). Nothing else in this file changes,
 * because a dispatcher is the last place to accumulate incidental edits.
 */

/** An Error a subcommand can mark so the handler exits 64 rather than 1. */
interface UsageMarkedError {
  usage?: boolean;
}

function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  const usage = (error as UsageMarkedError | undefined)?.usage === true;
  const message =
    error instanceof Error ? error.message : String(error);
  process.stderr.write(`tiphys: ${singleLine(message)}\n`);
  process.exitCode = usage ? EX_USAGE : 1;
}
