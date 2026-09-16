import { existsSync, lstatSync, statSync } from "node:fs";
import type { Stats } from "node:fs";
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

/**
 * A layout entry's type, established BEFORE anything is done with the path.
 * `classifyEntry` in src/task.ts answers "may this be opened as a regular
 * file" and therefore calls a directory irregular, which is the wrong answer
 * for a layout entry: here a directory is the wanted shape. Same discipline,
 * different question, so it is a separate function rather than a flag on that
 * one (plan constraint C-2 is unaffected; nothing here probes a process).
 */
export type LayoutEntryClass =
  /** Nothing at the path. */
  | { kind: "absent" }
  /** A directory, or a symlink resolving to one. */
  | { kind: "directory" }
  /** Present and not a directory, or a symlink resolving to nothing. */
  | { kind: "other"; reason: string }
  /** Neither lstat nor stat could answer the question. */
  | { kind: "unexaminable"; reason: string };

/**
 * Classify a layout path without opening it. lstat first, so a symlink is
 * seen as a symlink; then stat, so a symlink to a directory is a directory
 * and a dangling one is reported as such rather than as absent.
 */
export function classifyLayoutEntry(path: string): LayoutEntryClass {
  try {
    lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "absent" };
    }
    return {
      kind: "unexaminable",
      reason: `${path} could not be examined: ${String(error)}`,
    };
  }
  let stats: Stats;
  try {
    stats = statSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "other", reason: `${path} is a symlink to nothing` };
    }
    return {
      kind: "unexaminable",
      reason: `${path} could not be examined: ${String(error)}`,
    };
  }
  if (stats.isDirectory()) {
    return { kind: "directory" };
  }
  return { kind: "other", reason: `${path} exists and is not a directory` };
}

/**
 * The EPHEMERAL directories: exactly the gitignored set, with the trailing
 * slash that `.gitignore` needs stripped off. DERIVED from FLEET_IGNORED
 * rather than listed again, because a second list is a second thing to keep
 * in step and the first divergence would be silent: `tiphys resume` would
 * rebuild one set while `.gitignore` ignored another.
 */
export const EPHEMERAL_DIRS: readonly string[] = FLEET_IGNORED.map((entry) =>
  entry.endsWith("/") ? entry.slice(0, -1) : entry,
);

/**
 * The DURABLE directories: every fleet directory that is not ephemeral.
 * A clone of a fleet home carries these and not the ephemeral ones, which
 * is the fact `tiphys resume` exists to act on.
 */
export const DURABLE_DIRS: readonly string[] = FLEET_DIRS.filter(
  (name) => !EPHEMERAL_DIRS.includes(name),
);

/**
 * The durable layout entries missing from dir, in declaration order:
 * directories first with a trailing slash, then the root files. An empty
 * result means the directory carries everything a clone of a fleet home
 * carries, which is the precondition `tiphys resume` requires and never
 * fabricates.
 */
export function missingDurableEntries(dir: string): string[] {
  const missing: string[] = [];
  for (const name of DURABLE_DIRS) {
    if (classifyLayoutEntry(join(dir, name)).kind !== "directory") {
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
