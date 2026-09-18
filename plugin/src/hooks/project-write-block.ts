import { appendFileSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * THE PROJECT-WRITE BLOCK, WITH BOTH CARVE-OUTS (kernel plan M4, M4-P9,
 * delivery/plan/kernel-plan-m4.md:1501).
 *
 * THIS HOOK BLOCKS, which is the whole difference between it and M4-P6's
 * observer twelve lines away in this directory. It discharges the hook half of
 * clause 3, D-8 (delivery/plan/kernel-plan-v1.md:383) and SC-010
 * (delivery/verification/spec-coherence-report.md:126), and it makes
 * AGENTS.md's `projects-read-only` clause a command with an exit code instead
 * of a sentence an orchestrator is trusted to remember.
 *
 * THE LINE IT DRAWS IS M4-D-27's AND IT IS KEYED TO THE EFFECT, NOT TO A TOOL
 * NAME. "Designated merge tooling" has no referent in this kernel: src/commands/
 * holds fifteen modules and none of them merges, so a hook that tried to
 * recognise a designated tool would be inventing the merge command this
 * workstream does not own. What it recognises instead is the target: a write
 * that resolves INSIDE a project working tree and OUTSIDE that clone's `.git/`
 * is REFUSED, and a write under `.git/` is the ref update the release-manager
 * carve-out names and is PERMITTED.
 *
 * BOTH CARVE-OUTS SHIP HERE OR THE BLOCK IS SWITCHED OFF IN THE FIRST HOUR
 * (hazard H-D). The first is the `.git/` one above, without which this hook
 * refuses its own pipeline's merge path, which is exactly the contradiction
 * SC-010 recorded. The second is the infrastructure-hotfix BYPASS below.
 *
 * CONSTRAINT C-1 IS WHY THE BYPASS IS TWO FILES AND NOT ONE (M4-D-26).
 *
 *   `<fleet>/write-bypass.json`          the DECLARATION: current state,
 *                                        rewritten in place, and the only
 *                                        document any decision reads.
 *   `<fleet>/write-bypass-evidence.jsonl` the EVIDENCE: append-only, written
 *                                        after a permit and READ BY NOTHING.
 *
 * Reading the bypass state from the tail of the log is precisely what C-1
 * forbids, and the split is what makes the prohibition checkable rather than
 * promised: `decideWrite` is PURE and has no log parameter at all, so deleting
 * the entire log cannot change a single verdict (criterion 5). A decision that
 * survives the log's deletion cannot have been reading it.
 *
 * IT FAILS CLOSED, and the type says so rather than a comment. `ProjectRoots`
 * is a discriminated union, so "I could not find out which trees are projects"
 * is a DIFFERENT VALUE from "I looked and there are none". An implementation
 * that passed an empty array for the first would fail open, which is the same
 * fail-open as an absent hook and looks identical in every log (criterion 7);
 * here it does not type-check.
 */

/** The bypass declaration's basename inside the fleet home. */
export const BYPASS_BASENAME = "write-bypass.json";

/** The append-only evidence log's basename inside the fleet home. */
export const BYPASS_EVIDENCE_BASENAME = "write-bypass-evidence.jsonl";

/**
 * The tools this hook adjudicates, and the reason the list is short is a
 * MEASUREMENT rather than a preference.
 *
 * M4-P9 step 1 fired one `PreToolUse` hook against `Write`, `Edit` and `Bash`
 * under claude 2.1.273 and recorded each payload verbatim
 * (witness/captures/m4-p9-pretooluse-payloads.txt:1). `Write` and `Edit` carry
 * `tool_input.file_path`, an ABSOLUTE path, so a target-keyed predicate can
 * see them. `Bash` carries `tool_input.command`, a raw shell string, and
 * nothing else that names a file; a heredoc arm measured the same. So the
 * `Bash` payload carries NO RESOLVABLE WRITE TARGET, and this hook does not
 * pretend otherwise: it is not registered for `Bash`, the residual is stated
 * in the work history, and criterion 6 covers the file-writing tools only.
 * Registering for `Bash` and permitting it would be a fail-open wearing a
 * matcher; registering for `Bash` and refusing it would refuse `git merge`,
 * which is the SC-010 contradiction this phase exists to avoid.
 */
export const ADJUDICATED_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit"] as const;

/** One adjudicated write, as the wrapper extracted it from a hook payload. */
export interface WriteRequest {
  /** The tool name, verbatim from the payload. */
  tool: string;
  /**
   * The absolute path the tool will write, when the payload carried one.
   * ABSENT IS A RESOLUTION FAILURE, never a permit (criterion 7).
   */
  targetPath?: string;
}

/**
 * Which trees are project working trees, AND WHETHER THAT WAS ESTABLISHED.
 *
 * The second half is the point. `{kind: "observed", roots: []}` is a fleet
 * home with no project clones in it, and a write outside every project is not
 * a project write. `{kind: "unresolved"}` is "the fleet home could not be
 * read", and every request in that state is REFUSED.
 */
export type ProjectRoots =
  | { kind: "observed"; roots: readonly string[] }
  | { kind: "unresolved"; reason: string };

/**
 * The infrastructure-hotfix bypass, as the orchestrator declared it.
 *
 * A FIRST-CLASS DECLARED ACT (M4-D-26): it names the project, lists the paths
 * EXPLICITLY, gives a reason, and carries an ABSOLUTE EXPIRY INSTANT. The
 * expiry is required by `schemas/write-bypass.schema.json`, which is what
 * makes "a bypass with no expiry" unrepresentable rather than discouraged; a
 * bypass that never expires is a block switched off permanently by the first
 * hotfix.
 */
export interface BypassDeclaration {
  kind: "write-bypass";
  contractVersion: string;
  project: string;
  paths: readonly string[];
  reason: string;
  expiresAt: string;
  declaredBy: string;
  declaredAt: string;
}

/** What a permit owes the evidence log, when a bypass is what permitted it. */
export interface BypassUse {
  project: string;
  expiresAt: string;
  declaredAt: string;
  declaredBy: string;
  reason: string;
}

export type WriteDecision =
  | { verdict: "permit"; reason: string; bypass?: BypassUse }
  | { verdict: "refuse"; reason: string };

/** Is `path` `root` itself, or inside it? Both must already be canonical. */
export function isInside(root: string, path: string): boolean {
  return path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);
}

/**
 * The first path segment of `path` relative to `root`, or undefined when
 * `path` is `root` itself.
 */
function firstSegmentUnder(root: string, path: string): string | undefined {
  const rest = relative(root, path);
  if (rest === "") {
    return undefined;
  }
  const segments = rest.split(sep);
  return segments[0];
}

/**
 * The ref surface, as an ALLOWLIST, derived from what git actually writes.
 *
 * THE CARVE-OUT IS A CAPABILITY, NOT A DIRECTORY, and drawing it at a
 * directory is the defect CR-A-001 records. `.git/hooks/post-merge` and
 * `.git/config` are inside `<root>/.git` and are not ref updates: they are
 * EXECUTABLE POLICY for every later git command in that clone, so a single
 * permitted write into either turns the release manager's own
 * `git merge --ff-only` into the working-tree write this block had refused one
 * command earlier. Measured end to end, both members, at
 * delivery/work-history/plugin-security-fixes.md:1.
 *
 * DERIVED, NOT REMEMBERED. The entries below are the paths a real
 * `git fetch` followed by a real `git merge --ff-only` created or rewrote
 * under `.git` in a measured clone, plus the siblings the same operations
 * produce when the merge is not a fast-forward (`MERGE_HEAD`, `MERGE_MSG`,
 * `MERGE_MODE`, `SQUASH_MSG`, `COMMIT_EDITMSG`), when a checkout or reset runs
 * (`HEAD`, the `*_HEAD` family), and when git packs refs or objects
 * (`packed-refs`, `shallow`). The measurement is in the work history; the
 * standing proof that the set is still WIDE ENOUGH is
 * test/project-write-block.test.ts, which runs a real merge and requires every
 * `.git` path it wrote to be permitted, filtered on the FIRST SEGMENT rather
 * than on this predicate so the test cannot narrow itself alongside a bug.
 *
 * WHAT IS DELIBERATELY OUTSIDE IT. `hooks/` (git executes it), `config` (it
 * can set `core.hooksPath`, `core.fsmonitor` and `alias.*`, each of which is a
 * command git runs), `info/` (`info/exclude` changes what git considers
 * tracked and `info/attributes` names filter drivers), `worktrees/` and
 * `modules/` (each holds another checkout's own `config.worktree` and hooks),
 * and `.git` itself as a path. Every one of those is refused with `hooks/` and
 * `config` named, because a refusal that does not say what it refused sends
 * the reader to look for a hook defect.
 */
const GIT_REF_SURFACE_FILES = new Set([
  "HEAD",
  "ORIG_HEAD",
  "FETCH_HEAD",
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "REBASE_HEAD",
  "BISECT_HEAD",
  "AUTO_MERGE",
  "index",
  "packed-refs",
  "shallow",
  "MERGE_MSG",
  "MERGE_MODE",
  "SQUASH_MSG",
  "COMMIT_EDITMSG",
]);

/** The subtrees of `.git` a ref update writes into, as first segments. */
const GIT_REF_SURFACE_DIRS = new Set(["refs", "logs", "objects"]);

/**
 * Is `path` under `root`'s own `.git`?
 *
 * SEGMENT-WISE, never a substring test. `<root>/.gitignore` and
 * `<root>/src/.github/workflows/gates.yml` are ordinary working-tree files and
 * a substring match would hand both of them the release-manager carve-out.
 * FIRST segment only, because the carve-out is for THIS clone's refs; a nested
 * submodule's `.git` deeper down is another clone's working tree and is not
 * what AGENTS.md's clause hands the release manager.
 *
 * THIS IS THE LOCATION TEST AND IT IS NOT THE CARVE-OUT. `isGitRefSurface`
 * below is the carve-out; this function is exported because a caller that
 * wants to know "is this path inside this clone's git directory at all", such
 * as the wide-enough half of the merge test, must be able to ask that WITHOUT
 * asking the narrower question, or the test narrows itself alongside a bug.
 */
export function isGitInternal(root: string, path: string): boolean {
  return firstSegmentUnder(root, path) === ".git";
}

/**
 * Is `path` on the REF SURFACE of `root`'s own `.git`?
 *
 * The one predicate `decideWrite` carves out on. False for `<root>/.git`
 * itself, because writing a file over the git directory is not a ref update
 * by any spelling.
 */
export function isGitRefSurface(root: string, path: string): boolean {
  if (!isGitInternal(root, path)) {
    return false;
  }
  const gitDir = join(root, ".git");
  const inside = firstSegmentUnder(gitDir, path);
  if (inside === undefined) {
    return false;
  }
  if (GIT_REF_SURFACE_DIRS.has(inside)) {
    return true;
  }
  return relative(gitDir, path) === inside && GIT_REF_SURFACE_FILES.has(inside);
}

/**
 * The longest observed project root containing `path`, or undefined.
 *
 * LONGEST, because a fleet home may hold a project clone inside another
 * directory that is also declared, and the nearer root is the one whose `.git`
 * the carve-out is about.
 */
export function containingProjectRoot(
  roots: readonly string[],
  path: string,
): string | undefined {
  let best: string | undefined;
  for (const root of roots) {
    if (isInside(root, path) && (best === undefined || root.length > best.length)) {
      best = root;
    }
  }
  return best;
}

/**
 * Parse an instant this module is willing to compare. Returns undefined for
 * anything it cannot read as a time, so an unreadable expiry is NEVER treated
 * as a distant one.
 */
export function instantOf(text: string): number | undefined {
  const value = Date.parse(text);
  return Number.isNaN(value) ? undefined : value;
}

/**
 * Why a declaration did not apply to this request, or undefined when it did.
 *
 * EVERY ANSWER NAMES THE DECLARATION AND THE REASON (criterion 4). "Refused"
 * on its own sends the reader to look for a hook defect when the real state is
 * a bypass that expired an hour ago, which is a diagnosis this hook can make
 * for free and a human cannot make from an exit code.
 */
export function bypassDoesNotApply(
  bypass: BypassDeclaration,
  projectRoot: string,
  targetPath: string,
  now: string,
): string | undefined {
  const declaration =
    `the write bypass declared at ${bypass.declaredAt} by ${bypass.declaredBy} ` +
    `for ${bypass.project} (${bypass.reason})`;
  if (resolve(bypass.project) !== projectRoot) {
    return (
      `${declaration} does not apply: it names the project ${bypass.project} ` +
      `and this write is in ${projectRoot}`
    );
  }
  const expiry = instantOf(bypass.expiresAt);
  if (expiry === undefined) {
    return `${declaration} does not apply: its expiry ${bypass.expiresAt} is not a readable instant`;
  }
  const at = instantOf(now);
  if (at === undefined) {
    return `${declaration} does not apply: ${now} is not a readable instant`;
  }
  if (expiry <= at) {
    return `${declaration} does not apply: its expiry ${bypass.expiresAt} is not after ${now}`;
  }
  /* THE SAME ARGUMENT ONE LEVEL DOWN, and leaving it out was CR-A-005. The
     `/` case below is refused because `isInside(projectRoot, "/")` is false,
     which is a refusal by accident of the containment test rather than by a
     rule. An entry equal to the PROJECT ROOT passes that test and, because
     `isInside` is reflexive, covers every path in the project: it is the same
     off switch, declared one directory in. It is named explicitly rather than
     left to fall out of the coverage check, because a declaration that is an
     off switch and a declaration that simply misses this write are different
     states and an operator must be able to tell them apart. One such entry
     refuses the whole declaration: an off switch beside three honest entries
     is still an off switch. */
  const rootEntry = bypass.paths.find((entry) => resolve(entry) === projectRoot);
  if (rootEntry !== undefined) {
    return (
      `${declaration} does not apply: its path list names the project root ` +
      `${rootEntry}, which is an off switch rather than an explicit path list`
    );
  }
  const covers = bypass.paths.some((entry) => {
    const listed = resolve(entry);
    /* A listed path buys nothing outside the project it was declared for.
       Without this a declaration listing `/` would cover every write in the
       fleet, which is not an explicit path list, it is an off switch. */
    return isInside(projectRoot, listed) && isInside(listed, targetPath);
  });
  if (!covers) {
    return (
      `${declaration} does not apply: its path list ` +
      `(${String(bypass.paths.length)} entr${bypass.paths.length === 1 ? "y" : "ies"}) ` +
      `does not cover ${targetPath}`
    );
  }
  return undefined;
}

/**
 * THE DECISION. PURE: no filesystem, no clock, no environment, no log.
 *
 * Every acceptance criterion of this phase except the end-to-end one is stated
 * over this function, which is what makes them falsifiable without firing a
 * hook (plan step 3). `now` is a parameter for the same reason the log is not:
 * a decision that read the clock could not be tested at an expiry boundary,
 * and a decision that read the log would be the C-1 violation the split exists
 * to prevent.
 *
 * `request.targetPath` and every entry of `projectRoots.roots` must already be
 * CANONICAL. `canonicalisePath` below is the impure half that makes them so,
 * and it is separate precisely so this function can stay pure.
 */
export function decideWrite(
  request: WriteRequest,
  projectRoots: ProjectRoots,
  bypass: BypassDeclaration | undefined,
  now: string,
): WriteDecision {
  if (projectRoots.kind === "unresolved") {
    return {
      verdict: "refuse",
      reason:
        `the project root could not be resolved for this ${request.tool} call: ` +
        `${projectRoots.reason}`,
    };
  }
  const target = request.targetPath;
  if (target === undefined || target === "" || !isAbsolute(target)) {
    return {
      verdict: "refuse",
      reason:
        `the project root could not be resolved for this ${request.tool} call: ` +
        `the payload carries no absolute write target ` +
        `(${target === undefined ? "none" : JSON.stringify(target)})`,
    };
  }
  const root = containingProjectRoot(projectRoots.roots, target);
  if (root === undefined) {
    return {
      verdict: "permit",
      reason: `${target} is outside every project working tree`,
    };
  }
  if (isGitRefSurface(root, target)) {
    return {
      verdict: "permit",
      reason:
        `${target} is a ref update under ${join(root, ".git")}, which is the ` +
        `release-manager carve-out of AGENTS.md's projects-read-only clause`,
    };
  }
  /* A PATH INSIDE `.git` THAT IS NOT ON THE REF SURFACE GETS ITS OWN REFUSAL,
     because the working-tree wording below would be a false diagnosis for it
     and would send the reader to look for the wrong thing. */
  if (isGitInternal(root, target)) {
    const refusal =
      `${target} is inside ${join(root, ".git")} and is not on the ref ` +
      `surface the release-manager carve-out covers (HEAD and the other ` +
      `*_HEAD files, index, packed-refs, shallow, the merge and commit ` +
      `message buffers, and refs/, logs/ and objects/), so it is refused: ` +
      `hooks/ is executed by git and config can name a command through ` +
      `core.hooksPath, core.fsmonitor or alias.*, which makes either one a ` +
      `working-tree write by the next git command rather than a ref update`;
    if (bypass === undefined) {
      return { verdict: "refuse", reason: `${refusal}, and no write bypass is declared` };
    }
    const why = bypassDoesNotApply(bypass, root, target, now);
    if (why !== undefined) {
      return { verdict: "refuse", reason: `${refusal}, and ${why}` };
    }
    return {
      verdict: "permit",
      reason: `${target} is permitted by the write bypass declared at ${bypass.declaredAt}`,
      bypass: {
        project: bypass.project,
        expiresAt: bypass.expiresAt,
        declaredAt: bypass.declaredAt,
        declaredBy: bypass.declaredBy,
        reason: bypass.reason,
      },
    };
  }
  const refusal =
    `${target} is inside the project working tree ${root} and outside its ` +
    `.git directory, so it is a working-tree write by the one role whose ` +
    `independence every later check assumes`;
  if (bypass === undefined) {
    return { verdict: "refuse", reason: `${refusal}, and no write bypass is declared` };
  }
  const why = bypassDoesNotApply(bypass, root, target, now);
  if (why !== undefined) {
    return { verdict: "refuse", reason: `${refusal}, and ${why}` };
  }
  return {
    verdict: "permit",
    reason: `${target} is permitted by the write bypass declared at ${bypass.declaredAt}`,
    bypass: {
      project: bypass.project,
      expiresAt: bypass.expiresAt,
      declaredAt: bypass.declaredAt,
      declaredBy: bypass.declaredBy,
      reason: bypass.reason,
    },
  };
}

/* ------------------------------------------------------------------ */
/* The impure half: resolution, reading, appending, and the wrapper.   */
/* ------------------------------------------------------------------ */

/**
 * `path` with its longest EXISTING ancestor resolved through the filesystem
 * and the not-yet-existing remainder re-appended.
 *
 * A `Write` names a file that may not exist, so `realpathSync` on the target
 * itself throws for exactly the ordinary case. Resolving only the part that
 * exists is what closes the symlink evasion: `/tmp/shortcut` pointing at
 * `<fleet>/projects/app` would otherwise present `/tmp/shortcut/src/app.ts`,
 * which is lexically outside every project root and would be PERMITTED.
 * Never throws; an unresolvable path falls back to the lexical form.
 */
export function canonicalisePath(path: string): string {
  const absolute = resolve(path);
  const pending: string[] = [];
  let head = absolute;
  for (let depth = 0; depth < 256; depth += 1) {
    try {
      const real = realpathSync(head);
      return pending.length === 0 ? real : join(real, ...pending);
    } catch {
      const parent = dirname(head);
      if (parent === head) {
        return absolute;
      }
      pending.unshift(basename(head));
      head = parent;
    }
  }
  return absolute;
}

/** The layout entries that identify a fleet home (src/fleet.ts:12). */
const FLEET_MARKERS = [
  "charter",
  "decisions",
  "state",
  "tasks",
  "worktrees",
  "projects",
] as const;

export type FleetResolution =
  | { ok: true; root: string }
  | { ok: false; reason: string };

/**
 * The fleet home at or above `from`, by WALKING UP AND TESTING.
 *
 * Measured rather than configured, and that is forced rather than chosen: the
 * kernel builds the exact environment for every child of a launch from an
 * allowlist (src/exec/env.ts:69), so there is no `TIPHYS_FLEET_HOME` for this
 * hook to read and adding one would be the widening M2-P8 forbids. What the
 * hook does get is the payload's own `cwd`, which is the fleet root for the
 * orchestrator, `<fleet>/worktrees/<taskId>` for a launched agent, and
 * `<fleet>/projects/<name>` for a read of a project clone. All three sit at or
 * under the fleet home, so one upward walk serves them.
 */
export function findFleetHome(from: string): FleetResolution {
  let directory = resolve(from);
  for (let depth = 0; depth < 64; depth += 1) {
    if (
      FLEET_MARKERS.every((name) => {
        try {
          return statSync(join(directory, name)).isDirectory();
        } catch {
          return false;
        }
      })
    ) {
      return { ok: true, root: directory };
    }
    const parent = dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }
  return {
    ok: false,
    reason:
      `no fleet home was found at or above ${resolve(from)} ` +
      `(a fleet home carries ${FLEET_MARKERS.join("/, ")}/)`,
  };
}

/**
 * The project working trees of a fleet home: the direct children of
 * `<fleet>/projects/`, canonicalised.
 *
 * A directory that cannot be listed is `unresolved`, NEVER an empty observed
 * set. That is the difference the type exists to keep.
 */
export function readProjectRoots(fleetRoot: string): ProjectRoots {
  const projectsDir = join(fleetRoot, "projects");
  let entries: string[];
  try {
    entries = readdirSync(projectsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name);
  } catch (error) {
    return {
      kind: "unresolved",
      reason: `${projectsDir} could not be listed: ${singleLine(String(error))}`,
    };
  }
  return {
    kind: "observed",
    roots: entries.map((name) => canonicalisePath(join(projectsDir, name))),
  };
}

export type BypassRead =
  | { kind: "absent" }
  | { kind: "read"; declaration: BypassDeclaration }
  | { kind: "invalid"; reason: string };

const BYPASS_STRING_FIELDS = [
  "kind",
  "contractVersion",
  "project",
  "reason",
  "expiresAt",
  "declaredBy",
  "declaredAt",
] as const;

/**
 * Read the declaration, or say why it cannot be used.
 *
 * `invalid` IS NOT `absent`. An unparseable or ill-shaped declaration is a
 * document the orchestrator meant to be read, and treating it as "no bypass"
 * would be quiet; the wrapper turns it into exit 2 naming the document. That
 * direction is also the safe one: a malformed declaration never widens what is
 * permitted.
 */
export function readBypass(fleetRoot: string): BypassRead {
  const path = join(fleetRoot, BYPASS_BASENAME);
  let body: string;
  try {
    const stat = statSync(path);
    if (!stat.isFile()) {
      return { kind: "invalid", reason: `${path} is not a regular file` };
    }
    body = readFileSync(path, "utf8");
  } catch {
    return { kind: "absent" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    return { kind: "invalid", reason: `${path} does not parse as JSON: ${singleLine(String(error))}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { kind: "invalid", reason: `${path} is not a JSON object` };
  }
  const raw = parsed as Record<string, unknown>;
  for (const field of BYPASS_STRING_FIELDS) {
    if (typeof raw[field] !== "string" || (raw[field] as string) === "") {
      return { kind: "invalid", reason: `${path} has no ${field} string` };
    }
  }
  if (raw["kind"] !== "write-bypass") {
    return { kind: "invalid", reason: `${path} declares kind ${String(raw["kind"])}, not write-bypass` };
  }
  const paths = raw["paths"];
  if (
    !Array.isArray(paths) ||
    paths.length === 0 ||
    !paths.every((entry) => typeof entry === "string" && entry !== "")
  ) {
    return { kind: "invalid", reason: `${path} has no non-empty paths[] of strings` };
  }
  return {
    kind: "read",
    declaration: {
      kind: "write-bypass",
      contractVersion: raw["contractVersion"] as string,
      project: raw["project"] as string,
      paths: paths as string[],
      reason: raw["reason"] as string,
      expiresAt: raw["expiresAt"] as string,
      declaredBy: raw["declaredBy"] as string,
      declaredAt: raw["declaredAt"] as string,
    },
  };
}

/** One line of the append-only evidence log. NOTHING READS THIS TYPE BACK. */
export interface BypassEvidenceRecord {
  appendedAt: string;
  tool: string;
  targetPath: string;
  reason: string;
  bypass: BypassUse;
}

export type EvidenceOutcome = { ok: true; path: string } | { ok: false; reason: string };

/**
 * Append one permitted bypass write to the evidence log.
 *
 * APPEND ONLY, and there is deliberately NO READ PATH to this file anywhere in
 * this module or this package (C-1, criterion 5). The log is history; nothing
 * decides anything by looking at its tail.
 */
export function appendBypassEvidence(
  fleetRoot: string,
  record: BypassEvidenceRecord,
): EvidenceOutcome {
  const path = join(fleetRoot, BYPASS_EVIDENCE_BASENAME);
  try {
    appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
  } catch (error) {
    return { ok: false, reason: `${path} could not be appended to: ${singleLine(String(error))}` };
  }
  return { ok: true, path };
}

export type PayloadRead =
  | { ok: true; tool: string; cwd: string; targetPath?: string }
  | { ok: false; reason: string };

/**
 * Read a `PreToolUse` payload into the two things this hook needs: the tool,
 * and the absolute path it will write.
 *
 * THE FIELD NAMES ARE THE MEASURED ONES, not documented ones
 * (witness/captures/m4-p9-pretooluse-payloads.txt:1). `cwd` and `tool_name`
 * are top level; the target is `tool_input.file_path` and it arrived ABSOLUTE
 * in every captured arm. A payload that does not carry one still produces a
 * request, with `targetPath` absent, and `decideWrite` refuses it; dropping it
 * here would turn a resolution failure into a silent permit.
 */
export function requestFromPayload(raw: string): PayloadRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, reason: `the hook payload does not parse as JSON: ${singleLine(String(error))}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "the hook payload is not a JSON object" };
  }
  const payload = parsed as Record<string, unknown>;
  const tool = payload["tool_name"];
  if (typeof tool !== "string" || tool === "") {
    return { ok: false, reason: "the hook payload carries no tool_name" };
  }
  const cwd = payload["cwd"];
  if (typeof cwd !== "string" || cwd === "") {
    return { ok: false, reason: `the ${tool} hook payload carries no cwd` };
  }
  const input = payload["tool_input"];
  const filePath =
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)["file_path"]
      : undefined;
  if (typeof filePath === "string" && filePath !== "") {
    return { ok: true, tool, cwd, targetPath: filePath };
  }
  return { ok: true, tool, cwd };
}

export interface HookOutcome {
  exitCode: number;
  stderr: string;
}

/** Exit 0 permits; exit 2 blocks (intake Appendix B item 2). */
export const EXIT_PERMIT = 0;
export const EXIT_REFUSE = 2;

/**
 * The whole wrapper, as a function, so a test can drive it without a child
 * and the child below stays three lines long.
 *
 * FAIL CLOSED ON EVERY ARM. An unparseable payload, an unresolvable fleet
 * home, an invalid declaration and an evidence log that cannot be appended to
 * are all exit 2 with a DISTINCT reason. The last one is the least obvious and
 * the most important: a bypass write whose evidence could not be recorded is
 * exactly the untraceable act the two-file split exists to prevent, so it is
 * refused rather than permitted quietly.
 */
export function runHook(raw: string, now: string): HookOutcome {
  const read = requestFromPayload(raw);
  if (!read.ok) {
    return { exitCode: EXIT_REFUSE, stderr: `tiphys project-write block: ${read.reason}\n` };
  }
  const fleet = findFleetHome(read.cwd);
  if (!fleet.ok) {
    return {
      exitCode: EXIT_REFUSE,
      stderr:
        `tiphys project-write block: the project root could not be resolved ` +
        `for this ${read.tool} call: ${fleet.reason}\n`,
    };
  }
  const bypassRead = readBypass(fleet.root);
  if (bypassRead.kind === "invalid") {
    return {
      exitCode: EXIT_REFUSE,
      stderr: `tiphys project-write block: the bypass declaration is unusable: ${bypassRead.reason}\n`,
    };
  }
  const request: WriteRequest =
    read.targetPath === undefined
      ? { tool: read.tool }
      : { tool: read.tool, targetPath: canonicalisePath(read.targetPath) };
  const decision = decideWrite(
    request,
    readProjectRoots(fleet.root),
    bypassRead.kind === "read" ? bypassRead.declaration : undefined,
    now,
  );
  if (decision.verdict === "refuse") {
    return { exitCode: EXIT_REFUSE, stderr: `tiphys project-write block: ${decision.reason}\n` };
  }
  if (decision.bypass !== undefined) {
    const appended = appendBypassEvidence(fleet.root, {
      appendedAt: now,
      tool: request.tool,
      targetPath: request.targetPath as string,
      reason: decision.reason,
      bypass: decision.bypass,
    });
    if (!appended.ok) {
      return {
        exitCode: EXIT_REFUSE,
        stderr:
          `tiphys project-write block: the bypass permitted this write and its ` +
          `evidence could not be recorded, so it is refused: ${appended.reason}\n`,
      };
    }
  }
  return { exitCode: EXIT_PERMIT, stderr: "" };
}

/** Collapse a multi-line string to one line, for a single-line diagnostic. */
function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Read the whole of stdin as UTF-8. The harness closes it after the payload. */
export function readStdin(): Promise<string> {
  return new Promise((settle) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      raw += String(chunk);
    });
    process.stdin.on("end", () => {
      settle(raw);
    });
    process.stdin.on("error", () => {
      settle(raw);
    });
  });
}

/**
 * The script entry point.
 *
 * NOTHING IS WRITTEN TO STDOUT ON ANY PATH. The captured protocol
 * (test/fixtures/plugin-hook-payloads/hook-json-output-contract.txt:1) says a
 * `PreToolUse` decision travels on stdout as `decision`, `continue` or
 * `hookSpecificOutput.permissionDecision`. This hook blocks with the EXIT CODE
 * instead, which M4-P1 measured from the outside: hook exit 0 left the file
 * changed and hook exit 2 left it unchanged
 * (delivery/work-history/m4-p1.md:134 and delivery/work-history/m4-p1.md:135).
 * One channel, one mechanism, and the
 * reason travels on stderr where it cannot be mistaken for a decision.
 */
export async function main(): Promise<void> {
  const raw = await readStdin();
  const outcome = runHook(raw, new Date().toISOString());
  if (outcome.stderr !== "") {
    process.stderr.write(outcome.stderr);
  }
  process.exit(outcome.exitCode);
}

/* THE SCRIPT ARM, compared as URLs rather than as paths because
   `import.meta.url` is one and `process.argv[1]` is not (the same guard
   plugin/src/hooks/tool-call-observer.ts:191 carries). */
if (
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
