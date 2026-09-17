import { spawnSync } from "node:child_process";
import { EX_USAGE } from "../cli.ts";
import { loadFleet } from "../fleet.ts";
import { MACHINE_IDENTITY_EMAIL, MACHINE_IDENTITY_NAME } from "./init.ts";

/**
 * `tiphys sync`: commit the durable half of a fleet home and push it
 * (kernel plan M4, M4-P18).
 *
 * WHAT THIS IS THE EXECUTABLE HALF OF. AGENTS.md's
 * `fleet-state-commit-discipline` clause says durable state is committed and
 * pushed at the moment it changes, and that the PUSH is the half that gets
 * dropped. Until this phase the whole clause was discharged by an agent
 * remembering to run git, which is the shape this repository has recorded
 * three times: a rule that depends on remembering does not survive a busy
 * session, and the answer is a mechanism.
 *
 * THE DURABLE SET IS DERIVED, NEVER LISTED HERE (criterion 2). A second list
 * of ephemeral prefixes inside this file would be a second thing to keep in
 * step with the fleet's own `.gitignore`, and the first divergence would be
 * silent: a prefix added to the ignore set would keep being committed by a
 * command that had never heard of it. So the question "is this path
 * ephemeral" is answered by GIT, against the fleet `.gitignore` that
 * `tiphys init` wrote, and this module holds no prefix list at all.
 *
 * `--no-index` IS THE LOAD-BEARING FLAG AND THE REASON IS THE HAZARD ITSELF.
 * `git check-ignore` without it answers "would git ignore this path", and a
 * TRACKED file is never ignored whatever `.gitignore` says, so it answers 1
 * for exactly the file this command must exclude. The dangerous state is a
 * lease or a scratch file that got tracked once (by a `git add -f`, or by
 * being committed before the prefix was ignored): from then on every `git
 * add -A` re-commits it, and a fleet's lease travels through the remote to
 * environments that must rebuild it rather than restore it. With
 * `--no-index` the answer is about the RULES, which is the question being
 * asked. Measured contract in witness/captures/m4-p18-git-contracts.txt.
 *
 * WHY A STAGED EPHEMERAL PATH IS A REFUSAL AND NOT A SKIP (criterion 4).
 * This command stages the durable paths it enumerated and then commits, and
 * `git commit` commits the INDEX, not the pathspec it was handed. An
 * operator who ran `git add -A` first has already put the lease in the
 * index, so committing at all would commit it. Unstaging on the operator's
 * behalf is a destructive act on work this command did not create, so the
 * refusal names the path and the rule that makes it ephemeral, and commits
 * nothing.
 *
 * SUBSTRATE-NEUTRAL (DR-0007) and C-2 clean: pure git and filesystem, no
 * process probing, no pid, no signal.
 */

const USAGE = "usage: tiphys sync [--remote <name>]";

/** The remote a fleet home pushes to unless told otherwise. */
export const DEFAULT_REMOTE = "origin";

/**
 * The commit subject, and it carries NO PATHS ON PURPOSE (criterion 6,
 * CLAUDE.md binding convention 7: commit messages carry no AI model or tool
 * names). A message composed from the paths it commits inherits whatever
 * those paths are named, and a fleet's decision records and task directories
 * are named after the things they decide, which routinely includes the
 * harness or the model a decision is about. A count cannot carry a name.
 */
export function syncCommitMessage(count: number): string {
  return `tiphys sync: ${String(count)} durable path(s)`;
}

interface GitRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runGit(
  root: string,
  args: string[],
  options: { input?: string; extraEnv?: Record<string, string> } = {},
): GitRun {
  const run = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    input: options.input,
    env:
      options.extraEnv === undefined
        ? process.env
        : { ...process.env, ...options.extraEnv },
  });
  return {
    status: run.status,
    stdout: run.stdout ?? "",
    stderr: run.stderr ?? "",
  };
}

/** One path git reports as changed, with its two status columns. */
export interface ChangedPath {
  path: string;
  /** The index column (X). A space means unstaged; `?` means untracked. */
  index: string;
  /** The worktree column (Y). */
  worktree: string;
}

/**
 * Parse `git status --porcelain=v1 -z --untracked-files=all`.
 *
 * The NUL form is the only safe one: a path holding a space, a quote or a
 * newline is printed raw here and is C-quoted in the newline form, so the
 * newline form would need an unquoting pass that is its own defect surface.
 * A rename or copy record carries TWO paths, the new one first and the
 * original second, and both are returned: a rename out of the durable half
 * into the ephemeral half must be visible as a change to both names.
 */
export function parsePorcelainStatus(payload: string): ChangedPath[] {
  const fields = payload.split("\0");
  const found: ChangedPath[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const record = fields[index] as string;
    if (record === "") {
      continue;
    }
    const x = record.slice(0, 1);
    const y = record.slice(1, 2);
    const path = record.slice(3);
    found.push({ path, index: x, worktree: y });
    if (x === "R" || x === "C" || y === "R" || y === "C") {
      const original = fields[index + 1];
      index += 1;
      if (original !== undefined && original !== "") {
        found.push({ path: original, index: x, worktree: y });
      }
    }
  }
  return found;
}

/** The `.gitignore` rule that makes one path ephemeral. */
export interface IgnoreRule {
  source: string;
  line: string;
  pattern: string;
}

/**
 * Parse `git check-ignore --no-index -v -z --stdin`, whose output is a flat
 * NUL-separated stream of four fields per MATCHING path: source, line
 * number, pattern, pathname. Paths that match no rule are absent from the
 * output entirely, which is what makes the result a set of the ephemeral
 * ones rather than a verdict per input.
 */
export function parseCheckIgnore(payload: string): Map<string, IgnoreRule> {
  const fields = payload.split("\0");
  const found = new Map<string, IgnoreRule>();
  for (let index = 0; index + 3 < fields.length; index += 4) {
    const source = fields[index] as string;
    const line = fields[index + 1] as string;
    const pattern = fields[index + 2] as string;
    const path = fields[index + 3] as string;
    if (path === "") {
      continue;
    }
    found.set(path, { source, line, pattern });
  }
  return found;
}

/** How an ignore rule is named in every line this command prints. */
export function renderRule(rule: IgnoreRule): string {
  return `${rule.source}:${rule.line} ${rule.pattern}`;
}

type Classification =
  | { ok: true; ephemeral: Map<string, IgnoreRule> }
  | { ok: false; reason: string };

/**
 * Ask git which of these paths the fleet `.gitignore` covers.
 *
 * THE THREE EXIT CODES ARE NOT TWO. 0 means at least one path matched, 1
 * means none did, and 128 means git could not answer at all. Folding 128
 * into "nothing is ephemeral" is how a command reports a clean sync while
 * committing a lease, so it is a refusal here and the exit code is named.
 */
function classify(root: string, paths: string[]): Classification {
  if (paths.length === 0) {
    return { ok: true, ephemeral: new Map() };
  }
  const run = runGit(root, ["check-ignore", "--no-index", "-v", "-z", "--stdin"], {
    input: `${paths.join("\0")}\0`,
  });
  if (run.status === 0) {
    return { ok: true, ephemeral: parseCheckIgnore(run.stdout) };
  }
  if (run.status === 1) {
    return { ok: true, ephemeral: new Map() };
  }
  return {
    ok: false,
    reason:
      `git check-ignore exited ${String(run.status)} and could not say which paths are ephemeral, ` +
      `so nothing was committed: ${run.stderr.split("\n")[0] ?? ""}`,
  };
}

function parseArgs(argv: string[]): { remote?: string; usageError?: string } {
  let remote = DEFAULT_REMOTE;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] as string;
    if (flag !== "--remote") {
      return { usageError: `unknown option ${flag}` };
    }
    const value = argv[index + 1];
    if (value === undefined) {
      return { usageError: "--remote requires a value" };
    }
    remote = value;
    index += 1;
  }
  return { remote };
}

export function cmdSync(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (parsed.remote === undefined) {
    process.stderr.write(
      `tiphys sync: ${parsed.usageError ?? "usage error"}\n${USAGE}\n`,
    );
    return EX_USAGE;
  }
  const remote = parsed.remote;
  const fleet = loadFleet(process.cwd());

  /* THE REMOTE IS ESTABLISHED BEFORE ANYTHING IS COMMITTED. The discipline
     is commit AND push; a sync that commits and then discovers there is
     nowhere to push has done the half that gets dropped and reported the
     half that does not. */
  const remotes = runGit(fleet.root, ["remote"]);
  if (remotes.status !== 0) {
    process.stderr.write(
      `tiphys sync: git remote failed in ${fleet.root}: ${remotes.stderr.split("\n")[0] ?? ""}\n`,
    );
    return 1;
  }
  const known = remotes.stdout.split("\n").map((line) => line.trim());
  if (!known.includes(remote)) {
    process.stderr.write(
      `tiphys sync: ${fleet.root} has no remote named ${remote}, so durable state cannot be pushed; ` +
        `add one with git remote add ${remote} <url>, nothing was committed\n`,
    );
    return 1;
  }

  const status = runGit(fleet.root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  if (status.status !== 0) {
    process.stderr.write(
      `tiphys sync: git status failed in ${fleet.root}: ${status.stderr.split("\n")[0] ?? ""}\n`,
    );
    return 1;
  }

  const changed = parsePorcelainStatus(status.stdout);
  const classified = classify(
    fleet.root,
    [...new Set(changed.map((entry) => entry.path))],
  );
  if (!classified.ok) {
    process.stderr.write(`tiphys sync: ${classified.reason}\n`);
    return 1;
  }
  const ephemeral = classified.ephemeral;

  /* CRITERION 4, and the order matters: every staged ephemeral path is
     reported before anything is staged or committed, so the refusal is a
     statement about the tree as the operator left it. */
  const stagedEphemeral = changed.filter(
    (entry) =>
      ephemeral.has(entry.path) && entry.index !== " " && entry.index !== "?",
  );
  if (stagedEphemeral.length > 0) {
    for (const entry of stagedEphemeral) {
      const rule = ephemeral.get(entry.path) as IgnoreRule;
      process.stderr.write(
        `tiphys sync: ${entry.path} is staged and is ephemeral by ${renderRule(rule)}; ` +
          `unstage it with git restore --staged -- ${entry.path} and re-run, nothing was committed\n`,
      );
    }
    return 1;
  }

  const durable = [
    ...new Set(
      changed
        .map((entry) => entry.path)
        .filter((path) => !ephemeral.has(path)),
    ),
  ].sort();
  const excluded = [
    ...new Set(
      changed.map((entry) => entry.path).filter((path) => ephemeral.has(path)),
    ),
  ].sort();

  /* The excluded paths are PRINTED WITH THE RULE THAT EXCLUDED THEM. A
     command that silently drops paths is indistinguishable from one that
     never saw them, and the rule reference is what makes the derivation
     observable rather than asserted. */
  for (const path of excluded) {
    process.stdout.write(
      `EXCLUDED ${path} ${renderRule(ephemeral.get(path) as IgnoreRule)}\n`,
    );
  }

  if (durable.length === 0) {
    process.stdout.write("NOTHING TO COMMIT\n");
  } else {
    const added = runGit(fleet.root, ["add", "--", ...durable]);
    if (added.status !== 0) {
      process.stderr.write(
        `tiphys sync: git add failed in ${fleet.root}: ${added.stderr.split("\n")[0] ?? ""}\n`,
      );
      return 1;
    }
    const committed = runGit(
      fleet.root,
      ["commit", "-m", syncCommitMessage(durable.length)],
      {
        /* The documented deterministic machine identity, command-scoped,
           exactly as the bootstrap commit does it: CI runners have no git
           identity and this must never touch user or global config
           (CLAUDE.md standing warning 5). */
        extraEnv: {
          GIT_AUTHOR_NAME: MACHINE_IDENTITY_NAME,
          GIT_AUTHOR_EMAIL: MACHINE_IDENTITY_EMAIL,
          GIT_COMMITTER_NAME: MACHINE_IDENTITY_NAME,
          GIT_COMMITTER_EMAIL: MACHINE_IDENTITY_EMAIL,
        },
      },
    );
    if (committed.status !== 0) {
      process.stderr.write(
        `tiphys sync: git commit failed in ${fleet.root}: ${committed.stderr.split("\n")[0] ?? ""}\n`,
      );
      return 1;
    }
    for (const path of durable) {
      process.stdout.write(`COMMITTED ${path}\n`);
    }
  }

  /* THE PUSH ARM IS NOT OPTIONAL AND ITS FAILURE IS NOT A WARNING. The
     failure carries GIT'S OWN first stderr line rather than a message
     composed here: a retry signature or a diagnosis derived from a
     hand-written example is the failure T-003 and CLAUDE.md standing warning
     10 both record. */
  const pushed = runGit(fleet.root, ["push", remote, "HEAD"]);
  if (pushed.status !== 0) {
    const first = pushed.stderr.split("\n")[0] ?? "";
    process.stderr.write(
      `tiphys sync: git push to ${remote} exited ${String(pushed.status)}, ` +
        `so the durable state is committed locally and NOT pushed: ${first}\n`,
    );
    return 1;
  }
  process.stdout.write(`PUSHED ${remote}\n`);
  return 0;
}
