/*
 * Remove a staged repository's `.git` so that the directory is, afterwards,
 * NOT A REPOSITORY, whatever else is still writing inside the old `.git`.
 *
 * WHY NOT `rmSync(join(dir, ".git"), { recursive: true, force: true })`,
 * measured in kernel 0.2.1 fix round 3c:
 *
 *   - git 2.55.0 runs a commit's auto maintenance DETACHED
 *     (`git maintenance run --auto --quiet --detach`), and that child unlinks
 *     `.git/objects/maintenance.lock` a few milliseconds AFTER `git commit`
 *     has returned. git 2.43.0 runs the same step in the foreground.
 *   - node v26.6.0's recursive `rmSync` RETURNS WITHOUT ERROR and leaves part
 *     of the tree behind when an entry it listed is unlinked by someone else
 *     before it gets to it, with or without `force`. node v22.22.2 removed the
 *     whole tree in every trial.
 *
 * Together they leave a partial `.git` that still resolves HEAD while some of
 * its objects are gone, which is exactly the "assurance-modes.yaml does not
 * exist in commit ..." that CI printed for a removed-.git arm.
 *
 * So the `.git` is RENAMED out of the directory first. A rename is one
 * operation: the directory has a complete `.git` or none, and a straggler
 * that later unlinks `.git/...` by its relative path finds nothing. The moved
 * copy is then removed from `graveyard`, where a partial leftover names no
 * repository anyone asks about. Absence is asserted, never assumed.
 */
import { existsSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

export function removeGitDirectory(dir: string, graveyard: string): void {
  const moved = join(mkdtempSync(join(graveyard, "removed-git-")), "git");
  renameSync(join(dir, ".git"), moved);
  if (existsSync(join(dir, ".git"))) {
    throw new Error(`${join(dir, ".git")} still exists after it was moved to ${moved}`);
  }
  rmSync(moved, { recursive: true, force: true });
}
