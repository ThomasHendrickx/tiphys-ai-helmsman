import { cmdDoctor } from "./commands/doctor.ts";
import { cmdGates } from "./commands/gates.ts";
import { cmdInit } from "./commands/init.ts";
import { cmdLock } from "./commands/lock.ts";
import { cmdPlan } from "./commands/plan.ts";
import { cmdPool } from "./commands/pool.ts";
import { cmdSpawn } from "./commands/spawn.ts";
import { cmdStatus } from "./commands/status.ts";
import { cmdTeardown } from "./commands/teardown.ts";
import { cmdValidate } from "./commands/validate.ts";
import { cmdWatch } from "./commands/watch.ts";
import { printVersion } from "./version.ts";

/** Exit code for usage errors, per BSD sysexits EX_USAGE. */
export const EX_USAGE = 64;

type CommandHandler = (args: string[]) => Promise<number> | number;

/**
 * The one dispatch table. Subcommands added by later phases register here.
 */
const commands = new Map<string, CommandHandler>([
  ["version", printVersion],
  ["init", cmdInit],
  ["doctor", cmdDoctor],
  ["gates", cmdGates],
  ["lock", cmdLock],
  ["plan", cmdPlan],
  ["pool", cmdPool],
  ["spawn", cmdSpawn],
  ["status", cmdStatus],
  ["teardown", cmdTeardown],
  ["validate", cmdValidate],
  ["watch", cmdWatch],
]);

export function usageLine(): string {
  const names = [...commands.keys()].sort().join(" | ");
  return `usage: tiphys <${names}>`;
}

/**
 * Dispatch argv (already stripped of the node and script entries) to a
 * subcommand handler. A missing or unknown subcommand prints the usage
 * line to stderr and returns EX_USAGE.
 */
export async function run(argv: string[]): Promise<number> {
  const [subcommand, ...rest] = argv;
  const handler = subcommand === undefined ? undefined : commands.get(subcommand);
  if (handler === undefined) {
    process.stderr.write(`${usageLine()}\n`);
    return EX_USAGE;
  }
  return handler(rest);
}
