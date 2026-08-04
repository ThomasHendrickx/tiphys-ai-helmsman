import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { EX_USAGE } from "../cli.ts";
import { FLEET_DIRS, FLEET_IGNORED } from "../fleet.ts";

/**
 * The documented deterministic machine identity for fleet-scoped commits
 * (kernel plan v1, M1-P2 step 2; EXT-F-02 reviewer Option B). It is set as
 * command-scoped GIT_AUTHOR_* and GIT_COMMITTER_* environment variables on
 * the bootstrap commit invocation only; init never reads or requires user
 * git identity and never touches user or global git configuration.
 */
export const MACHINE_IDENTITY_NAME = "Tiphys Fleet";
export const MACHINE_IDENTITY_EMAIL = "fleet@tiphys.invalid";

/**
 * Durable directories receive a .gitkeep so the bootstrap commit tracks
 * them: git cannot track an empty directory, and without a tracked entry
 * the durable layout (SC-002) would not survive a clone of the fleet repo.
 * The ignored ephemera (state/, worktrees/, projects/) get no keep file:
 * they are recreated locally and are deliberately not repository content.
 */
const DURABLE_KEEP_DIRS = ["charter", "decisions", "tasks"] as const;

function runGit(
  cwd: string,
  args: string[],
  extraEnv?: Record<string, string>,
): { status: number | null; stderr: string } {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: extraEnv === undefined ? process.env : { ...process.env, ...extraEnv },
  });
  return { status: result.status, stderr: result.stderr ?? "" };
}

/**
 * tiphys init <dir>: create a fleet home in an empty or absent directory
 * (kernel plan v1, M1-P2 step 2). Substrate-neutral: pure filesystem and
 * git (DR-0007).
 */
export function cmdInit(args: string[]): number {
  const [dir, ...extra] = args;
  if (dir === undefined || extra.length > 0) {
    process.stderr.write("usage: tiphys init <dir>\n");
    return EX_USAGE;
  }
  const root = resolve(dir);

  if (existsSync(root)) {
    const entries = readdirSync(root);
    if (entries.length > 0) {
      const fleetMarkers = new Set<string>([...FLEET_DIRS, "backlog.md", ".git"]);
      const looksInitialized = entries.some((entry) => fleetMarkers.has(entry));
      if (looksInitialized) {
        process.stderr.write(`tiphys init: ${root} is already initialized\n`);
      } else {
        process.stderr.write(
          `tiphys init: ${root} is not empty and not a fleet home, refusing\n`,
        );
      }
      return 1;
    }
  } else {
    mkdirSync(root, { recursive: true });
  }

  for (const name of FLEET_DIRS) {
    mkdirSync(join(root, name), { recursive: true });
  }
  for (const name of DURABLE_KEEP_DIRS) {
    writeFileSync(join(root, name, ".gitkeep"), "");
  }
  writeFileSync(join(root, "backlog.md"), "# Backlog\n");
  const fleetPackageJson = {
    name: "tiphys-fleet-home",
    version: "0.0.0",
    private: true,
    description:
      "Tiphys fleet home stub. The @tiphys/kernel dependency pin is added at M3 first publish (kernel plan v1, M1-P2 step 2).",
  };
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify(fleetPackageJson, null, 2)}\n`,
  );
  writeFileSync(join(root, ".gitignore"), `${FLEET_IGNORED.join("\n")}\n`);

  const steps: { args: string[]; env?: Record<string, string> }[] = [
    { args: ["init", "--initial-branch=main"] },
    { args: ["add", "-A"] },
    {
      args: ["commit", "-m", "tiphys init: fleet home bootstrap"],
      env: {
        GIT_AUTHOR_NAME: MACHINE_IDENTITY_NAME,
        GIT_AUTHOR_EMAIL: MACHINE_IDENTITY_EMAIL,
        GIT_COMMITTER_NAME: MACHINE_IDENTITY_NAME,
        GIT_COMMITTER_EMAIL: MACHINE_IDENTITY_EMAIL,
      },
    },
  ];
  for (const step of steps) {
    const result = runGit(root, step.args, step.env);
    if (result.status !== 0) {
      process.stderr.write(
        `tiphys init: git ${step.args[0]} failed with exit ${String(result.status)}\n${result.stderr}`,
      );
      return 1;
    }
  }

  process.stdout.write(`initialized fleet home at ${root}\n`);
  return 0;
}
