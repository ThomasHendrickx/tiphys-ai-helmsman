import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { EX_USAGE } from "../cli.ts";
import {
  EPHEMERAL_DIRS,
  classifyLayoutEntry,
  missingDurableEntries,
} from "../fleet.ts";

/**
 * tiphys resume [dir]: rebuild the EPHEMERAL half of a fleet home that a
 * clone does not carry (kernel plan M4, M4-P16).
 *
 * WHAT THIS IMPLEMENTS, and it is a fixed written specification rather than
 * this command's own invention. AGENTS.md's fleet-resume-specification clause
 * fixes what survives a reclamation (everything committed and pushed) and what
 * is REBUILT rather than restored (worktrees, evidence directories, build
 * output and leases). Rebuilt, not restored, is the whole design: a lease held
 * by a session that no longer exists must expire rather than block, so resume
 * never carries one forward and never invents one.
 *
 * WHY A COMMAND AND NOT A FLAG ON `init`. `init` creates a fleet home and
 * refuses one that exists; `resume` requires one that exists and refuses one
 * that does not. Two opposite preconditions inside one command is how a
 * destructive mis-invocation gets written, so they stay apart (plan section
 * M4-P16, and DR-0016: the recommendation was defensible, so it is recorded
 * rather than escalated).
 *
 * THE DANGEROUS STATE THIS GUARDS, stated because "resume is missing" is NOT
 * it. The harmful outcomes are a resume that reports success while the fleet
 * is not recoverable, and a resume that destroys what a reclaim left behind.
 * Both are avoided by the same rule: this command ONLY creates directories
 * that are absent. It never removes, never truncates, never rewrites, and it
 * refuses outright rather than acting on a directory whose durable half is not
 * there to rebuild around.
 *
 * SUBSTRATE-NEUTRAL (DR-0007) and C-2 clean: this is pure filesystem work. No
 * process is probed, no pid is read, and liveness is not consulted, because
 * rehydration is a statement about a tree and not about anything running.
 */

/** One entry of the rebuild plan, decided before anything is created. */
interface RebuildStep {
  name: string;
  rebuild: boolean;
}

/**
 * The plan, or the one reason it cannot be made. Deciding every entry BEFORE
 * creating any of them is what makes criterion 2's "creates nothing" true of
 * the refusal arms: a refusal discovered halfway through a creating loop has
 * already changed the tree.
 */
function planRebuild(root: string): { steps: RebuildStep[] } | { refusal: string } {
  const steps: RebuildStep[] = [];
  for (const name of EPHEMERAL_DIRS) {
    const entry = classifyLayoutEntry(join(root, name));
    if (entry.kind === "directory") {
      steps.push({ name, rebuild: false });
      continue;
    }
    if (entry.kind === "absent") {
      steps.push({ name, rebuild: true });
      continue;
    }
    return {
      refusal:
        `tiphys resume: ${root} cannot be rehydrated: ${entry.reason}, ` +
        `and resume never removes anything to make room`,
    };
  }
  return { steps };
}

export function cmdResume(args: string[]): number {
  const [dir, ...extra] = args;
  if (extra.length > 0) {
    process.stderr.write("usage: tiphys resume [dir]\n");
    return EX_USAGE;
  }
  const root = resolve(dir ?? ".");

  const rootEntry = classifyLayoutEntry(root);
  if (rootEntry.kind !== "directory") {
    process.stderr.write(
      `tiphys resume: ${root} is not a directory, so there is no fleet home here to rebuild\n`,
    );
    return 1;
  }

  /* THE FIRST PRECONDITION: a fleet home is a git repository, and a clone of
     one is what this command exists to repair. A directory with no `.git` is
     not a fleet clone whatever else it holds, and creating three directories
     inside it would be a success report about a fleet that does not exist. */
  const gitEntry = classifyLayoutEntry(join(root, ".git"));
  if (gitEntry.kind === "absent") {
    process.stderr.write(
      `tiphys resume: ${root} is not a git repository, .git is absent, ` +
        `so it is not a cloned fleet home; run tiphys init <dir> to create one\n`,
    );
    return 1;
  }
  if (gitEntry.kind === "unexaminable") {
    process.stderr.write(`tiphys resume: ${gitEntry.reason}\n`);
    return 1;
  }

  /* THE SECOND PRECONDITION, and it is a different failure from the first.
     A git repository that is not a fleet home (any other clone, including the
     kernel's own) passes the `.git` test. Rebuilding the ephemeral three
     inside it would litter a stranger's repository and report success. The
     durable entries are what a clone of a fleet home carries, so their absence
     means either "not a fleet home" or "a fleet home that has lost durable
     content", and resume fabricates NEITHER: durable content comes back from
     the remote, never from this command. */
  const missingDurable = missingDurableEntries(root);
  if (missingDurable.length > 0) {
    process.stderr.write(
      `tiphys resume: ${root} is a git repository but not a fleet home, ` +
        `missing ${missingDurable.join(", ")}; durable content is restored by ` +
        `fetching from the remote, never by resume\n`,
    );
    return 1;
  }

  const planned = planRebuild(root);
  if ("refusal" in planned) {
    process.stderr.write(`${planned.refusal}\n`);
    return 1;
  }

  /* PER ENTRY, never all-or-nothing. An interrupted resume leaves a
     half-rebuilt layout, and that half is the common case rather than an edge:
     rebuilding the set because one member is missing is how a live worktree
     that survived the reclaim gets reported as rebuilt when it was not. */
  for (const step of planned.steps) {
    if (!step.rebuild) {
      continue;
    }
    mkdirSync(join(root, step.name));
    process.stdout.write(`REBUILT ${step.name}/\n`);
  }
  return 0;
}
