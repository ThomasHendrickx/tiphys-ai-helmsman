import { createHash } from "node:crypto";
import { appendFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * THE TOOL-CALL OBSERVER (kernel plan M4, M4-P6 criteria 4, 5 and 6).
 *
 * THIS HOOK BLOCKS NOTHING AND MAKES NO SAFETY CLAIM. The project-write block
 * is workstream 2's (SC-010's carve-out, D-8's working-tree-versus-refs line),
 * and a `PreToolUse` hook shipped here with no carve-out would either refuse
 * the orchestrator's own merge path or permit everything. The second is a
 * guard that cannot go red, which is the mechanism this repository has paid
 * for six times (hazards H-B and H-D). So this phase ships the PLUMBING with
 * no policy, and what it buys workstream 2 is a corpus of REAL captured hook
 * payloads to write its red witnesses against.
 *
 * WHAT "BLOCKS NOTHING" MEANS MECHANICALLY, from the shipped harness's own
 * documentation rather than from an assertion here
 * (test/fixtures/plugin-hook-payloads/hook-json-output-contract.txt:1): a
 * hook's decision travels on STDOUT, as `decision`, `continue: false` or
 * `hookSpecificOutput.permissionDecision`. M4-P1 measured the exit-code half
 * from the outside, hook exit 0 leaving the file CHANGED and hook exit 2
 * leaving it unchanged (delivery/work-history/m4-p1.md:236). So this module
 * writes NOTHING to stdout and exits 0 on every path, including every failure
 * path, and that pair is the whole of the claim.
 *
 * CONSTRAINT C-1 BINDS THE OUTPUT. `tasks/<id>/tool-calls.jsonl` is
 * append-only and is EVIDENCE, never state. Nothing in the kernel or in this
 * plugin reads current state from its tail, and this module is the only place
 * in either package that names the file at all: it opens the path for APPEND
 * and has no read path to it, which criterion 6 asserts over the COMPILED
 * output rather than over a grep pasted into a work history.
 *
 * WHERE THE LOG LIVES IS DERIVED FROM THE PAYLOAD, NOT FROM THE ENVIRONMENT,
 * and that is forced rather than chosen. The kernel builds the EXACT
 * environment for every child of a launch from an allowlist
 * (src/exec/env.ts:69) and an adapter must never widen it, so there is no
 * `TIPHYS_TASK_DIR` for this hook to read and adding one would be exactly the
 * widening M2-P8 forbids. What the hook does get is the payload's own `cwd`,
 * which for a kernel-launched agent is the task worktree
 * (src/pool.ts:241, `<fleet>/worktrees/<taskId>`), and the task directory is
 * its sibling `<fleet>/tasks/<taskId>`. The derivation is CHECKED, never
 * assumed: an observer running outside a fleet resolves nothing, records
 * nothing, and still exits 0.
 */

/** The append-only evidence log's basename, inside the task directory. */
export const TOOL_CALL_LOG_BASENAME = "tool-calls.jsonl";

export type LogResolution =
  | { ok: true; path: string }
  | { ok: false; reason: string };

/**
 * The evidence log for the task whose worktree is `payloadCwd`, or a reason.
 *
 * The check is that `<fleet>/tasks/<taskId>` IS AN EXISTING DIRECTORY. A hook
 * that created the directory would be inventing a task, and a hook that wrote
 * without checking would scatter `tool-calls.jsonl` files through whatever
 * tree an agent happened to be standing in.
 */
export function resolveToolCallLog(payloadCwd: unknown): LogResolution {
  if (typeof payloadCwd !== "string" || payloadCwd === "") {
    return { ok: false, reason: "the hook payload carries no cwd" };
  }
  const taskId = basename(payloadCwd);
  const worktreesDir = dirname(payloadCwd);
  if (basename(worktreesDir) !== "worktrees") {
    return {
      ok: false,
      reason: `${payloadCwd} is not a fleet worktree, so no task directory follows from it`,
    };
  }
  const taskDir = join(dirname(worktreesDir), "tasks", taskId);
  let isDirectory = false;
  try {
    isDirectory = statSync(taskDir).isDirectory();
  } catch {
    isDirectory = false;
  }
  if (!isDirectory) {
    return { ok: false, reason: `${taskDir} is not a directory` };
  }
  return { ok: true, path: join(taskDir, TOOL_CALL_LOG_BASENAME) };
}

/**
 * One line of the log: the payload VERBATIM, plus a receipt.
 *
 * A SUMMARISED RECORD WOULD BE USELESS, which is the only reason this
 * observer exists (criterion 5). Workstream 2 writes its write-block witnesses
 * against this corpus, and a record holding `tool_name` and a target path is a
 * record that has already decided which fields matter, on behalf of a phase
 * that has not been written yet. So the payload object crosses into the
 * record untouched and the observer adds exactly two fields of its own.
 *
 * `payloadSha256` IS OVER THE BYTES THAT ARRIVED, not over the re-encoded
 * object, so a later reader can tell a record that round-tripped from one that
 * was rewritten. That distinction is the whole difference between a capture
 * and a summary, and it is the one an audit cannot recover after the fact.
 */
export interface ToolCallRecord {
  receivedAt: string;
  payloadSha256: string;
  payload: unknown;
}

export function makeToolCallRecord(raw: string, at: string): ToolCallRecord {
  const payloadSha256 = createHash("sha256").update(raw, "utf8").digest("hex");
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    // AN UNPARSEABLE PAYLOAD IS STILL EVIDENCE, and discarding it would make
    // the one case worth investigating the one case with no record. The raw
    // text is carried as a string so the line stays valid JSON either way.
    payload = raw;
  }
  return { receivedAt: at, payloadSha256, payload };
}

export type ObserveOutcome =
  | { recorded: true; path: string; line: string }
  | { recorded: false; reason: string };

/**
 * Record one tool call. NEVER THROWS and never writes to stdout.
 *
 * The append is the only file operation. There is deliberately no read of the
 * log anywhere in this module or in this package (C-1, criterion 6): the log
 * is history, and nothing decides anything by looking at its tail.
 */
export function observeToolCall(raw: string, at: string): ObserveOutcome {
  const record = makeToolCallRecord(raw, at);
  const resolved = resolveToolCallLog(
    typeof record.payload === "object" && record.payload !== null
      ? (record.payload as { cwd?: unknown }).cwd
      : undefined,
  );
  if (!resolved.ok) {
    return { recorded: false, reason: resolved.reason };
  }
  const line = `${JSON.stringify(record)}\n`;
  try {
    appendFileSync(resolved.path, line, "utf8");
  } catch (error) {
    return {
      recorded: false,
      reason: `${resolved.path} could not be appended to: ${String(error)
        .replace(/\s+/g, " ")
        .trim()}`,
    };
  }
  return { recorded: true, path: resolved.path, line };
}

/** Read the whole of stdin as UTF-8. The harness closes it after the payload. */
export function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      raw += String(chunk);
    });
    process.stdin.on("end", () => {
      resolve(raw);
    });
    process.stdin.on("error", () => {
      resolve(raw);
    });
  });
}

/**
 * The script entry point.
 *
 * EXIT 0 ON EVERY PATH. A failure to record is reported on stderr, which the
 * captured contract shows is not part of the decision, and never on stdout,
 * which is. An observer that reddened a tool call because its own log was
 * unwritable would be a policy, and this phase ships none.
 */
export async function main(): Promise<void> {
  const raw = await readStdin();
  const outcome = observeToolCall(raw, new Date().toISOString());
  if (!outcome.recorded) {
    process.stderr.write(`tiphys tool-call observer: ${outcome.reason}\n`);
  }
  process.exit(0);
}

/* THE SCRIPT ARM. `main` runs only when this module IS the program, so the
   same file serves as the hook command and as an importable module a test can
   drive without a child. Compared as URLs rather than as paths because
   `import.meta.url` is one and `process.argv[1]` is not, and comparing the two
   spellings directly is how this guard is usually got wrong. */
if (
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
