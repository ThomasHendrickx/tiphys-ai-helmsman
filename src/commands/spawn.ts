import { EX_USAGE } from "../cli.ts";
import { loadFleet } from "../fleet.ts";
import { spawnTask } from "../spawn.ts";
import { singleLine } from "../task.ts";
import type { Fleet } from "../fleet.ts";
import type { TaskShape } from "../task.ts";

/**
 * tiphys spawn --task <id> --project <path> --brief <file> --shape
 * ship|scout --exec <cmd> [--deadline <seconds>] [--offline]
 * (kernel plan v1, M1-P4 step 4). Runs in a fleet home (cwd).
 *
 * --exec is REQUIRED in M1: spawn without it exits 64 with usage,
 * because the multiplexer-window adapter that would make an exec-less
 * spawn meaningful is M4-era work (PR-013). The payload runs to
 * completion before this command returns (plan constraint C-3: nothing
 * is auto-backgrounded).
 *
 * --offline is passed through to pool create, and is a deviation from
 * the plan's enumerated flag list, recorded in the M1-P4 work history:
 * meta.json's baseOffline field (criterion 13 of M1-P3, this phase's
 * named obligation) can only ever be true for a worktree created under
 * pool create --offline, and spawn is the only command that creates the
 * worktree a task's meta describes.
 */

const USAGE =
  "usage: tiphys spawn --task <id> --project <path> --brief <file> " +
  "--shape ship|scout --exec <cmd> [--deadline <seconds>] [--offline]";

interface SpawnArgs {
  task: string | undefined;
  project: string | undefined;
  brief: string | undefined;
  shape: TaskShape | undefined;
  exec: string | undefined;
  deadlineSeconds: number | undefined;
  offline: boolean;
}

function usageError(message?: string): number {
  if (message !== undefined) {
    process.stderr.write(`tiphys spawn: ${message}\n`);
  }
  process.stderr.write(`${USAGE}\n`);
  return EX_USAGE;
}

function parseFlags(args: string[]): SpawnArgs | undefined {
  const parsed: SpawnArgs = {
    task: undefined,
    project: undefined,
    brief: undefined,
    shape: undefined,
    exec: undefined,
    deadlineSeconds: undefined,
    offline: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    const value = args[i + 1];
    if (flag === "--task" && value !== undefined) {
      parsed.task = value;
      i += 1;
    } else if (flag === "--project" && value !== undefined) {
      parsed.project = value;
      i += 1;
    } else if (flag === "--brief" && value !== undefined) {
      parsed.brief = value;
      i += 1;
    } else if (flag === "--shape" && value !== undefined) {
      if (value !== "ship" && value !== "scout") {
        return undefined;
      }
      parsed.shape = value;
      i += 1;
    } else if (flag === "--exec" && value !== undefined) {
      parsed.exec = value;
      i += 1;
    } else if (flag === "--deadline" && value !== undefined) {
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        return undefined;
      }
      parsed.deadlineSeconds = seconds;
      i += 1;
    } else if (flag === "--offline") {
      parsed.offline = true;
    } else {
      return undefined;
    }
  }
  return parsed;
}

export async function cmdSpawn(args: string[]): Promise<number> {
  const flags = parseFlags(args);
  if (flags === undefined) {
    return usageError();
  }
  if (
    flags.task === undefined ||
    flags.project === undefined ||
    flags.brief === undefined ||
    flags.shape === undefined
  ) {
    return usageError(
      "spawn requires --task <id> --project <path> --brief <file> --shape ship|scout",
    );
  }
  if (flags.exec === undefined) {
    // PR-013: an exec-less spawn has no meaning in M1.
    return usageError("spawn requires --exec <cmd> in M1");
  }

  let fleet: Fleet;
  try {
    fleet = loadFleet(process.cwd());
  } catch (error) {
    process.stderr.write(`tiphys spawn: ${(error as Error).message}\n`);
    return 1;
  }

  const result = await spawnTask(fleet, {
    taskId: flags.task,
    project: flags.project,
    briefFile: flags.brief,
    shape: flags.shape,
    exec: flags.exec,
    deadlineSeconds: flags.deadlineSeconds,
    offline: flags.offline,
  });
  if (!result.ok) {
    // One reason line, structurally (CR-303): a reason may carry a
    // raised error message or git output, and an operator or the M1-P6
    // harness reading "the reason line" must get all of it.
    process.stderr.write(`tiphys spawn: ${singleLine(result.reason)}\n`);
    return 1;
  }
  // The payload's exit code is reported, not adopted: the task's state
  // authority is meta.json plus the turn-end record (plan constraint
  // C-1), and a nonzero payload is a completed task with a failing
  // payload, not a failed spawn.
  const { meta, exitCode } = result.value;
  process.stdout.write(
    `spawned ${meta.id} worktree ${meta.worktree} exec exited ${String(exitCode)}\n`,
  );
  return 0;
}
