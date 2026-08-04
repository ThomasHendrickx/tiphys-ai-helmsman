import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Fleet-home layout (kernel plan v1, M1-P2 step 1; blueprint section 3 with
 * the SC-002/SC-003 resolutions). The fleet home is a small git repository:
 * durable content (charter/, decisions/, tasks/, backlog.md, package.json,
 * .gitignore) is tracked; state/, worktrees/, and projects/ are ephemeral
 * and gitignored (plan decision D-4, PR-004).
 */
export const FLEET_DIRS = [
  "charter",
  "decisions",
  "state",
  "tasks",
  "worktrees",
  "projects",
] as const;

/** Files every fleet home carries at its root. */
export const FLEET_FILES = ["backlog.md", "package.json", ".gitignore"] as const;

/**
 * Exactly these entries are gitignored: clones under projects/ are
 * recoverable from their remotes, worktrees/ are disposable, state/ holds
 * beacons and locks (SC-002, plan decision D-4, PR-004). Nothing else.
 */
export const FLEET_IGNORED = ["state/", "worktrees/", "projects/"] as const;

/**
 * Well-known state file names. The lease lock is built by M1-P3 and the
 * watcher beacon by M1-P5 (convention FM-043); doctor reads both as files
 * only, never probing a process (plan constraint C-2). Task currency, when
 * a later phase needs it, comes exclusively from tasks/<id>/meta.json and
 * the turn-end file, never from a log tail (plan constraint C-1).
 */
export const LOCK_FILE = join("state", "orchestrator.lock");
export const BEACON_FILE = join("state", "watcher.beacon");

/** Typed accessors over a validated fleet home. */
export interface Fleet {
  root: string;
  charterDir: string;
  decisionsDir: string;
  stateDir: string;
  tasksDir: string;
  worktreesDir: string;
  projectsDir: string;
  backlogPath: string;
  packageJsonPath: string;
  gitignorePath: string;
  lockPath: string;
  beaconPath: string;
}

/**
 * Return the layout entries missing from dir, in declaration order.
 * Directories are reported with a trailing slash. An empty result means
 * the layout is complete.
 */
export function missingLayoutEntries(dir: string): string[] {
  const missing: string[] = [];
  for (const name of FLEET_DIRS) {
    const p = join(dir, name);
    if (!existsSync(p) || !statSync(p).isDirectory()) {
      missing.push(`${name}/`);
    }
  }
  for (const name of FLEET_FILES) {
    const p = join(dir, name);
    if (!existsSync(p) || !statSync(p).isFile()) {
      missing.push(name);
    }
  }
  return missing;
}

/**
 * Validate the layout at dir and return typed accessors. Throws an Error
 * naming every missing entry when the layout is incomplete.
 */
export function loadFleet(dir: string): Fleet {
  const root = resolve(dir);
  const missing = missingLayoutEntries(root);
  if (missing.length > 0) {
    throw new Error(
      `not a fleet home: ${root} is missing ${missing.join(", ")}`,
    );
  }
  return {
    root,
    charterDir: join(root, "charter"),
    decisionsDir: join(root, "decisions"),
    stateDir: join(root, "state"),
    tasksDir: join(root, "tasks"),
    worktreesDir: join(root, "worktrees"),
    projectsDir: join(root, "projects"),
    backlogPath: join(root, "backlog.md"),
    packageJsonPath: join(root, "package.json"),
    gitignorePath: join(root, ".gitignore"),
    lockPath: join(root, LOCK_FILE),
    beaconPath: join(root, BEACON_FILE),
  };
}
