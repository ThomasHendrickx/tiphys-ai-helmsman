import { EX_USAGE } from "../cli.ts";
import { loadFleet } from "../fleet.ts";
import { warnIfWatcherStale } from "../liveness.ts";
import { spawnTask } from "../spawn.ts";
import { singleLine } from "../task.ts";
import type { Fleet } from "../fleet.ts";
import type { TaskShape } from "../task.ts";

/**
 * tiphys spawn --task <id> --project <path> --brief <file> --shape
 * ship|scout --exec <cmd> [--deadline <seconds>] [--offline]
 * [--role <name>] [--tier <name>] [--phase <id>]
 * (kernel plan v1, M1-P4 step 4; the last three added by M4-P3).
 * Runs in a fleet home (cwd).
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
  "--shape ship|scout --exec <cmd> [--deadline <seconds>] [--offline] " +
  "[--role <name>] [--tier <name>] [--phase <id>]";

interface SpawnArgs {
  task: string | undefined;
  project: string | undefined;
  brief: string | undefined;
  shape: TaskShape | undefined;
  exec: string | undefined;
  deadlineSeconds: number | undefined;
  offline: boolean;
  /**
   * The three request fields M4-P3 adds. All three are OPTIONAL at the CLI
   * and none of them is validated against a vocabulary here: whether a given
   * adapter can launch without one is the ADAPTER's declaration (`requires`),
   * checked inside spawnTask before anything is created, and a second opinion
   * held here would be a vocabulary in `src/` that nothing else honours.
   */
  role: string | undefined;
  tier: string | undefined;
  phase: string | undefined;
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
    role: undefined,
    tier: undefined,
    phase: undefined,
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
      // N-403: finite and positive is not enough. The adapter turns the
      // deadline into an instant, and any value at or above roughly
      // 8.64e12 seconds is outside the Date range, so it used to raise
      // INSIDE the adapter, after pool create had made a worktree, a
      // branch and a pool record. A deadline this kernel cannot
      // represent is a usage error, and a usage error creates nothing.
      if (
        !Number.isFinite(seconds) ||
        seconds <= 0 ||
        !Number.isFinite(new Date(Date.now() + seconds * 1000).getTime())
      ) {
        return undefined;
      }
      parsed.deadlineSeconds = seconds;
      i += 1;
    } else if (flag === "--role" && value !== undefined) {
      parsed.role = value;
      i += 1;
    } else if (flag === "--tier" && value !== undefined) {
      // VERBATIM, and deliberately unvalidated: this is the DECLARED TIER,
      // whatever role-model-config.yaml declares, and the tier-to-model
      // mapping lives in the plugin. A kernel that checked this value
      // against a list would be holding the vocabulary the plugin owns.
      parsed.tier = value;
      i += 1;
    } else if (flag === "--phase" && value !== undefined) {
      // CARRIED, never derived from the branch name (M4-D-22 is open).
      parsed.phase = value;
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
    process.stderr.write(`tiphys spawn: ${singleLine((error as Error).message)}\n`);
    return 1;
  }

  // Liveness guard (M1-P5 step 2), completing the seam this phase left.
  // It WARNS and never blocks: one stderr line when work is in flight
  // and supervision has gone quiet, and the command then does exactly
  // what it would have done anyway (blueprint liveness-guard contract,
  // criteria 10 and 11).
  warnIfWatcherStale(fleet);

  const result = await spawnTask(fleet, {
    taskId: flags.task,
    project: flags.project,
    briefFile: flags.brief,
    shape: flags.shape,
    exec: flags.exec,
    deadlineSeconds: flags.deadlineSeconds,
    offline: flags.offline,
    role: flags.role,
    declaredTier: flags.tier,
    phaseId: flags.phase,
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
