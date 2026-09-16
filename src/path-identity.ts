import { realpathSync } from "node:fs";
import { resolve } from "node:path";

/** Compare two existing paths by their canonical filesystem identity. */
export function pathsIdentifySameObject(left: string, right: string): boolean {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return false;
  }
}

/**
 * Decide whether two paths NAME THE SAME filesystem object when at least
 * one of them was produced by ANOTHER PROGRAM rather than composed here.
 *
 * THE MECHANISM THIS EXISTS FOR, measured 2026-09-16 on the macOS smoke
 * job of pull request #155. `path.resolve` normalizes `.`, `..` and
 * relative segments and does NOT resolve symlinks, so two spellings of one
 * directory stay unequal as strings. Programs the kernel shells out to do
 * not preserve the caller's spelling: git canonicalizes every worktree
 * path it records (`git worktree add /link/wt` then `git worktree list
 * --porcelain` reports `/real/wt`, measured on Linux), and node reports
 * the canonical path of a test file in its reporter's `file` field. So a
 * kernel-composed path compared by string against such a value answers
 * "different object" for the same object, silently, and every decision
 * taken on that answer is wrong in the direction that does nothing.
 *
 * On macOS the symlink is supplied by the platform and needs no unusual
 * setup: `/tmp` is a symlink to `/private/tmp` and `os.tmpdir()` returns a
 * path under `/var/folders`, where `/var` is a symlink to `/private/var`.
 * The CLI is accidentally immune because `process.cwd()` is already
 * canonical, so only a caller that hands a path in makes this reachable,
 * which is exactly what a library consumer does.
 *
 * The string comparison is tried FIRST and kept, rather than replaced, for
 * two reasons: it answers without touching the filesystem in the common
 * case, and it still gives the right answer for two paths that do not
 * exist, where `realpathSync` can only raise. This function therefore says
 * "same" strictly more often than `resolve(left) === resolve(right)` does,
 * and never says "same" about two objects that are genuinely different:
 * equal canonical paths ARE one object.
 */
export function pathsNameSameObject(left: string, right: string): boolean {
  if (resolve(left) === resolve(right)) {
    return true;
  }
  return pathsIdentifySameObject(left, right);
}
