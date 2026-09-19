import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
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

/* ------------------------------------------------------------------ */
/* Establishing a path's TYPE before opening it                        */
/* ------------------------------------------------------------------ */

/**
 * THE GUARDED OPEN, AT THE BOTTOM OF THE IMPORT GRAPH.
 *
 * `classifyEntry` in src/task.ts:118 asks exactly this question and its own
 * docblock says where it belongs: "a general filesystem rule and not a task
 * rule, and a dedicated module would be its right home. This module is the
 * lowest one in the import graph that the fix round authorized to touch."
 * This module is LOWER. src/task.ts imports src/lock.ts, src/lock.ts imports
 * src/exclusion.ts, and this file imports nothing from the project at all, so
 * the two modules that hold the kernel's lease and register reads CANNOT
 * reach src/task.ts without making the first import cycle in `src/` (measured
 * at this head: the graph is a strict DAG). They reach these instead.
 *
 * THE DUPLICATION IS REAL AND IT IS NAMED RATHER THAN HIDDEN. Two
 * implementations of one question can drift, and the end state is src/task.ts
 * re-exporting these. That edit is not in this round's declared file set, so
 * it is escalated rather than made, and until it happens the vocabulary, the
 * branch order and the refusal TEXT below are kept identical to src/task.ts's
 * on purpose: doctor already prints "is a named pipe, not a regular file, so
 * it was not opened" for a lease, and a second sentence for the same state
 * would make two true reports read as two different conditions.
 *
 * C-2 is unaffected: lstat and stat are questions about a directory entry,
 * never about a running program.
 */
export type PathEntryClass =
  /** Nothing at the path. */
  | { kind: "absent" }
  /** A link is there and resolves to nothing: it exists, and it is empty of evidence. */
  | { kind: "dangling" }
  /** Safe to open. */
  | { kind: "regular" }
  /** Present, and opening it is not safe: never opened, always named. */
  | { kind: "irregular"; reason: string }
  /** Neither lstat nor stat could answer the question. */
  | { kind: "unexaminable"; reason: string };

function describePathType(stats: Stats): string {
  if (stats.isDirectory()) {
    return "a directory";
  }
  if (stats.isFIFO()) {
    return "a named pipe";
  }
  if (stats.isSocket()) {
    return "a socket";
  }
  if (stats.isCharacterDevice()) {
    return "a character device";
  }
  if (stats.isBlockDevice()) {
    return "a block device";
  }
  return "an entry of an unrecognized type";
}

/**
 * lstat first, so a symlink is seen as a symlink; then stat, so a symlink to
 * a regular file is regular and a dangling one is reported as such rather
 * than as absent. The path is never opened.
 */
export function classifyPathEntry(path: string): PathEntryClass {
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
      return { kind: "dangling" };
    }
    return {
      kind: "unexaminable",
      reason: `${path} could not be examined: ${String(error)}`,
    };
  }
  if (stats.isFile()) {
    return { kind: "regular" };
  }
  return {
    kind: "irregular",
    reason: `${path} is ${describePathType(stats)}, not a regular file, so it was not opened`,
  };
}

/** What a guarded read of a possibly-absent path produced. */
export type RegularPathRead =
  | { kind: "read"; body: string }
  | { kind: "absent" }
  /** Present and not readable, with a reason naming the path. */
  | { kind: "refused"; reason: string };

/** THE ONE READ of a path that might not be there and might not be a file. */
export function readRegularPathIfPresent(path: string): RegularPathRead {
  const entry = classifyPathEntry(path);
  if (entry.kind === "absent" || entry.kind === "dangling") {
    return { kind: "absent" };
  }
  if (entry.kind === "irregular" || entry.kind === "unexaminable") {
    return { kind: "refused", reason: entry.reason };
  }
  let body: string;
  try {
    body = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // Removed between the probe and the read.
      return { kind: "absent" };
    }
    return {
      kind: "refused",
      reason: `${path} could not be read: ${String(error)}`,
    };
  }
  return { kind: "read", body };
}

/**
 * Refuse an open-for-WRITE of a path that is not a regular file. The hazard
 * is symmetric: open(2) for writing on a FIFO with no reader blocks exactly
 * as reading one with no writer does, so a staged write is as dangerous as a
 * read. Returns the reason, or undefined when the path may be opened (absent
 * included: creating it is the point).
 */
export function refuseOpenPathForWrite(path: string): string | undefined {
  const entry = classifyPathEntry(path);
  if (entry.kind === "irregular" || entry.kind === "unexaminable") {
    return entry.reason;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* The fleet home's SYNC CLASSES                                       */
/* ------------------------------------------------------------------ */

/**
 * THE KERNEL'S OWN WRITE-THEN-RENAME SCRATCH SUFFIXES.
 *
 * `FLEET_IGNORED` above is a DENYLIST of three directory prefixes, and
 * `tiphys sync` derives "durable" as "not covered by it". That derivation is
 * right for everything the ignore rules were written to cover and blind to a
 * class they were never asked about: a transient artifact the KERNEL ITSELF
 * creates beside a TRACKED target, which git therefore reports as an
 * ordinary new durable path.
 *
 * The enumeration behind this list is every path the kernel writes under a
 * fleet home, classified against `FLEET_IGNORED`. The three that land
 * DURABLE without being fleet content are:
 *
 *   status/current.json.tmp     src/status.ts:142, a fixed name inside the
 *                               tracked status/ directory.
 *   .cutover.<random>.tmp       src/cutover.ts:278, a dot-prefixed random
 *                               name at the fleet ROOT.
 *   tiphys-environment.json     src/exclusion.ts:303, durable ON PURPOSE
 *                               (M4-P21 criterion 3) and therefore NOT in
 *                               this list.
 *
 * Two members, two directories, two naming shapes, which is why the rule is
 * a SUFFIX and not a filename: a rule naming `current.json.tmp` would close
 * the first and leave the second open.
 *
 * `FLEET_IGNORED` IS DELIBERATELY UNCHANGED. It drives `EPHEMERAL_DIRS`,
 * `DURABLE_DIRS` and the `.gitignore` that `tiphys init` writes, so a glob
 * added there would become a directory name `tiphys resume` tried to rebuild.
 * Nothing stops being synced because of this constant; `tiphys sync` gains a
 * refusal, and only for paths matching a suffix below.
 */
export const FLEET_SCRATCH_SUFFIXES: readonly string[] = [
  ".tmp",
  ".stage",
  ".mutex",
];

/**
 * True when a fleet-relative path is a kernel scratch artifact by its name
 * alone. Name-only on purpose: `tiphys sync` asks this about a path git
 * REPORTED, which may already have been renamed away by the time the
 * question is asked, so a stat here would answer about a different world
 * than the one being committed.
 */
export function isFleetScratchPath(relativePath: string): string | undefined {
  return FLEET_SCRATCH_SUFFIXES.find((suffix) => relativePath.endsWith(suffix));
}
