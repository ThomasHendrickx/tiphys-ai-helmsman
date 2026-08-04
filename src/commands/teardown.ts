import { EX_USAGE } from "../cli.ts";
import { loadFleet } from "../fleet.ts";
import { teardownTask } from "../teardown.ts";
import type { Fleet } from "../fleet.ts";

/**
 * tiphys teardown --task <id> [--salvage] (kernel plan v1, M1-P4
 * step 5). Runs in a fleet home (cwd).
 *
 * Every refusal is exit nonzero plus a SINGLE reason line naming the
 * blocking condition. A failure of the destroy itself is passed through
 * with the pool's own wording, which distinguishes a refusal (a true
 * no-op) from a partial failure (the worktree is already gone and the
 * survivors are enumerated); this command adds no framing of its own to
 * either, because the two must never be described alike.
 */

const USAGE = "usage: tiphys teardown --task <id> [--salvage]";

interface TeardownArgs {
  task: string | undefined;
  salvage: boolean;
}

function usageError(message?: string): number {
  if (message !== undefined) {
    process.stderr.write(`tiphys teardown: ${message}\n`);
  }
  process.stderr.write(`${USAGE}\n`);
  return EX_USAGE;
}

function parseFlags(args: string[]): TeardownArgs | undefined {
  const parsed: TeardownArgs = { task: undefined, salvage: false };
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    const value = args[i + 1];
    if (flag === "--task" && value !== undefined) {
      parsed.task = value;
      i += 1;
    } else if (flag === "--salvage") {
      parsed.salvage = true;
    } else {
      return undefined;
    }
  }
  return parsed;
}

export async function cmdTeardown(args: string[]): Promise<number> {
  const flags = parseFlags(args);
  if (flags === undefined) {
    return usageError();
  }
  if (flags.task === undefined) {
    return usageError("teardown requires --task <id>");
  }

  let fleet: Fleet;
  try {
    fleet = loadFleet(process.cwd());
  } catch (error) {
    process.stderr.write(`tiphys teardown: ${(error as Error).message}\n`);
    return 1;
  }

  const result = await teardownTask(fleet, {
    taskId: flags.task,
    salvage: flags.salvage,
  });
  if (!result.ok) {
    process.stderr.write(`tiphys teardown: ${result.reason}\n`);
    return 1;
  }
  const suffix = result.value.salvaged ? " (leavings salvaged and pushed)" : "";
  process.stdout.write(`torn down ${result.value.taskId}${suffix}\n`);
  return 0;
}
