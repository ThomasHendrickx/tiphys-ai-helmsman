import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { classifyEntry } from "../task.ts";

/**
 * RUN PINNING (kernel plan M2, M2-P1 step 3; M2-C-5; M2-D-06).
 *
 * T-004 lesson 3: "a test run is only evidence if you can prove what it
 * ran". In that incident no artifact recorded the content of the source
 * files during a failing run, so a forensic reconstruction was the only way
 * to establish that the tree had been rewritten underneath the run, and the
 * root cause was never awarded.
 *
 * A pin is that artifact: the file set of the tree that was actually
 * executed, with sha256, size and mtimeMs per file, taken at the start and
 * at the end of the run. ANY difference in ANY of the four fields (the
 * path's presence included) is a difference and makes the run's record
 * `error`.
 *
 * WHY ctimeMs IS PINNED TOO (CR-809, added in fix round 1). mtime is
 * SETTABLE FROM USERSPACE. `cp -p`, `rsync -a` and `tar -x` all restore it
 * through `utimensat` at nanosecond precision, so a rewrite performed by any
 * of those three ordinary commands passes a pin of {sha256, size, mtimeMs}
 * without a mark, and T-004's incident is a rewrite. ctime is the inode
 * change time: no userspace call sets it, and `utimensat` BUMPS it, so the
 * very act of restoring mtime is what makes the change visible. It also
 * catches replace-by-rename, which changes the inode.
 *
 * This is a strict ADDITION to M2-C-5's four fields, never a substitution:
 * the constraint says any difference in file set, sha256, size or mtime makes
 * the record `error`, and pinning a fifth field can only make more runs
 * `error`, never fewer. M2-P2 criterion 7 and M2-P3 criterion 8 are pin
 * witnesses and should be read against five fields, not four.
 *
 * The residue, stated rather than left to be discovered: ctime is not
 * forgeable from userspace, but it is not a cryptographic seal either. A
 * privileged actor with raw device access can write any inode field it
 * likes. That is outside anything this kernel can measure.
 *
 * WHY mtimeMs IS PINNED AND A CONTENT HASH IS NOT ENOUGH. T-004's forensics
 * describe a BYTE-IDENTICAL rewrite: `src/lock.ts` was replaced with
 * pristine content 42.8 seconds into the failing run. A content-only pin
 * passes that unchanged, and the whole value of the pin would be lost at
 * precisely the shape the incident actually had. M2-P2 criterion 7 turns
 * that into a witness rather than an assertion.
 *
 * M2-C-6 IS OBEYED BY REUSE, NOT BY REIMPLEMENTATION. The walk reads paths
 * it did not create, so every open is preceded by the DELIVERED
 * `classifyEntry` from src/task.ts. There is no second copy of "may this
 * path be opened" here: T-005 records that this project paid for that class
 * twice because the second component reimplemented the mechanism. The one
 * `readFileSync` in this module sits on the line after the probe, and it is
 * the only read of an externally supplied path anywhere in `src/gates/` that
 * is not `readRegularFileIfPresent`, which returns UTF-8 text and therefore
 * cannot hash a binary file honestly.
 *
 * `lstatSync` and `statSync` here are PROBES, not opens: they are the same
 * two syscalls `classifyEntry` itself performs, they answer questions about
 * the directory entry, and neither can block on a named pipe. They are used
 * only to decide directory-ness and to read size and mtime, never to decide
 * whether a path may be opened, which stays the delivered helper's job.
 *
 * FAIL CLOSED ON ANYTHING THAT IS NOT A REGULAR FILE OR A REAL DIRECTORY.
 * A named pipe, socket or device node inside a pinned root makes `takePin`
 * THROW with a reason naming the path and the observed type. It never opens
 * the path, so it never blocks, and the caller turns the throw into an
 * `error` record. Directory symlinks are deliberately not followed: a pin
 * that follows them can be made to walk outside its declared roots or to
 * loop, and neither is a measurement.
 */

export interface PinFile {
  /** `join(root, ...)` for the root exactly as the caller supplied it. */
  path: string;
  sha256: string;
  size: number;
  mtimeMs: number;
  /** Inode change time. Not settable from userspace; see the header. */
  ctimeMs: number;
}

export interface Pin {
  roots: string[];
  takenAt: string;
  /**
   * `files.length`, carried explicitly so a vacuous pin is visible in the
   * RECORD and not only to a caller who thinks to check (CR-804). Nothing in
   * the shape used to distinguish "the tree did not change" from "no tree was
   * measured", at the module two other phases consume as primary evidence.
   */
  fileCount: number;
  files: PinFile[];
}

export type PinFieldName = "sha256" | "size" | "mtimeMs" | "ctimeMs";

export type PinDifference =
  | { path: string; kind: "added" }
  | { path: string; kind: "removed" }
  | { path: string; kind: "changed"; fields: PinFieldName[] };

function hashFile(path: string): PinFile {
  // THE PROBE, then the open. The order is the point (MECHANISMS.md, CR-520).
  const entry = classifyEntry(path);
  if (entry.kind !== "regular") {
    throw new Error(
      entry.kind === "absent" || entry.kind === "dangling"
        ? `${path} vanished while the pin was being taken`
        : entry.reason,
    );
  }
  const stats = statSync(path);
  const body = readFileSync(path);
  return {
    path,
    sha256: createHash("sha256").update(body).digest("hex"),
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    ctimeMs: stats.ctimeMs,
  };
}

/**
 * True only for a REAL directory, never for a symlink that resolves to one.
 * lstat answers about the link itself, so a symlinked directory falls
 * through to the regular-file probe and is refused there.
 */
function isRealDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

function walk(root: string, dir: string, into: PinFile[]): void {
  const names = readdirSync(dir).sort();
  for (const name of names) {
    const path = join(dir, name);
    if (isRealDirectory(path)) {
      walk(root, path, into);
      continue;
    }
    const entry = classifyEntry(path);
    if (entry.kind === "absent" || entry.kind === "dangling") {
      // Raced away, or a dangling symlink: nothing to hash, and nothing
      // hidden either, because a later pin reports it as added.
      continue;
    }
    if (entry.kind !== "regular") {
      throw new Error(`${entry.reason}; refusing to pin ${root}`);
    }
    into.push(hashFile(path));
  }
}

/**
 * Pin the given roots. Throws with a reason naming the path and the observed
 * type when a root, or anything under it, is neither a regular file nor a
 * real directory (M2-C-6, fail closed). Callers wrap this with `runStep`
 * from src/task.ts and report `error`.
 */
export function takePin(roots: string[]): Pin {
  const files: PinFile[] = [];
  if (roots.length === 0) {
    throw new Error("a pin over no roots measures nothing (M2-C-5)");
  }
  for (const root of roots) {
    const before = files.length;
    if (isRealDirectory(root)) {
      walk(root, root, files);
      // THE VACUITY FLOOR (CR-804). A root a caller DECLARED that holds no
      // files is a configuration error, not a measurement of an unchanged
      // tree, and the two are indistinguishable in the result. M2-P2 pins
      // "the clone's source and test roots"; if a scratch clone puts sources
      // one directory deeper than the computed root, a silent empty pin
      // reports no difference and the gate goes green on evidence nobody
      // took. The rule lives HERE, in the module that carries the mechanism,
      // rather than in each consumer (T-005).
      if (files.length === before) {
        throw new Error(
          `pin root ${root} contributed no files; a declared root that holds nothing is a configuration error, not an unchanged tree (M2-C-5)`,
        );
      }
      continue;
    }
    const entry = classifyEntry(root);
    if (entry.kind === "absent" || entry.kind === "dangling") {
      throw new Error(`pin root ${root} does not exist`);
    }
    if (entry.kind === "regular") {
      files.push(hashFile(root));
      continue;
    }
    throw new Error(`${entry.reason}; refusing to pin ${root}`);
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    roots: [...roots],
    takenAt: new Date().toISOString(),
    fileCount: files.length,
    files,
  };
}

/**
 * Every difference between two pins, in a deterministic order (by path).
 * A byte-identical rewrite that changes only mtimeMs is a difference, which
 * is the whole reason mtimeMs is in the record.
 */
export function comparePins(a: Pin, b: Pin): PinDifference[] {
  const before = new Map(a.files.map((f) => [f.path, f]));
  const after = new Map(b.files.map((f) => [f.path, f]));
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const differences: PinDifference[] = [];
  for (const path of paths) {
    const start = before.get(path);
    const end = after.get(path);
    if (start === undefined && end !== undefined) {
      differences.push({ path, kind: "added" });
      continue;
    }
    if (start !== undefined && end === undefined) {
      differences.push({ path, kind: "removed" });
      continue;
    }
    if (start === undefined || end === undefined) {
      continue;
    }
    const fields: PinFieldName[] = [];
    if (start.sha256 !== end.sha256) {
      fields.push("sha256");
    }
    if (start.size !== end.size) {
      fields.push("size");
    }
    if (start.mtimeMs !== end.mtimeMs) {
      fields.push("mtimeMs");
    }
    if (start.ctimeMs !== end.ctimeMs) {
      fields.push("ctimeMs");
    }
    if (fields.length > 0) {
      differences.push({ path, kind: "changed", fields });
    }
  }
  return differences;
}

/** One line per difference, for a record's detail text. */
export function describePinDifference(difference: PinDifference): string {
  if (difference.kind === "added") {
    return `${difference.path} was added during the run`;
  }
  if (difference.kind === "removed") {
    return `${difference.path} was removed during the run`;
  }
  return `${difference.path} changed during the run (${difference.fields.join(", ")})`;
}
