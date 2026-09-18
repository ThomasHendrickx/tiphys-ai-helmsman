/**
 * THE PULL-REQUEST AND MERGE CAPABILITY, AND IT LIVES IN THE PLUGIN (kernel
 * plan M4, M4-P24 criteria 5 and 6; M4-D-09, DR-0036).
 *
 * WHY IT IS HERE AND NOT IN THE KERNEL. The kernel states in its own source
 * that it never opens pull requests, and the boundary is not a preference: the
 * orchestrator holds the credential, the kernel does not, and a kernel that
 * could open a pull request would be a kernel that has to be trusted with one.
 * M4-D-09 keeps the capability in the PLUGIN, invoked BY the orchestrator.
 *
 * SHIP THE CAPABILITY, DO NOT EXERCISE THE AUTHORITY. Under DR-0036 merge
 * authority stays with the current delivery process for the whole of M4
 * regardless of what this module can do. Criterion 6 is that promise expressed
 * as a test: no kernel code path names either command, asserted by grepping
 * `src/` and `bin/` for `PR_OPEN_COMMAND` and `PR_MERGE_COMMAND`'s VALUES.
 *
 * THIS MODULE SPAWNS NOTHING, and the split is deliberate rather than stylistic.
 * Every decision that can refuse lives here as a pure function over an
 * environment and an argv; `plugin/src/pr-main.ts` is the only file that owns a
 * child process. A refusal is therefore testable without a `gh` on PATH, which
 * matters because `gh` is absent from this container by default (CLAUDE.md
 * standing warning 6) and a capability whose refusal arm can only be exercised
 * where the tool is installed is a refusal arm nobody exercises.
 *
 * THE CREDENTIAL IS READ, NEVER PUBLISHED (criterion 5). `resolveCredential`
 * takes an environment as an ARGUMENT and returns a value; `prChildEnv` builds
 * a NEW object. Neither writes to `process.env`. The convenient alternative,
 * assigning the token into the ambient environment so a child inherits it, is
 * exactly the defect criterion 5 forbids: the kernel's adapter launches
 * payloads out of this same process, and a payload launched with inherited
 * environment would receive the credential with no artifact saying so. The
 * witness drives both write-through sites and asserts from INSIDE an
 * adapter-launched child, using the kernel's own credential probe rather than
 * a second mechanism.
 */

/** The command name `pr open` is invoked by, and the token criterion 6 greps for. */
export const PR_OPEN_COMMAND = "pr open";

/** The command name `pr merge` is invoked by, and the token criterion 6 greps for. */
export const PR_MERGE_COMMAND = "pr merge";

/**
 * The environment names a pull-request credential may arrive in.
 *
 * The same four names the kernel's own credential vocabulary walks for `gh`
 * (src/gates/credentials.ts:138). Named here rather than imported because
 * `@tiphys/kernel` publishes the adapter CONTRACT and nothing else, so the
 * constant is not reachable through the package name and a relative import
 * climbing out of this package compiles in this workspace and breaks for every
 * consumer who installs the two packages from npm. `test/next.test.ts` compares
 * this list against the kernel's exported one rather than against a second
 * literal.
 */
export const PR_CREDENTIAL_NAMES: readonly string[] = [
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "GH_ENTERPRISE_TOKEN",
  "GITHUB_ENTERPRISE_TOKEN",
];

/** A resolved credential, or the reason there is none. */
export type CredentialResolution =
  | { ok: true; name: string; value: string }
  | { ok: false; reason: string };

/**
 * Find a credential in the SUPPLIED environment. Reads only; the caller owns
 * the object and this function does not publish what it found.
 */
export function resolveCredential(
  env: Readonly<Record<string, string | undefined>>,
): CredentialResolution {
  for (const name of PR_CREDENTIAL_NAMES) {
    const value = env[name];
    if (value !== undefined && value !== "") {
      return { ok: true, name, value };
    }
  }
  return {
    ok: false,
    reason:
      `no pull-request credential is present: none of ` +
      `${PR_CREDENTIAL_NAMES.join(", ")} carries a value, so this command has ` +
      `no authority to act and refuses rather than proceeding`,
  };
}

/**
 * The environment handed to THIS command's own child, built fresh from the
 * supplied one. A NEW object every time, so nothing observable outside this
 * call changes.
 */
export function prChildEnv(
  inherited: Readonly<Record<string, string | undefined>>,
  credential: { name: string; value: string },
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(inherited)) {
    if (value !== undefined) {
      env[name] = value;
    }
  }
  env[credential.name] = credential.value;
  return env;
}

/** One child invocation, supplied by the caller so this module spawns nothing. */
export type PrExecutor = (
  program: string,
  args: string[],
  env: Record<string, string>,
) => { status: number | null; reason?: string };

/** Where a command's single output line goes. */
export interface PrIo {
  stderr(line: string): void;
  stdout(line: string): void;
}

/** Exit code for a usage error, per BSD sysexits EX_USAGE, as the kernel uses. */
export const PR_EX_USAGE = 64;

/** Exit code when the credential is absent. Nonzero, and not the usage code. */
export const PR_EX_NO_CREDENTIAL = 65;

const USAGE =
  "usage: pr <open|merge> --repo <owner/name> [--head <branch>] " +
  "[--base <branch>] [--title <text>] [--number <n>]";

interface PrFlags {
  repo?: string;
  head?: string;
  base?: string;
  title?: string;
  number?: string;
}

function parseFlags(args: string[]): PrFlags | undefined {
  const flags: PrFlags = {};
  const known = new Map<string, keyof PrFlags>([
    ["--repo", "repo"],
    ["--head", "head"],
    ["--base", "base"],
    ["--title", "title"],
    ["--number", "number"],
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const key = flag === undefined ? undefined : known.get(flag);
    const value = args[index + 1];
    if (key === undefined || value === undefined) {
      return undefined;
    }
    flags[key] = value;
    index += 1;
  }
  return flags;
}

/** Collapse anything interpolated into a reason so ONE line stays one line. */
function singleLine(value: unknown): string {
  return String(value).replace(/\s+/g, " ").trim();
}

/** The argv `pr open` runs, given its flags. */
export function openArgv(flags: PrFlags): string[] {
  const args = ["pr", "create", "--repo", flags.repo ?? "", "--fill"];
  if (flags.head !== undefined) {
    args.push("--head", flags.head);
  }
  if (flags.base !== undefined) {
    args.push("--base", flags.base);
  }
  if (flags.title !== undefined) {
    args.push("--title", flags.title);
  }
  return args;
}

/** The argv `pr merge` runs, given its flags. Squash, which is this process's practice. */
export function mergeArgv(flags: PrFlags): string[] {
  return [
    "pr",
    "merge",
    flags.number ?? "",
    "--repo",
    flags.repo ?? "",
    "--squash",
  ];
}

/**
 * Run one `pr` subcommand and return its exit code.
 *
 * EVERY REFUSAL IS ONE LINE AND A NONZERO EXIT (criterion 5). The reason is
 * collapsed through `singleLine` structurally rather than trusted of each
 * string, because reasons interpolate an executor's failure text and that is
 * not guaranteed to be short.
 */
export function runPr(
  argv: string[],
  options: {
    env: Readonly<Record<string, string | undefined>>;
    io: PrIo;
    exec: PrExecutor;
  },
): number {
  const [subcommand, ...rest] = argv;
  if (subcommand !== "open" && subcommand !== "merge") {
    options.io.stderr(USAGE);
    return PR_EX_USAGE;
  }
  const flags = parseFlags(rest);
  if (flags === undefined || flags.repo === undefined) {
    options.io.stderr(USAGE);
    return PR_EX_USAGE;
  }
  const name = subcommand === "open" ? PR_OPEN_COMMAND : PR_MERGE_COMMAND;

  // THE CREDENTIAL CHECK IS BEFORE ANY CHILD IS BUILT. A refusal that had
  // already spawned something would have exercised the authority it is
  // refusing to exercise.
  const credential = resolveCredential(options.env);
  if (!credential.ok) {
    options.io.stderr(singleLine(`${name}: ${credential.reason}`));
    return PR_EX_NO_CREDENTIAL;
  }

  const args = subcommand === "open" ? openArgv(flags) : mergeArgv(flags);
  const result = options.exec("gh", args, prChildEnv(options.env, credential));
  if (result.status === null || result.status === undefined) {
    options.io.stderr(
      singleLine(`${name}: gh did not run (${result.reason ?? "no reason reported"})`),
    );
    return 1;
  }
  if (result.status !== 0) {
    options.io.stderr(singleLine(`${name}: gh exited ${String(result.status)}`));
    return result.status;
  }
  options.io.stdout(`${name}: gh exited 0`);
  return 0;
}
