import { EX_USAGE } from "../cli.ts";
import { loadFleet } from "../fleet.ts";
import { poolCreate, poolDestroy, poolList } from "../pool.ts";
import type { Fleet } from "../fleet.ts";

/**
 * tiphys pool <create --task <id> --project <path> [--offline] | list |
 * destroy --task <id> [--discard]> (kernel plan v1, M1-P3 steps 3-4).
 * Runs in a fleet home (cwd). create emits the fetched base SHA as its
 * only stdout line (EXT-F-03 step 3; M1-P4 spawn captures it).
 */

const USAGE =
  "usage: tiphys pool <create --task <id> --project <path> [--offline] | " +
  "list | destroy --task <id> [--discard]>";

interface PoolArgs {
  task: string | undefined;
  project: string | undefined;
  offline: boolean;
  discard: boolean;
}

function usageError(message?: string): number {
  if (message !== undefined) {
    process.stderr.write(`tiphys pool: ${message}\n`);
  }
  process.stderr.write(`${USAGE}\n`);
  return EX_USAGE;
}

function parseFlags(rest: string[]): PoolArgs | undefined {
  const parsed: PoolArgs = {
    task: undefined,
    project: undefined,
    offline: false,
    discard: false,
  };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (flag === "--task" && i + 1 < rest.length) {
      parsed.task = rest[i + 1];
      i += 1;
    } else if (flag === "--project" && i + 1 < rest.length) {
      parsed.project = rest[i + 1];
      i += 1;
    } else if (flag === "--offline") {
      parsed.offline = true;
    } else if (flag === "--discard") {
      parsed.discard = true;
    } else {
      return undefined;
    }
  }
  return parsed;
}

export async function cmdPool(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  if (subcommand === undefined) {
    return usageError();
  }
  const flags = parseFlags(rest);
  if (flags === undefined) {
    return usageError();
  }

  let fleet: Fleet;
  try {
    fleet = loadFleet(process.cwd());
  } catch (error) {
    process.stderr.write(`tiphys pool: ${(error as Error).message}\n`);
    return 1;
  }

  switch (subcommand) {
    case "create": {
      if (flags.task === undefined || flags.project === undefined || flags.discard) {
        return usageError("create requires --task <id> and --project <path>");
      }
      const result = await poolCreate(fleet, {
        taskId: flags.task,
        project: flags.project,
        offline: flags.offline,
      });
      if (!result.ok) {
        process.stderr.write(`tiphys pool: ${result.reason}\n`);
        return 1;
      }
      process.stdout.write(`${result.value.baseSha}\n`);
      return 0;
    }
    case "list": {
      if (flags.task !== undefined || flags.project !== undefined || flags.offline || flags.discard) {
        return usageError("list takes no flags");
      }
      for (const entry of poolList(fleet)) {
        process.stdout.write(`${entry.taskId} ${entry.headSha}\n`);
      }
      return 0;
    }
    case "destroy": {
      if (flags.task === undefined || flags.project !== undefined || flags.offline) {
        return usageError("destroy requires --task <id>");
      }
      const result = await poolDestroy(fleet, {
        taskId: flags.task,
        discard: flags.discard,
      });
      if (!result.ok) {
        process.stderr.write(`tiphys pool: ${result.reason}\n`);
        return 1;
      }
      process.stdout.write(`destroyed ${flags.task}\n`);
      return 0;
    }
    default:
      return usageError(`unknown pool subcommand "${subcommand}"`);
  }
}
